const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'capy-dev-smoke-'));
  const stage=path.join(root,'source'),profile=path.join(root,'profile');
  const out=process.argv[2]||path.join(os.homedir(),'.capy/work/JETS-30/renders');
  await fs.mkdir(stage);await fs.mkdir(out,{recursive:true});
  for(const entry of await fs.readdir(__dirname,{withFileTypes:true})) {
    if(entry.isFile()&&/\.(cjs|js|json|css|html)$/.test(entry.name)||entry.name==='assets')await fs.cp(path.join(__dirname,entry.name),path.join(stage,entry.name),{recursive:true});
  }
  await fs.symlink(path.join(__dirname,'node_modules'),path.join(stage,'node_modules'));
  await fs.writeFile(path.join(stage,'dev-fixture.css'),'body { --dev-activity-token: 0; }\n');
  const html=await fs.readFile(path.join(stage,'index.html'),'utf8');
  await fs.writeFile(path.join(stage,'index.html'),html.replace('</head>','<link rel="stylesheet" href="./dev-fixture.css">\n</head>'));
  let app,stable;
  try {
    app=await _electron.launch({args:[stage,'--demo','--dev-launch','--user-data-dir='+profile]});
    const page=await app.firstWindow();
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.locator('#dev-tools').waitFor();
    await page.waitForFunction(()=>!messageBusy&&!navigating&&layoutView.ready);
    const proof=await app.evaluate(async({app,BrowserWindow})=>{
      const w=BrowserWindow.getAllWindows()[0],image=await w.capturePage(),bytes=image.toBitmap();
      return {name:app.getName(),profile:app.getPath('userData'),visible:w.isVisible(),focused:w.isFocused(),colors:new Set(Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4))).size,png:image.toPNG().toString('base64'),sandbox:w.webContents.getLastWebPreferences().sandbox,isolation:w.webContents.getLastWebPreferences().contextIsolation,node:w.webContents.getLastWebPreferences().nodeIntegration};
    });
    assert.equal(proof.name,'Capy Terminal Dev');assert.equal(proof.visible,false);assert.equal(proof.focused,false);assert.ok(proof.colors>100);assert.equal(proof.sandbox,true);assert.equal(proof.isolation,true);assert.equal(proof.node,false);
    await fs.writeFile(path.join(out,'dev-hidden.png'),Buffer.from(proof.png,'base64'));
    console.log('PASS hidden Dev rendering, profile and security boundaries');
    const stableProfile=path.join(root,'stable-profile');
    stable=await _electron.launch({args:[stage,'--demo','--user-data-dir='+stableProfile]});
    const stablePage=await stable.firstWindow();await stablePage.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    assert.equal(await stablePage.evaluate(async()=>Boolean((await desk.status()).dev)),false);
    assert.notEqual(await stable.evaluate(({app})=>app.getName()),'Capy Terminal Dev');
    await stable.close();stable=null;
    console.log('PASS stable and Dev coexist with separate profiles');
    const second=spawn(require('electron'),[stage,'--demo','--dev-launch','--test-hidden','--user-data-dir='+profile],{env:{...process.env,CAPY_API_KEY:''},stdio:'ignore'});
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{second.kill();reject(Error('Duplicate Dev instance did not exit.'));},10000);second.on('exit',code=>{clearTimeout(timer);resolve(code);});second.on('error',reject);});
    assert.equal(code,0);console.log('PASS one Dev instance per profile');
    await app.evaluate(({ipcMain})=>{
      globalThis.__devCounts={send:0,streams:[],receipts:0};
      for(const name of ['send','stream','threadReceipt']){
        const original=ipcMain._invokeHandlers.get('desk:'+name);
        ipcMain._invokeHandlers.set('desk:'+name,async(event,...args)=>{
          if(name==='send')globalThis.__devCounts.send++;
          if(name==='stream')globalThis.__devCounts.streams.push(args[0]);
          if(name==='threadReceipt')globalThis.__devCounts.receipts++;
          return original(event,...args);
        });
      }
    });
    await page.evaluate(()=>{composer.setText('One explicit demo send');$('send').click();});
    await page.waitForFunction(()=>!pending&&[...outgoing.items.values()].some(item=>item.state==='accepted'));
    const original=await page.evaluate(async()=>{
      const item=(await desk.threads(project)).items.find(item=>item.id!==thread.id);await openThread(item,{projectId:project});
      conversationControls.choices.set(item.id,{modelId:'fixture/model-a',reasoningMode:'high',modes:{fast:true}});
      conversationControls.choices.set(history[0].item.id,{modelId:'fixture/model-b',modes:{pro:true}});
      conversationControls.render();
      composer.setText('Draft that must survive\nSecond line');composer.view.focus();
      composer.view.dispatch({selection:ComposerEngine.EditorSelection.range(3,12)});
      layoutView.config.sidebarWidth=320;layoutView.config.replyHeight=180;layoutView.apply(()=>{});
      chatPosition=5;chatAnchor=2;paintChat(false);
      transcript.scrollTop=0;
      window.__devLoadIdentity=crypto.randomUUID();
      return {id:thread.id,text:draft.value,selection:composer.snapshot().selection,identity:window.__devLoadIdentity,history:history.map(view=>view.item?.id),historyIndex,chatPosition,chatAnchor,models:[...conversationControls.choices]};
    });
    assert.deepEqual(await page.evaluate(()=>{
      const value={modelId:'fixture/model',reasoningMode:'high',modes:{fast:true}};
      const clone=devReload.modelChoices([['good',value]]);value.modes.fast=false;
      return {older:devReload.modelChoices(undefined),invalid:devReload.modelChoices([null,['bad'],['../bad',{modelId:'a'}],['bad',{modelId:''}],['bad',{modelId:'x'.repeat(257)}],['bad',{modelId:'a',reasoningMode:5}],['bad',{modelId:'a',modes:{daybreak:true}}],['bad',{modelId:'a',modes:{fast:'yes'}}],['bad',{modelId:'a',extra:true}]]),bounded:devReload.modelChoices(Array.from({length:102},(_,i)=>['thread'+i,{modelId:'a'}])).map(([id])=>id),clone};
    }),{older:[],invalid:[],bounded:Array.from({length:100},(_,i)=>'thread'+(i+2)),clone:[['good',{modelId:'fixture/model',reasoningMode:'high',modes:{fast:true}}]]});
    const stylesheetCount=await page.locator('link[rel="stylesheet"]').count();
    const css=await fs.readFile(path.join(stage,'style.css'),'utf8');
    await fs.writeFile(path.join(stage,'style.css'),css+'\nbody { --dev-test-token: 37; }\n');
    await page.waitForFunction(()=>getComputedStyle(document.body).getPropertyValue('--dev-test-token').trim()==='37');
    assert.deepEqual(await page.evaluate(()=>({identity:window.__devLoadIdentity,text:draft.value,selection:composer.snapshot().selection,focus:composer.focused()})),{identity:original.identity,text:original.text,selection:original.selection,focus:true});
    console.log('PASS CSS hot update retains renderer, draft, editor selection and focus');
    const styleHref=await page.locator('link[rel="stylesheet"]').first().getAttribute('href');
    await fs.writeFile(path.join(stage,'dev-fixture.css'),'body { --dev-activity-token: 47; }\n');
    await page.waitForFunction(()=>getComputedStyle(document.body).getPropertyValue('--dev-activity-token').trim()==='47');
    assert.deepEqual(await page.evaluate(()=>({identity:window.__devLoadIdentity,text:draft.value,selection:composer.snapshot().selection,focus:composer.focused()})),{identity:original.identity,text:original.text,selection:original.selection,focus:true});
    assert.equal(await page.locator('link[rel="stylesheet"]').first().getAttribute('href'),styleHref);
    assert.equal(await page.locator('link[rel="stylesheet"]').count(),stylesheetCount);
    const registered=await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
    await page.evaluate(()=>devReload.style(999,['../outside.css','https://example.com/remote.css','not-registered.css']));
    assert.deepEqual(await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),registered);
    console.log('PASS second registered stylesheet updates only its own link and preserves renderer/editor state; unknown paths are ignored');
    const counts=await app.evaluate(()=>globalThis.__devCounts);
    assert.equal(await app.evaluate(({BrowserWindow})=>{
      let prevented=false;
      BrowserWindow.getAllWindows()[0].webContents.emit('before-input-event',{preventDefault:()=>{prevented=true;}},{type:'keyDown',key:'r',meta:true,control:false});
      return prevented;
    }),true);
    await page.waitForFunction(()=>devReload.enabled&&!devReload.restoring&&devReload.holdReads&&thread?.id);
    const restored=await page.evaluate(()=>({id:thread.id,text:draft.value,selection:composer.snapshot().selection,sidebar:layoutView.config.sidebarWidth,reply:layoutView.config.replyHeight,history:history.map(view=>view.item?.id),historyIndex,scroll:transcript.scrollTop,focus:composer.focused(),notice:$('dev-notice').textContent,chatPosition,chatAnchor}));
    assert.equal(restored.id,original.id,restored.notice);assert.equal(restored.text,original.text);assert.deepEqual(restored.selection,original.selection);assert.equal(restored.sidebar,320);assert.equal(restored.reply,180);assert.deepEqual(restored.history,original.history);assert.equal(restored.historyIndex,original.historyIndex);assert.equal(restored.scroll,0);assert.equal(restored.focus,true);
    assert.equal(restored.chatPosition,original.chatPosition);assert.equal(restored.chatAnchor,original.chatAnchor);
    assert.deepEqual(await page.evaluate(()=>[...conversationControls.choices]),original.models);
    assert.match(await page.locator('#conversation-model').innerText(),/fixture\/model-a/);
    console.log('PASS bounded per-thread next-message choices restore without sending; malformed and older choice snapshots are safe');
    console.log('PASS renderer reload restores draft, selection, focus, context, history, pane layout and scroll');
    const afterCounts=await app.evaluate(()=>globalThis.__devCounts);
    assert.equal(afterCounts.send,1);assert.equal(counts.send,1);
    assert.equal(afterCounts.receipts,counts.receipts);
    const afterStreams=afterCounts.streams.slice(counts.streams.length).filter(Boolean);
    assert.equal(afterStreams.length,1);assert.equal(afterStreams[0].id,original.id);
    console.log('PASS Cmd+R reconnects one stream without duplicate sends or read acknowledgments');
    assert.equal(await page.evaluate(async()=>{try{await desk.threadReceipt({id:thread.id,action:'unread'});return false;}catch{return true;}}),true);
    console.log('PASS reload cannot issue a read acknowledgment until intentional input');
    const raw=await fs.readFile(path.join(stage,'renderer.js'),'utf8');
    await fs.writeFile(path.join(stage,'renderer.js'),raw+'\nconst syntax = ;\n');
    await page.waitForFunction(()=>$('dev-notice').textContent.includes('Build failed'));
    const beforeFailure=await page.evaluate(()=>draft.value);
    await page.evaluate(()=>devReload.reload());
    assert.equal(await page.evaluate(()=>draft.value),beforeFailure);
    await fs.writeFile(path.join(stage,'renderer.js'),raw+'\n');
    await page.waitForFunction(()=>$('dev-notice').textContent.includes('update ready'));
    console.log('PASS syntax failure keeps current renderer and recovers on save');
    await fs.appendFile(path.join(stage,'preload.cjs'),"\ncontextBridge.exposeInMainWorld('devBoundaryMarker',true);\n");
    await page.waitForFunction(()=>$('dev-notice').textContent.includes('quit Dev'));
    const sameRenderer=await page.evaluate(()=>{window.__restartProof=crypto.randomUUID();return window.__restartProof;});
    await page.evaluate(()=>devReload.reload());
    assert.equal(await page.evaluate(()=>window.__restartProof),sameRenderer);
    assert.match(await page.locator('#dev-notice').innerText(),/Quit Dev/);
    await page.reload();await page.locator('#dev-tools').waitFor();
    await page.waitForFunction(()=>!devReload.restoring&&thread?.id);
    assert.equal(await page.evaluate(()=>typeof window.devBoundaryMarker),'undefined');
    console.log('PASS preload change requires explicit restart');
    const names=await fs.readdir(profile);assert.equal(names.includes('credential.bin'),false);
    const disk=await Promise.all(names.filter(name=>name.endsWith('.json')).map(name=>fs.readFile(path.join(profile,name),'utf8')));
    assert.equal(disk.some(text=>text.includes(original.text)),false);
    await fs.writeFile(path.join(out,'dev-restored.png'),await page.screenshot());
    console.log('PASS reload draft state is not persisted to profile JSON');
    await app.close();app=null;
    console.log('PASS Dev watcher/window cleanup');
  } finally {await stable?.close();await app?.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
