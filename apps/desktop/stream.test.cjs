const {test} = require('node:test');
const assert = require('node:assert/strict');
const {SSE,sanitize,Streams,retryAfter} = require('./stream.cjs');
const {Record} = require('./stream-state.js');
const eventId = '01J00000000000000000000000';
const wire = (event,data,id) => (id?'id: '+id+'\n':'')+'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n';
test('live delivery commits render without guessing replay order or advancing HTTP ownership',()=>{
  const record=new Record(),history=[{id:'old',source:'assistant',text:'Old history'}];
  record.accept({event:'transcript',data:{id:'replay',source:'assistant',text:'Disjoint replay'}});
  assert.equal(record.unplaced(history),true);assert.deepEqual(record.visible(history),history);
  record.accept({event:'assistant',data:{callId:'delivery',text:'Preview'}});
  record.accept({event:'transcript',id:eventId,data:{id:'new',callId:'delivery',source:'assistant',text:'Committed exact text'}});
  assert.deepEqual(record.merge(history),history);
  assert.deepEqual(record.visible(history).map(i=>i.id),['old','new']);assert.equal(record.visible(history)[1].liveDelivery,true);
  assert.equal(history.length,1,'Live projection must not mutate HTTP-owned items');
  assert.equal(record.live.size,0);assert.equal(record.cursors.get('new'),eventId);
  const hydrated=[...history,{id:'replay',source:'assistant',text:'Disjoint replay'},{id:'new',callId:'delivery',source:'assistant',text:'Committed exact text'}];
  assert.equal(record.unplaced(hydrated),false);assert.equal(record.visible(hydrated).filter(i=>i.id==='new').length,1);
  assert.equal(sanitize({event:'transcript',data:JSON.stringify({id:'own',source:'user',text:'Hi',clientKey:'retry-key'})}).data.clientKey,'retry-key');
});
const response = text => new Response(text,{headers:{'Content-Type':'text/event-stream'}});
test('SSE handles every partial boundary, multiline, CRLF, comments, ids and retry',()=>{
  const text=': keepalive\r\nretry: 2345\r\n\r\nid: '+eventId+'\r\nevent: transcript\r\ndata: {"text":\r\ndata: "hello 🦦"}\r\n\r\n';
  for(let split=0;split<text.length;split++){
    const frames=[],parser=new SSE(f=>frames.push(f));parser.push(text.slice(0,split));parser.push(text.slice(split));
    assert.equal(frames[0].retry,2345);assert.equal(frames[1].id,eventId);assert.equal(JSON.parse(frames[1].data).text,'hello 🦦');
  }
  assert.throws(()=>new SSE(()=>{}).push('data: '+'x'.repeat(524289)),/limit/);
});
test('public event whitelist strips arguments, results, reasoning, URLs and errors',()=>{
  assert.equal(sanitize({event:'reasoning',data:'bad'}),null);
  const tool=sanitize({event:'tool_call',data:JSON.stringify({callId:'tool-1',name:'bash',text:'Checking',arguments:{key:'secret'},result:'private'})});
  assert.deepEqual(tool.data,{callId:'tool-1',name:'bash',text:'Checking'});
  const item=sanitize({event:'transcript',id:eventId,data:JSON.stringify({id:'tool-1',source:'tool',text:'Done',reasoning:'hidden',url:'https://signed.secret',arguments:'hidden'})});
  assert.equal(item.id,eventId);assert.ok(!JSON.stringify(item).includes('hidden'));assert.ok(!JSON.stringify(item).includes('signed'));
  assert.deepEqual(sanitize({event:'error',data:'{"code":"forbidden","message":"secret"}'}).data,{code:'forbidden'});
  assert.equal(sanitize({event:'transcript',id:'tool-1',data:'{"id":"tool-1","source":"tool","text":"ok"}'}).id,undefined);
});
test('previews reconcile by delivery call, tools by id; dropped, aborted and run end never invent commits',()=>{
  const r=new Record(),frame=(event,data)=>r.accept({event,data});
  frame('turn',{phase:'start'});frame('assistant',{callId:'a',text:'hello '});frame('assistant',{callId:'a',text:'world'});
  assert.equal(r.live.get('a').text,'hello world');
  frame('transcript',{id:'committed',callId:'a',source:'assistant',text:'Authoritative'});
  frame('assistant',{callId:'a',text:'duplicate'});assert.equal(r.live.size,0);
  frame('tool_call',{callId:'tool',text:'Checking'});frame('transcript',{id:'tool',source:'tool',text:'Checked'});assert.equal(r.live.size,0);
  assert.equal(r.merge([{id:'committed',text:'Old'}]).length,2);
  for(const outcome of ['dropped','aborted']) {frame('turn',{phase:'start'});frame('assistant',{callId:outcome,text:'not committed'});frame('turn',{phase:'end',outcome});assert.equal(r.live.size,0);}
  frame('assistant',{callId:'never',text:'Preview'});frame('run',{phase:'end'});assert.equal(r.live.size,0);assert.equal(r.committed.size,2);
  frame('assistant',{callId:'huge',text:'x'.repeat(200001)});assert.equal(r.live.size,0);assert.equal(r.overflow,true);
});
test('EOF resumes only acknowledged transcript cursor; fixed origin headers, retry and done',async()=>{
  const calls=[],waits=[],events=[];let manager;
  manager=new Streams({random:()=>0,wait:async ms=>waits.push(ms),emit:b=>{events.push(...b.events);manager.ack(b.token,b.sequence);},fetcher:async(url,init)=>{
    calls.push({url:String(url),init});
    if(calls.length===1)return response('retry: 2500\n\n'+wire('transcript',{id:'committed',source:'assistant',text:'Record'},eventId));
    return response(wire('done',{}));
  }});
  manager.start({id:'threadA',token:'tokenA',scope:'accountA',key:'fixture'});await manager.active.promise;
  assert.equal(calls.length,2);assert.equal(waits[0],2500);
  assert.equal(calls[1].init.headers['Last-Event-ID'],eventId);assert.equal(calls[0].init.redirect,'error');
  assert.equal(calls[0].url,'https://api.capy.ai/api/v1/threads/threadA/stream?frames=subagent');
  assert.ok(events.some(f=>f.event==='reset'));assert.ok(events.some(f=>f.event==='connection'&&f.data.state==='complete'));manager.stop();
});
test('429/503 honor Retry-After, 401/403 and revocation stop until explicit recovery',async()=>{
  for(const status of [429,503]) {
    let n=0,m;const waits=[];
    m=new Streams({wait:async ms=>waits.push(ms),random:()=>0,emit:b=>m.ack(b.token,b.sequence),fetcher:async()=>++n===1?new Response('',{status,headers:{'Retry-After':'17'}}):response(wire('done',{}))});
    m.start({id:'t',token:'token',scope:'account',key:'fixture'});await m.active.promise;assert.equal(waits[0],17000);m.stop();
  }
  for(const status of [401,'revoked']) {
    let n=0,m;const states=[];
    m=new Streams({wait:async()=>{throw Error('No retry allowed');},emit:b=>{states.push(...b.events);m.ack(b.token,b.sequence);},fetcher:async()=>{n++;return status==='revoked'?response(wire('error',{code:'unauthorized',message:'Do not expose'})):new Response('',{status});}});
    m.start({id:'t',token:'token',scope:'account',key:'fixture'});await m.active.promise;
    m.start({id:'other',token:'other',scope:'account',key:'fixture'});assert.equal(n,1);assert.ok(states.some(f=>f.data.state==='access'));m.stop();
  }
  assert.equal(retryAfter('3'),3000);assert.equal(retryAfter(new Date(20000).toUTCString(),10000),10000);
  assert.equal(retryAfter('7200'),7200000);
});
test('forbidden is destination scoped; oversized committed frames stop replay and use history fallback',async()=>{
  let n=0,m;const states=[];
  m=new Streams({emit:b=>{states.push(...b.events);m.ack(b.token,b.sequence);},fetcher:async()=>++n===1?new Response('',{status:403}):response(wire('done',{}))});
  m.start({id:'a',token:'one',scope:'account',key:'fixture'});await m.active.promise;
  m.start({id:'b',token:'two',scope:'account',key:'fixture'});await m.active.promise;assert.equal(n,2);m.stop();
  n=0;
  m=new Streams({emit:b=>{states.push(...b.events);m.ack(b.token,b.sequence);},fetcher:async()=>{n++;return response(wire('transcript',{id:'huge',source:'assistant',text:'x'.repeat(600000)},eventId));},wait:async()=>{throw Error('Must not retry poison frame');}});
  m.start({id:'huge',token:'huge',scope:'account',key:'fixture'});await m.active.promise;
  assert.ok(states.some(f=>f.data.state==='limited'));assert.equal(n,1);assert.equal(m.cursors.size,0);
  m.start({id:'huge',token:'again',scope:'account',key:'fixture'});assert.equal(n,1);m.stop();
});
test('replay merges older-before-overlap, retains complete HTTP records and bounds retained history',()=>{
  const r=new Record();
  r.accept({event:'transcript',id:eventId,data:{id:'older',source:'assistant',text:'older'}});
  r.accept({event:'transcript',id:eventId,data:{id:'latest',source:'assistant',text:'partial',partial:true,attachments:[]}});
  const full={id:'latest',source:'assistant',text:'complete',attachments:Array.from({length:21},(_,i)=>({file:{fileId:'f'+i}}))};
  assert.deepEqual(r.merge([full]).map(i=>i.id),['older','latest']);assert.equal(r.merge([full])[1].attachments.length,21);
  assert.equal(r.cursors.get('older'),eventId);
  for(let i=0;i<3100;i++)r.accept({event:'transcript',data:{id:'id'+i,source:'tool',text:'Summary'}});
  assert.equal(r.committed.size,3000);assert.equal(r.historyLimited,true);assert.ok(r.bytes<=6000000);
  const separate=new Record();separate.accept({event:'transcript',data:{id:'older',source:'assistant',text:'older',createdAt:'2026-11-24T12:00:00Z'}});
  const newer={id:'newer',source:'assistant',text:'newer',createdAt:'2026-11-24T12:00:00Z'};
  assert.deepEqual(separate.merge([newer]).map(i=>i.id),['newer']);
  separate.accept({event:'transcript',data:newer});assert.deepEqual(separate.merge([newer]).map(i=>i.id),['older','newer']);
  const resumed=new Record();resumed.accept({event:'boundary',data:{messageId:'old'}});resumed.accept({event:'transcript',data:{id:'new',source:'assistant',text:'new'}});
  assert.deepEqual(resumed.merge([{id:'old',source:'assistant',text:'old'}]).map(i=>i.id),['old','new']);
});
test('bounded one subscription, scope cursor isolation, cancellation, stall and Mock zero network',async()=>{
  let calls=0,m;const events=[];
  m=new Streams({stall:25,wait:async()=>{m.stop();},emit:b=>{events.push(b);m.ack(b.token,b.sequence);},fetcher:async(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true}));}});
  m.start({id:'a',token:'one',scope:'account',key:'fixture'});const first=m.active.promise;
  m.start({id:'b',token:'two',scope:'account',key:'fixture'});const second=m.active.promise;
  await Promise.all([first,second]);assert.equal(calls,2);assert.ok(events.some(b=>b.token==='two'&&b.events.some(f=>f.data.state==='reconnecting')));
  m.start({id:'a',token:'mock',scope:'demo',mock:true});assert.equal(calls,2);m.stop();
  assert.throws(()=>m.start({id:'../unsafe',token:'x',scope:'scope',key:'fixture'}),/Invalid/);
});
test('cursor advances only on matching ack; pending IPC bytes and account scopes stay bounded',async()=>{
  const batches=[],calls=[];
  const m=new Streams({emit:b=>batches.push(b),fetcher:async(_url,init)=>{calls.push(init.headers);return response(wire('transcript',{id:'message',source:'assistant',text:'Committed'},eventId)+wire('done',{}));}});
  m.start({id:'a',token:'one',scope:'accountA',key:'fixture'});await m.active.promise;
  assert.equal(m.cursors.size,0);m.ack('stale',batches.at(-1).sequence);assert.equal(m.cursors.size,0);
  m.ack('one',batches.at(-1).sequence);assert.equal(m.cursors.get('accountA:a').cursor,eventId);
  m.start({id:'a',token:'two',scope:'accountB',key:'other'});await m.active.promise;assert.equal(calls[1]['Last-Event-ID'],undefined);m.stop();
  m.start({id:'a',token:'mock',scope:'demo',mock:true});
  for(let i=0;i<10;i++)m.queue(m.active,{event:'assistant',data:{callId:'large',text:'🦦'.repeat(100000)}});
  assert.ok(m.active.bytes<=1048576);assert.ok(m.active.queue.some(f=>f.event==='reset'));m.stop();
});
