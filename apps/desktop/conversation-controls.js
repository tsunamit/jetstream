const conversationControls={
  choices:new Map(),models:[],revision:0,catalogRequest:0,loading:false,metadata:null,error:'',origin:null,target:null,
  select(item){
    const revision=++this.revision;
    this.metadata=null;this.error='';this.loading=Boolean(item);this.render();
    if($('conversation-settings').open)$('conversation-settings').close();
    if(!item)return;
    client.metadata(item.id).then(value=>{
      if(revision!==this.revision)return;
      this.metadata=value;this.loading=false;this.render();
    }).catch(()=>{
      if(revision!==this.revision)return;
      this.error='Model metadata unavailable';this.loading=false;this.render();
    });
  },
  render(){
    const choice=this.choices.get(thread?.id),last=this.metadata?.lastModelId;
    $('conversation-model').disabled=!thread||!capability('modelSelection').supported;
    $('conversation-model').textContent=choice?'Next message: '+choice.modelId:'Next message model · Choose';
    $('conversation-last-model').textContent=!thread?'Model: no conversation selected':this.loading?'Last model: loading…':last?'Last-reported: '+last:'Last model: unknown'+(this.error?' · metadata unavailable':'');
    $('conversation-model').title=(!capability('modelSelection').supported?capability('modelSelection').reason+'. ':'')+(this.error?this.error+'. ':'')+'Last-reported ID only; current reasoning and modes are not exposed. Choose model for your next message.'+(typeof keyHint==='function'?keyHint('conversationModel'):'');
    $('conversation-runtime').textContent=thread?(this.loading?'Agent host: loading…':ConversationSettings.runtime()):'Agent host: no conversation selected';
    $('conversation-runtime').title=capability('runtime').reason || 'Execution host reported by the provider.';
  },
  async open(){
    if(!capability('modelSelection').supported){say(capability('modelSelection').reason);return;}
    if(!thread||document.querySelector('dialog[open]'))return;
    clearKeySequence();this.origin=document.activeElement;this.target=thread.id;
    $('conversation-settings').showModal();$('model-close').focus();
    await this.reload();
  },
  async reload(){
    const target=this.target,revision=this.revision,request=++this.catalogRequest;
    $('model-error').textContent='Loading available models…';$('model-apply').disabled=true;$('model-reload').disabled=true;
    $('reply-model').disabled=true;$('reply-reasoning').disabled=true;$('reply-modes').replaceChildren();
    try{
      const catalog=await client.models();
      if(request!==this.catalogRequest||revision!==this.revision||target!==thread?.id||!$('conversation-settings').open)return;
      this.models=catalog.items;
      const saved=this.choices.get(target);
      $('reply-model').replaceChildren(new Option('Keep server selection (no override)',''),...this.models.map(m=>new Option(m.name+' · '+m.billing,m.id)));
      if(saved&&!this.models.some(m=>m.id===saved.modelId))$('reply-model').append(new Option('Unavailable: '+saved.modelId,saved.modelId));
      $('reply-model').value=saved?.modelId||'';this.model(saved);
      $('reply-model').disabled=false;$('model-error').textContent='';$('model-apply').disabled=false;
    }catch(error){if(request===this.catalogRequest&&revision===this.revision&&target===thread?.id)$('model-error').textContent=error.message+' Your existing next-message choice is unchanged.';}
    finally{if(request===this.catalogRequest&&revision===this.revision)$('model-reload').disabled=false;}
  },
  model(saved){
    const model=this.models.find(m=>m.id===$('reply-model').value);
    $('reply-reasoning').replaceChildren(new Option('Model default',''),...(model?.reasoningModes||[]).map(v=>new Option(v,v)));
    if(saved?.reasoningMode&&!model?.reasoningModes.includes(saved.reasoningMode))$('reply-reasoning').append(new Option('Unavailable: '+saved.reasoningMode,saved.reasoningMode));
    $('reply-reasoning').value=saved?.reasoningMode||'';$('reply-reasoning').disabled=!model;
    $('reply-modes').replaceChildren(...['fast','pro','ultrafast'].map(mode=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.mode=mode;input.disabled=!model?.[mode];input.checked=Boolean(saved?.modes?.[mode]);label.append(input,document.createTextNode(mode+(model?.[mode]?'':' — unavailable')));return label;
    }));
  },
  value(){
    if(!$('reply-model').value)return undefined;
    const value={modelId:$('reply-model').value};
    if($('reply-reasoning').value)value.reasoningMode=$('reply-reasoning').value;
    const modes=Object.fromEntries([...$('reply-modes').querySelectorAll('input:checked')].map(i=>[i.dataset.mode,true]));
    if(Object.keys(modes).length)value.modes=modes;
    return ConversationSettings.selection(value,this.models);
  },
  apply(){
    if(this.target!==thread?.id)return;
    try{
      const value=this.value();
      if(value)this.choices.set(this.target,value);else this.choices.delete(this.target);
      this.render();$('conversation-settings').close();say('Next-message choice saved for this session. No message sent; the running turn is unchanged.');
    }catch(error){$('model-error').textContent=error.message+' Existing choice unchanged.';}
  },
  sent(entry){
    if(JSON.stringify(this.choices.get(entry.threadId))===JSON.stringify(entry.model))this.choices.delete(entry.threadId);
    this.render();
  }
};
$('conversation-model').onclick=()=>conversationControls.open();
$('model-close').onclick=()=>$('conversation-settings').close();
$('model-reload').onclick=()=>conversationControls.reload();
$('reply-model').onchange=()=>conversationControls.model();
$('conversation-settings-form').onsubmit=event=>{event.preventDefault();if(event.submitter===$('model-apply'))conversationControls.apply();};
$('conversation-settings').onclose=()=>{if($('conversation-settings').open)return;++conversationControls.catalogRequest;if(conversationControls.target===thread?.id&&conversationControls.origin?.isConnected&&!document.querySelector('dialog[open]')&&(document.activeElement===document.body||$('conversation-settings').contains(document.activeElement)))conversationControls.origin.focus();};
