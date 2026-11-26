const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, Menu, safeStorage } = require('electron');
const { Connection } = require('./connection.cjs');
const fs = require('node:fs/promises');
const { download, safeURL, saveName, Previews } = require('./media.cjs');
const previews = new Previews();
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const identity = require('./product-identity.cjs');
identity.initialize(app, process.argv);
const dev = !app.isPackaged && process.argv.includes('--dev-launch') ? require('./dev-runtime.cjs').setup({app,args:process.argv,directory:__dirname}) : null;
const { api } = require('./api.cjs');
const { demo } = require('./demo.cjs');
const Keymaps = require('./keymaps.js');
const WorkTree = require('./sidebar-state.js');
const Workspace = require('./workspace.cjs');
const { Streams } = require('./stream.cjs');
const { Zoom, action: zoomAction } = require('./zoom.cjs');
const {LayoutSettings}=require('./layout.cjs');
const ConversationSettings=require('./conversation-settings.js');
let layoutSettings;
let zoom;
function changeZoom(action) {
  const state = zoom.change(action);
  window.webContents.setZoomFactor(state.percent / 100);
  window.webContents.send('desk:zoom', state);
}
const streams = new Streams({emit: batch => {
  if (!window || window.isDestroyed()) return;
  for (const frame of batch.events) if (frame.event === 'transcript') for (const a of frame.data.attachments || []) attachments.set(batch.id + ':' + a.file.fileId, a.file);
  window.webContents.send('desk:stream', batch);
}});
const creates = new Map();
const sends = new Map();
let workspaceRead;
const treePath = () => path.join(app.getPath('userData'), 'workspace-' + Workspace.scope(key,demoMode) + '.json');
const configPath = () => path.join(app.getPath('userData'), 'keymaps.json');

const hiddenTest = process.argv.includes('--test-hidden');
if (hiddenTest && (app.isPackaged || !(process.argv.includes('--demo') || process.argv.includes('--live') && !process.env.CAPY_API_KEY) || !process.argv.some(arg => arg.startsWith('--user-data-dir=') && arg.slice(16).startsWith(require('node:os').tmpdir())))) throw Error('Hidden tests require unpackaged demo/offline live and an isolated temporary profile.');
if (hiddenTest && process.platform === 'darwin') app.setActivationPolicy('prohibited');
let demoMode = process.argv.includes('--demo') || (app.isPackaged && !process.argv.includes('--live'));
const fixture = demo();
const page = path.join(__dirname, 'index.html');
const pageURL = pathToFileURL(page).href;
let window;
const attachments = new Map();
let configWrite = Promise.resolve();
let key = demoMode ? '' : process.env.CAPY_API_KEY ?? '';
const environmentKey = hiddenTest ? '' : process.env.CAPY_API_KEY ?? '';
delete process.env.CAPY_API_KEY;
let connection;
const sessionDrafts = new Map();
let readController = new AbortController();
let transcriptController = new AbortController();
const liveAPI = () => api(key, fetch, readController.signal);
function changed() {
  dev?.clear();
  previews.reset(true);
  streams.stop();
  streams.blocked.clear();
  readController.abort(); readController = new AbortController();
  key = connection.key; demoMode = connection.demo;
  creates.clear(); sends.clear(); workspaceRead = null; attachments.clear();
  return connection.status();
}

const operations = {
  dev: (...args) => {if(!dev || !devAction)throw Error('Dev tools are unavailable in this build.');return devAction(...args);},
  conversationMetadata: async id => {
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('Invalid thread ID.');
    if(demoMode)return {id,lastModelId:null};
    const generation=connection.generation,result=await liveAPI().thread(id);
    if(generation!==connection.generation||result.id!==id)throw Error('Conversation changed.');
    return {id,lastModelId:typeof result.lastModelId==='string'?result.lastModelId:null};
  },
  referenceContext: async (kind,id) => {
    if(!['thread','captain'].includes(kind)||typeof id!=='string'||!/^jam_[A-Za-z0-9]{26}$/.test(id))throw Error('Unsupported reference identity.');
    if(demoMode)throw Error('Reference is not in the demo workspace.');
    const generation=connection.generation;
    const client=api(key,fetch,AbortSignal.any([readController.signal,transcriptController.signal]));
    const item=await (kind==='captain'?client.captain(id):client.thread(id));
    if(generation!==connection.generation||item.id!==id)throw Error('Reference destination changed.');
    return {...item,isCaptain:kind==='captain'};
  },
  threadReadState: async id => {
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('Invalid thread ID.');
    if(demoMode) return {id,hasUnreads:false};
    const generation=connection.generation, result=await liveAPI().thread(id);
    if(generation!==connection.generation)throw Error('Connection changed.');
    if(result.id!==id || typeof result.hasUnreads!=='boolean')throw Error('Read state unavailable.');
    return {id,hasUnreads:result.hasUnreads};
  },
  threadReceipt: async input => {
    if(dev?.state.blocked)throw Error('Read acknowledgments paused after Dev reload until you interact.');
    if(!input || Object.keys(input).some(k=>!['id','action','eventId'].includes(k)) || typeof input.id!=='string' || !/^[A-Za-z0-9_-]{1,160}$/.test(input.id) || !['read','unread'].includes(input.action) || input.action==='read' && (typeof input.eventId!=='string' || !/^[A-Za-z0-9]{26}$/.test(input.eventId)))throw Error('Invalid read receipt.');
    if(demoMode)return {id:input.id,hasUnreads:input.action==='unread'};
    const generation=connection.generation, result=await liveAPI().receipt(input.id,input.action,input.eventId);
    if(generation!==connection.generation)throw Error('Connection changed.');
    if(result.id!==input.id || typeof result.hasUnreads!=='boolean')throw Error('Read state unavailable.');
    return {id:result.id,hasUnreads:result.hasUnreads};
  },
  zoomState: () => zoom.state(),
  layoutState: () => layoutSettings.load(),
  saveLayout: value => layoutSettings.save(value),
  streamAck: (token, sequence) => { if (typeof token !== 'string' || !Number.isSafeInteger(sequence)) throw Error('Invalid stream acknowledgment.'); streams.ack(token,sequence); },
  stream: input => {
    if (input === null) { streams.stop(); return; }
    if (!input || Object.keys(input).some(k => !['id','token'].includes(k))) throw Error('Invalid stream request.');
    streams.start({...input, scope:Workspace.scope(key,demoMode), key, mock:demoMode,
      demoFetch:demoMode && process.argv.includes('--demo-stream') ? require('./stream-demo.cjs').demoFetch : undefined});
  },
  workspaceConfig: async () => {
    try {
      if ((await fs.stat(treePath())).size>64000) throw Error('Configuration is too large.');
      return {config:WorkTree.config(JSON.parse(await fs.readFile(treePath(),'utf8')))};
    } catch(error) {return {config:WorkTree.defaults(),error:error.code==='ENOENT'?'':'Saved work-tree settings were not changed: '+error.message};}
  },
  saveWorkspaceConfig: async value => {
    const config=WorkTree.config(value), destination=treePath();
    configWrite=configWrite.catch(()=>{}).then(async()=>{
      await fs.mkdir(app.getPath('userData'),{recursive:true});
      await fs.writeFile(destination+'.tmp',JSON.stringify(config),{mode:0o600});
      await fs.rename(destination+'.tmp',destination);
    });
    await configWrite;
  },
  workspace: async () => {
    if(demoMode) return fixture.activity();
    if(!workspaceRead) workspaceRead=Workspace.workspace(liveAPI()).finally(()=>{workspaceRead=null;});
    return workspaceRead;
  },
  models: () => {
    if(demoMode) throw Error('Use Connect live in the header to load your models. Demo mode never creates threads.');
    return liveAPI().models();
  },
  createThread: async input => {
    if(demoMode) throw Error('Demo mode never creates threads.');
    if(!input || JSON.stringify(input).length>34000) throw Error('Invalid creation request.');
    const fingerprint=JSON.stringify(input);
    const prior=creates.get(input.requestId);
    if(prior){if(prior.fingerprint!==fingerprint) throw Error('Request ID already belongs to different options.');return prior.promise;}
    if(creates.size>100) throw Error('Creation limit for this session reached. Reopen the app to continue.');
    const client=liveAPI();
    const promise=(async()=>{
      const [projects,models]=await Promise.all([client.projects(),client.models()]);
      return client.create(Workspace.selection(input,projects.items,models.items));
    })();
    creates.set(input.requestId,{fingerprint,promise});
    try{return await promise;}catch(error){creates.delete(input.requestId);throw error;}
  },
  keymaps: async () => {
    let config = Keymaps.defaults(process.platform === 'darwin'), error = '', repairConfig = null;
    try {
      const stat = await fs.stat(configPath());
      if (stat.size > 32768) throw Error('Configuration exceeds 32 KiB.');
      const saved = JSON.parse(await fs.readFile(configPath(), 'utf8'));
      config = Keymaps.migrate(saved, process.platform === 'darwin');
      if (saved.version !== config.version) await operations.saveKeymaps(config);
    } catch (cause) { if (cause.code !== 'ENOENT') { error = 'Saved keymaps are invalid. Defaults are active. ' + cause.message; repairConfig = cause.config ?? null; } }
    return {config, error, repairConfig, path:configPath(), mac:process.platform === 'darwin'};
  },
  saveKeymaps: async config => {
    if (JSON.stringify(config).length > 32768) throw Error('Configuration exceeds 32 KiB.');
    Keymaps.compile(config, process.platform === 'darwin');
    const serialized = JSON.stringify(config, null, 2) + '\n';
    configWrite = configWrite.catch(() => {}).then(async () => {
      await fs.mkdir(app.getPath('userData'), {recursive:true});
      await fs.writeFile(configPath() + '.tmp', serialized, {mode:0o600});
      await fs.rename(configPath() + '.tmp', configPath());
    });
    await configWrite;
  },
  copyText: text => {
    if (typeof text !== 'string' || text.length > 200000) throw new Error('Invalid clipboard text.');
    clipboard.writeText(text);
  },
  activity: () => {
    if (!demoMode) return operations.workspace().then(data=>({...data,activity:[...data.threads,...data.captains].filter(t=>t.status==='working'||t.needsYou||t.owed).map(t=>({id:t.id,threadId:t.id,kind:t.needsYou||t.owed?'needs':'running',title:t.title||t.name||'Untitled',detail:'Current API status · '+WorkTree.status(t),minutes:Math.max(0,(Date.now()-Date.parse(t.lastActivityAt||t.updatedAt))/60000)}))}));
    return fixture.activity();
  },
  status: () => ({ ...connection.status(), drafts: sessionDrafts.get(Workspace.scope(key, demoMode)) || [], dev:dev ? {checkpoint:dev.checkpoint(Workspace.scope(key,demoMode)),notice:dev.state.notice} : null }),
  stashDrafts: value => {
    if (!Array.isArray(value) || value.length > 100 || JSON.stringify(value).length > 3000000 || value.some(row => !Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || row[0].length > 160 || typeof row[1] !== 'string' || row[1].length > 30000)) throw Error('Invalid drafts.');
    sessionDrafts.set(Workspace.scope(key, demoMode), value);
  },
  connect: async (candidate, remember = true) => { await connection.connect(candidate, remember); return changed(); },
  setMode: async mode => { const result = await connection.mode(mode); if (!result.needsKey) changed(); return result; },
  forgetKey: async () => { await connection.forget(); return changed(); },
  projects: () => (demoMode ? fixture : liveAPI()).projects(),
  cancelMessages: () => { transcriptController.abort(); transcriptController = new AbortController(); previews.reset(); },
  threads: (id, cursor) => (demoMode ? fixture : liveAPI()).threads(id, cursor),
  messages: async (id, query) => {
    const generation = connection.generation;
    const signal = AbortSignal.any([readController.signal, transcriptController.signal]);
    const page = await (demoMode ? fixture : api(key, fetch, signal)).messages(id, query);
    if (generation !== connection.generation || signal.aborted) throw Error('Connection or destination changed.');
    for (const item of page.items) for (const attachment of Array.isArray(item.attachments) ? item.attachments : []) {
      if (typeof attachment?.file?.fileId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(attachment.file.fileId)) attachments.set(id + ':' + attachment.file.fileId, attachment.file);
    }
    return page;
  },
  openLink: async value => {
    const url = safeURL(value);
    if (demoMode) throw new Error('External links are disabled in demo mode.');
    await shell.openExternal(url.href);
  },
  media: async (id, fileId, action) => {
    const generation = connection.generation, mock = demoMode;
    if (typeof id !== 'string' || typeof fileId !== 'string' || !['preview','auto-preview','save'].includes(action)) throw new Error('Invalid media request.');
    const file = attachments.get(id + ':' + fileId);
    if (!file) throw new Error('Open the message carrying this attachment first.');
    if (Number(file.sizeBytes) > 12 * 1024 * 1024) throw new Error('File exceeds 12 MiB.');
    const load = async signal => {
      if (generation !== connection.generation) throw Error('Connection changed.');
      if (mock) {
        if (fileId === 'demo-image') return fs.readFile(path.join(__dirname, 'assets/release-preview.png'));
        if (fileId === 'demo-checklist') return Buffer.from('Release checklist\n1. Open the packaged app\n2. Run the smoke tests\n3. Confirm rollback steps\n');
        throw Error('Sample attachment unavailable.');
      }
      const ticket = await api(key, fetch, AbortSignal.any([readController.signal, signal])).attachment(id, fileId);
      return download(ticket.url, {signal});
    };
    if (action !== 'save') {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.mediaType)) throw Error('This file is not a supported raster image.');
      return previews.get(JSON.stringify([generation,id,file]), action === 'auto-preview', load);
    }
    const name = saveName(file.name);
    const result = await dialog.showSaveDialog(window, {defaultPath:name, title:'Save attachment'});
    if (result.canceled || !result.filePath) return {canceled:true};
    if (path.extname(result.filePath).toLowerCase() !== path.extname(name).toLowerCase()) throw new Error('Keep the original file extension.');
    const bytes = await load(readController.signal);
    if (generation !== connection.generation) throw Error('Connection changed.');
    await fs.writeFile(result.filePath, bytes); return {saved:true};
  },
  send: (id, text, clientKey, model) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 30000 ||
        typeof clientKey !== 'string' || !/^[a-f0-9-]{36}$/.test(clientKey)) {
      throw new Error('Invalid message.');
    }
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('Invalid thread ID.');
    const fingerprint=JSON.stringify([id,text.trim(),model]),prior=sends.get(clientKey);
    if(prior){if(prior.fingerprint!==fingerprint)throw Error('Message ID already belongs to different text.');return prior.promise;}
    if(sends.size>=1000)throw Error('Send limit for this session reached. Reopen to continue.');
    const generation=connection.generation;
    const promise=(async()=>{
      if(model){const catalog=await operations.models();model=ConversationSettings.selection(model,catalog.items);}
      if(generation!==connection.generation)throw Error('Connection changed.');
      const receipt=await (demoMode ? fixture : liveAPI()).send(id,text.trim(),clientKey,model);
      if(generation!==connection.generation)throw Error('Connection changed.');
      if(!receipt||typeof receipt.id!=='string'||!/^[A-Za-z0-9]{26}$/.test(receipt.id)||typeof receipt.deduped!=='boolean')throw Error('Invalid send receipt. Delivery is uncertain; retry with the same message ID.');
      return {id:receipt.id,deduped:receipt.deduped};
    })();
    sends.set(clientKey,{fingerprint,promise});
    promise.catch(()=>{sends.delete(clientKey);});
    return promise;
  }
};

let devAction;
app.whenReady().then(async () => {
  const productName = identity.display(app, Boolean(dev));
  connection = new Connection({ directory: app.getPath('userData'),
    storage: hiddenTest || process.platform !== 'darwin' ? { isEncryptionAvailable: () => false } : safeStorage,
    validate: candidate => api(candidate).projects(), environment: environmentKey, flags: process.argv });
  await connection.start(); changed();
  zoom = new Zoom(app.getPath('userData')); zoom.load();
  layoutSettings=new LayoutSettings(app.getPath('userData'));
  window = new BrowserWindow({
    show: !hiddenTest, focusable: !hiddenTest, paintWhenInitiallyHidden: true,
    width: 1140, height: 760, minWidth: 640, minHeight: 600,
    title: productName, backgroundColor: '#151819',
    webPreferences: { backgroundThrottling: !hiddenTest, preload: dev?.preload ?? path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  if(dev)devAction=dev.attach(window,{scope:()=>Workspace.scope(key,demoMode),busy:()=>connection.busy||connection.activeWrites>0,quiesce:()=>{
    streams.stop();previews.reset(true);operations.cancelMessages();readController.abort();readController=new AbortController();workspaceRead=null;
  }});
  const zoomMenu = {label:'View',submenu:[
    {id:'zoom-in',label:'Zoom In',accelerator:'CommandOrControl+=',click:()=>changeZoom('in')},
    {id:'zoom-out',label:'Zoom Out',accelerator:'CommandOrControl+-',click:()=>changeZoom('out')},
    {id:'zoom-reset',label:'Actual Size (100%)',accelerator:'CommandOrControl+0',click:()=>changeZoom('reset')}
  ]};
  const menu = Menu.buildFromTemplate([...(process.platform === 'darwin' ? [{role:'appMenu'}] : []), {role:'editMenu'}, zoomMenu, {role:'windowMenu'}]);
  Menu.setApplicationMenu(hiddenTest ? null : menu);
  window.webContents.on('before-input-event', (event,input) => {
    const action = zoomAction(input,process.platform === 'darwin');
    if (!action) return;
    event.preventDefault();
    changeZoom(action);
  });
  window.webContents.on('did-finish-load', () => window.webContents.setZoomFactor(zoom.value / 100));
  window.setMenuBarVisibility(false);
  window.on('hide', () => streams.stop());
  window.webContents.on('did-start-navigation', () => streams.stop());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== pageURL) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_sender, _permission, callback) => callback(false));
  for (const [name, handler] of Object.entries(operations)) {
    ipcMain.handle('desk:' + name, async (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pageURL) {
        throw new Error('Unknown sender.');
      }
      try {
        if (connection.busy && !['status','keymaps','copyText','zoomState','layoutState','saveLayout'].includes(name)) throw Error('Connection change in progress.');
        const write = ['send','createThread','threadReceipt'].includes(name) || name === 'media' && args[2] === 'save';
        if (write) connection.activeWrites++;
        try { return { value: await handler(...args) }; }
        finally { if (write) connection.activeWrites--; }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request failed.';
        return { error: message.replace(/capy_[A-Za-z0-9_-]+/g, '[redacted]') };
      }
    });
  }
  window.loadFile(page);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => streams.stop());
