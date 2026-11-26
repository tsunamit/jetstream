const devReload = {
  enabled:false, restoring:false, busy:false, button:null, output:null, version:0,
  view(view) {
    if(!view)return null;
    const {transcriptState,...safe}=view;
    return safe;
  },
  modelChoices(rows) {
    if(!Array.isArray(rows))return [];
    const result=[];
    for(const row of rows.slice(-100)) {
      if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(row[0]))continue;
      const value=row[1];
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['modelId','reasoningMode','modes'].includes(key)))continue;
      if(!Object.hasOwn(value,'modelId')||typeof value.modelId!=='string'||!value.modelId.length||value.modelId.length>256||/[\u0000-\u001f\u007f]/.test(value.modelId))continue;
      if(value.reasoningMode!==undefined&&(typeof value.reasoningMode!=='string'||!value.reasoningMode.length||value.reasoningMode.length>40||/[\u0000-\u001f\u007f]/.test(value.reasoningMode)))continue;
      if(value.modes!==undefined&&(!value.modes||typeof value.modes!=='object'||Array.isArray(value.modes)||Object.entries(value.modes).some(([key,flag])=>!['fast','pro','ultrafast'].includes(key)||typeof flag!=='boolean')))continue;
      result.push([row[0],{modelId:value.modelId,...(value.reasoningMode!==undefined?{reasoningMode:value.reasoningMode}:{}),...(value.modes!==undefined?{modes:{...value.modes}}:{})}]);
    }
    return result;
  },
  capture() {
    if(thread)drafts.set(thread.id,draft.value);
    if(historyIndex>=0)history[historyIndex]=captureView();
    return {view:this.view(captureView()),history:history.map(view=>this.view(view)),historyIndex,
      drafts:[...drafts],paneStates:[...paneStates],layout:{...layoutView.config},
      navigatorQuery,sidebarHidden:document.body.classList.contains('sidebar-hidden'),
      outgoing:[...outgoing.items.values()].map(({sentDoc,...entry})=>entry),
      modelChoices:typeof conversationControls==='undefined'?[]:this.modelChoices([...conversationControls.choices]),
      unread:[...readState.model.items],showToolActivity};
  },
  async reload() {
    if(!this.enabled||this.busy)return;
    if(pending||changingConnection||navigating||layoutView.drag||[...readState.model.items.values()].some(state=>state.pending)||document.querySelector('dialog[open]')||composer.prompt()) {
      this.output.textContent='Finish the send, navigation, drag or dialog before reloading.';return;
    }
    this.busy=true;
    try {
      await desk.dev('prepare');
      if(pending||changingConnection||navigating||layoutView.drag||[...readState.model.items.values()].some(state=>state.pending)||document.querySelector('dialog[open]')||composer.prompt())throw Error('Finish the current interaction, then reload.');
      const snapshot=this.capture();document.body.inert=true;
      await desk.dev('reload',snapshot);
    }
    catch(error){document.body.inert=false;this.output.textContent=error.message;this.busy=false;}
  },
  style(version, changes) {
    this.styleQueue=(this.styleQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
      const names=new Set((Array.isArray(changes)?changes:[]).filter(name=>typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.css$/.test(name)).slice(0,32));
      const links=[...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>names.has((link.getAttribute('href')||'').split(/[?#]/)[0].replace(/^\.\//,''))).slice(0,32);
      if(!links.length)return;
      const selection=getSelection(),ranges=selection ? Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()) : [];
      const scroll=transcript.scrollTop,editorScroll=composer.view?.scrollDOM.scrollTop;
      await Promise.all(links.map(async old=>{
        const name=old.getAttribute('href').split(/[?#]/)[0];
        const next=old.cloneNode();next.href=name+'?dev='+encodeURIComponent(version);
        await new Promise((resolve,reject)=>{next.onload=resolve;next.onerror=reject;old.after(next);}).catch(()=>{next.remove();throw Error('CSS update failed; the previous stylesheet is still active.');});
        old.remove();
      }));
      if(selection&&ranges.length){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}
      transcript.scrollTop=scroll;if(composer.view)composer.view.scrollDOM.scrollTop=editorScroll;
      composer.measure();this.output.textContent='Dev · CSS updated without renderer reload';
    });
    return this.styleQueue;
  },
  setup(notice) {
    if(this.enabled)return;this.enabled=true;
    document.title='Jetstream Dev';
    document.querySelector('.brand').append(document.createTextNode(' Dev'));
    const box=document.createElement('div');box.id='dev-tools';
    box.style.cssText='position:fixed;right:12px;bottom:38px;z-index:1000;max-width:65vw;background:#202629;color:#e6ebe7;padding:5px 9px;border:1px solid #789b83;font:12px system-ui';
    this.output=document.createElement('output');this.output.id='dev-notice';this.output.textContent=notice;
    this.button=document.createElement('button');this.button.id='dev-reload';this.button.textContent='Reload renderer · ⌘R';this.button.onclick=()=>this.reload();
    box.append(this.output,document.createTextNode(' '),this.button);document.body.append(box);
    desk.onDev(event=>{
      if(event.type==='reload'){this.reload();return;}
      if(event.type==='style')this.style(event.version,event.changes).catch(error=>{this.output.textContent=error.message;});
      else this.output.textContent=event.notice;
    });
    const resume=event=>{
      if(!event.isTrusted||this.restoring)return;
      desk.dev('resume').catch(()=>{});this.holdReads=false;
    };
    for(const event of ['keydown','pointerdown','wheel'])document.addEventListener(event,resume,{capture:true,passive:true});
  },
  async restore(status) {
    if(!status.dev)return false;
    this.setup(status.dev.notice);
    const saved=status.dev.checkpoint;if(!saved)return false;
    this.restoring=true;this.holdReads=true;
    try {
      for(const [id,text] of saved.drafts)drafts.set(id,text);
      for(const [id,state] of saved.paneStates){paneStates.set(id,state);if(drafts.has(id)){composer.switchTo(id,drafts.get(id));composer.restore(state.editor);}}
      for(const entry of saved.outgoing)outgoing.items.set(entry.clientKey,entry);
      if(typeof conversationControls!=='undefined')for(const [id,value] of this.modelChoices(saved.modelChoices))conversationControls.choices.set(id,value);
      showToolActivity=saved.showToolActivity;toolActivityHints();
      await projects(await desk.projects(),true);
      const view=saved.view;
      navigatorQuery=saved.navigatorQuery;
      toggleSidebar(!saved.sidebarHidden,false);
      await openThread(view.item,{projectId:view.projectId,replace:true,target:view.target});
      for(const [id,state] of saved.unread)readState.model.items.set(id,state);
      readState.model.version=Math.max(readState.model.version,...saved.unread.map(([,state])=>state.revision));
      let budget=Math.max(0,30-messageState.pages);
      while(thread&&budget>0&&(messageState.next||messageState.before&&messageState.pages<view.pages)) {
        const prior=messageState.pages;
        await loadMessages(!messageState.next,false,Math.min(5,budget));
        const used=messageState.pages-prior;
        if(!used)break;
        budget-=used;
      }
      history=saved.history;historyIndex=saved.historyIndex;historyControls();
      layoutView.config=LayoutState.config(saved.layout);layoutView.apply(()=>{});
      restorePaneState(thread?.id,view.modal);pane=view.pane;
      const focus=view.focus.startsWith('thread:')?[...$('threads').querySelectorAll('button')].find(row=>row.dataset.id===view.focus.slice(7)):$(view.focus);
      if(view.focus==='draft')composer.view?.focus();else (focus??$(view.pane))?.focus({preventScroll:true});
      transcript.scrollTop=view.scroll;$('navigator').scrollTop=view.navigatorScroll;
      keyboardMode();
      this.output.textContent='Dev · restored drafts and context · read acknowledgments paused until input';
      return true;
    } catch {
      this.output.textContent='Dev · drafts retained; context restoration failed. Choose the thread again. Read acknowledgments remain paused.';
      return true;
    } finally {this.restoring=false;}
  }
};
