const picker = $('picker'), search = $('picker-search');
let collection = 'results', selected = 0, matches = [], catalog = null;
let origin = null, originRow = null;
let pickerQuerySnapshot = null;
let pickerRequest = 0, pickerLoading = false, pickerError = '';
const pickerCollections = new Map();
function cyclePickerCollection(delta) {
  const tabs=[...$('picker-tabs').querySelectorAll('button')].filter(button=>!button.disabled);
  const index=tabs.findIndex(button=>button.dataset.picker===collection);
  showPicker(tabs[(index+delta+tabs.length)%tabs.length].dataset.picker);
}
function pickerHints() {
  const browsing=document.activeElement===$('picker-list');
  const actions=browsing?['pickerBrowseNext','pickerBrowseQuery']:['pickerNext','pickerBrowseMode'];
  $('picker-keys').textContent=(browsing?'BROWSE':'QUERY')+' · '+(matches.length?selected+1:0)+'/'+matches.length+' · '+actions.filter(id=>primaryMappingLabel(id)).map(id=>primaryMappingLabel(id)+' '+(id==='pickerBrowseQuery'?'query':id==='pickerBrowseMode'?'browse':'next')).join(' · ')+' · '+primaryMappingLabel('pickerCollectionPrevious')+' / '+primaryMappingLabel('pickerCollectionNext')+' collection · '+(primaryMappingLabel('pickerOpen')||'Open button')+' open · Esc '+(pickerQuerySnapshot?'restore query':'cancel');
  $('picker-browse').textContent='Browse results'+keyHint('pickerBrowseMode');
}
function browsePicker() {pickerQuerySnapshot=null;$('picker-list').focus();pickerHints();keyboardMode();}
function editPickerQuery() {pickerQuerySnapshot={query:search.value,selected,id:matches[selected]?.id,scroll:$('picker-list').scrollTop};search.focus();search.select();pickerHints();keyboardMode();}
function cancelPickerQuery() {
  if(!pickerQuerySnapshot)return false;
  const saved=pickerQuerySnapshot;pickerQuerySnapshot=null;search.value=saved.query;selected=saved.selected;renderPicker(false);const index=matches.findIndex(i=>i.id===saved.id);if(index>=0){selected=index;renderPicker();}browsePicker();$('picker-list').scrollTop=saved.scroll;return true;
}
const visits = new Map(), viewed = new Set();
let visitOrder = 0;
function recordVisit(item) { if (item) visits.set(item.id, ++visitOrder); }
const labels = { centralSearch:'Search captains and threads', threads:'Recent threads · all projects', captains:'Recent captain visits', running:'What’s running', needs:'What needs me', results:'Recent results', pins:'Your quick jumps' };
let pins = [];
try {
  const saved = JSON.parse(localStorage.getItem('demo-pins') || '[]');
  if (Array.isArray(saved)) pins = [...new Set(saved.filter(id => typeof id === 'string'))].slice(0, 4);
} catch {}

async function renderPins() {
  if (!demoMode) return;
  if (!catalog) catalog = await desk.activity();
  $('pins').hidden = false;
  $('pin-list').replaceChildren(...pins.map((id, index) => {
    const item = [...catalog.threads, ...catalog.captains].find(t => t.id === id);
    const button = document.createElement('button');
    button.textContent = (index + 1) + ' · ' + titleOf(item ?? {});
    button.title = 'Quick jump ' + (index + 1) + keyHint('pin' + (index + 1));
    button.onclick = () => jumpPin(index);
    return button;
  }));
  $('pin-current').textContent = (pins.includes(thread?.id) ? 'Unpin current thread' : 'Pin current thread') + keyHint('pin');
}

function togglePin() {
  if (!demoMode || !thread) return;
  if (pins.includes(thread.id)) pins = pins.filter(id => id !== thread.id);
  else if (pins.length < 4) pins.push(thread.id);
  else { say('Four quick jumps are pinned. Unpin one first.'); return; }
  localStorage.setItem('demo-pins', JSON.stringify(pins));
  renderPins().catch(fail);
}

async function jumpPin(index) {
  try {
    const item = [...(catalog?.threads ?? []), ...(catalog?.captains ?? [])].find(t => t.id === pins[index]);
    if (!item) { say('That quick-jump slot is empty.'); return; }
    await openThread(item, { projectId: item.projectId, focus: 'conversation' });
  } catch (error) { fail(error); }
}
$('pin-current').onclick = togglePin;

function fuzzy(query, text) {
  let offset = 0;
  for (const character of query.toLowerCase().replace(/\s/g, '')) {
    offset = text.toLowerCase().indexOf(character, offset);
    if (offset < 0) return false;
    offset++;
  }
  return true;
}

function renderPicker(preserve = true) {
  const identity = preserve ? matches[selected]?.id : null;
  const data = catalog ?? {threads:[],captains:[],activity:[],projects:[]};
  const contexts = CentralSearch.contexts(data);
  const items = ['threads','pins','captains'].includes(collection) ? contexts.filter(item => collection === 'captains' ? item.isCaptain && visits.has(item.id) : collection === 'pins' ? pins.includes(item.id) : !item.isCaptain).map(item => ({
    ...item, threadId:item.id, detail:data.activity.find(activity => activity.threadId === item.id)?.detail ?? 'No recent activity.',
    kind:collection, minutes:item.activityMinutes ?? data.activity.find(activity => activity.threadId === item.id)?.minutes ?? (!demoMode&&item.lastActivityAt?Math.max(0,(Date.now()-Date.parse(item.lastActivityAt))/60000):undefined)
  })).sort((a, b) => collection === 'pins' ? pins.indexOf(a.id) - pins.indexOf(b.id) : (visits.get(b.id) ?? 0) - (visits.get(a.id) ?? 0) || (a.minutes ?? Infinity) - (b.minutes ?? Infinity)) :
    data.activity.filter(item => item.kind === collection).slice().sort((a, b) => a.minutes - b.minutes);
  matches = items.filter(item => fuzzy(search.value, item.title + ' ' + item.detail + ' ' +
    contexts.find(t => t.id === item.threadId)?.code + ' ' + data.projects.find(p => p.id === contexts.find(t => t.id === item.threadId)?.projectId)?.name));
  if(collection==='centralSearch')matches=CentralSearch.rows(data,search.value,visits,item=>typeof readState!=='undefined'?readState.value(item):item.hasUnreads).map(item=>{
    const known=messageCache.get(item.id)?.items.findLast(entry=>['user','assistant'].includes(entry.source)&&typeof entry.text==='string'&&entry.text.trim());
    return known&&!item.ask?.text?{...item,detail:'Loaded message · '+known.text.trim().slice(0,600)}:item;
  });
  if(identity){const index=matches.findIndex(item=>item.id===identity);if(index>=0)selected=index;}
  selected = Math.max(0, Math.min(selected, matches.length - 1));
  $('picker-title').textContent = collection==='centralSearch'?'Search captains and threads':labels[collection];
  search.placeholder=collection==='centralSearch'?'Search titles, available codes, or projects…':'Search titles, codes, or updates…';
  for (const button of $('picker-tabs').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.picker === collection));
  }
  $('picker-count').textContent = matches.length + (collection === 'results' ? ' turn results · not completed tasks' : ' matches');
  if (pickerLoading) $('picker-count').textContent += ' · '+(catalog ? 'cached · refreshing…' : 'loading catalog…');
  if (pickerError) $('picker-count').textContent += ' · stale · '+pickerError+' · reopen collection to retry';
  $('picker-list').replaceChildren(...matches.map((item, index) => {
    const row = document.createElement('div');
    row.id = 'picker-option-' + index;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === selected));
    const title = document.createElement('strong');
    title.className='thread-name';
    title.textContent = item.title;
    const meta = document.createElement('span');
    meta.className='thread-meta';
    const context = contexts.find(t => t.id === item.threadId);
    const projectName = catalog.projects.find(p => p.id === context?.projectId)?.name;
    meta.textContent = context?.code + ' · ' + projectName + (context?' · '+WorkTree.status(context):'') + (context?.parentId ? ' · crew of ' + contexts.find(t => t.id === context.parentId)?.title : '') + ' · ' +
      (['threads','captains','pins'].includes(collection) && visits.has(item.threadId) ? 'session visit #' + visits.get(item.threadId) : item.minutes != null ? item.minutes + 'm ago · sample activity' : 'not visited this session') +
      (collection === 'results' ? viewed.has(item.id) ? ' · viewed' : ' · new' : '');
    if(collection==='centralSearch')meta.textContent=[item.isCaptain?'Captain':'Thread',context?.code,projectName||'No project',context?.queuedAt?'queued':context?.status||'idle',context?.parentId?'crew of '+(contexts.find(t=>t.id===context.parentId)?.title||context.captain?.name||context.parentId):null,item.reason==='Unread'?null:item.reason].filter(Boolean).join(' · ');
    row.append(title, meta);
    if(context){workIndicator(row,context,!workTree.state.stale&&Date.now()-workTree.state.updated<120000||context.id===liveStream.id&&liveStream.state==='streaming');if(typeof readState!=='undefined')readState.decorate(row,context);}
    if (collection === 'results' || collection === 'centralSearch') {
      const outcome = document.createElement('p');
      outcome.className = 'result-summary';
      outcome.textContent = item.detail;
      row.append(outcome);
    }
    row.onclick = () => { selected = index; renderPicker(); browsePicker(); };
    row.ondblclick = commitPicker;
    return row;
  }));
  const item = matches[selected];
  $('picker-open').disabled = !item;
  $('picker-open').textContent=collection==='centralSearch'?'Open context':'Open thread';
  const context = contexts.find(t => t.id === item?.threadId);
  $('preview-meta').textContent = item ? (data.projects.find(p => p.id === context?.projectId)?.name||'No project').toUpperCase() + ' / ' + (collection === 'centralSearch'?(item.isCaptain?'CAPTAIN':'THREAD'):collection === 'results' ? 'TURN RESULT' : collection.toUpperCase()) : 'NO MATCHES';
  $('preview-title').textContent = item?.title ?? (pickerLoading ? 'Loading available contexts…' : pickerError ? 'Catalog unavailable' : 'Try a different search');
  $('preview-text').textContent = item?.detail ?? 'Search by thread title, code, or words in an update.';
  $('preview-note').textContent = collection === 'captains' ? 'Only captain contexts you opened this session appear here. Visit a captain from its project navigator first. Visits are not API activity timestamps; ordinary crew threads do not count as captain visits.' : collection === 'threads' ? demoMode ? 'All demo projects. Session visits come first, then sample activity; no live API activity or transcript search.' : 'All accessible API projects. Session visits come first. No transcript full-text search or historical result feed.' : collection === 'results' && item ? 'Enter opens this specific update. Viewing it marks it as read in this demo session.' :
    'Preview only. Your current thread and draft stay untouched until you press Enter.';
  if (item) {
    if(collection==='centralSearch')$('preview-note').textContent='Titles, available codes and projects · matching crew appears when you type. Preview only; Enter opens the context. No global message search.';
    search.setAttribute('aria-activedescendant', 'picker-option-' + selected);
    $('picker-option-' + selected).scrollIntoView({ block:'nearest' });
  } else search.removeAttribute('aria-activedescendant');
  if(item)$('picker-list').setAttribute('aria-activedescendant','picker-option-'+selected);else $('picker-list').removeAttribute('aria-activedescendant');
  pickerHints();keyboardMode();
}

async function showPicker(next) {
  clearKeySequence();
  if (document.querySelector('dialog[open]:not(#picker)')) return;
  const request = ++pickerRequest;
  const wasOpen=picker.open, browsing=wasOpen&&document.activeElement===$('picker-list');
  if(wasOpen)pickerCollections.set(collection,{query:search.value,id:matches[selected]?.id,index:selected,scroll:$('picker-list').scrollTop});
  else pickerCollections.clear();
  try {
    if(!demoMode) {
      $('picker').querySelector('header .muted').textContent='Live API · all accessible projects · historical results and pins unavailable';
      $('picker').querySelector('[data-picker="results"]').disabled=true;
      $('picker').querySelector('[data-picker="pins"]').disabled=true;
      if(next==='results'||next==='pins')next='threads';
    }
    if (document.querySelector('dialog[open]:not(#picker)')) return;
    if (!picker.open) {
      origin = document.activeElement;
      originRow = origin.closest('#threads button')?.dataset.id;
      picker.showModal();
    }
    collection = next;
    const saved=pickerCollections.get(next);
    pickerQuerySnapshot=null;
    selected = saved?.index ?? 0;
    search.value = saved?.query ?? '';
    pickerLoading = !catalog || !demoMode; pickerError = '';
    renderPicker(false);
    if(saved?.id){const index=matches.findIndex(item=>item.id===saved.id);if(index>=0){selected=index;renderPicker();}}
    if(browsing)browsePicker();else search.focus();
    $('picker-list').scrollTop=saved?.scroll??0;
    if (pickerLoading) {
      const readRevision = typeof readState!=='undefined'?readState.model.version:0;
      const data = collection==='centralSearch'&&!demoMode ? await workTree.refresh(true) : await desk.activity();
      if (request !== pickerRequest || !picker.open) return;
      const id = matches[selected]?.id, scroll = $('picker-list').scrollTop;
      if(typeof readState!=='undefined')readState.overlay(data,readRevision);
      catalog = data; pickerLoading = false;
      renderPicker();
      if (id) { const index = matches.findIndex(item => item.id === id); if (index >= 0) { selected = index; renderPicker(); } }
      $('picker-list').scrollTop = scroll;
    }
  } catch (error) {
    if (request !== pickerRequest || !picker.open) return;
    pickerLoading = false; pickerError = error.message || 'Loading failed'; renderPicker();
  }
}

async function commitPicker() {
  const item = matches[selected];
  if (!item) return;
  try {
    const context = CentralSearch.contexts(catalog).find(t => t.id === item.threadId);
    origin = null;
    picker.close();
    openThread(context, {
      projectId: context.projectId, target: collection === 'results' ? item.id : null, focus: 'conversation'
    }).catch(fail);
    if (collection === 'results') {
      viewed.add(item.id);
    }
    renderPins().catch(fail);
  } catch (error) {
    fail(error);
  }
}

$('find').onclick = () => showPicker('centralSearch');
$('close-picker').onclick = () => picker.close();
picker.onclose = () => {
  if (picker.open) return;
  ++pickerRequest; pickerLoading = false;
  if (document.activeElement === document.body || picker.contains(document.activeElement)) {
    const target=origin?.isConnected?origin:origin&&originRow?[...$('threads').querySelectorAll('button')].find(row=>row.dataset.id===originRow)??$('navigator'):null;
    target?.focus({preventScroll:true});
  }
  origin=null;originRow=null;
  keyboardMode();
};
new MutationObserver(() => {
  if (picker.open && document.querySelector('dialog[open]:not(#picker)')) { origin = null; picker.close(); }
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
$('picker-open').onclick = commitPicker;
$('picker-browse').onclick=browsePicker;
picker.addEventListener('focusin',pickerHints);
for (const button of document.querySelectorAll('[data-picker]')) {
  button.onclick = () => showPicker(button.dataset.picker);
}
search.oninput = () => { selected = 0; renderPicker(false); };
desk.status().then(async status => {
  $('activity-links').hidden = !status.demo;
  if (status.demo) { demoMode = true; await renderPins(); }
  else pins = [];
}).catch(fail);
document.addEventListener('focusin', () => {
  if (demoMode) $('pin-current').textContent = (pins.includes(thread?.id) ? 'Unpin current thread' : 'Pin current thread') + keyHint('pin');
});
