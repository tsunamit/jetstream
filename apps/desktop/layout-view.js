const layoutView={
  config:LayoutState.defaults(),ready:false,frame:null,saveTimer:null,drag:null,limits:null,restore:null,
  apply(restore=this.ready?captureReadingLayout():()=>{}){
    const main=document.querySelector('main'),b=LayoutState.bounds(main.clientWidth,main.clientHeight);
    this.limits=b;
    const side=LayoutState.clamp(this.config.sidebarWidth,b.sidebarMin,b.sidebarMax),reply=LayoutState.clamp(this.config.replyHeight,b.replyMin,b.replyMax);
    document.body.dataset.layout='true';document.body.dataset.centeredReading=String(this.config.centeredReading);
    main.style.setProperty('--sidebar-width',side+'px');main.style.setProperty('--reply-height',reply+'px');
    main.style.setProperty('--chat-head-max',Math.max(24,main.clientHeight-reply-46)+'px');
    for(const [id,value,min,max] of [['sidebar-resize',side,b.sidebarMin,b.sidebarMax],['reply-resize',reply,b.replyMin,b.replyMax]]){
      const handle=$(id);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',value);handle.setAttribute('aria-valuetext',value+' pixels');
    }
    $('centered-reading').checked=this.config.centeredReading;
    composer.measure();restore();this.restore=captureReadingLayout(false);
  },
  schedule(){if(this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.apply();});},
  async save(){
    clearTimeout(this.saveTimer);this.saveTimer=null;
    try{await desk.saveLayout({...this.config});$('layout-status').textContent='Layout saved';}
    catch(error){$('layout-status').textContent='Layout changed for this session; could not save.';say($('layout-status').textContent);}
  },
  debounce(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save(),250);},
  reset(key){
    if(this.drag)this.finish(true);
    const defaults=LayoutState.defaults();
    for(const name of key?[key]:['sidebarWidth','replyHeight'])this.config[name]=defaults[name];
    this.apply();this.save();
  },
  start(event,key){
    if(!this.ready||this.drag||event.button!==0||!event.isPrimary)return;
    event.preventDefault();clearTimeout(this.saveTimer);this.saveTimer=null;
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
    const min=vertical?b.sidebarMin:b.replyMin,max=vertical?b.sidebarMax:b.replyMax,value=Number(event.target.getAttribute('aria-valuenow')),step=event.shiftKey?40:10;
    const delta=vertical?{ArrowLeft:-step,ArrowRight:step}:{ArrowUp:step,ArrowDown:-step};
    if(!Object.hasOwn(delta,event.key)&&!['Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    this.config[key]=event.key==='Home'?min:event.key==='End'?max:LayoutState.clamp(value+delta[event.key],min,max);
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
$('centered-reading').onchange=()=>{layoutView.config.centeredReading=$('centered-reading').checked;layoutView.apply();layoutView.save();};
new ResizeObserver(()=>{
  if(!layoutView.ready)return;
  const restore=layoutView.restore;
  layoutView.apply(restore||(()=>{}));
}).observe(document.querySelector('main'));
new MutationObserver(()=>{if(layoutView.ready)layoutView.apply();}).observe(document.body,{attributes:true,attributeFilter:['class']});
transcript.addEventListener('scroll',()=>{if(layoutView.ready&&!layoutView.drag)layoutView.restore=captureReadingLayout(false);},{passive:true});
new MutationObserver(()=>{if(layoutView.ready)layoutView.restore=captureReadingLayout(false);}).observe($('entries'),{childList:true,subtree:true,characterData:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&layoutView.ready&&layoutView.saveTimer)layoutView.save();});
desk.layoutState().then(result=>{layoutView.config=result.config;layoutView.ready=true;layoutView.apply();if(result.error)$('layout-status').textContent=result.error;}).catch(fail);
