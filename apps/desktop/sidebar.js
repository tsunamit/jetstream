let sidebarVisible = true;
try {sidebarVisible=localStorage.getItem('sidebar-visible')!=='false';} catch {}
function sidebarToggleHint() {
  let hint='';try {hint=primaryMappingLabel('toggleSidebar');} catch {}
  $('toggle-sidebar').textContent=(sidebarVisible?'Hide':'Show')+' sidebar'+(hint?' · '+hint:'');
  $('toggle-sidebar').setAttribute('aria-expanded',String(sidebarVisible));
  $('toggle-sidebar').title='Show/hide sidebar. Window left reveals it; cycle windows skips it when hidden.';
}
function toggleSidebar(show = !sidebarVisible, focus = true) {
  const wasInside=$('navigator').contains(document.activeElement);
  sidebarVisible=show;
  $('navigator').hidden=!show;
  document.body.classList.toggle('sidebar-hidden',!show);
  try {localStorage.setItem('sidebar-visible',String(show));} catch {}
  sidebarToggleHint();
  if(focus && show) {const row=navigatorRows().find(r=>r.dataset.id===lastNavigatorId) ?? navigatorRows().find(r=>r.dataset.id===thread?.id) ?? $('navigator');row.focus({preventScroll:true});row.scrollIntoView({block:'nearest',inline:'nearest'});}
  else if(wasInside && !show) {$('conversation').focus({preventScroll:true});reconcileChatCursor();paintChat(false);}
}
function workIndicator(button,item,fresh = true) {
  const meta=button.querySelector('.thread-meta');if(!meta)return;
  let icon=meta.querySelector('.work-indicator');
  if(!icon){icon=document.createElement('span');icon.className='work-indicator';icon.setAttribute('aria-hidden','true');meta.prepend(icon);}
  const active=item.status==='working' && !item.archived && fresh && navigator.onLine;
  icon.classList.toggle('working',active);
  if(active)CubeIndicator.mount(icon);
  else {CubeIndicator.unmount(icon);icon.textContent=item.status==='working'?'◇':'';icon.hidden=item.status!=='working';}
  if(active)icon.hidden=false;
  icon.title=active?'Working':item.status==='working'?'Last known working · not live':'';
  meta.querySelector('.work-stale')?.remove();
  meta.querySelector('.work-queued')?.remove();
  meta.querySelector('.row-state')?.remove();
  const state=document.createElement('span');state.className='row-state row-details';state.textContent=active?'Working':item.status==='working'?'Last known working · not live':item.status||'Status unavailable';meta.append(state);
  const queued=typeof item.queuedAt==='string'&&Number.isFinite(Date.parse(item.queuedAt));
  if(queued){const label=document.createElement('span');label.className='work-queued row-details';label.textContent='Queued (last poll)';meta.append(label);}
  meta.querySelector('.attention-indicator')?.remove();
  const attention=item.needsYou===true||Boolean(item.ask?.key),failed=item.status==='failed';
  if(attention||failed||queued){const badge=document.createElement('span');badge.className='attention-indicator';badge.textContent=failed?'×':attention?'!':'◷';badge.title=failed?'Failed':attention?'Needs input':'Queued (last poll)';badge.setAttribute('aria-label',badge.title);meta.append(badge);}
}
const workTree = {
  enabled:false, state:new WorkTree.State(), config:WorkTree.defaults(), loaded:false, busy:null, timer:null,
  async activate(){
    this.enabled=true;
    $('tree-controls').hidden=false;
    $('threads-heading').hidden=true;
    $('more').hidden=true;
    renderFilterSummary();
    $('work-tree-button').textContent='Filters';
    if(!$('tree-health'))this.controls();
    if(!this.loaded){const saved=await client.workspaceSettings();this.config=saved.config;this.loaded=true;if(saved.error)say(saved.error);this.controls();}
  },
  async save(){try{await client.saveWorkspaceSettings(this.config);}catch(error){say('Work-tree settings were not saved: '+error.message);}},
  controls(){
    const focused=$('tree-controls').contains(document.activeElement)?document.activeElement:null,selection=focused?.matches('input[type="search"]')?[focused.selectionStart,focused.selectionEnd]:null;
    const host=$('tree-controls'),wasOpen=$('tree-options')?.open;host.replaceChildren();let target=host;
    const select=(label,id,values,value,onchange)=>{
      const node=document.createElement('label');node.textContent=label;
      const input=document.createElement('select');input.id=id;
      input.append(...values.map(([text,value])=>new Option(text,value)));input.value=value;
      input.onchange=()=>{onchange(input.value);this.render();this.save();};node.append(input);target.append(node);return input;
    };
    select('View','tree-mode',[['Tree','tree'],['Activity','activity']],this.config.mode,v=>this.config.mode=v);
    const options=document.createElement('details'),heading=document.createElement('summary');options.id='tree-options';options.open=Boolean(wasOpen);heading.textContent='Sort / filter / sections';options.append(heading);target=document.createElement('div');target.className='tree-options';options.append(target);host.append(options);
    select('Sort','tree-sort',[['Recent activity','recent'],['Name','name'],['Status','status']],this.config.sort,v=>this.config.sort=v);
    select('Project filter','tree-project',[['Current project','current'],['All projects','all'],...this.state.data.projects.map(p=>[p.name,p.id])],this.config.project,v=>this.config.project=v);
    select('Status','tree-status',['all','unread','needs-you','working','waiting','idle','failed','archived'].map(s=>[s,s]),this.config.status,v=>this.config.status=v);
    const label=document.createElement('label');label.textContent='Filter text';const input=document.createElement('input');input.id='tree-text';input.type='search';input.maxLength=200;input.value=this.config.text;
    input.oninput=()=>{this.config.text=input.value;this.render();clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save(),300);};label.append(input);target.append(label);
    for(const [title,key] of [['Show archived','archive'],['Show counts','counts'],['Project roots','projectRoots']]){
      const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.checked=this.config[key];i.onchange=()=>{this.config[key]=i.checked;this.render();this.save();};l.append(i,document.createTextNode(title));target.append(l);
    }
    const sections=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Sections / order';sections.append(summary);
    for(const section of ['threads','captains']){
      if(section==='captains'&&!capability('hierarchy').supported){const note=document.createElement('p');note.textContent=capability('hierarchy').reason;sections.append(note);continue;}
      const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.checked=this.config.sections.includes(section);i.onchange=()=>{this.config.sections=this.config.sections.filter(s=>s!==section);if(i.checked)this.config.sections.push(section);this.render();this.save();};l.append(i,document.createTextNode(section));sections.append(l);
    }
    const reverse=document.createElement('button');reverse.textContent='Reverse section order';reverse.onclick=()=>{this.config.sections.reverse();this.render();this.save();};sections.append(reverse);target.append(sections);
    const refresh=document.createElement('button');refresh.id='tree-refresh';refresh.textContent='Refresh / retry';refresh.onclick=()=>this.refresh(true).catch(fail);host.append(refresh);
    const status=document.createElement('p');status.id='tree-health';status.setAttribute('role','status');host.append(status);
    if(focused?.id&&$(focused.id)){const replacement=$(focused.id);replacement.focus({preventScroll:true});if(selection)replacement.setSelectionRange(...selection);}
  },
  async refresh(force=false){
    await this.activate();
    if(this.busy)return this.busy;
    if(!force && this.state.updated){this.render();return this.state.data;}
    $('tree-health').textContent=this.state.updated?'Cached navigator · refreshing…':'Loading navigator…';
    this.busy=(async()=>{
      try{
        const started=Date.now(),readRevision=typeof readState!=='undefined'?readState.model.version:0;
        const data=await client.workspace(),changed=JSON.stringify(data.projects)!==JSON.stringify(this.state.data.projects);
        if(typeof readState!=='undefined')readState.overlay(data,readRevision);
        if(typeof liveStream!=='undefined')liveStream.overlay(data,started);
        const selected=data.threads.concat(data.captains).find(i=>i.id===thread?.id);
        if(selected){thread.status=selected.status;thread.archived=selected.archived;}
        this.state.accept(data);catalog=data;
        if(changed)this.controls();this.render();return data;
      }catch(error){this.state.fail(error);this.render();throw error;}
      finally{this.busy=null;this.schedule();}
    })();
    return this.busy;
  },
  schedule(){clearTimeout(this.timer);if(!document.hidden)this.timer=setTimeout(()=>this.refresh(true).catch(()=>{}),60000);},
  render(){
    if(!this.enabled)return;
    const active=document.activeElement,focused=active.closest('#threads button')?.dataset.id,parents=new Map([...$('threads').querySelectorAll('button')].map(b=>[b.dataset.id,b.dataset.parent])),scroll=$('navigator').scrollTop;
    const list=$('threads');list.replaceChildren();list.setAttribute('role',this.config.mode==='tree'?'tree':'list');
    const rows=this.state.rows(this.config,project);
    for(const row of rows){
      const li=document.createElement('li');li.setAttribute('role','none');
      if(row.section){li.className='tree-section';li.textContent=(row.section==='threads'&&this.config.mode==='tree'?'Standalone threads':row.section).toUpperCase();list.append(li);continue;}
      const item=row.item,b=document.createElement('button');b.dataset.id=item.id;b.dataset.parent=row.parent||'';b.className='tree-row';b.classList.toggle('tree-context',Boolean(row.context));b.style.paddingLeft=(8+row.depth*28)+'px';
      b.style.setProperty('--tree-depth',row.depth);
      b.dataset.kind=item.isProject?'project':item.isCaptain?'captain':'thread';
      b.setAttribute('role',this.config.mode==='tree'?'treeitem':'listitem');b.setAttribute('aria-level',String(row.depth+1));
      if(item.id===thread?.id)b.setAttribute('aria-current','true');
      if(row.children)b.setAttribute('aria-expanded',String(Boolean(row.expanded)));
      const meta=document.createElement('span');meta.className='thread-meta';meta.textContent=[item.code,!item.isProject?WorkTree.status(item):'',WorkTree.status(item)==='needs-you'?item.status:'',row.finished?'just finished turn → '+WorkTree.status(item):'',this.state.stale?'stale':'',!this.config.projectRoots?this.state.data.projects.find(p=>p.id===item.projectId)?.name:''].filter(Boolean).join(' · ');
      const details=document.createElement('span');details.className='row-details';details.textContent=meta.textContent;meta.replaceChildren(details);
      const type=document.createElement('span');type.className='tree-type row-details';type.textContent=item.isProject?'Project':item.isCaptain?'Captain':item.parentId?'Crew thread':'Thread';
      if(item.parentId){const parent=this.state.data.captains.find(i=>i.id===item.parentId);type.textContent+=' · crew of '+(parent?.title||parent?.name||'Captain not loaded');}
      const name=document.createElement('span');name.className='thread-name';name.textContent=item.title||item.name||'Untitled thread';
      if(row.children){const disclosure=document.createElement('span');disclosure.className='tree-disclosure';disclosure.setAttribute('aria-hidden','true');disclosure.textContent=row.expanded?'▾':'▸';disclosure.onpointerdown=event=>event.preventDefault();disclosure.onclick=event=>{event.stopPropagation();this.focus(item.id);this.expand(item.id);};name.prepend(disclosure);}
      b.append(type,name,meta);
      b.title=[name.textContent,type.textContent,details.textContent].filter(Boolean).join(' · ');
      const subscribed=typeof liveStream!=='undefined'&&item.id===liveStream.id;
      const freshPoll=!this.state.stale&&Date.now()-this.state.updated<120000;
      if(!item.isProject){
        workIndicator(b,item,subscribed&&liveStream.state==='streaming'||freshPoll);
        if(typeof readState!=='undefined')readState.decorate(b,item);
      }
      if(this.config.counts&&row.children){
        const children=this.state.data.threads.filter(i=>item.isProject?i.projectId===item.projectId:i.parentId===item.id);
        const working=children.filter(i=>i.status==='working'&&!i.archived).length;
        const unread=item.isProject&&typeof readState!=='undefined'?children.filter(i=>readState.value(i)===true).length:0;
        const count=document.createElement('span');count.className='tree-type row-details';count.textContent=row.count+' matching loaded'+(unread?' · '+unread+' unread threads (loaded)':'')+(working?' · '+working+' working '+(item.isProject?'threads':'crew')+' (loaded)':'');b.append(count);
      }
      b.onclick=()=>{if(!item.isProject)openThread(item,{projectId:item.projectId}).catch(fail);};
      li.append(b);list.append(li);
    }
    if(!rows.some(r=>r.item)){const li=document.createElement('li');li.textContent='No matching threads. Check filters or refresh.';list.append(li);}
    if(focused){let id=focused;while(id&&!list.querySelector('[data-id="'+CSS.escape(id)+'"]'))id=parents.get(id);if(id)this.focus(id,false);else $('navigator').focus({preventScroll:true});}
    $('navigator').scrollTop=scroll;
    const streamLabel=typeof liveStream!=='undefined'&&liveStream.state==='streaming'?'active conversation live':demoMode?'sample data · no API traffic':'active stream: '+(typeof liveStream!=='undefined'?liveStream.state:'not selected');
    $('tree-health').textContent=this.state.stale?'STALE · '+this.state.error+(this.state.updated?' · last sync '+new Date(this.state.updated).toLocaleTimeString():''):'Synced '+new Date(this.state.updated).toLocaleTimeString()+' · '+streamLabel+'; others 60s visible polling';
    $('tree-health').title='Just finished means an observed working → idle/waiting/failed turn, never a claim that the task is complete. Only transitions seen during this session appear.';
    $('tree-health').dataset.stale=String(this.state.stale);
    $('more').hidden=true;
    renderFilterSummary();
  },
  focus(id,reveal=true){const row=[...$('threads').querySelectorAll('button')].find(b=>b.dataset.id===id);row?.focus({preventScroll:true});if(reveal)row?.scrollIntoView({block:'nearest',inline:'nearest'});},
  expand(id,value){const set=new Set(this.config.expanded);if(value??!set.has(id))set.add(id);else set.delete(id);this.config.expanded=[...set];this.render();this.save();}
};
let lastNavigatorId = null;
toggleSidebar(sidebarVisible,false);
$('toggle-sidebar').onclick=()=>toggleSidebar();
document.addEventListener('focusin',event=>{const id=event.target.closest('#threads button')?.dataset.id;if(id)lastNavigatorId=id;});
function renderFilterSummary() {
  const c=workTree.config,filtered=workTree.enabled ? c.text||c.status!=='all'||c.project!=='current'||c.archive||c.sections.length!==2 : navigatorQuery;
  const scope=workTree.enabled ? c.project==='current'?'Current project':c.project==='all'?'All projects':workTree.state.data.projects.find(p=>p.id===c.project)?.name||'Project filter' : 'Current project';
    $('filter-summary').textContent=[scope,workTree.enabled&&c.status!=='all'?c.status:'',workTree.enabled?c.text? '“'+c.text+'”':'':navigatorQuery?'“'+navigatorQuery+'”':'',workTree.enabled&&c.sections.length!==2?c.sections.join(' + ')||'No sections':''].filter(Boolean).join(' · ');
  $('filter-summary').title=[navigatorRows().length+' rows',typeof readState!=='undefined'?readState.countLabel():''].filter(Boolean).join(' · ');
  $('clear-filters').hidden=!filtered;
}
$('clear-filters').onclick=()=>{
  if(workTree.enabled){Object.assign(workTree.config,{project:'current',status:'all',text:'',archive:false,sections:['threads','captains']});workTree.controls();workTree.render();workTree.save();}
  else {navigatorQuery='';filterDemoRows();}
  (navigatorRows().find(row=>row.dataset.id===lastNavigatorId)??navigatorRows().find(row=>row.dataset.id===thread?.id)??$('navigator')).focus();
};
$('work-tree-button').onclick=()=>{if(workTree.enabled&&$('tree-options'))$('tree-options').open=!$('tree-options').open;else workTree.refresh(true).catch(fail);};
document.addEventListener('visibilitychange',()=>{if(!workTree.enabled)return;if(document.hidden){clearTimeout(workTree.timer);workTree.state.seen.clear();}else if(Date.now()-workTree.state.updated>60000)workTree.refresh(true).catch(()=>{});else workTree.schedule();});
window.addEventListener('offline',()=>{if(workTree.enabled){workTree.state.fail(Error('Offline. Last-known statuses retained.'));workTree.render();}});
window.addEventListener('online',()=>{if(workTree.enabled)workTree.refresh(true).catch(()=>{});});
