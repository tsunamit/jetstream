const test=require('node:test'),assert=require('node:assert/strict');
const {selection,runtime}=require('./conversation-settings.js');
const {api}=require('./api.cjs');
const Keymaps=require('./keymaps.js');
const models=[{id:'m1',reasoningModes:['low','high'],fast:true,pro:false,ultrafast:false},{id:'m2',reasoningModes:[],fast:false,pro:true,ultrafast:false}];
test('catalog constrains selection and returns an immutable send snapshot',()=>{
  assert.equal(selection(undefined,models),undefined);
  const value={modelId:'m1',reasoningMode:'high',modes:{fast:true}},snapshot=selection(value,models);
  value.modes.fast=false;assert.equal(snapshot.modes.fast,true);
  for(const invalid of [{modelId:'gone'},{modelId:'m1',reasoningMode:'max'},{modelId:'m2',reasoningMode:'high'},{modelId:'m1',modes:{pro:true}},{modelId:'m1',modes:{daybreak:true}},{modelId:'m1',modes:{fast:'true'}}])assert.throws(()=>selection(invalid,models));
  assert.deepEqual(selection({modelId:'m2',modes:{pro:true}},models),{modelId:'m2',modes:{pro:true}});
});
test('undocumented host-looking metadata never becomes an execution claim',()=>{
  for(const fake of [{machine:'cloud'},{device:{name:'Mac'}},{machineId:'machine_1'},null])assert.match(runtime(fake),/Agent host: unknown.*API/);
});
test('model changes only travel with an explicit queued message',async()=>{
  const calls=[];const client=api('fixture',async(url,init)=>{calls.push([url.pathname,JSON.parse(init.body)]);return Response.json({});});
  const model={modelId:'m1',reasoningMode:'high',modes:{fast:true}};
  await client.send('t1','hello','same-key',model);
  assert.deepEqual(calls,[['/api/v1/threads/t1/message',{text:'hello',delivery:'queue',clientKey:'same-key',model}]]);
});
test('model command follows the leader, supports remapping/unmapping and reports conflicts',()=>{
  const config={...Keymaps.defaults(true),leader:',',mappings:{conversationModel:['<leader>ms']}};
  assert.deepEqual(Keymaps.compile(config,true).find(b=>b.id==='conversationModel').keys,[',','m','s']);
  assert.equal(Keymaps.compile({...config,mappings:{conversationModel:[]}},true).some(b=>b.id==='conversationModel'),false);
  const conflict={...Keymaps.defaults(true),mappings:{reply:['<leader>tm']}};
  assert.throws(()=>Keymaps.migrate(conflict,true),e=>e.config===conflict&&/repair/.test(e.message));
});
test('model rejection has actionable feedback without echoing private server text',async()=>{
  const client=api('fixture',async()=>Response.json({_tag:'ModelSelection.Rejected',message:'private diagnostic'},{status:400}));
  await assert.rejects(client.send('t1','hello','same-key',{modelId:'m1'}),{message:'Selected model was rejected. Reload models and choose again. Your draft and next-message choice are preserved.'});
});
