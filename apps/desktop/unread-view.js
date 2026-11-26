const readState = {
  model:new UnreadState.State(),timer:null,refreshTimer:null,refreshing:false,lastRefresh:0,
  overlay(data,revision){
    const ids=new Set(data.threads.concat(data.captains).map(i=>i.id));
    for(const [id,s] of this.model.items)if(!ids.has(id)&&id!==thread?.id&&!s.pending)this.model.items.delete(id);
    for(const key of ['threads','captains'])data[key]=data[key].map(i=>this.model.accept(i,revision));
  },
  select(id,previous){this.model.visit(id,previous);clearTimeout(this.timer);clearTimeout(this.refreshTimer);this.refreshTimer=null;this.schedule();},
  item(id){return workTree.state.data.threads.concat(workTree.state.data.captains).find(i=>i.id===id)|| (thread?.id===id?thread:null);},
  value(item){const s=this.model.get(item.id);return typeof s.value==='boolean'?s.value:item.hasUnreads;},
  decorate(row,item){
    const unread=this.value(item)===true;row.classList.toggle('thread-unread',unread);
    const meta=row.querySelector('.thread-meta');if(!meta)return;
    if(unread){const label=document.createElement('span');label.className='unread-label';label.title='Unread';const text=document.createElement('span');text.className='row-details';text.textContent='Unread';const dot=document.createElement('span');dot.className='unread-dot';dot.setAttribute('aria-hidden','true');label.append(dot,text);meta.append(label);}
    meta.querySelector('.crew-unread-summary')?.remove();
    if(item.isCaptain){const count=workTree.state.data.threads.filter(i=>i.parentId===item.id&&this.value(i)===true).length;if(count){const label=document.createElement('span');label.className='row-details crew-unread-summary';label.textContent=count+' unread crew';meta.append(label);}}
  },
  countLabel(){if(!workTree.config.counts)return '';const data=workTree.state.data,items=data.threads.concat(data.captains);const known=items.filter(i=>typeof this.value(i)==='boolean'),count=known.filter(i=>this.value(i)).length;return known.length?count+' unread thread'+(count===1?'':'s')+(known.length<items.length?' · partial status':''):'';},
  paint(){
    const data=workTree.state.data;for(const key of ['threads','captains'])data[key]=data[key].map(i=>({...i,...(typeof this.model.get(i.id).value==='boolean'?{hasUnreads:this.model.get(i.id).value}:{})}));catalog=data;
    if(thread){const current=this.item(thread.id);if(current&&typeof current.hasUnreads==='boolean')thread.hasUnreads=current.hasUnreads;}
    workTree.render();
    if(!workTree.enabled)for(const row of $('threads').querySelectorAll('button')){const item=this.item(row.dataset.id);if(item){row.querySelector('.unread-label')?.remove();this.decorate(row,item);}}
    this.controls();
    if(picker.open)renderPicker();
  },
  cursor(){
    if(!thread || liveStream.id!==thread.id || !messageState.started || !messageState.caughtUp || messageState.next || messageBusy || liveStream.rendering || liveStream.dirty || liveStream.record.partial.size || liveStream.record.unplaced(messageState.items))return null;
    const items=liveStream.record.merge(messageState.items),last=items.at(-1);
    if(!last || !$('entries').querySelector('[data-message-id="'+CSS.escape(last.id)+'"]'))return null;
    const value=liveStream.record.cursors.get(last.id);
    return typeof value==='string'&&/^[A-Za-z0-9]{26}$/.test(value)?value:null;
  },
  visible(){return !document.hidden&&document.hasFocus()&&!document.querySelector('dialog[open]')&&!changingConnection&&$('conversation').contains(document.activeElement)&&transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<40&&chatAnchor===null;},
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.auto(),250);},
  auto(){
    this.controls();if(devReload.holdReads||!thread||!this.visible())return;
    const s=this.model.get(thread.id),cursor=this.cursor();
    if(!cursor||s.hold||s.pending||s.attempted===cursor||this.value(thread)!==true)return;
    this.write(thread.id,'read',cursor);
  },
  async write(id,action,eventId){
    const s=this.model.get(id);if(s.pending)return;
    const started=Date.now(),revision=this.model.begin(id,action);if(action==='read')s.attempted=eventId;
    this.controls();
    try{const result=await desk.threadReceipt({id,action,...(eventId?{eventId}:{})});this.model.finish(id,revision,result);if(action==='read'&&result?.hasUnreads===false)workActivity.read(id,started);}
    catch(error){this.model.finish(id,revision,null,error);say('Read status was not synced. Use Mark read/unread to retry.');}
    this.paint();this.schedule();
  },
  explicit(action){
    const row=document.activeElement.closest('#threads button');
    if(row?.dataset.kind==='project'){say('Choose a conversation before changing read status. Project rows are groups only.');return;}
    const id=row?.dataset.id||thread?.id;
    if(!id)return;
    const cursor=id===thread?.id?this.cursor():null;
    if(action==='read'&&!cursor){say('Open the thread and load its latest streamed event before marking it read. No event cursor is available yet.');return;}
    return this.write(id,action,cursor);
  },
  committed(id,frame){
    if(!frame.id || liveStream.record.cursors.get(frame.data.id)===frame.id)return;
    this.model.touch(id);
    if(!this.refreshTimer)this.refreshTimer=setTimeout(()=>{this.refreshTimer=null;this.refresh(id);},Math.max(800,5000-(Date.now()-this.lastRefresh)));
  },
  async refresh(id){
    if(this.refreshing||demoMode||changingConnection||document.hidden||thread?.id!==id)return;
    this.refreshing=true;this.lastRefresh=Date.now();const revision=this.model.version;
    try{const result=await desk.threadReadState(id);this.model.accept(result,revision);this.paint();this.schedule();}catch{}
    finally{this.refreshing=false;}
  },
  controls(){
    const s=thread?this.model.get(thread.id):null,value=thread?this.value(thread):undefined;
    $('read-health').textContent=!thread?'':s.pending?'Syncing read status…':s.error|| (s.hold?'Marked unread · held until revisit':value===true?'Unread':value===false?'Read':'Read status unavailable');
    $('read-status').textContent=s?.pending?'Syncing…':value===true?'● Unread':value===false?'Read':'Read ?';$('read-status').disabled=!thread;
    $('mark-read').disabled=!thread||s.pending||!this.cursor();$('mark-unread').disabled=!thread||s.pending;
  }
};
const readControls=document.createElement('dialog');readControls.id='read-controls';readControls.setAttribute('aria-labelledby','read-title');
const readTitle=document.createElement('h2');readTitle.id='read-title';readTitle.textContent='Thread read status';readControls.append(readTitle);
for(const [id,label,action] of [['mark-read','Mark read','read'],['mark-unread','Mark unread','unread']]){const b=document.createElement('button');b.id=id;b.textContent=label;b.onclick=()=>readState.explicit(action);readControls.append(b);}
const readHealth=document.createElement('p');readHealth.id='read-health';readHealth.setAttribute('role','status');readControls.append(readHealth);
const readNote=document.createElement('p');readNote.textContent='Mark read uses the latest loaded transcript event. Automatic read requires a focused conversation at its caught-up tail. Mark unread stays held until you leave and revisit, or explicitly mark read.';readControls.append(readNote);
const readClose=document.createElement('button');readClose.textContent='Close';readClose.onclick=()=>readControls.close();readControls.append(readClose);document.body.append(readControls);
const readStatus=document.createElement('button');readStatus.id='read-status';readStatus.title='Thread read status and actions';readStatus.onclick=()=>readControls.showModal();$('thread-code').after(readStatus);
transcript.addEventListener('scroll',()=>readState.schedule(),{passive:true});
document.addEventListener('focusin',()=>readState.schedule());
document.addEventListener('visibilitychange',()=>readState.schedule());window.addEventListener('focus',()=>readState.schedule());
readState.overlay(workTree.state.data,0);readState.controls();
