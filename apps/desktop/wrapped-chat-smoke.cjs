const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-wrapped-'));let app;
 try {
  app=await _electron.launch({args:['.','--demo','--test-hidden','--user-data-dir='+profile]});
  const page=await app.firstWindow();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>keyReady&&!navigating);
  const keys=text=>page.keyboard.type(text);
  const settle=()=>page.evaluate(async()=>{
    await document.fonts.ready;
    let previous='',stable=0;
    for(let frame=0;frame<60;frame++) {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const rect=transcript.getBoundingClientRect(),entries=$('entries').getBoundingClientRect();
      const geometry=JSON.stringify([rect.top,rect.width,rect.height,entries.width,entries.height,transcript.scrollHeight,document.querySelector('main').style.cssText]);
      stable=geometry===previous&&layoutView.frame===null?stable+1:0;
      if(stable===3)return;
      previous=geometry;
    }
    throw Error('Wrapped fixture layout did not settle');
  });
  const fixture=async(source='user')=>{
    await page.evaluate(async source=>{
      const text='A wrapped paragraph '+('with Unicode 👩‍💻 café 漢字 and ordinary words ').repeat(28)+'https://example.com/'+('long-url-segment-').repeat(25)+' final words.';
      const article=document.createElement('article');article.dataset.messageId='wrapped';article.dataset.source=source;
      article.append(await richText.render({id:'wrapped',source,text},thread.id));
      const next=document.createElement('article');next.dataset.messageId='next';next.append(await richText.render({id:'next',source:'assistant',text:'Next entry with **rich inline words** and [Review](capy://thread/t2).'},thread.id));
      $('entries').replaceChildren(article,next);$('conversation').focus();chatPosition=0;chatAnchor=null;chatGeometry.reset();paintChat();
      globalThis.wrappedSemantic=chatText().text;
    },source);
    await settle();
  };
  const cursor=()=>page.evaluate(()=>{
    const projection=chatText(),piece=projection.pieces.find(p=>p.start<=chatPosition&&p.end>chatPosition);
    const range=chatRanges(projection,chatPosition,Motions.move(projection.text,chatPosition,'Right'))[0];const rect=range.getBoundingClientRect();
    return {position:chatPosition,top:rect.top-transcript.getBoundingClientRect().top+transcript.scrollTop,visibleTop:rect.top,x:(rect.left+rect.right)/2,height:rect.height,lineHeight:parseFloat(getComputedStyle(piece.node.parentElement).lineHeight),message:piece.node.parentElement.closest('article').dataset.messageId,anchor:chatAnchor,text:projection.text};
  });
  for(const width of [640,1280])for(const source of ['user','assistant']) {
    await page.setViewportSize({width,height:850});await fixture(source);
    const start=await cursor();await keys('j');const second=await cursor();assert.ok(second.position>start.position&&second.position<150,JSON.stringify(second));assert.ok(second.top>start.top&&second.top-start.top<start.height*2);
    await keys('j');const third=await cursor();assert.ok(third.top>second.top&&third.top-second.top<start.height*2);await keys('kk');const back=await cursor();assert.equal(back.position,start.position,'Vertical roundtrip maintains desired x');
    await keys('3j');const counted=await cursor();assert.ok(Math.abs(counted.top-start.top-(second.top-start.top)*3)<5,JSON.stringify({start,counted}));
    await keys('vjj');const selected=await cursor();assert.equal(selected.anchor,counted.position);await keys('y');assert.equal(await page.evaluate(()=>localYank),selected.text.slice(counted.position,MotionsRight(selected.text,selected.position)));
    assert.equal((await cursor()).text,start.text,'Visual rows do not add semantic newlines');
    await page.evaluate(()=>{chatPosition=chatText().pieces.filter(p=>p.node.parentElement.closest('article').dataset.messageId==='wrapped').at(-1).end-1;chatGeometry.reset();paintChat();});
    await keys('j');assert.equal((await cursor()).message,'next');
    await page.evaluate(()=>{chatPosition=chatText().pieces[0].start;chatGeometry.reset();paintChat();});await keys('k');assert.equal((await cursor()).position,0);
    await page.evaluate(()=>{chatPosition=chatText().text.indexOf('https://');chatGeometry.reset();paintChat();});
    for(let index=0;index<3;index++){const previous=await cursor();await keys('j');const next=await cursor();assert.ok(next.position>previous.position&&Math.abs(next.top-previous.top-previous.lineHeight)<1,JSON.stringify({reason:'Long URL traverses exactly one wrapped row',width,source,index,previous:{position:previous.position,top:previous.top,lineHeight:previous.lineHeight},next:{position:next.position,top:next.top}}));}
    assert.equal(await page.evaluate(()=>{const p=chatText().pieces.find(p=>p.start<=chatPosition&&p.end>chatPosition);return new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(p.node.textContent).containing(chatPosition-p.start).index===chatPosition-p.start;}),true,'Cursor stays on a complete grapheme');
    await page.evaluate(()=>{chatQuery='rich inline';findChat(1);});const rich=await cursor();assert.equal(rich.message,'next');await keys('k');await keys('j');const roundtrip=await cursor();assert.ok(Math.abs(roundtrip.x-rich.x)<25,JSON.stringify({width,rich:{position:rich.position,x:rich.x,top:rich.top},roundtrip:{position:roundtrip.position,x:roundtrip.x,top:roundtrip.top}}));
  }
  await page.setViewportSize({width:640,height:850});await fixture();await keys('4j');const before=await cursor();
  await page.setViewportSize({width:960,height:850});await settle();await keys('j');const resized=await cursor();assert.ok(resized.position>before.position);
  await page.evaluate(()=>{layoutView.config.sidebarWidth=220;layoutView.schedule();});await settle();const sidebar=await cursor();await keys('j');assert.ok(Math.abs((await cursor()).top-sidebar.top-sidebar.lineHeight)<1,'Scheduled sidebar layout settles before the next wrapped step');
  const reading=await cursor();
  await page.evaluate(async()=>{const image=document.createElement('img');image.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XkAAAAASUVORK5CYII=';await image.decode();image.style.height='120px';image.style.width='100%';preserveMediaLayout(()=>$('entries').firstElementChild.prepend(image));preserveMediaLayout(()=>image.style.height='240px');});
  assert.ok(Math.abs((await cursor()).visibleTop-reading.visibleTop)<3,'Image reflow preserves the reading anchor');
  const reflow=await cursor();await keys('j');assert.ok((await cursor()).top>reflow.top);
  await page.evaluate(()=>{const p=chatText().pieces[0];p.node.textContent+=' live appended text';});await settle();const live=await cursor();await keys('j');assert.ok((await cursor()).position>live.position);
  await page.evaluate(async()=>{await saveKeymaps({...keyConfig,mappings:{...keyConfig.mappings,chatDown:['J'],chatUp:['K']}});});
  const remap=await cursor();await keys('J');assert.ok((await cursor()).position>remap.position);await keys('K');assert.equal((await cursor()).position,remap.position);
  const proof=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],image=await w.capturePage(),bytes=image.toBitmap();return {visible:w.isVisible(),focused:w.isFocused(),width:image.getSize().width,png:image.toPNG().toString('base64'),colors:new Set(Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4))).size};});
  assert.equal(proof.visible,false);assert.equal(proof.focused,false);assert.ok(proof.width>=640);assert.ok(proof.colors>100);
  await fs.mkdir('/Users/ryan/.capy/work/JETS-31/renders',{recursive:true});await fs.writeFile('/Users/ryan/.capy/work/JETS-31/renders/wrapped-chat.png',Buffer.from(proof.png,'base64'));
  assert.deepEqual(errors,[]);console.log('PASS wrapped chat: user/assistant narrow/wide visual rows, desired x/roundtrip, counts, Visual/yank, unchanged Unicode/URL semantic text, rich nodes/search, entry boundaries, resize/media/live reflow, remaps, hidden rendered proof');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
function MotionsRight(text,p) {return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(p=>p.index).find(index=>index>p)??text.length;}
