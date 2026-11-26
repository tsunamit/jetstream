const layoutView={
  config:LayoutState.defaults(),ready:false,frame:null,saveTimer:null,drag:null,limits:null,restore:null,naturalHeight:0,
  apply(restore=this.ready?captureReadingLayout():()=>{}){
    const main=document.querySelector('main'),b=LayoutState.bounds(main.clientWidth,main.clientHeight);
    this.limits=b;
    const side=LayoutState.clamp(this.config.sidebarWidth,b.sidebarMin,b.sidebarMax),size=LayoutState.replySize(this.config.replyHeight,this.naturalHeight,main.clientHeight,b,this.drag?.key==='replyHeight'),reply=size.height;
    document.body.dataset.layout='true';document.body.dataset.centeredReading=String(this.config.centeredReading);
    main.style.setProperty('--sidebar-width',side+'px');main.style.setProperty('--reply-height',reply+'px');
    const width=main.clientWidth-(document.body.classList.contains('sidebar-hidden')?0:side+6);
    main.style.setProperty('--content-gutter',LayoutState.gutter(width,this.config.centeredReading)+'px');
    main.style.setProperty('--chat-head-max',Math.max(24,main.clientHeight-reply-46)+'px');
    for(const [id,value,min,max] of [['sidebar-resize',side,b.sidebarMin,b.sidebarMax],['reply-resize',reply,size.min,b.replyMax]]){
      const handle=$(id);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',value);handle.setAttribute('aria-valuetext',value+' pixels');
    }
    $('centered-reading').checked=this.config.centeredReading;
    composer.measure(true);restore();this.restore=captureReadingLayout(false);
  },
  geometry(event){
    if(!this.ready||event.detail.id!==composer.id)return;
    const chrome=$('composer').clientHeight-draft.clientHeight;
    this.naturalHeight=Math.ceil(event.detail.height+chrome);
    const main=document.querySelector('main'),size=LayoutState.replySize(this.config.replyHeight,this.naturalHeight,main.clientHeight,this.limits,this.drag?.key==='replyHeight');
    if($('reply-resize').getAttribute('aria-valuemin')!==String(size.min))$('reply-resize').setAttribute('aria-valuemin',size.min);
    if(size.height===Math.round($('composer').getBoundingClientRect().height)||this.frame!==null)return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;this.apply(this.restore||(()=>{}));});
  },
  schedule(){if(this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.apply();});},
  async save(){
    clearTimeout(this.saveTimer);this.saveTimer=null;
    const revision=this.editRevision??userSettings.revision;
    this.editRevision=null;
    try{
      const result=await desk.saveConfig('layout',{...this.config},revision);
      applyUserConfig(result);
      if(keyEditRevision===revision)keyEditRevision=result.revision;
      $('layout-status').textContent='Layout saved';
    }
    catch(error){$('layout-status').textContent=error.message;say(error.message);applyUserConfig(await desk.userConfig(),true);}
  },
  debounce(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save(),250);},
  reset(key){
    if(this.drag)this.finish(true);
    this.editRevision=userSettings.revision;
    const defaults=LayoutState.defaults();
    for(const name of key?[key]:['sidebarWidth','replyHeight'])this.config[name]=defaults[name];
    this.apply();this.save();
  },
  start(event,key){
    if(!this.ready||this.drag||event.button!==0||!event.isPrimary)return;
    event.preventDefault();clearTimeout(this.saveTimer);this.saveTimer=null;
    this.editRevision=userSettings.revision;
    const handle=event.currentTarget,vertical=key==='sidebarWidth';
    this.drag={key,handle,id:event.pointerId,start:vertical?event.clientX:event.clientY,value:Number(handle.getAttribute('aria-valuenow')),previous:this.config[key]};
    handle.setPointerCapture(event.pointerId);handle.dataset.dragging='true';
    document.body.classList.add('resizing');document.body.style.setProperty('--resize-cursor',vertical?'col-resize':'row-resize');
  },
  move(event){
    const d=this.drag;if(!d||event.pointerId!==d.id)return;
    const vertical=d.key==='sidebarWidth',b=this.limits;
    this.config[d.key]=Math.round(LayoutState.clamp(d.value+(vertical?event.clientX-d.start:d.start-event.clientY),vertical?b.sidebarMin:b.replyMin,vertical?b.sidebarMax:b.replyMax));
    this.schedule();
  },
  finish(cancel=false){
    const d=this.drag;if(!d)return;this.drag=null;
    if(this.frame!==null){cancelAnimationFrame(this.frame);this.frame=null;}
    if(cancel)this.config[d.key]=d.previous;
    delete d.handle.dataset.dragging;document.body.classList.remove('resizing');document.body.style.removeProperty('--resize-cursor');
    if(d.handle.hasPointerCapture(d.id))d.handle.releasePointerCapture(d.id);
    this.apply();if(!cancel)this.save();else this.debounce();
  },
  key(event){
    if(!this.ready)return;
    if(event.key==='Escape'&&this.drag){event.preventDefault();this.finish(true);return;}
    if(event.altKey||event.metaKey||event.ctrlKey)return;
    const vertical=event.target.id==='sidebar-resize',key=vertical?'sidebarWidth':'replyHeight',b=this.limits;
    const min=Number(event.target.getAttribute('aria-valuemin')),max=vertical?b.sidebarMax:b.replyMax,value=Number(event.target.getAttribute('aria-valuenow')),step=event.shiftKey?40:10;
    const delta=vertical?{ArrowLeft:-step,ArrowRight:step}:{ArrowUp:step,ArrowDown:-step};
    if(!Object.hasOwn(delta,event.key)&&!['Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const next=event.key==='Home'?(vertical?b.sidebarMin:b.replyMin):event.key==='End'?max:LayoutState.clamp(value+delta[event.key],min,max);
    if(Object.hasOwn(delta,event.key)&&next===value)return;
    if(!this.saveTimer)this.editRevision=userSettings.revision;
    this.config[key]=next;
    this.apply();this.debounce();keyboardMode();
  }
};
for(const [id,key] of [['sidebar-resize','sidebarWidth'],['reply-resize','replyHeight']]){
  const handle=$(id);
  handle.addEventListener('pointerdown',event=>layoutView.start(event,key));
  handle.addEventListener('pointermove',event=>layoutView.move(event));
  handle.addEventListener('pointerup',event=>{if(event.pointerId===layoutView.drag?.id){layoutView.move(event);layoutView.finish();}});
  for(const name of ['pointercancel','lostpointercapture'])handle.addEventListener(name,event=>{if(event.pointerId===layoutView.drag?.id)layoutView.finish(true);});
  handle.ondblclick=()=>layoutView.reset(key);
}
$('reset-layout').onclick=()=>layoutView.reset();
draft.addEventListener('geometry',event=>layoutView.geometry(event));
draft.addEventListener('compositionend',()=>composer.measure(true));
$('centered-reading').onchange=()=>{layoutView.editRevision=userSettings.revision;layoutView.config.centeredReading=$('centered-reading').checked;layoutView.apply();layoutView.save();};
new ResizeObserver(()=>{
  if(!layoutView.ready)return;
  const restore=layoutView.restore;
  layoutView.apply(restore||(()=>{}));
}).observe(document.querySelector('main'));
new MutationObserver(()=>{if(layoutView.ready)layoutView.apply();}).observe(document.body,{attributes:true,attributeFilter:['class']});
transcript.addEventListener('scroll',()=>{if(layoutView.ready&&!layoutView.drag)layoutView.restore=captureReadingLayout(false);},{passive:true});
new MutationObserver(()=>{if(layoutView.ready)layoutView.restore=captureReadingLayout(false);}).observe($('entries'),{childList:true,subtree:true,characterData:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&layoutView.ready&&layoutView.saveTimer)layoutView.save();});
