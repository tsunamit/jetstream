let referenceTarget = null, referenceDialog = null;
const referenceNodes = new WeakMap();
function referenceFocus() {
  const node=document.activeElement.closest('[data-reference]'),card=node?.closest('article');
  if(!card)return null;
  const target=referenceNodes.get(node);
  return {messageId:card.dataset.messageId,index:[...card.querySelectorAll('[data-reference]')].indexOf(node),kind:target.kind,id:target.id,fileId:target.fileId};
}
function restoreReferenceFocus(saved) {
  if(!saved)return;
  const card=[...$('entries').children].find(node=>node.dataset.messageId===saved.messageId);
  const node=card?.querySelectorAll('[data-reference]')[saved.index],target=node&&referenceNodes.get(node);
  if(target&&target.kind===saved.kind&&target.id===saved.id&&target.fileId===saved.fileId)node.focus({preventScroll:true});
}
function referenceRows() {
  const data = workTree.enabled ? workTree.state.data : catalog;
  return [...(data?.threads ?? []),...(data?.captains ?? []).map(item=>({...item,isCaptain:true}))];
}
function currentReference() {
  const focused=document.activeElement.closest('[data-reference],.image-button');
  if(focused?.closest('#entries'))return focused;
  const piece = chatText().pieces.find(p=>chatPosition >= p.start && chatPosition < p.end);
  const node = piece && (piece.node.nodeType === Node.TEXT_NODE ? piece.node.parentElement : piece.node);
  return node?.closest('[data-reference]') ?? (piece?.object ? node : null);
}
function referenceLabel(node) {
  const target=referenceNodes.get(node);
  return target ? target.kind+': '+(target.label || target.id || 'reference') : node.matches('.diagram')?'diagram source':'image';
}
function closeReferenceView() {
  const dialog = referenceDialog;
  referenceDialog = null;
  if (dialog) { dialog.onclose = null; dialog.close(); dialog.remove(); }
  referenceTarget = null;
}
function bindReference(node, target) {
  node.dataset.reference = '';
  node.setAttribute('role','link');
  node.tabIndex = 0;
  node.title = target.kind === 'external' ? 'Open in external browser' : target.kind === 'unavailable' ? target.reason : 'Open reference · gd / Enter';
  referenceNodes.set(node,target);
  node.onclick = event => {
    event.preventDefault();
    if(!node.isConnected)return;
    openReference(target).catch(fail);
  };
  node.onkeydown = event => {if(event.key==='Enter'){event.preventDefault();event.stopPropagation();openReference(target).catch(fail);}};
  return node;
}
async function showReferenceView(target, preview = false) {
  const restore=preview ? globalThis.imagePreviewReturn?.() : null;
  closeReferenceView();
  referenceTarget = preview ? null : target;
  const request = navigationRequest;
  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer reference-viewer';
  dialog.setAttribute('aria-label',target.label || 'Reference');
  const close = document.createElement('button'); close.type='button';close.textContent='Close preview · Esc';
  const leave = () => {
    if(referenceDialog!==dialog)return;
    if(preview){closeReferenceView();if(request===navigationRequest&&thread?.id===target.threadId)restore?.();}
    else traverseHistory(-1).catch(fail);
  };
  close.onclick = leave;
  dialog.oncancel = event => {event.preventDefault();leave();};
  dialog.onclose = leave;
  const heading = document.createElement('h2');heading.textContent=target.label || 'Reference';
  const status = document.createElement('p');status.setAttribute('role','status');
  dialog.append(close,heading,status);document.body.append(dialog);referenceDialog=dialog;
  dialog.showModal();close.focus();
  const valid = () => referenceDialog===dialog && request===navigationRequest && thread?.id===target.threadId && !changingConnection;
  if (target.kind === 'diagram') {
    const card=[...$('entries').children].find(node=>node.dataset.messageId===target.messageId);
    const code=card?.querySelectorAll('.code-block')[target.index]?.querySelector('pre code');
    status.textContent=code ? 'Diagram source · read-only' : 'Source is no longer loaded.';
    if(code){const pre=document.createElement('pre');pre.textContent=code.textContent;dialog.append(pre);}
    return;
  }
  const save=document.createElement('button');save.type='button';save.textContent='Save file…';
  save.onclick=async()=>{save.disabled=true;try{const result=await desk.media(target.threadId,target.fileId,'save');if(valid())status.textContent=result.canceled?'Save canceled.':'Saved.';}catch{if(valid())status.textContent='File unavailable. Close and retry.';}finally{save.disabled=false;}};
  dialog.append(save);
  if (!target.image) {status.textContent='This file cannot be navigated internally. Use Save file to open it in another app.';return;}
  status.textContent='Loading image…';
  try {
    const result=await desk.media(target.threadId,target.fileId,'preview');
    if(!valid())return;
    const image=new Image();image.alt=target.label;image.src=result.data;await image.decode();
    if(!valid())return;
    status.textContent=target.snapshot?'Delivered Drive copy · not a live Drive viewer':'Image preview';dialog.append(image);
  } catch {if(valid())status.textContent='Image unavailable. Close and retry.';}
}
async function hydrateReferenceContext(target, request) {
  try {
    const resolved=await desk.referenceContext(target.kind,target.id);
    if(request!==navigationRequest||changingConnection||thread?.id!==target.id)return;
    thread=resolved;
    project=resolved.projectId;projectPicker.value=project;
    $('title').textContent=titleOf(resolved);$('thread-code').textContent=resolved.code||resolved.id;
    if(history[historyIndex]){history[historyIndex].item=resolved;history[historyIndex].projectId=project;}
    if(workTree.enabled){const key=resolved.isCaptain?'captains':'threads';workTree.state.data={...workTree.state.data,[key]:[...workTree.state.data[key].filter(row=>row.id!==resolved.id),resolved]};workTree.render();}
    keyboardMode();
  }catch{
    if(request!==navigationRequest||changingConnection||thread?.id!==target.id)return;
    thread={...thread,title:'Reference unavailable'};$('title').textContent=thread.title;
    if(history[historyIndex])history[historyIndex].item=thread;
    if(workTree.enabled){const key=thread.isCaptain?'captains':'threads';workTree.state.data={...workTree.state.data,[key]:workTree.state.data[key].map(row=>row.id===thread.id?thread:row)};workTree.render();}
    say('Reference unavailable or access denied. Back returns to the source.');
  }
}
async function openReference(target) {
  if (changingConnection) return;
  if(target.kind==='external'){await desk.openLink(target.url);return;}
  if(target.kind==='unavailable'){say(target.reason);return;}
  if(['thread','captain','code'].includes(target.kind)) {
    const rows=referenceRows();
    const {item,error}=ReferenceTargets.entity(target,rows);
    if(item){const hydration=openThread(item,{projectId:item.projectId,focus:'conversation'});if(item.referencePending)await hydrateReferenceContext(item.referencePending,navigationRequest);return hydration;}
    if(rows.some(row=>row.id===target.id)||target.kind==='code'||!/^jam_[A-Za-z0-9]{26}$/.test(target.id)){say(error);return;}
    const hydration=openThread({id:target.id,title:'Loading reference…',isCaptain:target.kind==='captain',referencePending:target},{focus:'conversation'});
    await hydrateReferenceContext(target,navigationRequest);
    return hydration;
  }
  if(target.kind==='message') {
    if(![...$('entries').children].some(node=>node.dataset.messageId===target.id)){say('Message is not loaded in this conversation. Load its history first.');return;}
    return openThread(thread,{target:target.id,focus:'conversation'});
  }
  if(historyIndex>=0)history[historyIndex]=captureView();
  ++navigationRequest;
  closeReferenceView();
  referenceTarget=target;
  history=history.slice(0,historyIndex+1);history.push(captureView());
  if(history.length>100)history.shift();
  historyIndex=history.length-1;historyControls();
  return showReferenceView(target);
}
function openCurrentReference() {
  const node=currentReference();
  if(!node){say('No reference under the chat cursor.');return;}
  const target=referenceNodes.get(node);
  if(target)return openReference(target);
  if(node.matches('.image-button')){node.click();return;}
  if(node.matches('.diagram')) {
    const card=node.closest('article');
    return openReference({kind:'diagram',threadId:thread.id,messageId:card.dataset.messageId,index:[...card.querySelectorAll('.code-block')].indexOf(node.closest('.code-block')),label:'Diagram source'});
  }
}
globalThis.referenceNavigation={bind:bindReference,open:openReference,rows:referenceRows,register:(node,target)=>referenceNodes.set(node,target),preview:target=>showReferenceView(target,true)};
