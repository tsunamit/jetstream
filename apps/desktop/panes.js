let chatPosition = 0, chatAnchor = null, chatLineVisual = false, chatQuery = '', localYank = '';

let chatProjection = null;
let chatTextCache = null;
const chatTextObserver = new MutationObserver(() => { chatTextCache = null; });
chatTextObserver.observe($('entries'), {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','hidden','open']});
function resetChatProjection() {
  chatTextObserver.takeRecords();
  chatTextCache = null;
  chatProjection = null;
}
const paneStates = new Map();
function paneSnapshot() {
  return {chatPosition, chatAnchor, chatLocation:chatLocation(chatPosition), anchorLocation:chatLocation(chatAnchor), chatLineVisual, editor:composer.snapshot(), selection:[draft.selectionStart,draft.selectionEnd]};
}
function savePaneState(id) { if (id) paneStates.set(id, paneSnapshot()); }
function restorePaneState(id, snapshot) {
  const state = snapshot ?? paneStates.get(id) ?? {};
  chatPosition = state.chatPosition ?? 0; chatAnchor = state.chatAnchor ?? null;
  chatPosition = restoreChatLocation(state.chatLocation) ?? chatPosition;
  chatAnchor = restoreChatLocation(state.anchorLocation) ?? chatAnchor;
  const hiddenTool = location => !showToolActivity && messageState.items.some(item=>item.source==='tool' && item.id===location?.messageId);
  if (hiddenTool(state.chatLocation) || hiddenTool(state.anchorLocation)) chatAnchor = null;
  chatLineVisual = state.chatLineVisual ?? false;
  if (snapshot?.editor) composer.restore(snapshot.editor);
  paintChat(false); keyboardMode();
}
function chatText() {
  if (chatTextObserver.takeRecords().length) chatTextCache = null;
  if (chatTextCache) return chatTextCache;
  const pieces = [], chunks = []; let length = 0, last = '', block = null;
  function append(value) {
    chunks.push(value); length += value.length;
    if (value.length) last = value.at(-1);
  }
  function add(node, value, object = false) {
    pieces.push({node,start:length,end:length + value.length,object}); append(value);
  }
  for (const article of $('entries').children) {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (el.closest('.diagram,.image-button')) {
          if (node.nodeType === Node.ELEMENT_NODE && node.matches('.diagram,.image-button')) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_REJECT;
        }
        if (el.closest('button,.code-toolbar,.image-hint,summary,article > header,svg,[hidden]') || el.closest('details:not([open])')) return NodeFilter.FILTER_REJECT;
        if (node.nodeType === Node.ELEMENT_NODE && node.matches('br')) return NodeFilter.FILTER_ACCEPT;
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.length || !el.closest('.markdown')) return NodeFilter.FILTER_SKIP;
        if (!node.textContent.trim() && !el.closest('p,pre,li,h1,h2,h3,h4,h5,h6,td,th,blockquote')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches('br')) { if (last !== '\n') append('\n'); continue; }
        if (length && last !== '\n') append('\n');
        add(node, '\uFFFC', true); append('\n'); block = null; continue;
      }
      const nextBlock = node.parentElement.closest('p,pre,li,h1,h2,h3,h4,h5,h6,td,th,blockquote') ?? node.parentElement;
      if (block !== nextBlock && length && last !== '\n') append('\n');
      block = nextBlock; add(node, node.textContent);
    }
    if (length && last !== '\n') append('\n');
  }
  return chatTextCache = {text:chunks.join(''),pieces};
}
function chatOffset(projection, position, backwards = false) {
  const {pieces,text} = projection;
  if (!pieces.length) return 0;
  const p = Math.max(pieces[0].start,Math.min(pieces.at(-1).end - 1,position));
  if (pieces.some(piece => piece.start <= p && piece.end > p)) return p;
  return backwards ? Motions.move(text,[...pieces].reverse().find(piece => piece.end <= p).end,'Left') : pieces.find(piece => piece.start > p).start;
}
function chatLocation(position) {
  if (position === null) return null;
  const {pieces} = chatText(), piece = pieces.find(p => p.start <= position && p.end > position);
  if (!piece) return null;
  const article = piece.node.nodeType === Node.TEXT_NODE ? piece.node.parentElement.closest('article') : piece.node.closest('article');
  const text = piece.object ? piece.node.matches('.diagram') ? 'diagram' : 'image' : piece.node.textContent;
  const same = pieces.filter(p => article.contains(p.node) && (p.object ? p.node.matches('.diagram') ? 'diagram' : 'image' : p.node.textContent) === text && p.object === piece.object);
  return {messageId:article.dataset.messageId,clientKey:article.dataset.clientKey,index:[...$('entries').children].indexOf(article),text,object:piece.object,occurrence:same.indexOf(piece),offset:position - piece.start};
}
function restoreChatLocation(location) {
  if (!location) return null;
  const article = location.messageId ? [...$('entries').children].find(node => node.dataset.messageId === location.messageId || location.clientKey&&node.dataset.clientKey===location.clientKey) : $('entries').children[location.index];
  if (!article) return null;
  const piece = chatText().pieces.filter(p => article.contains(p.node) && Boolean(p.object) === Boolean(location.object) && (p.object ? p.node.matches('.diagram') ? 'diagram' : 'image' : p.node.textContent) === location.text)[location.occurrence];
  return piece ? piece.start + Math.min(location.offset,piece.end - piece.start - 1) : null;
}
function chatRanges(projection, from, to) {
  return projection.pieces.filter(piece => !piece.object && piece.start < to && piece.end > from).map(piece => {
    const range = document.createRange();
    range.setStart(piece.node,Math.max(0,from - piece.start));
    range.setEnd(piece.node,Math.min(piece.node.length,to - piece.start));
    return range;
  });
}
function reconcileChatCursor() {
  const projection=chatText(),bounds=transcript.getBoundingClientRect();
  const current=projection.pieces.find(piece=>piece.start<=chatPosition&&piece.end>chatPosition);
  const rect=current && (current.object ? current.node : chatRanges(projection,chatPosition,Motions.move(projection.text,chatPosition,'Right'))[0])?.getBoundingClientRect();
  if(rect&&rect.top>=bounds.top&&rect.bottom<=bounds.bottom)return;
  for(const piece of projection.pieces) {
    const range=document.createRange();range.selectNodeContents(piece.node);
    const visible=[...(piece.object?[piece.node.getBoundingClientRect()]:range.getClientRects())].find(r=>r.height&&r.top>=bounds.top&&r.bottom<=bounds.bottom);
    if(!visible)continue;
    const caret=!piece.object&&document.caretPositionFromPoint(Math.max(bounds.left+2,visible.left+2),visible.top+visible.height/2);
    chatPosition=piece.start+(caret?.offsetNode===piece.node?caret.offset:0);
    return;
  }
}
let chatControlReturn = null;
function returnChatControl() {
  const position=chatControlReturn?.id===thread?.id ? restoreChatLocation(chatControlReturn.location)??chatControlReturn.position : chatPosition;
  if(matchMedia('(max-width:720px)').matches)$('chat-actions').open=false;
  $('conversation').focus();chatPosition=position;paintChat();keyboardMode();
}
function selectedChat(projection) {
  let from = Math.min(chatAnchor ?? chatPosition,chatPosition), to = Motions.move(projection.text,Math.max(chatAnchor ?? chatPosition,chatPosition),'Right');
  if (chatLineVisual) { from = Motions.line(projection.text,from)[0]; to = Motions.line(projection.text,to - 1)[1]; }
  return {from,to};
}
function paintChat(scroll = true) {
  CSS.highlights.delete('chat-cursor');
  CSS.highlights.delete('chat-selection');
  document.querySelector('.chat-object-cursor')?.classList.remove('chat-object-cursor');
  document.querySelectorAll('.chat-object-selection').forEach(node => node.classList.remove('chat-object-selection'));
  const projection = chatText();
  chatProjection = projection;
  chatPosition = chatOffset(projection,chatPosition);
  if (chatAnchor !== null) chatAnchor = chatOffset(projection,chatAnchor);
  const focused = ['conversation','transcript'].includes(document.activeElement.id);
  if (!focused) return;
  const piece = projection.pieces.find(p => p.start <= chatPosition && p.end > chatPosition);
  if (!piece) return;
  const range = chatRanges(projection,chatPosition,Motions.move(projection.text,chatPosition,'Right'))[0];
  if (piece?.object) piece.node.classList.add('chat-object-cursor');
  else if (range) { const highlight = new Highlight(range); highlight.priority = 1; CSS.highlights.set('chat-cursor',highlight); }
  if (chatAnchor !== null) {
    const {from,to} = selectedChat(projection);
    CSS.highlights.set('chat-selection',new Highlight(...chatRanges(projection,from,to)));
    for (const object of projection.pieces.filter(p => p.object && p.start < to && p.end > from)) object.node.classList.add('chat-object-selection');
  }
  if (scroll) {
    const rect = (range ?? piece.node).getBoundingClientRect(), bounds = transcript.getBoundingClientRect();
    if (rect.top < bounds.top || rect.bottom > bounds.bottom) transcript.scrollTop += rect.top - bounds.top - bounds.height / 3;
  }
}
function chatMove(motion) {
  const projection = chatText(), {text} = projection;
  chatPosition = Motions.move(text,chatPosition,motion);
  if (motion === 'Last') chatPosition = Motions.move(text,text.trimEnd().length,'Left');
  if (motion === 'End' && chatPosition > Motions.move(text,chatPosition,'Start')) chatPosition = Motions.move(text,chatPosition,'Left');
  chatPosition = chatOffset(projection,chatPosition,['Left','BackWord','Up','Start','First'].includes(motion));
  paintChat(); keyboardMode();
}
function chatVisual(line = false) {
  if (chatAnchor !== null && chatLineVisual === line) cancelChatVisual();
  else { window.getSelection()?.removeAllRanges(); chatAnchor = chatPosition; chatLineVisual = line; paintChat(); }
  keyboardMode();
}
function cancelChatVisual() { chatAnchor = null; chatLineVisual = false; window.getSelection()?.removeAllRanges(); paintChat(false); keyboardMode(); }
async function yankChat() {
  if (chatAnchor === null) { say('Use visual selection first, or select text with the mouse.'); return; }
  const projection = chatText(), {from,to} = selectedChat(projection);
  localYank = projection.text.slice(from,to).replace(/\uFFFC/g,'');
  await desk.copyText(localYank); cancelChatVisual(); say('Copied plain text.');
}
function chatMessage(delta) {
  const {pieces} = chatText();
  const starts = [...new Set(pieces.map(p => p.node.nodeType === Node.TEXT_NODE ? p.node.parentElement.closest('article') : p.node.closest('article')))].map(article => pieces.find(p => article.contains(p.node))?.start).filter(p => p !== undefined);
  chatPosition = delta > 0 ? starts.find(p => p > chatPosition) ?? chatPosition : starts.filter(p => p < chatPosition).at(-1) ?? 0;
  paintChat(); keyboardMode();
}
function findChat(delta) {
  if (!chatQuery) return false;
  const text = chatText().text.toLocaleLowerCase(), query = chatQuery.toLocaleLowerCase();
  let next = delta > 0 ? text.indexOf(query,chatPosition + 1) : text.lastIndexOf(query,chatPosition - 1);
  if (next < 0) next = delta > 0 ? text.indexOf(query) : text.lastIndexOf(query);
  if (next < 0) { $('chat-search-status').textContent = 'No matches in loaded messages.'; say('No matches in loaded messages.'); return false; }
  $('chat-search').close(); $('conversation').focus(); chatPosition = next; paintChat();
  keyboardMode();return true;
}
function openChatSearch() { clearKeySequence(); $('chat-query').value = chatQuery; $('chat-search-status').textContent = ''; $('chat-search').showModal(); $('chat-query').focus(); }
$('chat-search-form').onsubmit = event => { event.preventDefault(); const previous=chatQuery;chatQuery=$('chat-query').value;if(!chatQuery){$('chat-search').close();return;}if(!findChat(1))chatQuery=previous; };
$('close-chat-search').onclick = () => $('chat-search').close();
function activateChatObject() {
  const reference=currentReference();
  if(reference?.matches('[data-reference]'))return openCurrentReference();
  const piece = chatText().pieces.find(p => p.object && chatPosition >= p.start && chatPosition < p.end);
  if (!piece) return;
  chatControlReturn={id:thread?.id,position:chatPosition,location:chatLocation(chatPosition)};
  if (piece.node.matches('.image-button')) piece.node.click();
  else { const details = piece.node.parentElement.querySelector('details'); if (details) { details.open = true; details.querySelector('summary')?.focus(); } }
}
globalThis.imagePreviewReturn = () => {
  const id = thread?.id, location = chatLocation(chatPosition), anchor = chatLocation(chatAnchor), scroll = transcript.scrollTop;
  const origin = document.activeElement;
  return () => {
    if (thread?.id !== id) return;
    chatPosition = restoreChatLocation(location) ?? chatPosition;
    chatAnchor = restoreChatLocation(anchor);
    (origin?.isConnected ? origin : $('conversation')).focus({preventScroll:true});
    paintChat(false); transcript.scrollTop = scroll; keyboardMode();
  };
};
function captureToolPresentation(hiding) {
  const id = thread?.id, projection = chatText(), position = chatLocation(chatPosition), anchor = chatLocation(chatAnchor);
  const isTool = piece => (piece.node.nodeType === Node.TEXT_NODE ? piece.node.parentElement : piece.node).closest('article')?.dataset.source === 'tool';
  const survivors = projection.pieces.filter(piece => !hiding || !isTool(piece));
  const nearest = survivors.find(piece => piece.start >= chatPosition) ?? survivors.at(-1);
  const fallback = nearest && chatLocation(nearest.start);
  const selection = chatAnchor !== null && selectedChat(projection);
  const removedSelection = hiding && selection && projection.pieces.some(piece => isTool(piece) && piece.start < selection.to && piece.end > selection.from);
  const scroll = transcript.scrollTop, top = transcript.getBoundingClientRect().top;
  const outputHidden = $('new-output').hidden;
  const tail = transcript.scrollHeight - scroll - transcript.clientHeight < 40 && chatAnchor === null;
  const rect = piece => {
    if (piece.object) return piece.node.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(piece.node); return range.getBoundingClientRect();
  };
  const visible = survivors.find(piece => rect(piece).bottom > top && rect(piece).top < top + transcript.clientHeight);
  const viewport = visible && {location:chatLocation(visible.start), offset:rect(visible).top};
  return () => {
    if (thread?.id !== id) return;
    chatPosition = restoreChatLocation(position) ?? restoreChatLocation(fallback) ?? 0;
    chatAnchor = removedSelection ? null : restoreChatLocation(anchor);
    paintChat(false); keyboardMode();
    const restored = viewport && restoreChatLocation(viewport.location);
    const piece = restored !== null && restored !== undefined && chatText().pieces.find(piece => piece.start <= restored && piece.end > restored);
    if (tail) transcript.scrollTop = transcript.scrollHeight;
    else if (piece) transcript.scrollTop += rect(piece).top - viewport.offset;
    else transcript.scrollTop = scroll;
    $('new-output').hidden = outputHidden;
    if (removedSelection) say('Tool activity hidden; selection across tool summaries was cleared.');
  };
}
$('toggle-tool-activity').onclick = toggleToolActivity;
toolActivityHints();
function captureReadingLayout(preserveCursor=true) {
  const id=thread?.id;
  const position = chatLocation(chatPosition), anchor = chatLocation(chatAnchor), scroll = transcript.scrollTop;
  const selection=window.getSelection();
  const tail = transcript.scrollHeight - scroll - transcript.clientHeight < 40 && chatAnchor === null && selection?.isCollapsed!==false;
  const top = transcript.getBoundingClientRect().top,projection=chatText();
  let visible=null;
  for(const piece of projection.pieces){
    const range=piece.object?piece.node:document.createRange();
    if(!piece.object)range.selectNodeContents(piece.node);
    if(range.getBoundingClientRect().bottom<=top)continue;
    let offset=0;
    if(!piece.object){
      let low=0,high=piece.node.length-1;
      while(low<high){const mid=Math.floor((low+high)/2);range.setStart(piece.node,mid);range.setEnd(piece.node,mid+1);if(range.getBoundingClientRect().bottom<=top)low=mid+1;else high=mid;}
      offset=low;range.setStart(piece.node,offset);range.setEnd(piece.node,offset+1);
    }
    visible={location:chatLocation(piece.start+offset),offset:range.getBoundingClientRect().top-top};break;
  }
  return ()=>{
    if(thread?.id!==id)return;
    if(preserveCursor){chatPosition = restoreChatLocation(position) ?? chatPosition; chatAnchor = restoreChatLocation(anchor);}
    paintChat(false);
    const restored=visible&&restoreChatLocation(visible.location);
    const piece=restored!==null&&restored!==undefined&&chatText().pieces.find(p=>p.start<=restored&&p.end>restored);
    if(tail&&chatAnchor===null&&window.getSelection()?.isCollapsed!==false)transcript.scrollTop=transcript.scrollHeight;
    else if(piece){
      let rect;
      if(piece.object)rect=piece.node.getBoundingClientRect();
      else {const range=document.createRange();range.setStart(piece.node,restored-piece.start);range.setEnd(piece.node,Math.min(piece.node.length,restored-piece.start+1));rect=range.getBoundingClientRect();}
      transcript.scrollTop+=rect.top-transcript.getBoundingClientRect().top-visible.offset;
    }else transcript.scrollTop=scroll;
  };
}
globalThis.preserveMediaLayout = update => {
  const restore=captureReadingLayout();update();restore();
};
function insertDraft(append = false) {composer.insert(append); keyboardMode();}
function normalDraft() {composer.normal(); keyboardMode();}
function draftMove(motion) {const keys={Left:'h',Right:'l',Down:'j',Up:'k',Word:'w',BackWord:'b',Start:'0',End:'$',First:'gg',Last:'G'}; for(const key of keys[motion]) composer.key(key);}
function editDraft(operation) {const keys={Delete:'x',DeleteLine:'dd',DeleteWord:'dw',YankLine:'yy',Paste:'p',Undo:'u'}; for(const key of keys[operation]) composer.key(key);}
$('chat-cursor').onclick = () => { $('conversation').focus(); paintChat(); };
$('edit-reply').onclick = () => { if (!draft.disabled) insertDraft(); };
$('chat-select').onclick = () => { $('conversation').focus(); chatVisual(); };
$('chat-copy').onclick = () => {
  if (chatAnchor !== null) yankChat().catch(fail);
  else { const selection = window.getSelection(); if (selection?.anchorNode && $('entries').contains(selection.anchorNode)) desk.copyText(selection.toString()).catch(fail); }
};
draft.addEventListener('input',keyboardMode);
draft.addEventListener('select',keyboardMode);
document.addEventListener('focusin', event => { if(['conversation','transcript'].includes(event.target.id))reconcileChatCursor();paintChat(false); keyboardMode(); });
$('entries').addEventListener('pointerdown', () => { chatAnchor = null; chatLineVisual = false; paintChat(false); keyboardMode(); });
let chatPaintPending = false;
new MutationObserver(() => {
  if (chatPaintPending) return;
  chatPaintPending = true;
  requestAnimationFrame(() => {
    chatPaintPending = false;
    const next = chatText();
    const restore = position => {
      if (position === null) return null;
      const old = chatProjection?.pieces.find(piece => piece.start <= position && piece.end > position);
      const current = old && next.pieces.find(piece => piece.node === old.node);
      return current ? current.start + Math.min(position - old.start,current.end - current.start - 1) : position;
    };
    chatPosition = restore(chatPosition); chatAnchor = restore(chatAnchor);
    paintChat(false); keyboardMode();
  });
}).observe($('entries'),{childList:true,subtree:true,characterData:true});

function chatHalfPage(direction, fraction = 0.5) {
  const projection=chatText();
  if(!projection.pieces.length)return;
  chatPosition=chatOffset(projection,chatPosition);
  const current=projection.pieces.find(p=>p.start<=chatPosition&&p.end>chatPosition);
  const rectAt=p=>p.object?p.node:chatRanges(projection,chatPosition,Motions.move(projection.text,chatPosition,'Right'))[0];
  const cursor=rectAt(current).getBoundingClientRect(), bounds=transcript.getBoundingClientRect();
  const distance=direction*transcript.clientHeight*fraction;
  const y=Math.max(bounds.top,Math.min(bounds.bottom-cursor.height,cursor.top))+distance,x=cursor.left;
  let best=null,first=Infinity,last=-Infinity;
  for(const piece of projection.pieces) {
    const range=document.createRange();range.selectNodeContents(piece.node);
    for(const rect of piece.object?[piece.node.getBoundingClientRect()]:range.getClientRects()) {
      if(!rect.height)continue;
      first=Math.min(first,rect.top);last=Math.max(last,rect.bottom);
      const score=Math.abs(rect.top-y)*10000+Math.max(rect.left-x,0,x-rect.right);
      if(!best||score<best.score)best={piece,rect,score};
    }
  }
  if(!best)return;
  const {piece,rect}=best;chatPosition=piece.start;
  if(!piece.object) {
    let low=0,high=piece.node.length-1;const range=document.createRange(),target=Math.max(rect.left,Math.min(rect.right-1,x));
    while(low<high) {
      const mid=Math.floor((low+high)/2);range.setStart(piece.node,mid);range.setEnd(piece.node,mid+1);const r=range.getBoundingClientRect();
      if(r.top<rect.top-1||Math.abs(r.top-rect.top)<1&&r.right<=target)low=mid+1;else high=mid;
    }
    chatPosition += [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(piece.node.textContent)].map(p=>p.index).filter(p=>p<=low).at(-1)??0;
  }
  if(y<=first+1&&direction<0)chatPosition=projection.pieces[0].start;
  if(y>=last&&direction>0)chatPosition=chatOffset(projection,Motions.move(projection.text,projection.pieces.at(-1).end,'Left'),true);
  transcript.scrollTop+=distance;paintChat(false);
  const next=projection.pieces.find(p=>p.start<=chatPosition&&p.end>chatPosition),r=rectAt(next).getBoundingClientRect();
  if(r.top<bounds.top)transcript.scrollTop+=r.top-bounds.top;
  else if(r.bottom>bounds.bottom)transcript.scrollTop+=Math.min(r.bottom-bounds.bottom,r.top-bounds.top);
  keyboardMode();
}
