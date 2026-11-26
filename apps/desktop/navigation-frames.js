let navigatorQuery = '', filterOrigin = null, filterApplied = false;
const navigatorRows = () => [...$('threads').querySelectorAll('button')].filter(row=>!row.closest('li').hidden);
function navigationViewport(host) {
  const rect=host.getBoundingClientRect();let top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
  for(let parent=host.parentElement;parent;parent=parent.parentElement) {
    if(!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY))continue;
    const bounds=parent.getBoundingClientRect();top=Math.max(top,bounds.top+parent.clientTop);bottom=Math.min(bottom,bounds.top+parent.clientTop+parent.clientHeight);
  }
  return {top,bottom:Math.max(top,bottom)};
}
function filterDemoRows() {
  for(const row of $('threads').querySelectorAll('li'))row.hidden=!row.textContent.toLocaleLowerCase().includes(navigatorQuery.toLocaleLowerCase());
  renderFilterSummary();
}
function navigatorFilter() {
  filterOrigin=document.activeElement;
  filterApplied=false;
  $('list-query').value=workTree.enabled?workTree.config.text:navigatorQuery;
  $('list-filter').showModal();$('list-query').focus();
}
function applyNavigatorFilter() {
  const value=$('list-query').value;
  if(workTree.enabled) {
    workTree.config.text=value;workTree.render();workTree.controls();workTree.save();
  } else {
    navigatorQuery=value;
    filterDemoRows();
  }
  filterApplied=true;$('list-filter').close();
  keyboardMode();
}
$('list-filter-form').onsubmit=event=>{event.preventDefault();applyNavigatorFilter();};
$('close-list-filter').onclick=()=>$('list-filter').close();
$('list-filter').onclose=()=>{(filterApplied?navigatorRows().find(row=>row.dataset.id===filterOrigin?.dataset.id)??navigatorRows()[0]??$('navigator'):filterOrigin?.isConnected?filterOrigin:$('navigator')).focus();keyboardMode();};
function navigateTree(expand) {
  if(!workTree.enabled||workTree.config.mode!=='tree')return;
  const row=document.activeElement.closest('#threads button');if(!row)return;
  const open=row.getAttribute('aria-expanded');
  if(expand&&open==='false')workTree.expand(row.dataset.id,true);
  else if(expand&&open==='true'){const child=navigatorRows().find(b=>b.dataset.parent===row.dataset.id);if(child)workTree.focus(child.dataset.id);}
  else if(!expand&&open==='true')workTree.expand(row.dataset.id,false);
  else if(!expand&&row.dataset.parent)workTree.focus(row.dataset.parent);
  document.activeElement.scrollIntoView({block:'nearest'});keyboardMode();
}
const navigationFrames = {
  navigator:Navigation.list({rows:navigatorRows,index:()=>navigatorRows().indexOf(document.activeElement),viewport:()=>$('navigator'),
    visible:navigationViewport,
    inset:host=>Math.max(0,Math.min(host.clientHeight,host.querySelector('.tree-toolbar').getBoundingClientRect().bottom-host.getBoundingClientRect().top)),
    select:(index,rows)=>{rows[index].focus({preventScroll:true});rows[index].scrollIntoView({block:'nearest'});keyboardMode();},
    find:navigatorFilter,collapse:()=>navigateTree(false),expand:()=>navigateTree(true)}),
  picker:Navigation.list({rows:()=>[...$('picker-list').children],index:()=>selected,viewport:()=>$('picker-list'),
    visible:navigationViewport,
    select:index=>{selected=index;renderPicker();},find:()=>editPickerQuery()}),
  chat:new Navigation.Controller({
    Next:()=>chatMove('Down'),Previous:()=>chatMove('Up'),First:()=>chatMove('First'),Last:()=>chatMove('Last'),
    HalfDown:()=>chatHalfPage(1),HalfUp:()=>chatHalfPage(-1),PageDown:()=>chatHalfPage(1,1),PageUp:()=>chatHalfPage(-1,1),
    Find:openChatSearch,NextMatch:()=>findChat(1),PreviousMatch:()=>findChat(-1),
    LoadOlder:()=>loadMessages(true),LoadNewer:()=>loadMessages()
  })
};
const navigationActions = {
  down:['navigator','Next'],up:['navigator','Previous'],pickerNext:['picker','Next'],pickerPrevious:['picker','Previous'],
  chatDown:['chat','Next'],chatUp:['chat','Previous'],chatSearch:['chat','Find'],chatNextMatch:['chat','NextMatch'],chatPreviousMatch:['chat','PreviousMatch'],
  pickerBrowseNext:['picker','Next'],pickerBrowsePrevious:['picker','Previous'],pickerBrowseQuery:['picker','Find']
};
for(const [prefix,surface] of [['navigator','navigator'],['picker','picker'],['pickerBrowse','picker'],['chat','chat']]) {
  for(const action of ['First','Last','HalfDown','HalfUp','PageDown','PageUp','Find','Collapse','Expand','LoadOlder','LoadNewer']) {
    if(Keymaps.actions[prefix+action])navigationActions[prefix+action]=[surface,action];
  }
}
const repeatNavigation = id => navigationActions[id] && ['Next','Previous','HalfDown','HalfUp','PageDown','PageUp'].includes(navigationActions[id][1]);
function navigationStatus(status) {
  if(picker.open) return {mode:document.activeElement===search?'PICKER QUERY':'PICKER BROWSE',position:'Row '+(matches.length?selected+1:0)+'/'+matches.length+' loaded',context:labels[collection]+' / '+(search.value||'no filter')};
  if(pane==='conversation') return {position:status.position+' · loaded'+(messageState.before?' · earlier available':'')+(messageState.next?' · newer available':'')};
  if(pane==='navigator') {const rows=navigatorRows();return {position:'Row '+Math.max(0,rows.indexOf(document.activeElement)+1)+'/'+rows.length+' loaded'+(cursor&&!workTree.enabled?' · more available':'')+' / '+(workTree.enabled?workTree.config.mode:'list')+((workTree.enabled?workTree.config.text:navigatorQuery)?' / filter: '+(workTree.enabled?workTree.config.text:navigatorQuery):'')};}
  return {};
}
function navigationHints() {
  const {scope}=effectiveScope();
  if(scope==='dialog'||scope==='text')return 'Tab / Shift+Tab focus · Enter activate · Esc cancel dialog';
  if(scope==='editorPrompt')return 'Vim search / Ex · Enter apply · Esc return to editor';
  if(scope==='picker'||scope==='pickerBrowse')return $('picker-keys').textContent;
  if(scope==='chat'&&currentReference())return referenceLabel(currentReference())+' · '+(primaryMappingLabel('chatReference')||'Unmapped')+' open reference · Enter '+(currentReference().matches('.diagram')?'inspect inline':currentReference().matches('.image-button')?'preview':'open')+' · '+primaryMappingLabel('back')+' back · '+primaryMappingLabel('forward')+' forward';
  if(scope==='chatControl')return (document.activeElement.matches('[data-reference],.image-button')?primaryMappingLabel('chatReference')+' open reference · ':'')+'Enter / Space activate · Esc return to chat · '+primaryMappingLabel('windowDown')+' reply window';
  if(scope==='composer')return primaryMappingLabel('normal')+' Normal · '+primaryMappingLabel('windowUp')+' chat · '+primaryMappingLabel('send')+' queue reply';
  if(scope==='composerNormal')return 'Vim motions / i Insert · '+primaryMappingLabel('switchPane',true)+' cycle windows · '+primaryMappingLabel('send')+' queue reply';
  const ids=scope==='chat'?['chatDown','chatUp','chatHalfDown','chatSearch','reply','help']:scope==='navigator'?['down','up','navigatorFirst','navigatorFind','navigatorExpand','help']:['reply','switchPane','help'];
  const names={chatDown:'next line',chatUp:'previous',chatHalfDown:'half page',chatSearch:'search',reply:'reply',help:'help',down:'next',up:'previous',navigatorFirst:'first loaded',navigatorFind:'filter',navigatorExpand:'expand',switchPane:'cycle windows'};
  return ids.filter(id=>primaryMappingLabel(id)).map(id=>primaryMappingLabel(id)+' '+names[id]).join(' · ');
}
