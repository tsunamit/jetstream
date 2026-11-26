const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reference-targets.js'),K=require('./keymaps.js');
test('references resolve only fixed internal routes, exact Drive copies and safe external HTTPS',()=>{
  const context={attachments:[{file:{fileId:'f1',name:'proof.png'}}],references:[{location:'captain-one',path:'renders/proof.png',version:'v1',fileId:'f1'}]};
  assert.deepEqual(R.resolve('capy://thread/jam_abc'),{kind:'thread',id:'jam_abc',label:'thread jam_abc'});
  assert.equal(R.resolve('capy://captain/c1').kind,'captain');
  assert.equal(R.resolve('capy://message/m1').kind,'message');
  assert.equal(R.resolve('drive://captain-one/renders/proof.png',context).fileId,'f1');
  assert.equal(R.resolve('drive://captain-two/renders/proof.png',context).kind,'unavailable');
  assert.equal(R.resolve('capy-file:f1',context).fileId,'f1');
  assert.equal(R.resolve('capy-file:missing',context).kind,'unavailable');
  assert.equal(R.resolve('capy://thread/../../x').kind,'unavailable');
  assert.equal(R.resolve('capy://thread/t1?command=exec').kind,'unavailable');
  for(const url of ['javascript:alert(1)','file:///etc/passwd','command:run','data:text/html,hi','https://user:token@host/path','https://host:444/path','/Users/ryan/secret','../file','http://host'])assert.equal(R.resolve(url,context),null,url);
  assert.equal(R.resolve('https://example.com/help').kind,'external');
  assert.equal(R.resolve('capy-file:missing',{attachments:{},references:null}).kind,'unavailable');
});
test('workspace mappings require exact unique identities and preserve captain types without invented codes',()=>{
  const rows=[{id:'t1',code:'JET-1'},{id:'c1',code:'JET-C1',isCaptain:true}];
  assert.equal(R.entity({kind:'code',id:'JET-1'},rows).item.id,'t1');
  assert.equal(R.entity({kind:'captain',id:'c1'},rows).item.isCaptain,true);
  assert.match(R.entity({kind:'thread',id:'c1'},rows).error,/type/);
  assert.match(R.entity({kind:'code',id:'JET-10'},rows).error,/not in/);
  assert.match(R.entity({kind:'code',id:'JET-1'},[...rows,{id:'t2',code:'JET-1'}]).error,/ambiguous/);
  assert.equal(R.entity({kind:'code',id:'JET-1'},[...rows,rows[0]]).item.id,'t1');
});
test('gd is chat scoped, configurable, unmap-able and conflicts are reported without mutating overrides',()=>{
  const config=K.defaults(true);
  assert.deepEqual(K.compile(config,true).find(row=>row.id==='chatReference').keys,['g','d']);
  config.mappings.chatReference=['go'];
  assert.deepEqual(K.compile(config,true).find(row=>row.id==='chatReference').keys,['g','o']);
  config.mappings.chatReference=[];
  assert.ok(!K.compile(config,true).some(row=>row.id==='chatReference'));
  config.mappings.chatReference=['j'];assert.throws(()=>K.compile(config,true),/conflict|already|same/i);
});
test('public live commits preserve bounded sender and Drive identities without private fields or tickets',()=>{
  const {sanitize}=require('./stream.cjs');
  const payload={id:'message',source:'assistant',text:'Delivered',sender:{id:'captain-id',relation:'captain',secret:'private'},references:[{location:'captain-one',path:'renders/proof.png',version:'v1',fileId:'f1',url:'https://signed.invalid/ticket',secret:'private'}]};
  const frame=sanitize({event:'transcript',data:JSON.stringify(payload)});
  assert.deepEqual(frame.data.sender,{id:'captain-id',relation:'captain'});
  assert.deepEqual(frame.data.references,[{location:'captain-one',path:'renders/proof.png',version:'v1',fileId:'f1'}]);
  assert.ok(!JSON.stringify(frame).includes('private'));assert.ok(!JSON.stringify(frame).includes('signed.invalid'));
  payload.references=Array.from({length:25},()=>payload.references[0]);
  const limited=sanitize({event:'transcript',data:JSON.stringify(payload)}).data;
  assert.equal(limited.references.length,20);assert.equal(limited.partial,true);
  payload.references=[{location:'ok',path:'x'.repeat(1025),version:'v1'}];
  assert.equal(sanitize({event:'transcript',data:JSON.stringify(payload)}).data.references.length,0);
});
