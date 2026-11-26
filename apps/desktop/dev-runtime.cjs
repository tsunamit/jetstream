const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {watch,mainFiles} = require('./dev-watch.cjs');
const {build} = require('./dev-build.cjs');
const {devName} = require('./product-identity.cjs');

function profile(app, args) {
  const name = args.find(arg => arg.startsWith('--dev-profile='))?.slice(14) || 'default';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) throw Error('Use a Dev profile name with 1–40 letters, digits, underscores or hyphens.');
  const override = args.find(arg => arg.startsWith('--user-data-dir='));
  if (override && !args.includes('--test-hidden')) throw Error('Dev profiles cannot override the stable user-data path. Use --dev-profile=name.');
  if(override) {
    const relative=path.relative(os.tmpdir(),path.resolve(override.slice(16)));
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Hidden Dev tests require an isolated temporary profile.');
  }
  return override ? override.slice(16) : path.join(app.getPath('appData'),devName,'profiles',name);
}

function setup({app, args, directory}) {
  const directoryPath = profile(app,args);
  fs.mkdirSync(directoryPath,{recursive:true,mode:0o700});
  app.setName(devName);
  app.setPath('userData',directoryPath);
  app.setPath('sessionData',directoryPath);
  delete process.env.CAPY_API_KEY;
  if (!app.requestSingleInstanceLock()) app.exit(0);
  app.on('second-instance',()=>{});
  const boundary=fs.mkdtempSync(path.join(os.tmpdir(),'capy-dev-boundary-'));
  const preload=path.join(boundary,'preload.cjs');
  fs.copyFileSync(path.join(directory,'preload.cjs'),preload);
  app.once('will-quit',()=>fs.rmSync(boundary,{recursive:true,force:true}));
  const originals=new Map([...mainFiles].map(name=>[name,fs.existsSync(path.join(directory,name))?fs.readFileSync(path.join(directory,name)):null]));
  let watcher, checkpoint = null, version = 0, prepared = false;
  const state = {blocked:false, ready:false, building:false, restart:false, notice:'Dev · source watcher active'};
  let buildQueue=Promise.resolve(),buildCount=0;
  function rebuild() {
    buildCount++;state.building=true;
    const result=buildQueue.catch(()=>{}).then(()=>build(directory));
    buildQueue=result;
    return result.finally(()=>{if(--buildCount===0)state.building=false;});
  }
  function restartRequired() {
    return state.restart||[...originals].some(([name,bytes])=>{
      try{return !bytes||!bytes.equals(fs.readFileSync(path.join(directory,name)));}catch{return Boolean(bytes);}
    });
  }
  return {
    preload,
    state,
    clear() {checkpoint=null;state.blocked=false;},
    checkpoint(scope) {return checkpoint?.scope===scope ? checkpoint.value : null;},
    attach(window, {scope, quiesce, busy}) {
      const emit = event => {
        if (window.isDestroyed()) return;
        if(event.type!=='style')prepared=false;
        if (event.type==='renderer') {state.ready=true;state.building=false;state.notice='Renderer update ready · Cmd+R to reload';}
        if (event.type==='restart') {state.restart=true;state.notice='Main / preload changed · quit Dev and run the launch command again';}
        if (event.type==='error') {state.building=false;state.notice=event.message;}
        window.webContents.send('desk:dev', {...event, version:++version, notice:state.notice});
      };
      watcher=watch({directory,build:rebuild,emit});
      const close=()=>{watcher?.close();watcher=null;};
      window.once('closed',close);app.once('before-quit',close);
      window.webContents.on('before-input-event',(event,input)=>{
        if(input.type==='keyDown' && (input.meta||input.control) && input.key.toLowerCase()==='r') {
          event.preventDefault();window.webContents.send('desk:dev',{type:'reload'});
        }
      });
      return async (action,value) => {
        if(action==='resume') {state.blocked=false;return;}
        if(!['prepare','reload'].includes(action))throw Error('Unknown Dev action.');
        if(restartRequired())throw Error('Main / preload changed. Quit Dev and run the launch command again; renderer reload cannot apply this change.');
        if(busy()||state.building)throw Error('Wait for the active send, connection change or build before reloading.');
        if(action==='prepare') {
          try{await rebuild();}catch{throw Error('Build failed. Fix the source and save again; the current renderer is unchanged.');}
          if(busy()||state.building||restartRequired())throw Error('Source or connection changed during the build. Wait, then retry; main / preload changes require restarting Dev.');
          prepared=true;
          return true;
        }
        if(!prepared)throw Error('Prepare the renderer build before reloading.');
        prepared=false;
        if(!value || JSON.stringify(value).length>4000000)throw Error('Reload state exceeds the Dev session limit.');
        checkpoint={scope:scope(),value};state.blocked=true;
        quiesce();state.ready=false;
        setImmediate(()=>{if(!window.isDestroyed())window.webContents.reload();});
        return true;
      };
    }
  };
}
module.exports={profile,setup};
