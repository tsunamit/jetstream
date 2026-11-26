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
contextBridge.exposeInMainWorld('desk', {...Object.fromEntries(methods.map(name => [name, async (...args) => {
  const result = await ipcRenderer.invoke('desk:' + name, ...args);
  if (result.error) throw new Error(result.error);
  return result.value;
}])), onDev: callback => {
  if(typeof callback!=='function')throw Error('Invalid Dev listener.');
  const listener=(_event,state)=>callback(state);
  ipcRenderer.on('desk:dev',listener);
  return ()=>ipcRenderer.removeListener('desk:dev',listener);
}, onZoom: callback => {
  if (typeof callback !== 'function') throw Error('Invalid zoom listener.');
  const listener = (_event, state) => callback(state);
  ipcRenderer.on('desk:zoom', listener);
  return () => ipcRenderer.removeListener('desk:zoom', listener);
}, onStream: callback => {
  if (typeof callback !== 'function') throw Error('Invalid stream listener.');
  const listener = (_event, batch) => callback(batch);
  ipcRenderer.on('desk:stream', listener);
  return () => ipcRenderer.removeListener('desk:stream', listener);
}});
