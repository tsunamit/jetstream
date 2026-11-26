const localFind={
  session:null,sequence:[],timer:null,
  surface(target=document.activeElement) {
    if(target.closest('input,textarea,select,[contenteditable=true],#draft,.cm-editor,.local-find-bar'))return null;
    const dialog=document.querySelector('dialog[open]');
    if(dialog) {
      if(dialog===picker||['chat-search','list-filter'].includes(dialog.id))return null;
      if(dialog.id==='work-activity') {
        if(target.closest('#activity-preview'))return {host:$('activity-preview'),label:'Work preview'};
        return {host:$('activity-board'),label:'Work overview',select:node=>{
          const card=node.parentElement.closest('.activity-card');if(!card)return;
          const [,column,row]=/activity-option-(\d+)-(\d+)/.exec(card.id)||[];
          if(column!==undefined){workActivity.column=Number(column);workActivity.rows[Number(column)]=Number(row);workActivity.render(false,false);}
        },capture:()=>{const column=workActivity.column,rows=[...workActivity.rows];return ()=>{workActivity.column=column;workActivity.rows=rows;workActivity.render(false,false);};}};
      }
      return {host:dialog,label:dialog.querySelector('h2')?.textContent||dialog.getAttribute('aria-label')||'Preview'};
    }
    if(target.closest('#navigator'))return {host:$('threads'),label:'Navigator · loaded rows',select:node=>node.parentElement.closest('#threads button')?.focus({preventScroll:true})};
    return null;
  },
  open() {
    const adapter=this.surface();if(!adapter)return;
    if(this.session&&this.session.adapter.host!==adapter.host)this.close(false);
    if(this.session){this.session.editing=true;this.bar.hidden=false;this.input.disabled=false;this.bar.classList.remove('committed');this.input.focus({preventScroll:true});this.input.select();return;}
    const origin=document.activeElement,scrolls=[document.scrollingElement,...document.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight||n.scrollWidth>n.clientWidth).map(n=>[n,n.scrollTop,n.scrollLeft]);
    const selection=getSelection(),saved=[];for(let i=0;i<selection.rangeCount;i++)saved.push(selection.getRangeAt(i).cloneRange());
    const restoreCursor=adapter.capture?.();
    const session=this.session={adapter,origin,scrolls,saved,restoreCursor,query:'',matches:[],current:-1,dirty:true,editing:true};
    this.bar=document.createElement('form');this.bar.className='local-find-bar';this.bar.setAttribute('aria-label','Find in '+adapter.label);
    const label=document.createElement('label');label.textContent='Find · '+adapter.label;
    this.input=document.createElement('input');this.input.type='search';this.input.maxLength=200;this.input.autocomplete='off';this.input.setAttribute('aria-label','Local find query');
    this.status=document.createElement('output');this.status.setAttribute('role','status');
    const close=document.createElement('button');close.type='button';close.textContent='Esc · Cancel';close.onclick=()=>this.close(true);
    label.append(this.input);this.bar.append(label,this.status,close);
    (adapter.host.closest('dialog')||$('navigator')).append(this.bar);
    this.bar.onsubmit=event=>{event.preventDefault();this.commit();};
    this.input.oninput=event=>{if(!event.isComposing)this.update();};
    this.input.addEventListener('compositionend',()=>this.update());
    session.observer=new MutationObserver(records=>{if(records.every(r=>this.bar.contains(r.target)))return;session.dirty=true;if(session.frame)return;session.frame=requestAnimationFrame(()=>{session.frame=null;if(this.session===session)this.update(false);});});
    session.observer.observe(adapter.host,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','open']});
    this.update();this.input.focus({preventScroll:true});
  },
  update(reveal=true) {
    const s=this.session;if(!s)return;
    if(!s.adapter.host.isConnected||s.adapter.host.closest('dialog')&&!s.adapter.host.closest('dialog').open){this.close(false);return;}
    if(s.dirty){s.index=LocalFind.index(s.adapter.host);s.dirty=false;}
    const query=this.input.value,changed=s.query!==query;s.query=query;
    s.matches=LocalFind.matches(s.index.text,query);s.current=s.matches.length?changed?0:Math.max(0,Math.min(s.current,s.matches.length-1)):-1;
    this.paint(reveal);
  },
  paint(reveal) {
    const s=this.session;if(!s)return;
    const ranges=s.matches.map(match=>LocalFind.range(s.index,match)).filter(Boolean),current=ranges[s.current];
    CSS.highlights.set('local-find-all',new Highlight(...ranges));CSS.highlights.set('local-find-current',new Highlight(...(current?[current]:[])));
    this.status.textContent=(s.current+1)+' / '+s.matches.length+(s.matches.length===2000?' (limit)':'')+(s.index.truncated?' · first 500k characters':'')+' · Smart case · Enter keep · Esc cancel';
    if(reveal&&current){current.startContainer.parentElement.scrollIntoView({block:'nearest',inline:'nearest'});this.revealRange(current);}
  },
  revealRange(range) {
    const rect=range.getBoundingClientRect();
    for(let parent=range.startContainer.parentElement;parent;parent=parent.parentElement){
      if(parent.scrollHeight<=parent.clientHeight&&parent.scrollWidth<=parent.clientWidth)continue;
      const bounds=parent.getBoundingClientRect(),height=parent.clientHeight,width=parent.clientWidth;
      if(rect.bottom>bounds.top+height)parent.scrollTop+=rect.bottom-bounds.top-height;
      else if(rect.top<bounds.top)parent.scrollTop+=rect.top-bounds.top;
      if(rect.right>bounds.left+width)parent.scrollLeft+=rect.right-bounds.left-width;
      else if(rect.left<bounds.left)parent.scrollLeft+=rect.left-bounds.left;
    }
  },
  select() {
    const s=this.session,match=s.matches[s.current];if(!match)return;
    const range=LocalFind.range(s.index,match);if(!range)return;
    s.adapter.select?.(range.startContainer);
    if(s.adapter.select){s.dirty=true;this.update(false);}
    this.paint(true);
  },
  commit() {
    const s=this.session;if(!s)return;
    s.editing=false;this.input.blur();s.origin.focus({preventScroll:true});this.select();
    this.input.disabled=true;this.bar.classList.add('committed');
  },
  next(direction) {
    const s=this.session;if(!s)return;
    if(s.dirty)this.update(false);
    if(!s.matches.length)return;
    s.current=(s.current+direction+s.matches.length)%s.matches.length;this.select();
  },
  close(restore) {
    const s=this.session;if(!s)return;
    this.session=null;s.observer.disconnect();cancelAnimationFrame(s.frame);
    this.bar.remove();CSS.highlights.delete('local-find-all');CSS.highlights.delete('local-find-current');
    if(restore){s.restoreCursor?.();if(s.origin.isConnected)s.origin.focus({preventScroll:true});const selection=getSelection();selection.removeAllRanges();for(const range of s.saved)if(range.startContainer.isConnected&&range.endContainer.isConnected)selection.addRange(range);for(const [node,top,left] of s.scrolls)if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}}
  },
  key(event) {
    const s=this.session;
    if(s&&event.key==='Escape'){event.preventDefault();this.close(true);return true;}
    if(s&&this.bar.contains(event.target))return false;
    const adapter=this.surface(event.target);
    if(s&&(!adapter||adapter.host!==s.adapter.host)){this.close(false);}
    if(!adapter||keySequence.length||keyCount)return false;
    const token=Keymaps.eventKey(event),scope=this.session?'localMatch':'localWindow';
    const navigator=adapter.host===$('threads');
    const sequence=[...this.sequence,token],bindings=keyBindings.filter(b=>(navigator?b.id==='navigatorFind'||scope==='localMatch'&&b.scope==='localMatch':['localWindow',scope].includes(b.scope))&&sequence.every((key,i)=>b.keys[i]===key));
    if(!bindings.length){this.sequence=[];clearTimeout(this.timer);return false;}
    event.preventDefault();clearTimeout(this.timer);
    const exact=bindings.find(b=>b.keys.length===sequence.length);
    if(exact){this.sequence=[];if(['localFind','navigatorFind'].includes(exact.id))this.open();else this.next(exact.id==='localNextMatch'?1:-1);}
    else {this.sequence=sequence;this.timer=setTimeout(()=>this.sequence=[],keyConfig.timeout);}
    return true;
  }
};
window.addEventListener('resize',()=>{if(localFind.session)requestAnimationFrame(()=>localFind.paint(true));});
document.addEventListener('focusin',event=>{localFind.sequence=[];const s=localFind.session;if(s&&!localFind.bar.contains(event.target)&&localFind.surface(event.target)?.host!==s.adapter.host)localFind.close(false);});
document.addEventListener('close',event=>{if(localFind.session?.adapter.host.closest('dialog')===event.target)localFind.close(false);},true);
