const $ = id => document.getElementById(id);
const projectPicker = $('projects'), draft = $('draft'), transcript = $('transcript');
let project, thread, cursor, before, demoMode, pane = 'navigator', pending = false;
let showToolActivity = true;
try { showToolActivity = localStorage.getItem('showToolActivity') !== 'false'; } catch {}
function visibleMessage(item) { return showToolActivity || item.source !== 'tool'; }
function toolActivityHints() {
  const button = $('toggle-tool-activity');
  button.textContent = 'Tools';
  button.setAttribute('aria-label', 'Show public tool activity');
  button.setAttribute('aria-pressed', String(showToolActivity));
  button.title = 'Public tool summaries ' + (showToolActivity ? 'shown' : 'hidden') + (typeof keyHint === 'function' ? keyHint('toggleToolActivity') : '');
  $('tool-visibility-status').hidden = showToolActivity;
}
function toggleToolActivity() {
  const restore = captureToolPresentation(showToolActivity);
  showToolActivity = !showToolActivity;
  try { localStorage.setItem('showToolActivity', String(showToolActivity)); } catch { say('Tool visibility changed for this session; could not save it.'); }
  toolActivityHints();
  liveStream.presentationRestore = {id:thread?.id, restore};
  liveStream.needsCommit = true; liveStream.revision++; liveStream.schedule();
}
let threadRequest = 0, messageRequest = 0;
let history = [], historyIndex = -1, navigating = false, updateTarget = null, messagePages = 1;
let viewFocus = 'navigator';
let connectionNotice = '';
let messageState = new Transcript.Pager(), messageBusy = false;
const messageCache = new Map();
const messageViews = new Map();
let navigationRequest = 0;
let navigationTouched = false;
let pendingViewRestore = null;
for (const event of ['keydown','pointerdown','wheel','input']) document.addEventListener(event, () => { navigationTouched = true; }, {capture:true,passive:true});
let messageTimer, messageRetries = 0, autoPages = 0;
function scheduleMessages(delay = 100) {
  clearTimeout(messageTimer);messageTimer=null;
  if (!thread || document.hidden || changingConnection) return;
  if (typeof liveStream !== 'undefined' && liveStream.suppressesPolling() && !messageState.next && messageState.started && messageState.caughtUp) return;
  const id = thread.id;
  messageTimer = setTimeout(() => { messageTimer=null; if (thread?.id === id) loadMessages().catch(error => { if (thread?.id === id) fail(error); }); }, delay);
}
document.addEventListener('visibilitychange', () => {
  clearTimeout(messageTimer);messageTimer=null;
  if (document.hidden) { ++messageRequest; messageBusy = false; desk.cancelMessages().catch(()=>{}); }
  else scheduleMessages();
});
const drafts = new Map();
const outgoing = {
  items:new Map(),
  project(items,id) {
    const result=[...items];
    for(const entry of this.items.values()) {
      if(entry.threadId!==id)continue;
      const index=result.findIndex(item=>item.source==='user'&&(item.clientKey===entry.clientKey||entry.receiptId&&item.id===entry.receiptId));
      const status=(entry.state==='sending'?'Sending…':entry.state==='accepted'?(demoMode?'Saved in demo':'Queued · accepted'):'Send not confirmed · retry with the same ID')+(entry.model?' · '+entry.model.modelId:'');
      const item={...(index<0?{id:entry.receiptId||'outgoing-'+entry.clientKey,source:'user',text:entry.text,createdAt:entry.createdAt}:result[index]),outgoingLocal:index<0,outgoingState:entry.state,outgoingStatus:status,clientKey:entry.clientKey};
      if(index<0)result.push(item);else result[index]=item;
    }
    return result;
  },
  paint(id) {if(thread?.id===id){liveStream.needsCommit=true;liveStream.revision++;liveStream.schedule();}},
  async submit(entry,sentDoc) {
    if(pending)return;
    if(!this.items.has(entry.clientKey)&&this.items.size>=1000){say('Send limit for this session reached. Reopen to continue.');return;}
    entry.sentDoc=sentDoc??entry.sentDoc;
    pending=true;entry.state='sending';this.items.set(entry.clientKey,entry);updateSend();this.paint(entry.threadId);
    if(thread?.id===entry.threadId&&['complete','offline'].includes(liveStream.state))liveStream.select(thread);
    try {
      const receipt=await desk.send(entry.threadId,entry.text,entry.clientKey,entry.model);
      if(!receipt||typeof receipt.id!=='string'||!/^[A-Za-z0-9]{26}$/.test(receipt.id)||typeof receipt.deduped!=='boolean')throw Error('Invalid send receipt. Delivery is uncertain; retry uses the same message ID.');
      entry.receiptId=receipt.id;entry.state='accepted';
      workActivity.accepted(entry.threadId);
      conversationControls.sent(entry);
      if(composer.clearSent(entry.threadId,entry.sentDoc))drafts.delete(entry.threadId);
      if(thread?.id===entry.threadId){say(demoMode?'Saved in this demo session.':'Accepted for queue delivery. This does not mean the agent has started.');if(liveStream.state==='complete')liveStream.select(thread);if(!messageBusy)loadMessages().catch(fail);}
    } catch(error) {entry.state='failed';entry.error=error.message;if(thread?.id===entry.threadId)fail(error);}
    finally {pending=false;this.paint(entry.threadId);updateSend();}
  }
};
const composer = new ComposerEngine.Controller(draft,(id,text) => {if(id!=='__empty__') drafts.set(id,text);});
const zoomIndicator = document.createElement('output');
zoomIndicator.id = 'zoom-indicator';
zoomIndicator.setAttribute('role','status');
zoomIndicator.setAttribute('aria-live','polite');
document.body.append(zoomIndicator);
function showZoom(state) {
  zoomIndicator.textContent = state.percent + '%' + (state.error ? ' · ' + state.error : '');
  zoomIndicator.title = 'Visual zoom · View menu · 50–200%';
  for (const {view} of composer.views.values()) view.requestMeasure();
}
desk.onZoom(showZoom);
desk.zoomState().then(showZoom);
const say = text => { $('notice').textContent = text; };
const fail = error => say(error.message || 'Request failed.');
const titleOf = item => item.title || 'Untitled thread';
const keyboardMode = () => {
  const resolved = typeof effectiveScope === 'function' ? effectiveScope() : {scope:pane==='conversation'?'chat':'navigator'};
  const inDraft = composer.focused() && resolved.scope !== 'editorPrompt';
  const mode = resolved.scope === 'dialog' ? (resolved.dialog.getAttribute('aria-labelledby') ? $(resolved.dialog.getAttribute('aria-labelledby'))?.textContent : resolved.dialog.querySelector('h2')?.textContent) || 'DIALOG' : resolved.scope === 'editorPrompt' ? 'COMPOSER PROMPT' : resolved.scope === 'chatControl' ? 'CHAT CONTROL' : resolved.scope === 'text' ? 'NATIVE CONTROL' : inDraft ? 'COMPOSER ' + composer.mode().toUpperCase() : pane === 'composer' ? 'COMPOSER WINDOW' : pane === 'conversation' ? chatAnchor !== null ? 'CHAT VISUAL' : 'CHAT NORMAL' : 'NAVIGATOR';
  const text = inDraft ? draft.value : pane === 'conversation' ? chatText().text : '';
  const offset = inDraft ? draft.selectionStart : chatPosition;
  const lines = text.slice(0,offset).split('\n');
  const rows = [...$('threads').querySelectorAll('button')];
  const status = {
    mode, pane:resolved.dialog ? resolved.dialog.id : inDraft ? 'composer' : document.activeElement.id || pane,
    context:[projectPicker.selectedOptions[0]?.textContent, thread?.code || thread?.id, thread?.parentId ? 'crew of ' + thread.parentId : '', thread?.title].filter(Boolean).join(' / '),
    position:text ? 'Ln ' + lines.length + ', Col ' + (Array.from(lines.at(-1)).length + 1) : 'Row ' + Math.max(0,rows.indexOf(document.activeElement) + 1) + '/' + rows.length,
    sequence:keySequence.length ? 'KEYS ' + keySequence.map(displayKey).join(' ') : '',
    connection:demoMode ? 'DEMO' : $('connection-state').textContent
  };
  if(resolved.scope==='separator'){status.mode='RESIZE';status.position='Arrows resize · Shift: 40px · Home/End bounds';status.pane=document.activeElement.getAttribute('aria-label');}
  if(typeof navigationStatus==='function'&&['chat','navigator','picker','pickerBrowse'].includes(resolved.scope))Object.assign(status,navigationStatus(status));
  if (['dialog','text','chatControl','editorPrompt'].includes(resolved.scope)) status.position = resolved.scope === 'editorPrompt' ? 'Vim search / Ex input' : resolved.scope === 'chatControl' ? 'Native chat action' : 'Native form controls';
  $('mode').textContent = status.mode;
  $('statusline').dataset.mode = inDraft && composer.mode() === 'insert' ? 'insert' : (inDraft ? composer.mode().startsWith('visual') : resolved.scope === 'chat' && chatAnchor !== null) ? 'visual' : 'normal';
  $('pane').textContent = status.pane;
  $('pane').title = 'Focus: ' + status.pane;
  for (const field of ['context','position','sequence','connection']) $('status-' + field).textContent = status[field];
  $('status-context').title = status.context;
  if(typeof navigationHints==='function')$('active-keys').textContent=navigationHints();
};

async function projects(result, restoring = false) {
  const { items } = result ?? await desk.projects();
  history = [];
  historyIndex = -1;
  project = undefined;
  projectPicker.replaceChildren(...items.map(item => new Option(item.name, item.id)));
  projectPicker.disabled = !items.length;
  if(restoring)return;
  await selectProject();
}

function selectProject() {
  return openThread(null, { projectId: projectPicker.value, first: true });
}
function appendThreadRow(item) {
  if([...$('threads').querySelectorAll('button')].some(button=>button.dataset.id===item.id))return;
  const row=document.createElement('li'),button=document.createElement('button');
  button.dataset.id=item.id;
  if(item.id===thread?.id)button.setAttribute('aria-current','true');
  const meta=document.createElement('span');meta.className='thread-meta';meta.textContent=[item.code,item.status].filter(Boolean).join(' · ');
  const details=document.createElement('span');details.className='row-details';details.textContent=meta.textContent;meta.replaceChildren(details);button.title=[titleOf(item),details.textContent].filter(Boolean).join(' · ');
  const name=document.createElement('span');name.className='thread-name';name.textContent=titleOf(item);
  button.append(name,meta);button.onclick=()=>openThread(item).catch(fail);row.append(button);$('threads').append(row);
  if(typeof workIndicator==='function')workIndicator(button,item);
  if(typeof readState!=='undefined')readState.decorate(button,item);
}

async function loadThreads(append = false) {
  if(!demoMode || workTree.enabled){
    const data=await workTree.refresh();
    return [...data.threads,...data.captains].filter(item=>item.projectId===project);
  }
  const request = ++threadRequest;
  const selectedProject = project;
  $('more').hidden = true;
  $('filter-summary').textContent = 'Loading project threads…';
  try {
    const result = await desk.threads(selectedProject, append ? cursor : null);
    if (request !== threadRequest || project !== selectedProject) return;
    cursor = result.cursor;
    for (const item of result.items) appendThreadRow(item);
    $('more').hidden = !cursor;
    filterDemoRows();
    if (!append && !result.items.length) say('No threads in this project.');
    return result.items;
  } catch (error) {
    if (request !== threadRequest || project !== selectedProject) return;
    $('more').hidden = !append;
    throw error;
  }
}

function captureView() {
  return { projectId: project, item: thread, target: updateTarget, reference:referenceTarget, referenceFocus:referenceFocus(), scroll: transcript.scrollTop,
    navigatorScroll: $('navigator').scrollTop, pages: messagePages, focus: viewFocus, pane,
    selection: [draft.selectionStart, draft.selectionEnd], modal:paneSnapshot(), transcriptState:messageState };
}

function historyControls() {
  $('back').disabled = historyIndex <= 0;
  $('forward').disabled = historyIndex >= history.length - 1;
  projectPicker.disabled = !projectPicker.options.length;
}

async function openThread(item, options = {}) {
  const request = ++navigationRequest;
  if (historyIndex >= 0) history[historyIndex] = captureView();
  const leavingReference=referenceTarget!==null;
  closeReferenceView();
  try {
    const projectId = options.projectId !== undefined ? options.projectId : project;
    const target = options.target ?? null;
    if (!options.first && !leavingReference && projectId === project && item?.id === thread?.id && target === updateTarget) {
      recordVisit(item);
      if (options.focus) $(options.focus).focus();
      return;
    }
    if (project !== projectId) {
      project = projectId;
      projectPicker.value = project;
      $('threads').replaceChildren();
      ++threadRequest;
      const loading = project ? loadThreads() : Promise.resolve([]);
      loading.then(items => {
        if (request !== navigationRequest) return;
        if (options.first && demoMode && items?.length) openThread(items[0], {projectId, replace:true}).catch(fail);
        else if (!item && !items?.length) say('No threads in this project.');
      }).catch(error => { if (request === navigationRequest) fail(error); });
    }
    const hydration = displayThread(item);
    updateTarget = options.target ?? null;
    if (updateTarget) {
      const card = [...$('entries').children].find(node => node.dataset.messageId === updateTarget);
      if (card) { card.classList.add('jump-target'); card.scrollIntoView({ block: 'center' }); }
    }
    if (options.focus) $(options.focus).focus();
    else if (document.activeElement === $('navigator') || !document.activeElement.closest('aside, #conversation, #composer')) (navigatorRows().find(row=>row.dataset.id===item?.id) ?? $('navigator')).focus();
    const view = captureView();
    const current = history[historyIndex];
    if (options.replace || current && !current.reference && current.projectId === view.projectId && current.item?.id === view.item?.id && current.target === view.target) {
      history[historyIndex] = view;
    } else {
      history = history.slice(0, historyIndex + 1);
      history.push(view);
      if (history.length > 100) history.shift();
      historyIndex = history.length - 1;
    }
    return hydration;
  } finally { navigating = false; historyControls(); }
}

async function traverseHistory(delta) {
  const next = historyIndex + delta;
  if (next < 0 || next >= history.length) return;
  history[historyIndex] = captureView();
  const view = history[next];
  closeReferenceView();
  const request = ++navigationRequest;
  historyIndex = next;
  try {
    if (project !== view.projectId) {
      project = view.projectId;
      projectPicker.value = project;
      $('threads').replaceChildren();
      ++threadRequest;
      if (project) loadThreads().catch(error => { if (request === navigationRequest) fail(error); });
    }
    const hydration = displayThread(view.item, view.transcriptState);
    if (!view.item && project && !$('threads').children.length) say('No threads in this project.');
    updateTarget = view.target;
    const card = [...$('entries').children].find(node => node.dataset.messageId === view.target);
    card?.classList.add('jump-target');
    pane = view.pane;
    const focus = view.focus.startsWith('thread:') ? [...$('threads').querySelectorAll('button')].find(node => node.dataset.id === view.focus.slice(7)) : $(view.focus);
    (focus ?? $(view.pane)).focus({ preventScroll: true });
    draft.setSelectionRange(...view.selection);
    restorePaneState(view.item?.id, view.modal);
    restoreReferenceFocus(view.referenceFocus);
    transcript.scrollTop = view.scroll;
    if (view.item && !$('entries').children.length) pendingViewRestore = view;
    $('navigator').scrollTop = view.navigatorScroll;
    if (['conversation','transcript'].includes(document.activeElement.id)) { reconcileChatCursor(); paintChat(false); }
    historyIndex = next;
    keyboardMode();
    if(view.reference)showReferenceView(view.reference).catch(fail);
    if(view.item?.referencePending)hydrateReferenceContext(view.item.referencePending,request).catch(fail);
    return hydration;
  } finally { navigating = false; historyControls(); }
}

$('back').onclick = () => traverseHistory(-1).catch(fail);
$('forward').onclick = () => traverseHistory(1).catch(fail);

function displayThread(item, savedMessages) {
  document.querySelector('.image-viewer')?.close();
  if(typeof readState!=='undefined')readState.select(item?.id,thread?.id);
  if (typeof liveStream !== 'undefined') liveStream.select(item);
  navigationTouched = false;
  pendingViewRestore = null;
  clearTimeout(messageTimer);messageTimer=null; messageRetries = 0; autoPages = 0;
  ++messageRequest;
  desk.cancelMessages().catch(()=>{});
  savePaneState(thread?.id);
  resetChatProjection();
  if (thread && messageCache.has(thread.id)) messageViews.set(thread.id, {nodes:[...$('entries').children].filter(n=>!n.dataset.preview),scroll:transcript.scrollTop});
  if (thread) drafts.set(thread.id, draft.value);
  thread = item;
  if(workTree.enabled){
    if(item){const key=item.isCaptain?'captains':'threads',data=workTree.state.data;if(!data[key].some(row=>row.id===item.id))workTree.state.data={...data,[key]:[...data[key],item]};}
    workTree.render();
  }
  else if(item)appendThreadRow(item);
  updateTarget = null;
  messagePages = 1;
  savedMessages ??= messageCache.get(item?.id);
  messageState = savedMessages ?? new Transcript.Pager();
  messageBusy = false;
  before = null;
  $('thread-code').textContent = item?.code || item?.id || 'WORKSPACE';
  $('title').textContent = item ? titleOf(item) : 'Open a thread';
  conversationControls.select(item);
  for (const button of $('threads').querySelectorAll('button')) {
    if (button.dataset.id === item?.id) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
  const cachedView = savedMessages && messageViews.get(item?.id);
  $('entries').replaceChildren(...(cachedView?.nodes ?? []).filter(node=>showToolActivity || node.dataset.source!=='tool'));
  for(const node of $('entries').children)node.classList.remove('jump-target');
  transcript.scrollTop = cachedView?.scroll ?? 0;
  $('earlier').hidden = !messageState.before;
  $('newer').hidden = !messageState.next;
  $('message-health').textContent = item ? savedMessages ? 'Cached history · checking for updates…' : 'Loading history toward latest…' : 'Choose a thread. The navigator remains available while loading.';
  $('refresh').disabled = !item;
  draft.disabled = !item;
  composer.switchTo(item?.id, item ? drafts.get(item.id) ?? '' : '');
  updateSend();
  keyboardMode();
  say(connectionNotice);
  recordVisit(item);
  restorePaneState(item?.id);
  if (item) {
    const request = messageRequest;
    const hydration = loadMessages(false, Boolean(savedMessages)).catch(error => { if (thread?.id === item.id && request + 1 === messageRequest) fail(error); });
    return hydration;
  }
}

async function loadMessages(older = false, cached = false, pageLimit = 5) {
  if (!thread || messageBusy || older && !messageState.before) return;
  clearTimeout(messageTimer);messageTimer=null;
  messageBusy = true;
  const request = ++messageRequest;
  const { id } = thread;
  const state = Object.assign(new Transcript.Pager(), messageState, {items:[...messageState.items], forwardSeen:[...(messageState.forwardSeen || [])]});
  const initial = !state.started && !cached;
  $('earlier').disabled = true;
  $('newer').disabled = true;
  $('refresh').disabled = false;
  $('message-health').textContent = cached ? 'Cached history · checking for updates…' : 'Loading history toward latest…';
  let nextDelay = null;
  try {
    let pages = 0, added = 0, stalled = false;
    const seen = new Set();
    if (!cached) do {
      const query = state.started ? state.query(older ? 'older' : 'newer') : {};
      const signature = JSON.stringify(query);
      if (!older && state.next && state.forwardSeen.includes(signature)) { stalled = true; break; }
      if (seen.has(signature)) { stalled = true; break; }
      seen.add(signature);
      if (!older && state.next) state.forwardSeen.push(signature);
      const result = await desk.messages(id, query);
      if (request !== messageRequest) return;
      const prior = state.items.length;
      const progress = state.accept(result, query);
      added += state.items.slice(older ? 0 : prior, older ? state.items.length - prior : undefined).filter(item=>visibleMessage(item) && (typeof item.text==='string' && item.text.trim() || item.attachments?.length)).length;
      pages++;
      if (!progress) { stalled = Boolean(older ? state.before : state.next); break; }
    } while (pages < pageLimit && added < 12);
    if (request !== messageRequest) return;
    const projected=typeof liveStream!=='undefined'?liveStream.project(state,id):state.items;
    const nodes = await messageNodes(projected, id);
    if (request !== messageRequest) return;
    const oldHeight = transcript.scrollHeight;
    const oldScroll = transcript.scrollTop;
    const atBottom = oldHeight - oldScroll - transcript.clientHeight < 40;
    const entries = $('entries');
    const referenceControl=referenceFocus();
    entries.replaceChildren(...nodes);
    if(referenceControl&&document.activeElement===document.body)restoreReferenceFocus(referenceControl);
    messageState = state;
    messageCache.delete(id); messageCache.set(id, state);
    if (messageCache.size > 30) { const oldest = messageCache.keys().next().value; messageCache.delete(oldest); messageViews.delete(oldest); }
    before = state.before;
    messagePages = state.pages;
    autoPages = state.next ? autoPages + pages : 0; messageRetries = 0;
    if (cached) nextDelay = 100;
    else if (state.next && !stalled && !older && autoPages < 200) nextDelay = 100;
    else if (!state.next && !older && !cached && !stalled && !demoMode) nextDelay = 15000;
    $('message-health').textContent = cached ? 'Cached history · checking for updates…' : stalled ? 'Messages still settling or cursor unchanged. Retry to continue.' : state.next ? autoPages >= 200 ? 'Paused after 200 pages. More history remains; Refresh continues.' : 'Loading history toward latest… ' + state.pages + ' pages loaded.' : 'Loaded through the latest available page.';
    transcript.scrollTop = older ? oldScroll + transcript.scrollHeight - oldHeight : (!navigationTouched && initial || atBottom && (!navigationTouched || pane === 'conversation') && chatAnchor === null) ? transcript.scrollHeight : oldScroll;
    const target = updateTarget && [...entries.children].find(node => node.dataset.messageId === updateTarget);
    if (target) { target.classList.add('jump-target'); if (!navigationTouched && !cached) target.scrollIntoView({block:'center'}); }
    if (pendingViewRestore) {
      if (!navigationTouched) { restorePaneState(id, pendingViewRestore.modal); restoreReferenceFocus(pendingViewRestore.referenceFocus); transcript.scrollTop = pendingViewRestore.scroll; }
      pendingViewRestore = null;
    }
    if (!navigationTouched && ['conversation','transcript'].includes(document.activeElement.id)) { reconcileChatCursor(); paintChat(false); }
    if (state.next && seen.has(JSON.stringify(state.query('newer')))) { nextDelay = null; $('message-health').textContent = 'Messages still settling or cursor unchanged. Retry to continue.'; }
    if(!older)state.caughtUp=!cached&&!state.next&&!stalled;
  } catch (error) {
    if (request === messageRequest) {
      $('message-health').textContent = 'Loading failed. Loaded messages kept; retry the same direction.';
      if (!older && ++messageRetries <= 3) {
        const rate = error.message.match(/Retry after ([0-9.]+) seconds/);
        nextDelay = rate ? Number(rate[1]) * 1000 : 1000 * 2 ** (messageRetries - 1);
        $('message-health').textContent = 'Loading failed. Loaded messages kept; retrying automatically (' + messageRetries + '/3).';
      }
      throw error;
    }
  } finally {
    if (request === messageRequest) {
      messageBusy = false;
      $('earlier').hidden = !messageState.before;
      $('newer').hidden = !messageState.next;
      $('earlier').disabled = false;
      $('newer').disabled = false;
      $('refresh').disabled = false;
      if (typeof liveStream !== 'undefined') liveStream.hydrated();
      if (nextDelay !== null) scheduleMessages(nextDelay);
    }
  }
}

async function messageNodes(items, id) {
    const visibility = showToolActivity;
    items=[...outgoing.project(items.filter(item=>!item.liveDelivery),id),...items.filter(item=>item.liveDelivery)];
    const existing = new Map([...$('entries').children].map(node=>[node.dataset.entryKey,node]));
    const nodes = await Promise.all(items.filter(item => visibleMessage(item) && (typeof item.text === 'string' && item.text.trim() || item.attachments?.length)).map(async item => {
      const entryKey = item.outgoingState?'outgoing-'+item.clientKey:Transcript.key(item), serialized = JSON.stringify(item);
      const prior = existing.get(entryKey);
      if (prior?.entryValue === serialized) return prior;
      const card = document.createElement('article');
      card.dataset.entryKey = entryKey;
      card.entryValue = serialized;
      card.dataset.role = item.source === 'user' ? 'user' : 'assistant';
      card.dataset.source = item.source;
      if (item.id) card.dataset.messageId = item.id;
      if(item.outgoingState)card.dataset.clientKey=item.clientKey;
      const header = document.createElement('header');
      const date = document.createElement('time');
      const label = document.createElement('span');
      label.textContent = ({ user:'YOU', assistant:'CAPY', agent:'AGENT' })[item.source] ?? String(item.source ?? 'EVENT').toUpperCase();
      label.className = 'message-role';
      if(item.liveDelivery){const status=document.createElement('span');status.className='send-status';status.textContent='Delivered live · history syncing';header.append(status);}
      if(item.outgoingState){
        card.dataset.outgoing=item.outgoingState;
        const status=document.createElement('span');status.className='send-status';status.textContent=item.outgoingStatus;
        status.title='Queue delivery was requested. Acceptance does not confirm agent pickup; earlier work can delay it.';
        header.append(status);
        if(item.outgoingState==='failed'){
          const retry=document.createElement('button');retry.type='button';retry.textContent='Retry send';
          retry.onclick=()=>outgoing.submit(outgoing.items.get(item.clientKey),null);header.append(retry);
          card.title=item.outgoingStatus+' · '+outgoing.items.get(item.clientKey).error;
        }
      }
      card.setAttribute('aria-label', label.textContent === 'YOU' ? 'Your message' : label.textContent + ' message');
      date.textContent = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
      let text;
      if(item.outgoingLocal){text=document.createElement('div');text.className='markdown outgoing-text';text.textContent=item.text;}
      else text=await window.richText.render(item, id, () => thread?.id === id ? navigationRequest : null);
      header.append(label, date);
      if(item.sender?.id && ReferenceTargets.id(item.sender.id)) {
        const sender=document.createElement('a');sender.textContent='From '+(item.authorName || item.sender.relation || 'agent');
        const known=referenceNavigation.rows().find(row=>row.id===item.sender.id);
        referenceNavigation.bind(sender,{kind:known?.isCaptain||item.sender.relation==='captain'?'captain':'thread',id:item.sender.id,label:sender.textContent});
        header.append(sender);
      }
      card.append(header, text);
      return card;
    }));
    return visibility === showToolActivity ? nodes : messageNodes(items, id);
}

function updateSend() {
  $('send').disabled = pending || draft.disabled || !draft.value.trim();
}

const shortcuts = $('shortcuts'), connection = $('connection');
let changingConnection = false;
async function changeConnection(action) {
  if (changingConnection || pending || newThread.busy) { $('connection-mode').value = demoMode ? 'mock' : 'live'; throw Error('Wait for the active send or creation before switching.'); }
  changingConnection = true;
  if (thread) drafts.set(thread.id, draft.value);
  document.body.inert = true;
  try {
    await desk.stashDrafts([...drafts].slice(-100));
    const result = await action();
    if (result?.needsKey) { $('connection-mode').value = demoMode ? 'mock' : 'live'; connection.showModal(); $('key').focus(); return; }
    resetChatProjection();
    location.reload();
  } catch (error) { $('connection-mode').value = demoMode ? 'mock' : 'live'; throw error; }
  finally { document.body.inert = false; changingConnection = false; }
}
$('connection-mode').onchange = () => changeConnection(() => desk.setMode($('connection-mode').value)).catch(fail);
$('forget-key').onclick = () => changeConnection(() => desk.forgetKey()).catch(error => $('key-error').textContent = error.message);
$('help').onclick = () => { clearKeySequence(); shortcuts.showModal(); };
$('connect').onclick = () => { clearKeySequence(); $('key-error').textContent = ''; connection.showModal(); $('key').focus(); };
$('close-connect').onclick = () => connection.close();
connection.onclose = () => { $('key').value = ''; };
$('key-form').onsubmit = async event => {
  event.preventDefault();
  $('save-key').disabled = true;
  try {
    const candidate = $('key').value.trim(); $('key').value = '';
    await changeConnection(() => desk.connect(candidate, $('remember-key').checked));
  } catch (error) {
    if (connection.open) $('key-error').textContent = error.message;
    else fail(error);
  } finally {
    $('save-key').disabled = false;
  }
};
projectPicker.onchange = () => selectProject().catch(fail);
$('more').onclick = () => loadThreads(true).catch(fail);
$('earlier').onclick = () => loadMessages(true).catch(fail);
$('newer').onclick = () => loadMessages().catch(fail);
$('refresh').onclick = () => {
  ++messageRequest; messageBusy = false; desk.cancelMessages().catch(()=>{});
  autoPages = 0; messageRetries = 0; messageState.forwardSeen = []; clearTimeout(messageTimer);messageTimer=null;
  const id = thread?.id;
  loadMessages().catch(error => { if (thread?.id === id) fail(error); });
};
draft.addEventListener('limit',()=>say('Reply limit is 30000 characters. Paste canceled.'));
draft.oninput = () => { if (thread) drafts.set(thread.id, draft.value); updateSend(); };
$('composer').onsubmit = async event => {
  event.preventDefault();
  if (event.submitter !== $('send') || $('send').disabled) return;
  const { id } = thread;
  const text = draft.value, sentDoc = composer.view.state.doc;
  const prior=[...outgoing.items.values()].reverse().find(entry=>entry.threadId===id&&entry.text===text.trim()&&entry.state==='failed');
  const clientKey = prior?.clientKey ?? crypto.randomUUID();
  const entry=outgoing.items.get(clientKey)||{threadId:id,text:text.trim(),clientKey,createdAt:new Date().toISOString(),model:conversationControls.choices.get(id)};
  await outgoing.submit(entry,sentDoc);
};

document.addEventListener('focusin', event => {
  const region = event.target.closest('aside, section, #composer');
  if (region) {
    pane = region.id;
    viewFocus = draft.contains(event.target) ? 'draft' : event.target.dataset.id ? 'thread:' + event.target.dataset.id : event.target.id || region.id;
  }
  keyboardMode();
});

desk.status().then(async status => {
  if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  for (const [id, text] of status.drafts || []) drafts.set(id, text);
  demoMode = status.demo;
  connectionNotice = status.warning || '';
  $('connection-mode').value = demoMode ? 'mock' : 'live';
  $('saved-key-status').textContent = status.saved ? 'A saved key is available. Mock keeps it dormant.' : 'No saved key. Environment credentials are never saved automatically.';
  if (status.warning) $('saved-key-status').textContent += ' ' + status.warning;
  $('forget-key').disabled = !status.saved && !status.connected;
  $('connect').textContent = demoMode ? 'Connect live' : 'Connect';
  $('connection-state').textContent = demoMode ? 'DEMO · SAMPLE DATA' : status.connected ? 'CONNECTED' + (status.source === 'session' ? ' · SESSION ONLY' : status.source === 'environment' ? ' · ENV' : '') : 'OFFLINE';
  if (status.dev && await devReload.restore(status)) return;
  if (status.connected) await projects();
  else say('Connect to browse your projects, or launch with --demo for sample data.');
  if (status.warning) say(status.warning);
}).catch(fail);
