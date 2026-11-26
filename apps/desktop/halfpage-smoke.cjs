const {_electron}=require('./test-support.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-halfpage-'));let app;
 try {
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});const page=await app.firstWindow();page.setDefaultTimeout(8000);
  await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>keyReady&&!navigating);
  const settle=()=>page.evaluate(async()=>{
   await document.fonts.ready;
   let previous='',stable=0;
   for(let frame=0;frame<60;frame++) {
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const bounds=transcript.getBoundingClientRect();
    const geometry=JSON.stringify([bounds.top,bounds.width,bounds.height,transcript.scrollHeight,document.querySelector('main').style.cssText]);
    stable=geometry===previous&&layoutView.frame===null?stable+1:0;
    if(stable===3)return;
    previous=geometry;
   }
   throw Error('Half-page fixture layout did not settle');
  });
  const items=Array.from({length:8},(_,i)=>({id:'half-'+i,source:'assistant',text:Array.from({length:20},(_,j)=>`Body ${i} row ${j} for navigation`).join('\n\n'),createdAt:'2026-11-20T17:12:00Z'}));
  await app.evaluate(({ipcMain},items)=>{ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',()=>({value:{items,beforeCursor:null}}));},items);
  await page.evaluate(async()=>{messageState=new Transcript.Pager();await loadMessages();$('conversation').focus();chatPosition=0;transcript.scrollTop=0;paintChat();});
  await settle();
  const state=()=>page.evaluate(()=>{
   const p=chatText(),r=chatRanges(p,chatPosition,Motions.move(p.text,chatPosition,'Right'))[0].getBoundingClientRect(),b=transcript.getBoundingClientRect();
   return {pos:chatPosition,scroll:transcript.scrollTop,height:transcript.clientHeight,y:r.top-b.top,bottom:r.bottom-b.top,last:p.pieces.at(-1).end-1};
  });
  const press=(key,repeat=false)=>page.evaluate(async({key,repeat})=>{const event=new KeyboardEvent('keydown',{key,ctrlKey:true,repeat,bubbles:true,cancelable:true});document.activeElement.dispatchEvent(event);await Promise.resolve();return event.defaultPrevented;},{key,repeat});
  const start=await state();await press('d');const down=await state();assert.ok(down.pos>0);assert.ok(Math.abs(down.scroll-start.scroll-start.height/2)<2);assert.ok(Math.abs(down.y-start.y)<30);
  await press('u');assert.equal((await state()).scroll,0);assert.equal((await state()).pos,0);
  await page.setViewportSize({width:1000,height:650});await settle();
  await page.evaluate(()=>{const p=chatText(),r=chatRanges(p,chatPosition,Motions.move(p.text,chatPosition,'Right'))[0].getBoundingClientRect(),b=transcript.getBoundingClientRect();transcript.scrollTop+=Math.max(0,r.top-b.top-Math.min(20,transcript.clientHeight/4));});
  const small=await state();await press('d');const smallDown=await state();
  assert.ok(smallDown.pos>small.pos);assert.equal(smallDown.height,small.height);assert.ok(Math.abs(smallDown.scroll-small.scroll-small.height/2)<2);
  await press('d',true);const repeatedDown=await state();
  assert.ok(repeatedDown.pos>smallDown.pos,'Repeated Down advances from the prior position in the same viewport');assert.equal(repeatedDown.height,smallDown.height);assert.ok(Math.abs(repeatedDown.scroll-smallDown.scroll-smallDown.height/2)<2,'Repeated Down scrolls exactly half of that viewport away from boundary correction');
  for(let i=0;i<100;i++)await press('d',true);const end=await state();assert.equal(end.pos,end.last);assert.ok(end.y>=0&&end.bottom<=end.height+1);await press('d',true);assert.deepEqual(await state(),end);
  for(let i=0;i<100;i++)await press('u',true);assert.equal((await state()).pos,0);assert.equal((await state()).scroll,0);
  await page.keyboard.type('v');for(let i=0;i<15;i++)await press('d',true);
  const selection=await page.evaluate(()=>{const p=chatText(),{from,to}=selectedChat(p);return {anchor:chatAnchor,text:p.text.slice(from,to),bad:[...CSS.highlights.get('chat-selection')].some(r=>r.startContainer.parentElement.closest('header,button,summary'))};});
  assert.equal(selection.anchor,0);assert.ok(selection.text.includes('Body 1 row 0'));assert.equal(selection.bad,false);assert.ok(!selection.text.includes('17:12'));await page.keyboard.type('y');assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),selection.text);
  const chat=(await state()).pos;await page.locator('#edit-reply').click();await press('d');await press('u');assert.equal((await state()).pos,chat);await page.keyboard.press('Escape');await press('d',true);await press('u',true);assert.equal((await state()).pos,chat);
  await page.locator('#conversation').focus();await page.keyboard.type('/');assert.equal(await press('d'),false);assert.equal(await press('u'),false);await page.keyboard.press('Escape');
  await page.locator('#keymaps-button').click();assert.equal(await press('d'),false);assert.equal(await press('u'),false);await page.keyboard.press('Escape');
  await page.evaluate(()=>{keyConfig={...keyConfig,mappings:{...keyConfig.mappings,chatHalfDown:['<C-e>'],chatHalfUp:[]}};keyBindings=Keymaps.compile(keyConfig,keyMac);renderKeyHints();$('conversation').focus();});
  assert.equal(await press('d'),false);assert.equal(await press('u'),false);assert.equal(await press('e'),true);assert.equal(await page.evaluate(()=>mappingLabel('chatHalfDown')),'Ctrl+e');
  await page.evaluate(()=>{keyConfig=Keymaps.defaults(keyMac);keyBindings=Keymaps.compile(keyConfig,keyMac);$('navigator').focus();});assert.equal(await press('d'),true);assert.ok(await page.evaluate(()=>$('threads').contains(document.activeElement)));assert.equal(await press('u',true),true);
  await page.evaluate(()=>showPicker('threads'));await page.locator('#picker-search').focus();assert.equal(await press('d'),true);assert.equal(await press('u',true),true);assert.equal(await page.locator('#picker-search').inputValue(),'');await page.keyboard.press('Escape');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  await page.evaluate(()=>{$('entries').innerHTML='<article><header>CHROME 17:12</header><div class="markdown"><p>'+ 'Wrapped body text '.repeat(600)+'</p><p>End marker.</p></div></article>';$('conversation').focus();chatPosition=0;transcript.scrollTop=0;paintChat();});
  const wrap=await state();await press('d');assert.ok((await state()).pos>0);assert.ok(Math.abs((await state()).y-wrap.y)<30);await press('u');
  console.log('PASS halfpage: viewport relative resize/wrapped rows/cursor+scroll alignment/bounds/repeat/body-only Visual+yank/scopes/remaps/navigator+picker');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
