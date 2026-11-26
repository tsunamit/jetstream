const newThread = {
  models:[],projects:[],busy:false,loading:false,ready:false,attempt:null,origin:null,
  async open(){
    if(document.querySelector('dialog[open]'))return;
    clearKeySequence();this.origin=document.activeElement;
    $('new-thread').showModal();
    $('new-prompt').focus();
    await this.reload();
  },
  async reload(){
    if(this.busy||this.loading)return;
    const previousOptions=this.ready?this.options():null;
    this.loading=true;this.ready=false;this.update();$('new-error').textContent='Loading projects and available models…';
    for(const input of $('new-thread-form').querySelectorAll('input,select'))input.disabled=true;
    try{
      const [projects,models,settings]=await Promise.all([desk.projects(),desk.models(),desk.workspaceConfig()]);
      this.projects=projects.items;this.models=models.items;
      if(!workTree.loaded){workTree.config=settings.config;workTree.loaded=true;}
      const previous=$('new-project').value||project;
      $('new-project').replaceChildren(...this.projects.map(p=>new Option(p.name,p.id)));
      if(this.projects.some(p=>p.id===previous))$('new-project').value=previous;
      $('new-model').replaceChildren(new Option('Account default (server resolves availability)',''),...this.models.map(m=>new Option(m.name+' · '+m.billing,m.id)));
      this.defaults(previousOptions?.projectId===$('new-project').value?{modelId:previousOptions.model?.modelId||'',reasoningMode:previousOptions.model?.reasoningMode||'',modes:previousOptions.model?.modes||{},machineSize:previousOptions.machineSize||''}:null);this.ready=true;$('new-error').textContent=settings.error||'';
      $('new-note').textContent='Explicit submit starts a real agent. Account default: '+(models.default?.modelId||'server selected')+'.';
    }catch(error){$('new-error').textContent=error.message;}
    this.loading=false;
    for(const input of $('new-thread-form').querySelectorAll('input,select'))input.disabled=!this.ready;
    const m=this.models.find(m=>m.id===$('new-model').value);
    $('new-reasoning').disabled=!this.ready||!m;
    for(const input of $('new-modes').querySelectorAll('input'))input.disabled=!this.ready||!m?.[input.dataset.mode];
    this.update();
  },
  defaults(selected=null){
    const d=selected||workTree.config.createDefaults[$('new-project').value]||{};
    if(d.modelId&&!this.models.some(m=>m.id===d.modelId))$('new-model').append(new Option('Unavailable saved model: '+d.modelId,d.modelId));
    $('new-model').value=d.modelId||'';$('new-size').value=d.machineSize||'';
    this.model(d);
  },
  model(defaults={}){
    const m=this.models.find(m=>m.id===$('new-model').value);
    $('new-reasoning').replaceChildren(new Option('Model default',''),...(m?.reasoningModes||[]).map(v=>new Option(v,v)));
    if(defaults.reasoningMode&&!m?.reasoningModes.includes(defaults.reasoningMode))$('new-reasoning').append(new Option('Unavailable saved strength: '+defaults.reasoningMode,defaults.reasoningMode));
    $('new-reasoning').value=defaults.reasoningMode||'';
    $('new-reasoning').disabled=!m;
    $('new-modes').replaceChildren(...['fast','pro','ultrafast'].map(mode=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.mode=mode;input.disabled=!m?.[mode];input.checked=Boolean(defaults.modes?.[mode]);input.onchange=()=>this.update();label.append(input,document.createTextNode(mode+(m?.[mode]?'':' — not supported')));return label;
    }));
    this.update();
  },
  options(){
    const body={projectId:$('new-project').value,message:$('new-prompt').value};
    if($('new-size').value)body.machineSize=$('new-size').value;
    if($('new-model').value){
      body.model={modelId:$('new-model').value};
      if($('new-reasoning').value)body.model.reasoningMode=$('new-reasoning').value;
      const modes=Object.fromEntries([...$('new-modes').querySelectorAll('input:checked')].map(i=>[i.dataset.mode,true]));
      if(Object.keys(modes).length)body.model.modes=modes;
    }
    return body;
  },
  valid(){
    const options=this.options(),m=this.models.find(m=>m.id===options.model?.modelId);
    return this.ready&&this.projects.some(p=>p.id===options.projectId)&&options.message.trim().length>0&&options.message.length<=30000&&(!options.model||m&&(!options.model.reasoningMode||m.reasoningModes.includes(options.model.reasoningMode))&&Object.keys(options.model.modes||{}).every(k=>m[k]));
  },
  update(){
    $('new-submit').disabled=this.busy||!this.valid();$('new-submit').textContent=this.busy?'Creating…':'Create thread';
    $('new-reload').disabled=this.busy||this.loading;
    $('new-summary').textContent=[$('new-project').selectedOptions[0]?.textContent,'Cloud · '+($('new-size').value||'project size'),$('new-model').selectedOptions[0]?.textContent,$('new-reasoning').value||'default reasoning'].filter(Boolean).join(' / ');
  },
  async submit(){
    if(this.busy||!this.valid())return;
    this.busy=true;this.update();$('new-error').textContent='';
    const options=this.options(),fingerprint=JSON.stringify(options);
    if(this.attempt?.fingerprint!==fingerprint)this.attempt={fingerprint,id:crypto.randomUUID()};
    for(const input of $('new-thread-form').querySelectorAll('input,textarea,select'))input.disabled=true;
    try{
      const created=await desk.createThread({...options,requestId:this.attempt.id});
      workTree.config.createDefaults[options.projectId]={modelId:options.model?.modelId||'',reasoningMode:options.model?.reasoningMode||'',machineSize:options.machineSize||'',modes:options.model?.modes||{}};
      await workTree.save();
      $('new-prompt').value='';this.attempt=null;this.origin=null;$('new-thread').close();
      await workTree.activate();
      const data=workTree.state.data;
      workTree.state.data={...data,threads:[...data.threads.filter(t=>t.id!==created.id),created]};
      workTree.render();
      openThread(created,{projectId:created.projectId||options.projectId,focus:'conversation'}).catch(fail);
      say('Created thread '+created.id+'.');
      workTree.refresh(true).catch(()=>{});
    }catch(error){$('new-error').textContent=error.message+' Prompt and options are preserved. Retrying unchanged options reuses the request ID.';if(!$('new-thread').open)fail(error);}
    finally{
      this.busy=false;
      for(const input of $('new-thread-form').querySelectorAll('input,textarea,select'))input.disabled=false;
      const m=this.models.find(m=>m.id===$('new-model').value);
      $('new-reasoning').disabled=!m;
      for(const input of $('new-modes').querySelectorAll('input'))input.disabled=!m?.[input.dataset.mode];
      this.update();
    }
  }
};
$('new-thread-button').onclick=()=>newThread.open();
$('new-close').onclick=()=>{if(!newThread.busy)$('new-thread').close();};
$('new-thread').addEventListener('cancel',event=>{if(newThread.busy)event.preventDefault();});
$('new-thread').onclose=()=>{
  if (!$('new-thread').open && (document.activeElement === document.body || $('new-thread').contains(document.activeElement))) newThread.origin?.isConnected && newThread.origin.focus();
};
$('new-project').onchange=()=>{newThread.defaults();newThread.update();};
$('new-model').onchange=()=>newThread.model();
for(const id of ['new-size','new-reasoning','new-prompt'])$(id).addEventListener('input',()=>newThread.update());
$('new-reload').onclick=()=>newThread.reload();
$('new-thread-form').onsubmit=event=>{event.preventDefault();if(event.submitter===$('new-submit'))newThread.submit();};
