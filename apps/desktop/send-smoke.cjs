const {_electron}=require('./test-support.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-send-'));let app;
 try{
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof liveStream!=='undefined'&&keyReady&&!messageBusy);
  await app.evaluate(()=>{
   global.calls=[];global.connections=new Map();global.posts=[];global.rows=[];global.holdHistory=false;
   global.fetch=async(url,init)=>{
    const u=new URL(url);calls.push({path:u.pathname,method:init.method,body:init.body&&JSON.parse(init.body),last:init.headers['Last-Event-ID']});
    if(u.origin!=='https://api.capy.ai')throw Error('Wrong origin');
    if(u.pathname.endsWith('/stream')){const id=u.pathname.split('/').at(-2);let c;const body=new ReadableStream({start(v){c=v;}});connections.set(id,c);init.signal.addEventListener('abort',()=>{try{c.close();}catch{}if(connections.get(id)===c)connections.delete(id);});return new Response(body,{headers:{'Content-Type':'text/event-stream'}});}
    if(init.method==='POST')return new Promise((resolve,reject)=>posts.push({resolve,reject,body:JSON.parse(init.body)}));
    if(u.pathname.endsWith('/projects'))return Response.json({items:[{id:'p',name:'Send fixture'}]});
    if(u.pathname.endsWith('/captains'))return Response.json({items:[],cursor:null});
    if(u.pathname.endsWith('/threads'))return Response.json({items:['a','b'].map(id=>({id,projectId:'p',title:'Conversation '+id,status:'idle',hasUnreads:false})),cursor:null});
    if(u.pathname.endsWith('/messages')){if(holdHistory)await new Promise(r=>global.releaseHistory=r);return Response.json({items:[{id:'history',source:'assistant',text:'Stable history',createdAt:'2026-11-24T12:00:00Z'},...rows],cursor:null,beforeCursor:null});}
    throw Error('Unexpected route');
   };
  });
  await page.locator('#connect').click();await page.locator('#key').fill('capy_'+'x'.repeat(43));await page.locator('#save-key').click();await page.waitForFunction(()=>!demoMode&&workTree.loaded&&keyReady);
  await page.evaluate(()=>openThread(workTree.state.data.threads.find(t=>t.id==='a'),{focus:'composer'}));await page.waitForFunction(()=>liveStream.state==='streaming'&&!messageBusy);
  const push=(event,data,id)=>app.evaluate((_,v)=>connections.get('a').enqueue(new TextEncoder().encode((v.id?'id: '+v.id+'\n':'')+'event: '+v.event+'\ndata: '+JSON.stringify(v.data)+'\n\n')),{event,data,id});
  const send=text=>page.evaluate(text=>{draft.value=text;$('composer').requestSubmit($('send'));},text);
  const shot=async name=>{if(!process.argv[2])return;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const image=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible test');return(await w.capturePage()).toPNG().toString('base64');});await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(path.join(process.argv[2],name),Buffer.from(image,'base64'));};
  await send('Deferred message');await page.waitForFunction(()=>pending);
  await app.evaluate(()=>{if(posts.length!==1)throw Error('POST not started');});
  if(!process.env.SEND_REPRO)await page.waitForFunction(()=>[...document.querySelectorAll('#entries article')].some(n=>n.textContent.includes('Deferred message')&&n.textContent.includes('Sending')),null,{timeout:2000});
  await checkRows('sending'); await shot('sending.png');
  await app.evaluate(()=>{holdHistory=true;});await page.evaluate(()=>{$('refresh').click();});await app.evaluate(()=>{if(!releaseHistory)throw Error('History read not started');});
  await push('run',{phase:'start'});await push('assistant',{callId:'first',text:'Reply before POST receipt'});
  await page.waitForFunction(()=>document.querySelector('[data-preview="first"]')?.textContent.includes('Reply before POST receipt'),null,{timeout:2000});
  assert.equal(await app.evaluate(()=>posts.length),1);
  await shot('live-before-receipt.png');
  const count=async()=>app.evaluate(()=>calls.filter(c=>c.method==='POST').length);
  const streams=async()=>app.evaluate(()=>calls.filter(c=>c.path.endsWith('/stream')).length);
  const firstStreams=await streams();
  const key=await app.evaluate(()=>posts[0].body.clientKey),receiptId='01J00000000000000000000010';
  assert.equal(await app.evaluate(()=>posts[0].body.delivery),'queue');
  await page.evaluate(key=>{globalThis.duplicate=desk.send('a','Deferred message',key);},key);
  assert.equal(await count(),1,'Main coalesces duplicate IPC requests');
  assert.match(await page.evaluate(()=>changeConnection(()=>desk.setMode('mock')).then(()=>'',e=>e.message)),/active send/);
  await page.evaluate(()=>{$('composer').requestSubmit($('send'));});assert.equal(await count(),1);
  await push('transcript',{id:receiptId,clientKey:key,source:'user',text:'Deferred message',createdAt:'2026-11-24T12:01:00Z'},'01J00000000000000000000011');
  await push('assistant',{callId:'first',text:' and another fragment'});
  await push('transcript',{id:'first-reply',callId:'first',source:'assistant',text:'Delivered exact **reply**',createdAt:'2026-11-24T12:02:00Z'},'01J00000000000000000000012');
  await page.waitForFunction(()=>document.querySelector('[data-message-id="first-reply"] strong')?.textContent==='reply'&&!document.querySelector('[data-preview="first"]'));
  assert.equal(await page.locator('[data-role="user"]').count(),1,'clientKey dedupe while POST unresolved');
  await page.evaluate(()=>{draft.value='Newer typing survives';});
  await page.evaluate(()=>{$('conversation').focus();const p=chatText().text.indexOf('Deferred message');chatPosition=p+2;chatAnchor=p+6;paintChat(false);globalThis.selectedBeforeReceipt=chatText().text.slice(selectedChat(chatText()).from,selectedChat(chatText()).to);});
  await app.evaluate((_,id)=>posts[0].resolve(Response.json({id,deduped:false})),receiptId);
  await page.waitForFunction(()=>!pending);assert.equal(await page.evaluate(()=>draft.value),'Newer typing survives');
  assert.equal((await page.evaluate(()=>duplicate)).id,receiptId);
  await page.waitForFunction(()=>document.querySelector('[data-outgoing="accepted"]')?.textContent.includes('Queued'));
  assert.equal(await page.evaluate(()=>chatText().text.slice(selectedChat(chatText()).from,selectedChat(chatText()).to)),await page.evaluate(()=>selectedBeforeReceipt));
  await checkRows('accepted'); await shot('accepted.png');
  assert.equal(await streams(),firstStreams,'Healthy stream stays open across send');
  await app.evaluate((_,{key,id})=>{rows=[{id,source:'user',clientKey:key,text:'Deferred message',createdAt:'2026-11-24T12:01:00Z'},{id:'first-reply',callId:'first',source:'assistant',text:'Delivered exact **reply**',createdAt:'2026-11-24T12:02:00Z'}];holdHistory=false;releaseHistory();},{key,id:receiptId});
  await page.waitForFunction(()=>!messageBusy&&!liveStream.rendering&&!liveStream.dirty);
  assert.equal(await page.locator('[data-role="user"]').count(),1);assert.equal(await page.locator('[data-message-id="first-reply"]').count(),1);
  await push('run',{phase:'end'});await push('status',{threadId:'a',status:'idle'});await page.waitForFunction(()=>thread.status==='idle');
  await page.waitForFunction(()=>!document.querySelector('[data-id="a"] .working'));
  await send('Rejected message');await page.waitForFunction(()=>pending);await app.evaluate(()=>posts[1].resolve(new Response('',{status:400})));await page.waitForFunction(()=>!pending);
  await page.waitForFunction(()=>document.querySelector('[data-outgoing="failed"] button'));
  await checkRows('failed');
  if(process.argv[2])await page.locator('#new-output').click();
  await shot('failed-retry.png');
  assert.equal(await page.evaluate(()=>draft.value),'Rejected message');assert.equal(await count(),2);
  const retryKey=await app.evaluate(()=>posts[1].body.clientKey);
  await page.evaluate(()=>{draft.value='Keep the next draft';});await page.locator('[data-outgoing="failed"] button').click();await page.waitForFunction(()=>pending);
  assert.equal(await app.evaluate(()=>posts[2].body.clientKey),retryKey);
  await app.evaluate(()=>posts[2].reject(Error('Network uncertainty')));await page.waitForFunction(()=>!pending);
  await page.waitForFunction(()=>document.querySelector('[data-outgoing="failed"] button'));
  await page.locator('[data-outgoing="failed"] button').click();await page.waitForFunction(()=>pending);
  assert.equal(await app.evaluate(()=>posts[3].body.clientKey),retryKey);
  await app.evaluate(()=>posts[3].resolve(Response.json({id:'01J00000000000000000000013',deduped:true})));await page.waitForFunction(()=>!pending);
  assert.equal(await page.evaluate(()=>draft.value),'Keep the next draft');assert.equal(await count(),4);
  await send('Malformed receipt');await page.waitForFunction(()=>pending);await app.evaluate(()=>posts[4].resolve(Response.json({queued:true})));await page.waitForFunction(()=>!pending);
  await page.waitForFunction(()=>document.querySelector('[data-outgoing="failed"] button'));assert.equal(await page.evaluate(()=>draft.value),'Malformed receipt');
  await page.evaluate(()=>{globalThis.nav=openThread(workTree.state.data.threads.find(t=>t.id==='b'));});await page.evaluate(()=>nav);await page.waitForFunction(()=>liveStream.id==='b'&&!messageBusy);
  assert.equal(await page.locator('[data-outgoing]').count(),0,'No outgoing leak into another thread');
  await page.evaluate(()=>openThread(workTree.state.data.threads.find(t=>t.id==='a')));await page.waitForFunction(()=>liveStream.state==='streaming'&&!messageBusy);
  assert.equal(await page.evaluate(()=>draft.value),'Malformed receipt');
  await push('done',{});await page.waitForFunction(()=>liveStream.state==='complete');
  await send('Restart ended stream');await page.waitForFunction(()=>pending);await page.waitForFunction(()=>liveStream.state==='streaming');
  assert.equal(await streams(),firstStreams+3,'Navigation plus ended-stream send uses one replacement each');
  await app.evaluate(()=>posts[5].resolve(Response.json({id:'01J00000000000000000000014',deduped:false})));await page.waitForFunction(()=>!pending);assert.equal(await page.evaluate(()=>draft.value),'');
  await push('turn',{phase:'start'});await push('assistant',{callId:'dropped',text:'Discard me'});await page.waitForFunction(()=>document.querySelector('[data-preview="dropped"]'));
  await push('turn',{phase:'end',outcome:'dropped'});await push('run',{phase:'end'});await page.waitForFunction(()=>!document.querySelector('[data-preview="dropped"]'));
  await page.locator('#connection-mode').selectOption('mock');await page.waitForFunction(()=>demoMode&&!messageBusy);
  assert.equal(await page.evaluate(()=>outgoing.items.size),0,'Account/mode reload isolates pending and accepted sends');
  console.log('PASS deferred POST/history, immediate pending, live delivery/commit before HTTP, dedupe, queue/run/idle, drafts, rejection/uncertainty/same-key retry, malformed receipt, navigation, ended SSE and Mock isolation');
  async function checkRows(state) {
    const rows=await page.evaluate(state=>{
      const area=$('entries').getBoundingClientRect();
      return [...document.querySelectorAll('article[data-role]')].map(n=>{
        const r=n.getBoundingClientRect(),s=getComputedStyle(n);
        return {state:n.dataset.outgoing,role:n.dataset.role,left:r.left-area.left,width:r.width,area:area.width,border:s.borderWidth,radius:s.borderRadius,opacity:s.opacity,background:s.backgroundColor};
      });
    },state);
    assert.ok(rows.some(r=>r.state===state));
    for(const row of rows){assert.equal(row.left,0);assert.equal(row.width,row.area);assert.equal(row.border,'0px');assert.equal(row.radius,'0px');assert.equal(row.opacity,'1');}
    assert.notEqual(rows.find(r=>r.role==='user').background,rows.find(r=>r.role==='assistant').background);
  }
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
