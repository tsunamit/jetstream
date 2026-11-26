const newThread = {
  models:[],projects:[],captains:[],busy:false,loading:false,ready:false,attempt:null,origin:null,revision:0,draft:false,
  async open(){
    if(document.querySelector('dialog[open]'))return;
    clearKeySequence();this.origin=document.activeElement;
    $('new-thread').showModal();$('new-prompt').focus();
    await this.reload();
  },
  async reload(){
    if(this.busy||this.loading)return;
    const revision=++this.revision,previous=this.draft?this.options():null;
    this.loading=true;this.ready=false;this.update();
    $('new-error').textContent='Loading available projects, models and Captains…';
    if(!capability('create').supported){
      this.loading=false;$('new-error').textContent=capability('create').reason;this.update();return;
    }
    try{
      const [catalog,settings]=await Promise.all([client.creationOptions(),client.workspaceSettings()]);
      if(revision!==this.revision||!$('new-thread').open)return;
      this.projects=catalog.projects;this.models=catalog.models;this.captains=catalog.captains;
      if(!workTree.loaded){workTree.config=settings.config;workTree.loaded=true;}
      $('new-project').replaceChildren(...this.projects.map(p=>new Option(p.name,p.id)));
      const preferred=previous?.projectId||project;
      if(this.projects.some(p=>p.id===preferred))$('new-project').value=preferred;
      $('new-model').replaceChildren(new Option('Account default',''),...this.models.map(m=>new Option(m.name+(m.billing?' · '+m.billing:''),m.id)));
      const current=conversationControls.choices.get(thread?.id)||{modelId:conversationControls.metadata?.lastModelId||thread?.lastModelId};
      const defaults=workTree.config.createDefaults[$('new-project').value];
      this.defaults(previous?.projectId===$('new-project').value?{...previous.model,machineSize:previous.machineSize}:defaults||($('new-project').value===project&&this.models.some(m=>m.id===current.modelId)?current:{}));
      this.captain(previous?.projectId===$('new-project').value?previous.captainId:'');
      this.ready=true;this.draft=true;
      $('new-error').textContent=this.projects.length?(settings.error||''):'No projects are available to this account. Refresh after project access is granted.';
      $('new-note').textContent='Only Create thread starts an agent. The title is generated from your prompt.';
      $('new-model').title='Account default: '+(catalog.default?.modelId||'server selected');
    }catch(error){if(revision===this.revision)$('new-error').textContent=error.message+' Your draft is preserved. Refresh availability to retry.';}
    finally{if(revision===this.revision){this.loading=false;this.update();}}
  },
  defaults(selected={}){
    const d=selected||{};
    if(d.modelId&&!this.models.some(m=>m.id===d.modelId))$('new-model').append(new Option('Unavailable saved model: '+d.modelId,d.modelId));
    $('new-model').value=capability('createModel').supported?d.modelId||'':'';
    $('new-size').value=capability('createMachineSize').supported?d.machineSize||'':'';
    this.model(d);
  },
  captain(selected=''){
    const choices=this.captains.filter(c=>c.projectId===$('new-project').value);
    $('new-captain').replaceChildren(new Option('None · standalone thread',''),...choices.map(c=>new Option(c.name,c.id)));
    if(choices.some(c=>c.id===selected))$('new-captain').value=selected;
    $('new-captain').title=choices.length?'Reports to this Captain; uses its access rules.':'No Captains are available in this project.';
  },
  model(defaults={}){
    const m=this.models.find(m=>m.id===$('new-model').value);
    $('new-reasoning').replaceChildren(new Option('Model default',''),...(m?.reasoningModes||[]).map(v=>new Option(v,v)));
    if(defaults.reasoningMode&&!m?.reasoningModes.includes(defaults.reasoningMode))$('new-reasoning').append(new Option('Unavailable saved strength: '+defaults.reasoningMode,defaults.reasoningMode));
    $('new-reasoning').value=defaults.reasoningMode||'';
    $('new-modes').replaceChildren(...['fast','pro','ultrafast'].map(mode=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.mode=mode;input.checked=Boolean(defaults.modes?.[mode]);input.onchange=()=>this.update();label.append(input,document.createTextNode(mode+(m?.[mode]?'':' — unavailable')));return label;
    }));
    this.update();
  },
  options(){
    const body={projectId:$('new-project').value,message:$('new-prompt').value};
    if(capability('createCaptain').supported&&$('new-captain').value)body.captainId=$('new-captain').value;
    if(capability('createMachineSize').supported&&$('new-size').value)body.machineSize=$('new-size').value;
    if(capability('createModel').supported&&$('new-model').value){
      body.model={modelId:$('new-model').value};
      if($('new-reasoning').value)body.model.reasoningMode=$('new-reasoning').value;
      const modes=Object.fromEntries([...$('new-modes').querySelectorAll('input:checked')].map(i=>[i.dataset.mode,true]));
      if(Object.keys(modes).length)body.model.modes=modes;
    }
    return body;
  },
  valid(){
    const options=this.options(),m=this.models.find(m=>m.id===options.model?.modelId);
    return capability('create').supported&&this.ready&&this.projects.some(p=>p.id===options.projectId)&&options.message.trim().length>0&&options.message.length<=30000&&(!options.captainId||this.captains.some(c=>c.id===options.captainId&&c.projectId===options.projectId))&&(!options.model||m&&(!options.model.reasoningMode||m.reasoningModes.includes(options.model.reasoningMode))&&Object.keys(options.model.modes||{}).every(k=>m[k]));
  },
  update(){
    const disabled=this.busy||!this.ready||!capability('create').supported,m=this.models.find(m=>m.id===$('new-model').value);
    for(const input of $('new-thread-form').querySelectorAll('input,select'))input.disabled=disabled;
    $('new-prompt').disabled=this.busy;
    $('new-model-field').hidden=$('new-reasoning-field').hidden=$('new-modes').hidden=!capability('createModel').supported;
    $('new-captain-field').hidden=!capability('createCaptain').supported;
    $('new-cloud').hidden=!capability('createMachineSize').supported;
    $('new-model').disabled=disabled||!capability('createModel').supported;
    $('new-reasoning').disabled=disabled||!m||!capability('createModel').supported;
    for(const input of $('new-modes').querySelectorAll('input'))input.disabled=disabled||!m?.[input.dataset.mode]||!capability('createModel').supported;
    $('new-submit').disabled=this.busy||!this.valid();$('new-submit').textContent=this.busy?'Creating…':'Create thread';
    $('new-submit').title=capability('create').supported?'Create conversation':capability('create').reason;
    $('new-close').disabled=this.busy;$('new-reload').disabled=this.busy||this.loading;
    $('new-summary').textContent=this.loading?'Loading availability…':!this.ready?'Creation unavailable':[$('new-project').selectedOptions[0]?.textContent,capability('createModel').supported?$('new-model').selectedOptions[0]?.textContent:null,capability('createCaptain').supported?$('new-captain').selectedOptions[0]?.textContent:null].filter(Boolean).join(' / ');
  },
  async submit(){
    if(this.busy||!this.valid())return;
    this.busy=true;this.update();$('new-error').textContent='';
    const options=this.options(),fingerprint=JSON.stringify(options);
    if(this.attempt?.fingerprint!==fingerprint)this.attempt={fingerprint,id:crypto.randomUUID()};
    try{
      const created=await client.createConversation({...options,requestId:this.attempt.id});
      $('new-prompt').value='';this.attempt=null;this.draft=false;this.origin=null;$('new-thread').close();
      workTree.config.createDefaults[options.projectId]={modelId:options.model?.modelId||'',reasoningMode:options.model?.reasoningMode||'',machineSize:options.machineSize||'',modes:options.model?.modes||{}};
      try{await workTree.save();}catch{say('Thread created. Could not save creation defaults.');}
      try{
        await workTree.activate();
        const data=workTree.state.data;
        workTree.state.data={...data,threads:[...data.threads.filter(t=>t.id!==created.id),created]};
        workTree.render();
        await openThread(created,{projectId:created.projectId||options.projectId,focus:'conversation'});
        say('Created thread '+created.id+'.');workTree.refresh(true).catch(()=>{});
      }catch(error){fail(Error('Thread '+created.id+' was created. Refresh the work tree to open it. '+error.message));}
    }catch(error){$('new-error').textContent=error.message+' Prompt and options are preserved. Retrying unchanged options reuses the request ID.';if(!$('new-thread').open)fail(error);}
    finally{this.busy=false;this.update();}
  }
};
for(const id of ['new-thread-button','new-thread-top-button'])$(id).onclick=()=>newThread.open();
$('new-close').onclick=()=>{if(!newThread.busy)$('new-thread').close();};
$('new-thread').addEventListener('cancel',event=>{if(newThread.busy)event.preventDefault();});
$('new-thread').onclose=()=>{
  if($('new-thread').open)return;
  ++newThread.revision;newThread.loading=false;
  if(document.activeElement===document.body||$('new-thread').contains(document.activeElement))newThread.origin?.isConnected&&newThread.origin.focus();
};
$('new-project').onchange=()=>{
  const saved=workTree.config.createDefaults[$('new-project').value],m=newThread.models.find(m=>m.id===saved?.modelId);
  newThread.defaults(m?{...saved,reasoningMode:m.reasoningModes.includes(saved.reasoningMode)?saved.reasoningMode:'',modes:Object.fromEntries(Object.entries(saved.modes||{}).filter(([key])=>m[key]))}:{});
  newThread.captain();newThread.update();
};
$('new-model').onchange=()=>newThread.model();
for(const id of ['new-size','new-reasoning','new-prompt','new-captain'])$(id).addEventListener('input',()=>newThread.update());
$('new-reload').onclick=()=>newThread.reload();
$('new-thread-form').onsubmit=event=>{event.preventDefault();if(event.submitter===$('new-submit'))newThread.submit();};
