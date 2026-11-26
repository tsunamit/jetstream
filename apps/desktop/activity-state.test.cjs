const {test}=require('node:test'),assert=require('node:assert/strict');
const {State}=require('./activity-state.js'),Keymaps=require('./keymaps.js');
const data=threads=>({threads,captains:[],projects:[]});
const turn=(s,id,key,at=100)=>{
  s.frame(id,{event:'turn',data:{phase:'start'}},at-2);
  s.frame(id,{event:'transcript',id:'cursor-'+key,data:{id:key,source:'assistant',text:'Result '+key}},at-1);
  return s.frame(id,{event:'turn',data:{phase:'end',outcome:'settled'}},at);
};
test('groups asks before results and work; deduplicates captains and keeps crew',()=>{
  const s=new State();turn(s,'ask','a');turn(s,'done','b');
  const d=data([{id:'ask',status:'idle',ask:{key:'k'}},{id:'done',status:'idle'},{id:'work',status:'working',captain:{jamId:'cap'}},{id:'archived',needsYou:true,archived:true},{id:'owed',owed:true},{id:'cap',title:'Duplicate'}]);d.captains=[{id:'cap',title:'Actual captain',status:'working'}];
  const groups=s.groups(d);assert.deepEqual(groups.map(g=>g.map(i=>i.id)),[['ask'],['done'],['cap','work']]);assert.equal(groups[2][0].title,'Actual captain');assert.equal(groups[2][1].parentId,'cap');
});
test('idle, failed, aborted, dropped, run end and connection end never invent completion',()=>{
  const s=new State();
  for(const outcome of ['aborted','dropped',undefined]){
    s.frame('x',{event:'turn',data:{phase:'start'}});s.frame('x',{event:'transcript',data:{id:'m',source:'assistant',text:'not finished'}});s.frame('x',{event:'turn',data:{phase:'end',outcome}});
  }
  for(const event of ['run','done','connection','status'])s.frame('x',{event,data:{phase:'end',status:'idle'}});
  assert.deepEqual(s.groups(data([{id:'x',status:'idle'},{id:'failed',status:'failed'}])),[[],[],[]]);
  s.frame('x',{event:'turn',data:{phase:'end',outcome:'settled'}});assert.equal(s.finished.size,0);
});
test('settled completion requires observed committed assistant and deduplicates replay',()=>{
  const s=new State();assert.equal(turn(s,'x','m'),true);assert.equal(turn(s,'x','m',200),false);assert.equal(s.finished.get('x').at,100);
  s.frame('x',{event:'turn',data:{phase:'start'}});s.frame('x',{event:'transcript',data:{id:'partial',source:'assistant',text:'partial',partial:true}});s.frame('x',{event:'turn',data:{phase:'end',outcome:'settled'}});assert.equal(s.finished.get('x').id,'m');
  s.frame('y',{event:'turn',data:{phase:'start'}});s.frame('y',{event:'connection',data:{state:'reconnecting'}});s.frame('y',{event:'transcript',data:{id:'replay',source:'assistant',text:'replayed'}});s.frame('y',{event:'turn',data:{phase:'end',outcome:'settled'}});assert.equal(s.finished.has('y'),false);
});
test('successful replies order monitoring, not arbitrary visits or timestamps',()=>{
  const s=new State();s.sentReply('a',100);s.sentReply('b',200);
  assert.deepEqual(s.groups(data([{id:'a',status:'idle'},{id:'b',status:'working'},{id:'c',status:'working',updatedAt:'2026-11-26'},{id:'fail',status:'failed'}]),300)[2].map(i=>i.id),['b','a','c']);
  assert.equal(s.groups(data([{id:'a',status:'idle'}]),86400200)[2].length,0);
  turn(s,'a','result',300);assert.equal(s.groups(data([{id:'a',status:'idle'}]),400)[1].length,1);s.sentReply('a',500);assert.equal(s.finished.has('a'),false);
});
test('read only clears completions predating the started confirmed read',()=>{
  const s=new State();turn(s,'x','one',100);s.read('x',90);assert.equal(s.finished.size,1);s.read('x',100);assert.equal(s.finished.size,0);assert.equal(turn(s,'x','one',200),false);
  turn(s,'x','two',300);s.read('x',200);assert.equal(s.finished.size,1);
});
test('retention is bounded and archive or inaccessible contexts do not appear',()=>{
  const s=new State();for(let i=0;i<600;i++){s.sentReply('t'+i,i+1);turn(s,'t'+i,'m'+i,i+1);}
  assert.equal(s.sent.size,200);assert.equal(s.finished.size,200);assert.equal(s.delivered.size,400);assert.deepEqual(s.groups(data([])),[[],[],[]]);
  assert.deepEqual(s.groups(data([{id:'t599',archived:true,status:'working'}])),[[],[],[]]);
});
test('Space k is configurable and collision checked by existing keymap compiler',()=>{
  const config=Keymaps.defaults(false),bindings=Keymaps.compile(config,false);assert.deepEqual(bindings.find(b=>b.id==='workActivity').keys,[' ','k']);
  config.mappings.workActivity=['<leader>pf'];assert.throws(()=>Keymaps.compile(config,false),/conflict|collision|already|overlap/i);
});
