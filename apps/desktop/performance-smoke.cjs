const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-performance-'));let app;
 try {
  const env={...process.env};delete env.CAPY_API_KEY;
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&thread&&!messageBusy);
  const evidence=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],image=await w.capturePage();return {visible:w.isVisible(),focused:w.isFocused(),size:image.getSize(),colors:new Set(image.toBitmap()).size};});
  assert.equal(evidence.visible,false);assert.equal(evidence.focused,false);assert.ok(evidence.colors>100);
  const correctness=await page.evaluate(async()=>{
   clearTimeout(messageTimer);clearTimeout(workTree.timer);
   const root=$('entries');
   function reference(){
    const pieces=[];let text='',block=null;
    function add(node,value,object=false){pieces.push({node,start:text.length,end:text.length+value.length,object});text+=value;}
    for(const article of root.children){
     const walker=document.createTreeWalker(article,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(node){
      const el=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
      if(el.closest('.diagram,.image-button'))return node.nodeType===Node.ELEMENT_NODE&&node.matches('.diagram,.image-button')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
      if(el.closest('button,.code-toolbar,.image-hint,summary,article > header,svg,[hidden]')||el.closest('details:not([open])'))return NodeFilter.FILTER_REJECT;
      if(node.nodeType===Node.ELEMENT_NODE&&node.matches('br'))return NodeFilter.FILTER_ACCEPT;
      if(node.nodeType!==Node.TEXT_NODE||!node.textContent.length||!el.closest('.markdown'))return NodeFilter.FILTER_SKIP;
      if(!node.textContent.trim()&&!el.closest('p,pre,li,h1,h2,h3,h4,h5,h6,td,th,blockquote'))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
     }});let node;
     while((node=walker.nextNode())){
      if(node.nodeType===Node.ELEMENT_NODE){if(node.matches('br')){if(!text.endsWith('\n'))text+='\n';continue;}if(text&&!text.endsWith('\n'))text+='\n';add(node,'\uFFFC',true);text+='\n';block=null;continue;}
      const nextBlock=node.parentElement.closest('p,pre,li,h1,h2,h3,h4,h5,h6,td,th,blockquote')??node.parentElement;
      if(block!==nextBlock&&text&&!text.endsWith('\n'))text+='\n';block=nextBlock;add(node,node.textContent);
     }
     if(text&&!text.endsWith('\n'))text+='\n';
    }
    return {text,pieces};
   }
   const checks=[];
   function check(name){const a=reference(),b=chatText();if(a.text!==b.text||a.pieces.length!==b.pieces.length||a.pieces.some((p,i)=>p.node!==b.pieces[i].node||p.start!==b.pieces[i].start||p.end!==b.pieces[i].end||p.object!==b.pieces[i].object))throw Error(name);checks.push(name);}
   root.innerHTML='<article data-message-id="semantic"><header>Excluded</header><div class="markdown"><h2>Heading</h2><p>A 👨‍👩‍👧‍👦 family á<br>After break</p><ul><li>first</li><li>second</li></ul><table><tr><td>cell</td><td>next</td></tr></table><div class="code-toolbar"><button>Copy</button>language</div><pre><code>let x = 1;\nline two</code></pre><details><summary>Source</summary><pre>hidden source</pre></details><div class="diagram"><svg><text>visual text</text></svg></div><button class="image-button"><img alt="visual image"></button><span class="image-hint">hint</span><p hidden>hidden body</p></div></article><article><div class="markdown"><br><p>second article</p></div></article>';
   check('mixed semantics');const cached=chatText();if(chatText()!==cached)throw Error('cache miss without mutation');
   for(const piece of cached.pieces){const p=piece.start;const address=chatLocation(p);if(restoreChatLocation(address)!==p)throw Error('object/text address round trip');}
   root.querySelector('p').firstChild.textContent='Synchronous replacement';check('synchronous text change');
   root.querySelector('p').append(document.createTextNode(' appended'));check('synchronous insertion');
   root.querySelector('details').open=true;check('details opened');root.querySelector('details').open=false;check('details closed');
   root.querySelector('[hidden]').hidden=false;check('hidden body revealed');
   root.querySelector('.diagram').className='markdown';check('semantic class change');
   root.querySelector('.image-button').replaceChildren(Object.assign(document.createElement('img'),{alt:'decoded image'}));check('image replaced');
   await new Promise(r=>setTimeout(r,0));check('observer delivered');
   chatAnchor=0;chatPosition=5;const selection=selectedChat(chatText());if(chatText().text.slice(selection.from,selection.to)!=='Headin')throw Error('semantic selection');chatAnchor=null;chatPosition=0;
   const old=chatText();chatProjection=old;resetChatProjection();if(chatTextCache!==null||chatProjection!==null)throw Error('reset retained projection');
   if(chatText()===old)throw Error('reset did not force recompute');
   root.replaceChildren();check('destination cleared');root.innerHTML='<article data-message-id="other"><div class="markdown"><p>Other destination</p></div></article>';check('new current DOM');if(chatText().pieces.some(p=>old.pieces.some(q=>q.node===p.node)))throw Error('retained old DOM node');
   const state=messageState,item=thread;messageState=new Transcript.Pager();resetChatProjection();displayThread(null);if(chatTextCache?.pieces.some(p=>old.pieces.some(q=>q.node===p.node)))throw Error('thread change retained DOM');await displayThread(item,state);clearTimeout(messageTimer);clearTimeout(workTree.timer);
   globalThis.referenceChatText=reference;
   return checks;
  });
  const measurements=await page.evaluate(async baseline=>{
   ++messageRequest;clearTimeout(messageTimer);clearTimeout(workTree.timer);liveStream.select(null);clearTimeout(liveStream.timer);clearTimeout(liveStream.statusTimer);await desk.cancelMessages();
   if(baseline){chatText=referenceChatText;const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'}),move=Motions.move;Motions.move=(text,position,motion)=>{if(!['Left','Right'].includes(motion))return move(text,position,motion);const p=Math.max(0,Math.min(text.length,position)),boundaries=[...segmenter.segment(text)].map(part=>part.index);return motion==='Left'?boundaries.filter(index=>index<p).at(-1)??0:boundaries.find(index=>index>p)??text.length;};}
   const samples=[];const root=$('entries');
   for(const count of [100,1000,5000]){
    const frameStart=performance.now();
    const fragment=document.createDocumentFragment();for(let i=0;i<count;i++){const card=document.createElement('article');card.dataset.messageId='perf-'+i;const text=document.createElement('div');text.className='markdown';text.innerHTML='<h2>Message '+i+'</h2>'+('<p>A realistic <strong>Markdown</strong> response with <a>reference</a>, inline <code>code</code> and details.</p><ul><li>first point</li><li>second point</li></ul>').repeat(3);card.append(text);fragment.append(card);}root.replaceChildren(fragment);chatPosition=0;chatAnchor=null;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const firstFrameMs=performance.now()-frameStart;
    for(let run=0;run<3;run++){if(root.children.length!==count)throw Error('Fixture overwritten');resetChatProjection();const start=performance.now();const value=chatText();const coldMs=performance.now()-start;const cachedStart=performance.now();const repeats=baseline?1:20;for(let j=0;j<repeats;j++)if(chatText()!==value&&!baseline)throw Error('warm traversal');const cachedMs=(performance.now()-cachedStart)/repeats;
     const focusStart=performance.now();focusWindow('composer');focusWindow('conversation');const focusMs=performance.now()-focusStart;samples.push({baseline,count,run,firstFrameMs,coldMs,cachedMs,focusMs,pieces:value.pieces.length,domNodes:root.querySelectorAll('*').length});}
   }
   return samples;
  },process.argv.includes('--baseline'));
  const out=process.argv[2];if(out){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'performance.json'),JSON.stringify({evidence,correctness,measurements},null,2));}
  console.log('PASS hidden semantic cache, exact text/object offsets, synchronous/details/image invalidation, current-DOM reset and performance samples',JSON.stringify({evidence,correctness,measurements}));
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
