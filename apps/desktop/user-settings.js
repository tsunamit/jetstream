const userSettings={revision:null,ready:false};
function applyUserConfig(state,force=false) {
  if(userSettings.ready&&Number.parseInt(state.revision)<Number.parseInt(userSettings.revision))return;
  const changed=state.revision!==userSettings.revision;
  userSettings.revision=state.revision;
  $('keymaps-location').textContent='Settings file: '+state.path;
  $('keymaps-error').textContent=state.error;
  keyConfigIssue=state.error;
  if(!changed&&userSettings.ready&&!force) {renderKeyHints();return;}
  if(layoutView.editRevision!=null) {
    $('layout-status').textContent='Config changed on disk; pending resize cancelled. Review and retry.';
    say($('layout-status').textContent);
  }
  clearKeySequence();
  keyConfig=state.config.keymaps;keyMac=state.mac;
  keyBindings=Keymaps.compile(keyConfig,keyMac);keyRepairConfig=state.repairKeymaps;keyReady=true;
  composer.cancelInsertChord();
  syncComposerBindings();
  if(layoutView.drag)layoutView.finish(true);
  clearTimeout(layoutView.saveTimer);layoutView.saveTimer=null;layoutView.editRevision=null;
  layoutView.config={...state.config.layout};layoutView.ready=true;layoutView.apply();
  setToolActivity(state.config.showToolActivity);
  userSettings.ready=true;
  renderKeyHints();
  if(state.error)say(state.error);
}
$('open-config').onclick=()=>desk.openConfig().catch(fail);
$('reload-config').onclick=()=>desk.reloadConfig().then(state=>{
  applyUserConfig(state);
  if(!state.error) {editKeymaps();$('keymaps-error').textContent='Config reloaded.';}
}).catch(fail);
desk.onConfig(applyUserConfig);
let legacyToolActivity=null;
try {const value=localStorage.getItem('showToolActivity');if(value==='true'||value==='false')legacyToolActivity=value==='true';}catch{}
desk.migrateToolActivity(legacyToolActivity).then(applyUserConfig).catch(async error=>{applyUserConfig(await desk.userConfig());fail(error);});
