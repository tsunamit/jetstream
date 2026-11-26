const test=require('node:test'),assert=require('node:assert/strict');
const {ProviderSession}=require('./provider.cjs');
const {capyProvider}=require('./provider-capy.cjs');
const {selection}=require('./workspace.cjs');
const input={requestId:'12345678-1234-1234-1234-123456789012',projectId:'p1',message:'Start this explicitly'};
const captains=[{id:'captain-entity',projectId:'p1',name:'Delivery'},{id:'other',projectId:'p2'},{id:'archived',projectId:'p1',archived:true}];
test('Captain assignment uses the exact permitted same-project catalog ID, never parent or jam inference',()=>{
  assert.equal(selection({...input,captainId:'captain-entity'},[{id:'p1'}],[],captains).captainId,'captain-entity');
  for(const captainId of ['other','archived','jam_inferred','missing'])assert.throws(()=>selection({...input,captainId},[{id:'p1'}],[],captains),/Captain/);
  assert.equal('captainId' in selection(input,[{id:'p1'}],[],captains),false);
});
test('creation catalog exhausts Captains, excludes inaccessible projects and archives, then creates atomically',async()=>{
  const calls=[],controller=new AbortController();
  const provider=capyProvider({key:'fixture',mock:false,signal:()=>controller.signal,transcriptSignal:()=>controller.signal,emit:()=>{},fetcher:async(url,init)=>{
    const u=new URL(url);calls.push({path:u.pathname,method:init.method,body:init.body&&JSON.parse(init.body)});
    if(u.pathname.endsWith('/projects'))return Response.json({items:[{id:'p1',name:'One',privateField:'not exposed'}]});
    if(u.pathname.endsWith('/models'))return Response.json({items:[{id:'m',name:'Model',reasoningModes:['high'],fast:true}],default:{modelId:'m'}});
    if(u.pathname.endsWith('/captains'))return Response.json({items:u.searchParams.has('cursor')?captains.slice(1):captains.slice(0,1),cursor:u.searchParams.has('cursor')?null:'next'});
    if(u.pathname.endsWith('/threads'))return Response.json({_tag:'capy/CrewRefused',message:'private reason'}, {status:409});
    assert.fail('Unexpected mutation '+url);
  }});
  const catalog=await provider.creationOptions();
  assert.deepEqual(catalog.projects,[{id:'p1',name:'One'}]);
  assert.deepEqual(catalog.captains,[{id:'captain-entity',projectId:'p1',name:'Delivery'}]);
  await assert.rejects(provider.create({...input,captainId:'captain-entity'}),e=>e.message==='Captain access refused.');
  assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body),[{...input,captainId:'captain-entity'}]);
  assert.equal(calls.some(c=>c.path.includes('/crew')),false);
  const posts=calls.filter(c=>c.method==='POST').length;
  await assert.rejects(provider.create({...input,captainId:'other'}),/Captain/);
  assert.equal(calls.filter(c=>c.method==='POST').length,posts);
});
test('supported creation does not imply optional model, Captain or machine-size support',async()=>{
  const session=new ProviderSession();let mutations=0;
  session.use({id:'minimal',capabilities:{create:{supported:true},hierarchy:{supported:true}},create:async()=>{mutations++;return {id:'opaque'};},creationOptions:async()=>({projects:[{id:'workspace',name:'Workspace'}],models:[],captains:[]})},'fixture');
  for(const field of [{model:{modelId:'m'}},{captainId:'captain'},{machineSize:'large'}])await assert.rejects(session.call('create',{...input,...field}),{code:'unsupported'});
  assert.equal(mutations,0);assert.equal((await session.call('create',input)).id,'opaque');
});
