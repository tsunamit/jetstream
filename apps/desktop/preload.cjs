const { contextBridge, ipcRenderer } = require('electron');
const methods = ['workspaceConfig','saveWorkspaceConfig','workspace','models','createThread','keymaps', 'saveKeymaps', 'status', 'connect', 'setMode', 'forgetKey', 'projects', 'threads', 'messages', 'send', 'activity', 'media', 'openLink', 'copyText'];
methods.push('stashDrafts', 'cancelMessages');
methods.push('referenceContext');
methods.push('stream','streamAck');
methods.push('zoomState');
methods.push('layoutState','saveLayout');
methods.push('threadReceipt','threadReadState');
methods.push('dev');
methods.push('conversationMetadata');
methods.push('userConfig','reloadConfig','saveConfig','openConfig','migrateToolActivity');
methods.push('providerInfo');
methods.push('creationOptions');
let providerContext;
const invoke = name => async (...args) => {
  const result = await ipcRenderer.invoke('desk:' + name, ...args);
  if (result.error) throw Object.assign(new Error(result.error),{code:result.code});
  if(name==='status'&&!providerContext)providerContext=result.value.provider;
  if(name==='providerInfo'&&!providerContext)providerContext=result.value;
  return result.value;
};
const providerMethods = {info:'providerInfo',workspace:'workspace',workspaceSettings:'workspaceConfig',saveWorkspaceSettings:'saveWorkspaceConfig',projects:'projects',conversations:'threads',content:'messages',send:'send',models:'models',creationOptions:'creationOptions',createConversation:'createThread',metadata:'conversationMetadata',readState:'threadReadState',markRead:'threadReceipt',reference:'referenceContext',activity:'activity',stream:'stream',ack:'streamAck',cancelContent:'cancelMessages'};
const onStream = callback => {
  if (typeof callback !== 'function') throw Error('Invalid stream listener.');
  const listener = (_event, batch) => callback(batch);
  ipcRenderer.on('desk:stream', listener);
  return () => ipcRenderer.removeListener('desk:stream', listener);
};
const providerInvoke = operation => async (...args) => {
  try{
    if(operation==='providerInfo')return {value:await invoke(operation)()};
    if(!providerContext)await invoke('providerInfo')();
    const context=providerContext;
    return await ipcRenderer.invoke('desk:'+operation,...args,{providerContext:{scope:context.scope,generation:context.generation}});
  }catch(error){return {error:error.message,code:'provider'};}
};
contextBridge.exposeInMainWorld('desk', {provider:{...Object.fromEntries(Object.entries(providerMethods).map(([name,operation])=>[name,providerInvoke(operation)])),onStream},...Object.fromEntries(methods.map(name => [name, invoke(name)])), onConfig: callback => {
  if(typeof callback!=='function')throw Error('Invalid config listener.');
  const listener=(_event,state)=>callback(state);
  ipcRenderer.on('desk:config',listener);
  return ()=>ipcRenderer.removeListener('desk:config',listener);
}, onDev: callback => {
  if(typeof callback!=='function')throw Error('Invalid Dev listener.');
  const listener=(_event,state)=>callback(state);
  ipcRenderer.on('desk:dev',listener);
  return ()=>ipcRenderer.removeListener('desk:dev',listener);
}, onZoom: callback => {
  if (typeof callback !== 'function') throw Error('Invalid zoom listener.');
  const listener = (_event, state) => callback(state);
  ipcRenderer.on('desk:zoom', listener);
  return () => ipcRenderer.removeListener('desk:zoom', listener);
}, onStream});
