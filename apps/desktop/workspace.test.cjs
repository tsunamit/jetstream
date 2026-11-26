const test=require('node:test');
const assert=require('node:assert/strict');
const {api}=require('./api.cjs');
const {workspace,pages,selection,scope,sizes}=require('./workspace.cjs');
const Tree=require('./sidebar-state.js');
const Keymaps=require('./keymaps.js');
const projects=[{id:'p',name:'Project'}];
const models=[{id:'m1',reasoningModes:['low','high'],fast:true,pro:false,ultrafast:false},{id:'m2',reasoningModes:['none','max'],fast:false,pro:true,ultrafast:true}];
const input={projectId:'p',requestId:'12345678-1234-1234-1234-123456789012',message:' hello '};
test('all documented public collections, captain IDs and create contract stay fixed-origin',async()=>{
  const calls=[];
  const client=api('fixture',async(url,init)=>{calls.push({url:url.href,init});return Response.json({});});
  await client.captains('next+page');await client.captain('captain-id');await client.models();await client.create(input);
  assert.deepEqual(calls.map(c=>c.url),['https://api.capy.ai/api/v1/captains?limit=30&cursor=next%2Bpage','https://api.capy.ai/api/v1/captains/captain-id','https://api.capy.ai/api/v1/models','https://api.capy.ai/api/v1/threads']);
  assert.deepEqual(JSON.parse(calls[3].init.body),input);
  assert.throws(()=>client.captain('../private'),/Invalid/);
});
test('workspace exhausts every project and captain page and uses jamId relationships',async()=>{
  const client={projects:async()=>({items:[...projects,{id:'other'}]}),captains:async c=>({items:[{id:c?'c2':'c',projectId:'p'}],cursor:c?null:'next'}),threads:async(p,c)=>({items:[{id:p+(c?'2':'1'),projectId:p,captain:{jamId:'c'}}],cursor:c?null:'next'})};
  const result=await workspace(client);
  assert.equal(result.threads.length,4);assert.equal(result.captains.length,2);assert.equal(result.threads[0].parentId,'c');
  await assert.rejects(pages(async()=>({items:[],cursor:'repeat'})),/Repeated/);
});
test('creation validates catalog reasoning, every size and advertised mode without arbitrary passthrough',()=>{
  assert.deepEqual(selection(input,projects,models),{...input,message:'hello'});
  for(const machineSize of sizes)assert.equal(selection({...input,machineSize},projects,models).machineSize,machineSize);
  for(const m of models)for(const reasoningMode of m.reasoningModes){
    const modes=Object.fromEntries(['fast','pro','ultrafast'].filter(k=>m[k]).map(k=>[k,true]));
    const model={modelId:m.id,reasoningMode,modes};
    assert.deepEqual(selection({...input,model},projects,models).model,model);
  }
  for(const invalid of [{message:''},{projectId:'gone'},{machineSize:'huge'},{requestId:'bad'},{device:{deviceId:'unknown'}},{environmentVariables:[]},{model:{modelId:'gone'}},{model:{modelId:'m1',reasoningMode:'max'}},{model:{modelId:'m1',modes:{pro:true}}},{model:{modelId:'m1',modes:{daybreak:true}}}])assert.throws(()=>selection({...input,...invalid},projects,models));
  assert.equal(scope('same-key',false),scope('same-key',false));assert.notEqual(scope('other-key',false),scope('same-key',false));
});
test('safe known creation errors never echo server payload text',async()=>{
  const client=api('fixture',async()=>Response.json({_tag:'ModelSelection.Rejected',message:'secret body'}, {status:400}));
  await assert.rejects(client.create(input),e=>e.message.includes('Selected model')&&!e.message.includes('secret'));
});
test('sidebar config is declarative, bounded and preserves safe defaults independently',()=>{
  const c=Tree.config({sections:['captains','threads'],expanded:['c'],createDefaults:{p:{modelId:'m1',reasoningMode:'high',modes:{fast:true}}}});
  assert.deepEqual(c.sections,['captains','threads']);assert.equal(c.sort,'recent');
  for(const invalid of [{version:2},{sort:'script'},{expanded:['x'.repeat(200)]},{sections:['threads','threads']},{createDefaults:{p:{prompt:'private'}}},{createDefaults:{p:{modes:{daybreak:true}}}},{secret:'no'}])assert.throws(()=>Tree.config(invalid));
});
test('new-thread mapping inherits leader, unmaps and rejects existing prefix conflicts without mutation',()=>{
  const custom={...Keymaps.defaults(true),leader:',',mappings:{newThread:['<leader>zn']}};
  assert.ok(Keymaps.compile(custom,true).some(b=>b.id==='newThread'&&b.keys.join('')===',zn'));
  assert.equal(Keymaps.compile({...custom,mappings:{newThread:[]}},true).some(b=>b.id==='newThread'),false);
  const conflict={...Keymaps.defaults(true),mappings:{threads:['<leader>t']}};
  const before=JSON.stringify(conflict);assert.throws(()=>Keymaps.migrate(conflict,true),/conflict|prefix|Prefix|ambig/i);assert.equal(JSON.stringify(conflict),before);
});
test('tree hierarchy, sorting, project/status/archive filters, section order and observed outcome only',()=>{
  const state=new Tree.State(),config=Tree.defaults();
  const data={projects,threads:[{id:'run',projectId:'p',title:'Zebra',status:'working',updatedAt:'2026-11-20'},{id:'child',parentId:'c',projectId:'p',title:'Alpha',status:'waiting',needsYou:true},{id:'old',projectId:'p',status:'archived'},{id:'else',projectId:'other',status:'failed'}],captains:[{id:'c',title:'Captain',projectId:'p',isCaptain:true,status:'idle'}],activity:[]};
  state.accept(data,1000);assert.equal(state.finished.size,0);
  assert.deepEqual(state.rows(config,'p').filter(r=>r.item).map(r=>r.item.id),['run','c']);
  config.expanded=['c'];assert.deepEqual(state.rows(config,'p').filter(r=>r.item).map(r=>r.item.id),['run','c','child']);
  config.status='needs-you';assert.deepEqual(state.rows(config,'p').filter(r=>r.item).map(r=>r.item.id),['c','child']);
  config.status='all';config.project='all';config.archive=true;config.mode='activity';config.sort='name';
  assert.ok(state.rows(config,'p').some(r=>r.item.id==='old'));
  const next={...data,threads:data.threads.map(t=>t.id==='run'?{...t,status:'idle'}:t)};state.accept(next,2000);
  assert.equal(state.rows(config,'p',3000).find(r=>r.item.id==='run').finished,true);
  state.fail(Error('offline'));assert.equal(state.stale,true);assert.equal(state.data.threads[0].status,'idle');assert.equal(state.error,'offline');
  assert.equal(state.rows(config,'p',123000).find(r=>r.item.id==='run').finished,false);
  config.text='Alpha';assert.deepEqual(state.rows(config,'p').map(r=>r.item.id),['child']);
  const disconnected=new Tree.State();disconnected.accept(data,1000);disconnected.fail(Error('offline'));disconnected.accept(next,2000);assert.equal(disconnected.finished.size,0);
});
