const test=require('node:test'),assert=require('node:assert/strict');
const {ProviderSession}=require('./provider.cjs');
const {capyProvider}=require('./provider-capy.cjs');
const {memoryProvider}=require('./provider-memory.cjs');
const {demo}=require('./demo.cjs');
const Shape=require('./provider-shapes.cjs');

test('provider implementation changes require restart while provider harness files stay ignored',()=>{
  const {classify}=require('./dev-watch.cjs');
  for(const file of ['provider.cjs','provider-capy.cjs','provider-memory.cjs','provider-shapes.cjs'])assert.equal(classify(file),'restart');
  for(const file of ['provider-smoke.cjs','provider.test.cjs'])assert.equal(classify(file),null);
});

test('provider/account scopes isolate identical opaque IDs and reject late resolutions and errors',async()=>{
  const session=new ProviderSession();
  const adapter=memoryProvider({emit:()=>{}});let finish;
  adapter.messages=()=>new Promise(resolve=>{finish=resolve;});
  session.use(adapter,'account-one');const first=session.describe();
  const read=session.call('messages','t1');
  session.use(memoryProvider({emit:()=>{}}),'account-two');
  assert.notEqual(first.scope,session.scope);assert.equal(first.id,'memory');
  finish({items:[{id:'same-id',text:'old account'}]});
  await assert.rejects(read,{code:'stale'});
  const other=memoryProvider({emit:()=>{}});other.id='another';session.use(other,'account-one');
  assert.notEqual(first.scope,session.scope);
  let reject;other.models=()=>new Promise((_,fail)=>{reject=fail;});
  const models=session.call('models');session.use(adapter,'account-one');reject(Error('old transport error'));
  await assert.rejects(models,{code:'stale'});
  assert.equal(JSON.stringify(session.describe()).includes('account-one'),false);
});

test('capabilities reject unsupported calls before execution and leave runtime honest',async()=>{
  const session=new ProviderSession(),adapter=memoryProvider({emit:()=>{}});
  adapter.create=()=>assert.fail('unsupported create executed');session.use(adapter,'test');
  await assert.rejects(session.call('create',{}),{code:'unsupported'});
  await assert.rejects(session.call('context','captain','t1'),{code:'unsupported'});
  await assert.rejects(session.call('arbitrary','file'),{code:'invalid'});
  assert.equal(session.describe().capabilities.runtime.supported,false);
  assert.equal(session.describe().capabilities.modelSelection.semantics,'next-message');
  assert.equal(session.describe().capabilities.modelState.supported,false);
  assert.throws(()=>session.stream({id:'t1',token:''}),{code:'invalid'});
});

test('Capy adapter keeps offline fixture content, hierarchy, paging and accepted-local semantics',async()=>{
  const fixture=demo(),controller=new AbortController(),frames=[];
  const adapter=capyProvider({key:'',mock:true,fixture,signal:()=>controller.signal,transcriptSignal:()=>controller.signal,emit:batch=>frames.push(batch),fetcher:()=>assert.fail('demo touched HTTP')});
  const session=new ProviderSession();session.use(adapter,'demo');
  const workspace=await session.call('workspace');
  assert.equal(workspace.captains.length,2);assert.equal(workspace.threads.find(t=>t.id==='t6').parentId,'c2');
  const page=await session.call('messages','t1',{});assert.equal(page.beforeCursor,'older-messages');
  assert.deepEqual(page.items.map(i=>i.text),fixture.messages('t1',{}).items.map(i=>i.text));
  const receipt=await session.call('send','t1','test','a'.repeat(36));
  assert.equal(receipt.delivery,'local');assert.equal(receipt.accepted,true);
  assert.equal((await session.call('send','t1','test','a'.repeat(36))).deduped,true);
  await assert.rejects(session.call('models'),{code:'unsupported'});
  assert.equal(session.describe().capabilities.delivery,'local');
  await assert.rejects(session.call('receipt','t1','read','cursor:memory'),/Invalid read receipt/);
  session.stream({id:'t1',token:'sub'});assert.equal(frames[0].events[0].data.state,'mock');session.stop();
});

test('Capy normalization excludes backend schema/private metadata and does not invent states',async()=>{
  const controller=new AbortController(),calls=[];
  const adapter=capyProvider({key:'test-only',mock:false,signal:()=>controller.signal,transcriptSignal:()=>controller.signal,emit:()=>{},fetcher:async(url,init)=>{
    calls.push({url:String(url),body:init.body});
    if(String(url).endsWith('/message'))return Response.json({id:'A'.repeat(26),deduped:false,internal:'discard'});
    return Response.json({items:[{id:'t1',projectId:'p1',title:'Conversation',status:'new-provider-status',captain:{jamId:'c1'},privateSchema:'discard'}]});
  }});
  const page=await adapter.threads('p1');
  assert.deepEqual(page.items,[{id:'t1',projectId:'p1',title:'Conversation',parentId:'c1',status:'unknown'}]);
  const model={modelId:'selected',reasoningMode:'high'};
  const receipt=await adapter.send('t1','hello','retry-key',model);
  assert.deepEqual(receipt,{id:'A'.repeat(26),deduped:false,accepted:true,delivery:'queue'});
  assert.deepEqual(JSON.parse(calls.at(-1).body),{text:'hello',delivery:'queue',clientKey:'retry-key',model});
  assert.equal(new URL(calls.at(-1).url).origin,'https://api.capy.ai');
  assert.deepEqual(Shape.message({id:'opaque/message',source:'tool',text:'Summary',arguments:'secret',result:'secret',reasoning:'secret',fileURL:'secret'}),{id:'opaque/message',source:'tool',text:'Summary'});
});

test('second provider accepts non-Capy receipts/cursors and preserves stream ack backpressure',async()=>{
  const frames=[],adapter=memoryProvider({emit:batch=>frames.push(batch)}),session=new ProviderSession();session.use(adapter,'test');
  session.stream({id:'t1',token:'sub'});
  const first=frames[0];assert.equal(first.events[1].id,'cursor:message/initial');
  const receipt=await session.call('send','t1','Other provider','same-key',{modelId:'memory/model'});
  assert.equal(receipt.id,'message/1');assert.equal(frames.length,1);
  session.ack('wrong-token',first.sequence);assert.equal(frames.length,1);
  session.ack('sub',first.sequence);assert.equal(frames.length,2);
  assert.equal(frames[1].events[0].data.text,'Other provider');
  assert.equal((await session.call('send','t1','Other provider','same-key')).deduped,true);
  assert.equal((await session.call('receipt','t1','read','cursor:message/1')).hasUnreads,false);
  session.stop();
});
