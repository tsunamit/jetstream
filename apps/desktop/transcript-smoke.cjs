const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-transcript-'));let app;
 try{
  app=await _electron.launch({args:['.','--live','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
  const page=await app.firstWindow();
  async function shot(name){const out=process.argv[2];if(!out)return;await fs.mkdir(out,{recursive:true});await page.evaluate(()=>{transcript.scrollTop=transcript.scrollHeight;return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible test window');return(await w.capturePage()).toPNG().toString('base64');});await fs.writeFile(path.join(out,name),Buffer.from(png,'base64'));}
  await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady);
  await app.evaluate(()=>{
   global.messageCalls=[];global.failPage=null;global.delayPage=null;global.repeated=false;global.extra=false;global.invalid=false;
   global.fetch=async(url)=>{
    const u=new URL(url),json=value=>Response.json(value);
    if(u.pathname.endsWith('/projects'))return json({items:[{id:'p',name:'Fixture'}]});
    if(u.pathname.endsWith('/captains'))return json({items:[],cursor:null});
    if(u.pathname.endsWith('/threads'))return json({items:[{id:'t1',projectId:'p',title:'Multi-turn history',status:'idle'},{id:'t2',projectId:'p',title:'Other thread',status:'idle'}],cursor:null});
    if(u.pathname.endsWith('/messages')){
     const id=u.pathname.split('/').at(-2),after=u.searchParams.get('after'),before=u.searchParams.get('before'),n=Number(after||0);
     global.messageCalls.push({id,after,before});
     if(global.delayPage===n)await new Promise(r=>setTimeout(r,250));
     if(global.failPage===n)return new Response('',{status:503});
     const item=(id,text,source='assistant')=>({id,text,source,createdAt:'2026-11-23T08:00:00Z'});
     if(id==='t2')return json({items:[item('other','Other conversation')],cursor:null,beforeCursor:null});
     if(before)return json({items:[item('old','Earlier context'),item('u1','Opening question','user')],cursor:null,beforeCursor:null});
     const items=n===0?[item('u1','Opening question','user'),item('a1','First answer'),...Array.from({length:28},(_,i)=>item('tool'+i,'','tool'))]:n===5?[item('u2','Second question','user'),item('a2','Second answer')]:n===6?[item('u3','Third question','user'),item('a3','Third answer'),...(global.extra?[item('a4','Newly committed update')]:[])]:[];
     return json({items,cursor:global.invalid?42:global.repeated?after||'1':n<6?String(n+1):null,beforeCursor:n===0?'older':String(n)});
    }
    throw Error('Unexpected fixture route');
   };
  });
  await page.locator('#connect').click();await page.locator('#key').fill('capy_'+'x'.repeat(43));await page.locator('#key-form').evaluate(f=>f.requestSubmit(document.getElementById('save-key')));
  await page.waitForFunction(()=>!navigating&&workTree.loaded);
  await app.evaluate(()=>{global.failPage=6;});
  await page.locator('#threads [data-id="t1"]').click();await page.waitForFunction(()=>!navigating&&!messageBusy);
  assert.equal(await page.locator('#entries article').count(),2);
  assert.ok((await app.evaluate(()=>global.messageCalls)).length>=5);
  assert.equal(await page.locator('#newer').isVisible(),true);
  await shot('continuation.png');
  await page.waitForFunction(()=>messageRetries===1&&!messageBusy);
  assert.equal(await page.locator('#entries article').count(),2);
  assert.match(await page.locator('#message-health').innerText(),/failed/);
  await app.evaluate(()=>{global.failPage=null;});
  await page.waitForFunction(()=>!messageBusy&&messageState.next===null&&messageState.items.some(i=>i.id==='a3'));
  assert.deepEqual(await page.locator('#entries article').evaluateAll(nodes=>nodes.map(n=>n.dataset.messageId)),['u1','a1','u2','a2','u3','a3']);
  await page.evaluate(()=>{pane='conversation';chatPosition=chatText().text.indexOf('Second answer');chatAnchor=chatPosition+3;paintChat(false);const p=chatText(),s=selectedChat(p);globalThis.selectedBefore=p.text.slice(s.from,s.to);});
  await page.locator('#earlier').click();await page.waitForFunction(()=>!messageBusy);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.equal(await page.evaluate(()=>{const p=chatText(),s=selectedChat(p);return p.text.slice(s.from,s.to);}),await page.evaluate(()=>selectedBefore));
  assert.equal(await page.locator('#entries article').first().getAttribute('data-message-id'),'old');
  await app.evaluate(()=>{global.extra=true;});
  await page.setViewportSize({width:1000,height:650});
  await page.evaluate(()=>{transcript.scrollTop=20;});
  const scroll=await page.evaluate(()=>transcript.scrollTop);
  await page.locator('#refresh').click();await page.waitForFunction(()=>!messageBusy);
  assert.equal(await page.evaluate(()=>transcript.scrollTop),scroll);
  assert.equal(await page.locator('#entries article').count(),8);
  assert.equal(await page.locator('#earlier').isVisible(),false);
  const prior=await page.locator('#entries').innerText();
  await app.evaluate(()=>{global.failPage=6;});await page.locator('#refresh').click();await page.waitForFunction(()=>!messageBusy);
  assert.equal(await page.locator('#entries').innerText(),prior);assert.match(await page.locator('#message-health').innerText(),/failed/);
  await app.evaluate(()=>{global.failPage=null;global.invalid=true;});await page.locator('#refresh').click();await page.waitForFunction(()=>!messageBusy);
  assert.equal(await page.locator('#entries').innerText(),prior);assert.match(await page.locator('#notice').innerText(),/Invalid transcript page/);
  await app.evaluate(()=>{global.invalid=false;});
  await app.evaluate(()=>{global.failPage=null;global.repeated=true;});await page.locator('#refresh').click();await page.waitForFunction(()=>!messageBusy);
  assert.match(await page.locator('#message-health').innerText(),/unchanged/);assert.equal(await page.locator('#newer').isVisible(),true);
  await app.evaluate(()=>{global.repeated=false;global.delayPage=6;});
  await page.locator('#refresh').click();await page.locator('#threads [data-id="t2"]').click();await page.waitForFunction(()=>!navigating&&!messageBusy);await page.waitForTimeout(300);
  assert.equal(await page.locator('#entries article').count(),1);assert.match(await page.locator('#entries').innerText(),/Other conversation/);
  await page.locator('#back').click();await page.waitForFunction(()=>!navigating&&!messageBusy);
  assert.equal(await page.locator('#entries article').count(),8);
  await page.setViewportSize({width:1400,height:950});await shot('transcript.png');
  console.log('PASS hidden multi-turn DOM: automatic sparse continuation and retry, bounded batches, overlap, refresh, selection, repeated cursor, stale response and history');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
