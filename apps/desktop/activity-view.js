const workActivity={
  model:new ActivityState.State(),data:{threads:[],captains:[],projects:[]},groups:[[],[],[]],column:0,rows:[0,0,0],origin:null,originId:null,request:0,timer:null,paintTimer:null,loading:false,error:'',
  selected(){return this.groups[this.column][this.rows[this.column]];},
  accepted(id){this.model.sentReply(id);this.paintSoon();},
  observed(id,frame){
    this.model.frame(id,frame);
    if(frame.event==='status')for(const key of ['threads','captains'])this.data[key]=this.data[key].map(item=>item.id===id?{...item,status:frame.data.status,archived:frame.data.archived}:item);
    if(['turn','transcript','status'].includes(frame.event))this.paintSoon();
  },
  read(id,started){this.model.read(id,started);this.paintSoon();},
  paintSoon(){if(!this.dialog.open||this.paintTimer)return;this.paintTimer=setTimeout(()=>{this.paintTimer=null;if(this.dialog.open)this.render();},100);},
  async open(){
    clearKeySequence();
    if(changingConnection||document.querySelector('dialog[open]'))return;
    this.origin=document.activeElement;this.originId=this.origin.closest('#threads button')?.dataset.id;
    this.restoreReading=captureReadingLayout();
    this.data=workTree.state.updated?workTree.state.data:catalog||this.data;
    this.column=0;this.rows=[0,0,0];this.groups=this.model.groups(this.data);
    this.defaultPending=!this.groups.some(items=>items.length);
    const first=this.groups.findIndex(items=>items.length);if(first>=0)this.column=first;
    this.error='';this.loading=false;this.dialog.showModal();this.render();this.board.focus({preventScroll:true});
    await this.refresh();
  },
  schedule(){clearTimeout(this.timer);this.timer=null;if(this.dialog.open&&!document.hidden)this.timer=setTimeout(()=>this.refresh(),60000);},
  async refresh(){
    if(this.loading||!this.dialog.open||document.hidden||changingConnection)return;
    const request=++this.request;this.loading=true;this.render();
    try{
      const data=demoMode?await desk.activity():await workTree.refresh(true);
      if(request!==this.request||!this.dialog.open)return;
      this.data=data;this.error='';
    }catch(error){if(request===this.request&&this.dialog.open)this.error=error.message||'Refresh failed';}
    finally{if(request===this.request){this.loading=false;if(this.dialog.open){this.render();this.schedule();}}}
  },
  render(preserve=true){
    const identity=preserve?this.selected()?.id:null;
    this.groups=this.model.groups(this.data);
    if(this.defaultPending){const first=this.groups.findIndex(items=>items.length);if(first>=0){this.column=first;this.defaultPending=false;}}
    if(identity){const column=this.groups.findIndex(items=>items.some(item=>item.id===identity));if(column>=0){this.column=column;this.rows[column]=this.groups[column].findIndex(item=>item.id===identity);}}
    this.rows=this.rows.map((row,column)=>Math.max(0,Math.min(row,this.groups[column].length-1)));
    this.board.replaceChildren();$('activity-tabs').replaceChildren();
    for(const [column,title] of ActivityState.columns.entries()){
      const section=document.createElement('section');section.className='activity-column'+(this.column===column?' active':'');
      const heading=document.createElement('h3');heading.id='activity-heading-'+column;heading.textContent=title+' · '+this.groups[column].length;
      const list=document.createElement('div');list.className='activity-rows';list.setAttribute('role','group');list.setAttribute('aria-labelledby',heading.id);
      const tab=document.createElement('button');tab.type='button';tab.textContent=heading.textContent;tab.setAttribute('aria-pressed',String(this.column===column));tab.onclick=()=>this.select(column);$('activity-tabs').append(tab);
      for(const [index,item] of this.groups[column].entries()){
        const row=document.createElement('div');row.className='activity-card';row.id='activity-option-'+column+'-'+index;row.dataset.id=item.id;row.setAttribute('role','option');row.setAttribute('aria-selected',String(column===this.column&&index===this.rows[column]));
        const name=document.createElement('strong');name.textContent=item.title;
        const meta=document.createElement('span');meta.textContent=this.meta(item);
        const status=document.createElement('span');status.textContent=column===0?'Needs input':column===1?'Observed settled turn':item.status==='working'?'Working':item.queuedAt?'Queued':'Recently replied · '+(item.status||'status unavailable');
        row.append(name,meta,status);row.onclick=()=>this.select(column,index);row.ondblclick=()=>this.commit();list.append(row);
      }
      if(!this.groups[column].length){const empty=document.createElement('p');empty.className='activity-empty';empty.textContent=['No explicit asks in the available contexts.','No unacknowledged settled turns observed this session. Other conversations may have finished outside this app’s stream.','No working, queued or recently replied-to contexts available.'][column];list.append(empty);}
      section.append(heading,list);this.board.append(section);
    }
    const item=this.selected();
    $('activity-preview-meta').textContent=item?this.meta(item):ActivityState.columns[this.column];
    $('activity-preview-title').textContent=item?.title||'Nothing here yet';
    const loaded=item&&messageCache.get(item.id)?.items.findLast(entry=>['assistant','user'].includes(entry.source)&&typeof entry.text==='string'&&entry.text.trim());
    $('activity-preview-text').textContent=item?.ask?.text||item?.completion?.text||(loaded?'Loaded message · '+loaded.text.slice(0,1200):item?'Latest message not loaded. Open the conversation to catch up.':'Use h/l to check another column.');
    $('activity-preview-note').textContent='Preview only · does not mark read. Finished tracks observed turns in this app session, not completed tasks.';
    $('activity-health').textContent=(demoMode?'Demo contexts':'Available API contexts')+' · '+(this.error?'Stale · '+this.error:this.loading?'Loading / refreshing…':'Current snapshot')+' · finished: observed turns only · recent replies: this app session · other work: visible 60s polling';
    $('activity-open').disabled=!item;
    $('activity-keys').textContent='BROWSE · h/l columns · j/k rows · Enter open · Esc cancel';
    if(item){this.board.setAttribute('aria-activedescendant','activity-option-'+this.column+'-'+this.rows[this.column]);$('activity-option-'+this.column+'-'+this.rows[this.column]).scrollIntoView({block:'nearest'});}else this.board.removeAttribute('aria-activedescendant');
  },
  meta(item){const parent=this.data.captains.concat(this.data.threads).find(i=>i.id===item.parentId);return [item.isCaptain?'Captain':item.parentId?'Crew':'Thread',item.code,this.data.projects.find(p=>p.id===item.projectId)?.name,item.parentId?'crew of '+(parent?.title||parent?.name||item.captain?.name||'Captain not loaded'):null].filter(Boolean).join(' · ');},
  select(column,row=this.rows[column]){this.defaultPending=false;this.column=Math.max(0,Math.min(2,column));this.rows[this.column]=row;this.render(false);this.board.focus({preventScroll:true});},
  commit(){const item=this.selected();if(!item)return;this.origin=null;this.dialog.close();openThread(item,{projectId:item.projectId,focus:'conversation'}).catch(fail);},
  key(event){
    if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target!==this.board)return;
    const delta={h:[-1,0],ArrowLeft:[-1,0],l:[1,0],ArrowRight:[1,0],j:[0,1],ArrowDown:[0,1],k:[0,-1],ArrowUp:[0,-1]}[event.key];
    if(delta){event.preventDefault();this.select(Math.max(0,Math.min(2,this.column+delta[0])),delta[0]?undefined:this.rows[this.column]+delta[1]);}
    else if(event.key==='Enter'&&!event.repeat){event.preventDefault();this.commit();}
  }
};
const activityDialog=document.createElement('dialog');activityDialog.id='work-activity';activityDialog.setAttribute('aria-labelledby','activity-title');
const activityHeader=document.createElement('header'),activityTitle=document.createElement('h2');activityTitle.id='activity-title';activityTitle.textContent='Work overview';
const activityClose=document.createElement('button');activityClose.textContent='Esc · Close';activityClose.onclick=()=>activityDialog.close();
const activityRefresh=document.createElement('button');activityRefresh.textContent='Refresh';activityRefresh.onclick=()=>workActivity.refresh();activityHeader.append(activityTitle,activityRefresh,activityClose);
const activityHealth=document.createElement('p');activityHealth.id='activity-health';activityHealth.setAttribute('role','status');
const activityTabs=document.createElement('nav');activityTabs.id='activity-tabs';activityTabs.setAttribute('aria-label','Work columns');
const activityLayout=document.createElement('div');activityLayout.className='activity-layout';
const activityBoard=document.createElement('div');activityBoard.id='activity-board';activityBoard.tabIndex=0;activityBoard.setAttribute('role','listbox');activityBoard.setAttribute('aria-label','Work columns · h/l columns, j/k rows');
const activityPreview=document.createElement('aside');activityPreview.id='activity-preview';activityPreview.setAttribute('aria-label','Selected work preview');
for(const [tag,id,cls] of [['div','activity-preview-meta','eyebrow'],['h3','activity-preview-title',''],['p','activity-preview-text',''],['p','activity-preview-note','']]){const node=document.createElement(tag);node.id=id;node.className=cls;activityPreview.append(node);}
activityLayout.append(activityBoard,activityPreview);
const activityFooter=document.createElement('footer'),activityKeys=document.createElement('span');activityKeys.id='activity-keys';
const activityOpen=document.createElement('button');activityOpen.id='activity-open';activityOpen.textContent='Open conversation';activityOpen.onclick=()=>workActivity.commit();
activityFooter.append(activityKeys,activityOpen);activityDialog.append(activityHeader,activityHealth,activityTabs,activityLayout,activityFooter);document.body.append(activityDialog);
workActivity.dialog=activityDialog;workActivity.board=activityBoard;
activityDialog.addEventListener('keydown',event=>workActivity.key(event));
activityDialog.addEventListener('close',()=>{
  ++workActivity.request;clearTimeout(workActivity.timer);clearTimeout(workActivity.paintTimer);workActivity.timer=null;workActivity.paintTimer=null;workActivity.loading=false;
  if(workActivity.origin){const origin=workActivity.origin;workActivity.origin=null;if(origin.isConnected)origin.focus({preventScroll:true});else if(workActivity.originId)workTree.focus(workActivity.originId);else $('conversation').focus({preventScroll:true});workActivity.restoreReading?.();}
  workActivity.restoreReading=null;
  keyboardMode();
});
document.addEventListener('visibilitychange',()=>{clearTimeout(workActivity.timer);workActivity.timer=null;if(!document.hidden&&activityDialog.open)workActivity.refresh();});
