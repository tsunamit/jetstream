let keyConfig = Keymaps.defaults(false), keyBindings = [], keyMac = false;
let keySequence = [], keyTimer, keyScope = '', keyReady = false;
let keyConfigIssue = '';
let keyRepairConfig = null;
const settingsDialog = $('keymaps-settings');
const compactShell=matchMedia('(max-width:720px)');
function compactChatActions() { $('chat-actions').open=!compactShell.matches; }
compactShell.addEventListener('change',compactChatActions);compactChatActions();
const keyHandlers = {
  chatReference:openCurrentReference,
  resetLayout:()=>layoutView.reset(),
  toggleSidebar:()=>toggleSidebar(),
  toggleToolActivity:()=>toggleToolActivity(),
  markRead:()=>readState.explicit('read'),markUnread:()=>readState.explicit('unread'),
  newThread:()=>newThread.open(),
  back: () => traverseHistory(-1), forward: () => traverseHistory(1),
  switchPane: () => {const windows=[...($('navigator').hidden?[]:['navigator']),'conversation',...(draft.disabled?[]:['composer'])];focusWindow(windows[(windows.indexOf(pane)+1)%windows.length]);},
  windowLeft:()=>moveWindow('h'),windowDown:()=>moveWindow('j'),windowUp:()=>moveWindow('k'),windowRight:()=>moveWindow('l'),
  navigator: () => focusWindow('navigator'), conversation: () => $('conversation').focus(),
  reply: () => { if (!draft.disabled) insertDraft(); },
  normal: normalDraft, send: () => $('composer').requestSubmit($('send')),
  help: () => $('help').click(), settings: () => $('keymaps-button').click(),
  centralSearch: () => showPicker('centralSearch'),
  resultsGlobal: () => showPicker('results'),
  threads: () => showPicker('threads'), running: () => showPicker('running'),
  captains: () => showPicker('captains'),
  needs: () => showPicker('needs'), results: () => showPicker('results'), pins: () => showPicker('pins'),
  pin: togglePin, pin1: () => jumpPin(0), pin2: () => jumpPin(1), pin3: () => jumpPin(2), pin4: () => jumpPin(3),
  pickerOpen: commitPicker
};
keyHandlers.pickerCollectionNext=()=>cyclePickerCollection(1);
keyHandlers.pickerCollectionPrevious=()=>cyclePickerCollection(-1);
for (const motion of ['Left','Right','Down','Up','Word','BackWord','Start','End','First','Last']) {
  keyHandlers['chat' + motion] = () => chatMove(motion);
  keyHandlers['draft' + motion] = () => draftMove(motion);
}
Object.assign(keyHandlers, {
  chatPreviousMessage:() => chatMessage(-1), chatNextMessage:() => chatMessage(1),
  chatVisual:() => chatVisual(), chatVisualLine:() => chatVisual(true), chatYank:yankChat, chatCancel:cancelChatVisual,
  chatSearch:openChatSearch, chatNextMatch:() => findChat(1), chatPreviousMatch:() => findChat(-1), chatActivate:activateChatObject,
  draftAppend:() => insertDraft(true), draftDelete:() => editDraft('Delete'), draftDeleteLine:() => editDraft('DeleteLine'),
  draftDeleteWord:() => editDraft('DeleteWord'), draftYankLine:() => editDraft('YankLine'), draftPaste:() => editDraft('Paste'),
  draftUndo:() => editDraft('Undo'),
  draftExit:normalDraft
});
for(const [id,[surface,action]] of Object.entries(navigationActions))keyHandlers[id]=()=>navigationFrames[surface].perform(action);
keyHandlers.pickerBrowseMode=browsePicker;
function focusWindow(target) {
  if(target==='navigator' && $('navigator').hidden) toggleSidebar(true,false);
  if (target === pane && effectiveScope().scope !== 'chatControl') return;
  if (composer.focused()) normalDraft();
  if (target === 'composer') { if (!draft.disabled) normalDraft(); }
  else if (target === 'navigator') (navigatorRows().find(row=>row.dataset.id===thread?.id) ?? navigatorRows()[0] ?? $('navigator')).focus();
  else $(target).focus();
}
function moveWindow(direction) {
  const destinations={navigator:{l:'conversation'},conversation:{h:'navigator',j:'composer'},composer:{h:'navigator',k:'conversation'}};
  focusWindow(destinations[pane]?.[direction] ?? pane);
}
function syncComposerBindings() {
  if(typeof sidebarToggleHint==='function')sidebarToggleHint();
  ComposerEngine.setInsertEscapes(keyBindings.filter(binding=>binding.id==='normal' && binding.keys.every(key=>key.length===1)).map(binding=>binding.keys.join('')),keyConfig.timeout);
}
function visibleAction(id,config) {return !(id.startsWith('draft') || ['navigator','conversation'].includes(id)) || Object.hasOwn(config.mappings,id);}
function clearKeySequence() {
  keySequence = [];
  clearTimeout(keyTimer);
  keyboardMode();
}
function mappingLabel(id) {
  return keyBindings.filter(b => b.id === id).map(b => b.keys.map(displayKey).join(' ')).join(' / ');
}
globalThis.imagePreviewHint = () => (mappingLabel('chatActivate') || 'Unmapped · Keymaps: Chat open current image') + ' opens preview · Esc closes · '+(mappingLabel('chatReference') || 'Unmapped')+' opens reference in history';
function primaryMappingLabel(id, editor = false) {
  const binding=keyBindings.find(b=>b.id===id&&(!editor||composerAppBinding(b)));
  return binding ? binding.keys.map(displayKey).join(' ') : '';
}
function displayKey(token) {
  const modifiers = {C:'Ctrl',M:'⌘',A:'Alt',S:'Shift'};
  const labels = {' ':'Space',Escape:'Esc',ArrowDown:'Down',ArrowUp:'Up',ArrowLeft:'Left',ArrowRight:'Right'};
  const match = /^((?:[ACMS]:)+)(.*)$/s.exec(token);
  return match ? match[1].slice(0,-1).split(':').map(mod => modifiers[mod]).concat(labels[match[2]] ?? match[2]).join('+') : labels[token] ?? token;
}
function keyHint(id) { const label = mappingLabel(id); return label ? ' · ' + label : ''; }
function renderKeyHints() {
  toolActivityHints();
  document.querySelectorAll('.image-hint').forEach(node => { node.textContent = globalThis.imagePreviewHint(); });
  $('keymaps-button').textContent = keyConfigIssue ? 'Keymaps (repair)' : 'Keymaps';
  for (const [id, action, label] of [['back','back','Back'], ['forward','forward','Forward'], ['find','resultsGlobal','Recent results'], ['send','send','Queue reply'], ['keymaps-button','settings','Keymaps']]) {
    $(id).title = label + keyHint(action);
  }
  $('find').textContent = 'Jump' + keyHint('centralSearch');
  $('find').title = 'Search captains and threads' + keyHint('centralSearch');
  $('help').title = 'Shortcuts' + keyHint('help');
  $('help').textContent = (mappingLabel('help') ? mappingLabel('help') + ' ' : '') + 'Shortcuts';
  $('edit-reply').title = 'Edit reply' + keyHint('reply');
  $('new-thread-button').title = 'New thread' + keyHint('newThread');
  $('chat-select').title = 'Select text' + keyHint('chatVisual');
  $('chat-copy').title = 'Copy selection' + keyHint('chatYank');
  $('active-keys').textContent = ['switchPane','reply','help'].map(id => (mappingLabel(id) || 'unmapped') + ' ' + Keymaps.actions[id][0].toLowerCase()).join(' · ');
  pickerHints();
  $('active-shortcuts').replaceChildren(...Object.entries(Keymaps.actions).filter(([id])=>visibleAction(id,keyConfig)).flatMap(([id, [label, scope]]) => {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = mappingLabel(id) || 'Unmapped'; dd.textContent = label + ' · ' + scope;
    return [dt, dd];
  }));
  for (const [keys,label] of [[keyMac?'⌘ + / ⌘ = / Shift+⌘ =':'Ctrl + / Ctrl = / Shift+Ctrl =','Zoom in'],[keyMac?'⌘ −':'Ctrl −','Zoom out'],[keyMac?'⌘ 0':'Ctrl 0','Reset zoom to 100%']]) {
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=keys;dd.textContent=label+' · native View menu · 50–200%';
    $('active-shortcuts').append(dt,dd);
  }
  for (const button of document.querySelectorAll('[data-picker]')) button.title = Keymaps.actions[button.dataset.picker][0] + keyHint(button.dataset.picker);
  for (const [index, button] of [...$('pin-list').children].entries()) button.title = 'Quick jump ' + (index + 1) + keyHint('pin' + (index + 1));
  $('pin-current').textContent = (pins.includes(thread?.id) ? 'Unpin current thread' : 'Pin current thread') + keyHint('pin');
  keyboardMode();
}
function editKeymaps() {
  const editable = keyRepairConfig ?? keyConfig;
  $('map-leader').value = editable.leader;
  $('map-timeout').value = editable.timeout;
  $('keymaps-rows').replaceChildren(...Object.entries(Keymaps.actions).filter(([id])=>visibleAction(id,editable)).map(([id, [label, scope]]) => {
    const row = document.createElement('label');
    row.textContent = label + ' · ' + scope;
    const input = document.createElement('input');
    input.dataset.action = id;
    input.id = 'map-' + id;
    input.value = (editable.mappings[id] ?? Keymaps.fallback(id,keyMac)).join(' | ');
    input.spellcheck = false;
    input.autocomplete = 'off';
    row.append(input); return row;
  }));
}
$('keymaps-button').onclick = () => { clearKeySequence(); editKeymaps(); settingsDialog.showModal(); };
$('close-keymaps').onclick = () => settingsDialog.close();
async function saveKeymaps(config) {
  try {
    const compiled = Keymaps.compile(config, keyMac);
    await desk.saveKeymaps(config);
    keyConfig = config; keyBindings = compiled; keyConfigIssue = ''; keyRepairConfig = null; keyReady = true;
    syncComposerBindings();
    clearKeySequence(); renderKeyHints();
    $('keymaps-error').textContent = 'Saved. Active now and after restart.';
    return true;
  } catch (error) { $('keymaps-error').textContent = error.message; return false; }
}
$('keymaps-form').onsubmit = async event => {
  event.preventDefault();
  const mappings = {};
  for (const input of $('keymaps-rows').querySelectorAll('input')) mappings[input.dataset.action] = input.value.trim() ? input.value.split('|').map(value => value.trim()) : [];
  await saveKeymaps({version:3, leader:$('map-leader').value, timeout:Number($('map-timeout').value), mappings});
};
$('reset-keymaps').onclick = async () => { if (await saveKeymaps(Keymaps.defaults(keyMac))) editKeymaps(); };
document.addEventListener('focusin', clearKeySequence);
document.addEventListener('pointerdown', clearKeySequence, true);
document.addEventListener('compositionstart', clearKeySequence, true);
window.addEventListener('blur', clearKeySequence);
document.addEventListener('visibilitychange', clearKeySequence);
function composerAppBinding(binding) {
  if (binding.id === 'normal' && binding.keys.every(key=>key.length===1)) return false;
  if (['back','forward'].includes(binding.id) && binding.keys.some(key=>['C:o','C:i'].includes(key))) return false;
  if (binding.scope === 'windows') {
    if (binding.keys.length===1 && /^(?:[ACMS]:)+/.test(binding.keys[0])) return true;
    return composer.idle();
  }
  if (binding.scope === 'global' || binding.id === 'send' || binding.id === 'normal' || binding.scope === 'composerNormal') return true;
  if (!composer.idle()) return false;
  if (binding.notation.toLowerCase().startsWith('<leader>')) return true;
  return ['navigator','conversation','switchPane','back','forward'].includes(binding.id) && /^(?:[ACMS]:)+/.test(binding.keys[0]);
}
function effectiveScope(target = document.activeElement) {
  const dialog = target.closest('dialog[open]') ?? document.querySelector('dialog[open]');
  if (dialog) return {scope:dialog===picker && [search,$('picker-list')].includes(target) ? target===search?'picker':'pickerBrowse' : 'dialog',dialog,inComposer:false};
  if(target.matches('.split-handle'))return {scope:'separator',inComposer:false};
  const inComposer = draft.contains(target);
  if (inComposer) return {scope:composer.prompt(target)?'editorPrompt':composer.mode()==='insert'?'composer':'composerNormal',inComposer:true};
  if (target.closest('#conversation') && target.matches('button,summary,a')) return {scope:'chatControl',inComposer:false};
  const text=target.matches('input,textarea,select,button,summary,a')&&!target.closest('#threads')||target.isContentEditable;
  return {scope:text?'text':pane==='composer'?'composerWindow':pane==='conversation'?'chat':'navigator',inComposer:false};
}
function runKeyAction(id) {
  try { Promise.resolve(keyHandlers[id]()).catch(fail); }
  catch(error) { fail(error); }
}
document.addEventListener('keydown', event => {
  if (!keyReady || event.defaultPrevented) return;
  if (event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')) { clearKeySequence(); return; }
  if (['Control','Shift','Alt','Meta'].includes(event.key)) return;
  const target = event.target;
  const {dialog,inComposer,scope} = effectiveScope(target);
  if(dialog===referenceDialog && dialog) {
    const token=Keymaps.eventKey(event);
    const binding=keyBindings.find(b=>['back','forward'].includes(b.id)&&b.keys.length===1&&b.keys[0]===token);
    if(binding){event.preventDefault();runKeyAction(binding.id);return;}
  }
  if(event.key==='Escape'&&layoutView.drag){event.preventDefault();layoutView.finish(true);clearKeySequence();return;}
  if(scope==='separator'){layoutView.key(event);if(event.defaultPrevented){clearKeySequence();return;}}
  if (dialog && event.key === 'Escape' && !event.repeat) { event.preventDefault(); clearKeySequence(); if(dialog===picker&&cancelPickerQuery())return;dialog.requestClose(); return; }
  if (dialog && (dialog !== picker || ![search,$('picker-list')].includes(target))) { clearKeySequence(); return; }
  if (scope === 'editorPrompt') { clearKeySequence(); return; }
  if (scope === 'chatControl' && event.key === 'Escape') { event.preventDefault(); returnChatControl(); clearKeySequence(); return; }
  if (inComposer && !event.repeat) {
    const active=Keymaps.activeScopes(scope), token=Keymaps.eventKey(event);
    const allowed=keyBindings.filter(b=>(active.includes(b.scope) || b.id==='send') && composerAppBinding(b));
    if (!keySequence.length && !allowed.some(b=>b.keys[0]===token)) return;
    if (['C:o','C:i','C:r','C:d','C:u'].includes(token)) return;
  }
  if (keyScope !== scope) clearKeySequence();
  keyScope = scope;
  if (event.repeat && inComposer) {
    const token=Keymaps.eventKey(event);
    const windowBinding=keyBindings.find(binding=>binding.scope==='windows' && binding.keys.length===1 && binding.keys[0]===token && composerAppBinding(binding));
    if (windowBinding) {event.preventDefault();event.stopPropagation();clearKeySequence();runKeyAction(windowBinding.id);return;}
    const appAction=keyBindings.some(b=>(b.scope==='global'||b.id==='send')&&b.keys[0]===token);
    if(appAction || keySequence.length || composer.mode()!=='insert' && !['h','j','k','l','w','b','e','0','$','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','C:n','C:p','C:d','C:u','C:f','C:b'].includes(token)) {event.preventDefault();event.stopPropagation();clearKeySequence();}
    return;
  }
  if (event.repeat) {
    const active = Keymaps.activeScopes(scope), token = Keymaps.eventKey(event);
    const bindings = keyBindings.filter(b => active.includes(b.scope) && b.keys[0] === token);
    const safe = bindings.find(b => b.keys.length === 1 && (repeatNavigation(b.id) || ['windowLeft','windowDown','windowUp','windowRight','chatLeft','chatRight','chatWord','chatBackWord','chatStart','chatEnd','chatPreviousMessage','chatNextMessage','draftLeft','draftRight','draftDown','draftUp','draftWord','draftBackWord','draftStart','draftEnd'].includes(b.id)));
    const pending = keySequence.length > 0;
    if (bindings.length || pending) event.preventDefault();
    clearKeySequence();
    if (safe && !pending) runKeyAction(safe.id);
    return;
  }
  if (event.key === 'Escape' && keySequence.length) { event.preventDefault(); clearKeySequence(); return; }
  const token = Keymaps.eventKey(event);
  const sequence = [...keySequence, token];
  const active = Keymaps.activeScopes(scope);
  const candidates = keyBindings.filter(b => (!inComposer || composerAppBinding(b)) && (active.includes(b.scope) || inComposer && b.id==='send' || ['chatControl','composerWindow','separator'].includes(scope)&&['back','forward'].includes(b.id) || scope==='chatControl' && (b.scope==='windows'||b.id==='chatReference'&&target.closest('[data-reference],.image-button'))) && sequence.every((key, index) => b.keys[index] === key));
  if (!candidates.length) { clearKeySequence(); return; }
  event.preventDefault();
  if(inComposer) event.stopPropagation();
  const exact = candidates.find(b => b.keys.length === sequence.length);
  if (exact) {
    clearKeySequence();
    runKeyAction(exact.id);
  } else {
    keySequence = sequence;
    clearTimeout(keyTimer);
    keyTimer = setTimeout(clearKeySequence, keyConfig.timeout);
    keyboardMode();
  }
}, true);
desk.keymaps().then(result => {
  keyConfig = result.config; keyMac = result.mac;
  keyConfigIssue = result.error;
  keyRepairConfig = result.repairConfig;
  keyBindings = Keymaps.compile(keyConfig, keyMac); keyReady = true;
  syncComposerBindings();
  $('keymaps-location').textContent = 'Stored separately from demo data and API keys: ' + result.path;
  $('keymaps-error').textContent = result.error;
  renderKeyHints();
  if (result.error) say(result.error + ' Open Keymaps to repair.');
}).catch(error => { $('keymaps-error').textContent = error.message; fail(error); });
