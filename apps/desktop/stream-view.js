const liveStream = {
  token:null, id:null, state:'mock', record:new StreamRecord(), timer:null, rendering:false, dirty:false, revision:0, statusTimer:null, observed:new Map(),
  select(item) {
    this.presentationRestore = null;
    this.token = crypto.randomUUID(); this.id = item?.id; this.record = messageCache.get(item?.id)?.streamRecord ?? new StreamRecord(); this.record.live.clear();this.record.turn.clear();this.state = demoMode ? 'mock' : 'connecting';
    this.revision++; clearTimeout(this.timer); clearTimeout(this.statusTimer); this.dirty = false;this.needsCommit=true;
    this.timer=null;this.statusTimer=null;this.subagents=new Map();$('crew-health').textContent='';
    $('new-output').hidden = true;
    if (!item || document.hidden) {client.stream(null).catch(()=>{});return;}
    if(this.record.historyLimited){this.state='limited';client.stream(null).catch(()=>{});this.health();return;}
    if(!capability('stream').supported){this.state='unavailable';this.health();return;}
    const token = this.token;
    client.stream({id:item.id,token}).catch(()=>{if (this.token === token) {this.state='polling';this.health();scheduleMessages(15000);}});
    this.health();this.schedule();
  },
  suppressesPolling() {return ['access','unavailable'].includes(this.state)||this.record.partial.size===0&&!this.record.unplaced(messageState.items)&&this.state==='streaming';},
  health() {
    const labels = {streaming:'Live stream',connecting:'Connecting stream',reconnecting:'Reconnecting · polling fallback',polling:'Rate limited / unavailable · polling fallback',limited:'Stream resource limit · paginated history / polling fallback',offline:'Offline · polling fallback',complete:'Stream ended',access:'Access lost · reconnect account to recover',unavailable:'Stream unavailable · Refresh history',mock:'Mock · no API'};
    $('stream-health').textContent = (labels[this.state] || this.state) + (this.record.overflow ? ' · preview limited; awaiting committed reply' : '')+(this.record.partial.size?' · incomplete commit; fetching full history record':this.record.unplaced(messageState.items)?' · replay awaiting history boundary':'');
    const row=[...$('threads').querySelectorAll('button')].find(b=>b.dataset.id===this.id);
    const polled=workTree.state.data.threads.concat(workTree.state.data.captains).find(i=>i.id===this.id);
    const freshPoll=!workTree.state.stale&&Date.now()-workTree.state.updated<120000;
    if(row && thread)workIndicator(row,this.state==='streaming'?thread:polled||thread,this.state==='streaming'||freshPoll);
  },
  overlay(data,started) {
    for(const key of ['threads','captains'])data[key]=data[key].map(item=>{const seen=this.observed.get(item.id);return seen && seen.at>=started?{...item,...seen.value}:item;});
  },
  project(state,id) {if(id!==this.id)return state.items;state.streamRecord=this.record;return this.record.visible(state.items);},
  hydrated() {this.needsCommit=true;this.revision++;this.health();if (this.dirty || this.record.live.size || this.record.committed.size) this.schedule();if(typeof readState!=='undefined')readState.schedule();},
  schedule() {this.dirty = true;if (!this.timer) this.timer = setTimeout(()=>{this.timer=null;this.render().catch(()=>{this.dirty=false;});},100);},
  async render() {
    if (this.rendering || !thread || thread.id !== this.id) return;
    this.rendering = true; this.dirty = false;
    const token = this.token, revision = this.revision, id = this.id;
    try {
      const items = this.record.visible(messageState.items);
      const presenting = this.presentationRestore?.id === id;
      const committing=this.needsCommit;
      this.needsCommit=false;
      const nodes = committing ? await messageNodes(items,id) : [...$('entries').children].filter(n=>!n.dataset.preview);
      if (token !== this.token || revision !== this.revision || id !== thread?.id) {this.dirty=true;this.needsCommit ||= committing;return;}
      const atTail = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 40 && chatAnchor === null;
      const scroll = transcript.scrollTop;
      const readingPreview=chatProjection?.pieces.some(p=>p.start<=chatPosition&&p.end>chatPosition&&(p.node.parentElement||p.node).closest('[data-preview]'));
      const position = committing ? chatLocation(chatPosition) : null, anchor = committing ? chatLocation(chatAnchor) : null;
      const entries = $('entries');
      const referenceControl=referenceFocus();
      for (const preview of entries.querySelectorAll('[data-preview]')) if (!this.record.live.has(preview.dataset.preview)) preview.remove();
      let previous = null;
      for (const node of nodes) {
        const expected = previous ? previous.nextSibling : entries.firstChild;
        if (expected !== node) entries.insertBefore(node,expected);
        previous = node;
      }
      const keep = new Set(nodes);
      for (const node of [...entries.children]) if (!node.dataset.preview && !keep.has(node)) node.remove();
      if(referenceControl&&document.activeElement===document.body)restoreReferenceFocus(referenceControl);
      for (const [call,item] of this.record.live) {
        if (!visibleMessage(item)) { [...entries.children].find(node=>node.dataset.preview===call)?.remove(); continue; }
        let node = [...entries.children].find(n=>n.dataset.preview === call);
        if (!node) {
          node = document.createElement('article'); node.dataset.preview=call; node.dataset.messageId=item.id; node.dataset.role='assistant';node.dataset.source=item.source;
          const header=document.createElement('header'); header.textContent=item.source==='tool'?'TOOL · live summary':'CAPY · writing · source preview';
          const body=document.createElement('div');body.className='markdown stream-source';const pre=document.createElement('pre');body.append(pre);node.append(header,body);entries.append(node);
        }
        const pre=node.querySelector('pre');
        if (pre.textContent !== item.text) pre.textContent=item.text;
      }
      if (messageState.started) messageCache.set(id,messageState);
      if(committing) {
        chatPosition=restoreChatLocation(position) ?? chatPosition;
        if (chatAnchor !== null) chatAnchor=restoreChatLocation(anchor) ?? chatAnchor;
      }
      if ((committing || readingPreview) && ['conversation','transcript'].includes(document.activeElement.id)) paintChat(false);
      if (atTail) transcript.scrollTop=transcript.scrollHeight;
      else {transcript.scrollTop=scroll;$('new-output').hidden=false;}
      if (this.presentationRestore?.id === id) { this.presentationRestore.restore(); this.presentationRestore = null; }
      this.health();
      if(typeof readState!=='undefined' && !presenting)readState.schedule();
    } finally {this.rendering=false;if (this.dirty) this.schedule();}
  },
  observe(frame) {
    if (!['status','subagent','task','transcript','run'].includes(frame.event)) return;
    if(frame.event==='run'){if(frame.data.phase==='start'&&thread?.id===this.id)this.observe({event:'status',data:{threadId:this.id,status:'working',archived:thread.archived}});return;}
    const d=frame.data;
    if (frame.event==='subagent'||frame.event==='task') {
      const count=this.subagents ??= new Map();
      const id=d.subagentId||d.taskId;if(id)count.set(id,d);
      if(count.size>100)count.delete(count.keys().next().value);
      $('crew-health').textContent=count.size ? 'Observed subagents: '+[...count.values()].filter(v=>v.status==='working').length+' working / '+count.size+' seen' : '';
      return;
    }
    const id=d.threadId || this.id;
    if (id!==this.id) return;
    if (frame.event==='status' && thread?.id===id) {thread.status=d.status;thread.archived=d.archived;}
    if(frame.event==='status'){this.observed.set(id,{at:Date.now(),value:{status:d.status,archived:d.archived}});if(this.observed.size>100)this.observed.delete(this.observed.keys().next().value);}
    if (typeof workTree==='undefined' || !workTree.enabled) return;
    const data=workTree.state.data;
    const update=item=>item.id===id?{...item,...(frame.event==='status'?{status:d.status,archived:d.archived}:{lastActivityAt:d.createdAt || item.lastActivityAt})}:item;
    workTree.state.accept({...data,threads:data.threads.map(update),captains:data.captains.map(update)},workTree.state.updated || Date.now());
    catalog=workTree.state.data;
    const row=[...catalog.threads,...catalog.captains].find(t=>t.id===id);
    if(row) {
      catalog.activity=catalog.activity.filter(a=>a.threadId!==id || !['running','needs'].includes(a.kind));
      if(row.status==='working'||row.needsYou||row.owed)catalog.activity.push({id:'observed-'+id,threadId:id,kind:row.needsYou||row.owed?'needs':'running',title:titleOf(row),detail:'Observed stream status · '+WorkTree.status(row),minutes:0});
    }
    if(!this.statusTimer)this.statusTimer=setTimeout(()=>{this.statusTimer=null;workTree.render();if(picker.open) {const selectedId=matches[selected]?.threadId,scroll=$('picker-list').scrollTop;renderPicker();const index=matches.findIndex(m=>m.threadId===selectedId);if(index>=0){selected=index;renderPicker();}$('picker-list').scrollTop=scroll;}},100);
  }
};
const health=document.createElement('span');health.id='stream-health';health.className='muted';
const crew=document.createElement('span');crew.id='crew-health';crew.className='muted';
const output=document.createElement('button');output.id='new-output';output.type='button';output.textContent='New output ↓';output.hidden=true;
output.onclick=()=>{transcript.scrollTop=transcript.scrollHeight;output.hidden=true;$('conversation').focus({preventScroll:true});reconcileChatCursor();paintChat(false);};
$('thread-code').after(health,crew,output);
transcript.addEventListener('scroll',()=>{if(transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<40)output.hidden=true;},{passive:true});
client.onStream(batch=>{
  if (batch.context && batch.context!==providerInfo?.scope || batch.token!==liveStream.token || batch.id!==liveStream.id || document.hidden || changingConnection) return;
  let changed=false;
  for (const frame of batch.events) {
    workActivity.observed(batch.id,frame);
    if(frame.event==='transcript')liveStream.needsCommit=true;
    if(frame.event==='transcript' && typeof readState!=='undefined')readState.committed(batch.id,frame);
    if (frame.event==='connection') {
      liveStream.state=frame.data.state;liveStream.health();
      if(liveStream.suppressesPolling() && !messageState.next && messageState.started && messageState.caughtUp){clearTimeout(messageTimer);messageTimer=null;}
      else if(['polling','offline','reconnecting','limited','complete'].includes(liveStream.state) && messageState.started && !messageState.next && !messageBusy && !messageTimer)scheduleMessages(15000);
    }
    changed=liveStream.record.accept(frame)||changed;
    liveStream.observe(frame);
  }
  if(changed) {
    messageState.streamRecord=liveStream.record;
    messageCache.set(batch.id,messageState);
    if(messageCache.size>30){const oldest=messageCache.keys().next().value;messageCache.delete(oldest);messageViews.delete(oldest);}
  }
  if(liveStream.record.partial.size && !messageBusy && !messageTimer)scheduleMessages(100);
  if(changed&&liveStream.record.unplaced(messageState.items)&&!messageBusy&&!messageTimer)scheduleMessages(100);
  if(liveStream.record.historyLimited) {
    client.stream(null).catch(()=>{});liveStream.state='limited';liveStream.record.live.clear();liveStream.health();
    if(!messageBusy&&!messageState.next)scheduleMessages(15000);
    liveStream.revision++;liveStream.schedule();return;
  }
  if (changed) {liveStream.revision++;liveStream.schedule();}
  if (batch.sequence) client.ack(batch.token,batch.sequence).catch(()=>{});
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {liveStream.token=null;liveStream.revision++;clearTimeout(liveStream.timer);liveStream.timer=null;client.stream(null).catch(()=>{});}
  else liveStream.select(thread);
});
window.addEventListener('offline',()=>{client.stream(null).catch(()=>{});liveStream.state='offline';liveStream.health();});
window.addEventListener('online',()=>{if(!document.hidden)liveStream.select(thread);});
window.addEventListener('beforeunload',()=>{liveStream.token=null;client.stream(null).catch(()=>{});});
if (thread) liveStream.select(thread);
