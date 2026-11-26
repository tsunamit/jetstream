const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reference-targets.js');
test('codes use explicit prefixes and exact mappings without deriving opaque identities',()=>{
  const rows=[{id:'jam_opaque',code:'ONE-42',projectId:'p1'},{id:'captain_opaque',code:'TWO-7',projectId:'p2',isCaptain:true}];
  const text='(ONE-42), ONE-43. TWO-7! UNKNOWN-9 and RYA-128';
  assert.deepEqual(R.tokens(text,{rows,prefixes:['ONE']}).map(t=>[t.code,t.confirmed]),[['ONE-42',true],['ONE-43',false],['TWO-7',true]]);
  assert.equal(R.entity({kind:'code',id:'ONE-42'},rows).item.id,'jam_opaque');
  assert.equal(R.entity({kind:'code',id:'TWO-7'},rows).item.isCaptain,true);
  assert.deepEqual(R.tokens(text),[]);
  assert.equal(R.tokens('ONE-42',{rows:[...rows,{id:'other',code:'ONE-42'}]})[0].confirmed,false);
  assert.match(R.entity({kind:'code',id:'ONE-42'},[...rows,{id:'other',code:'ONE-42'}]).error,/ambiguous/);
  assert.equal(R.tokens('ONE-42',{rows:[rows[0],rows[0]]})[0].confirmed,true);
});
test('boundaries exclude partial identifiers, Unicode neighbors, paths, URLs and unknown prefixes',()=>{
  const text='xONE-42 ONE-42x _ONE-42 ONE-42_suffix ONE-42-3 éONE-42 ONE-42界 https://site/ONE-42 /ONE-42 user@ONE-42 ONE-42/child https://site/?q=ONE-42 (ONE-42).';
  assert.deepEqual(R.tokens(text,{prefixes:['ONE']}).map(t=>text.slice(t.start,t.end)),['ONE-42']);
  assert.deepEqual(R.tokens('one-42 ONE-42 BAD-9',{prefixes:['one','BAD.*','ONE']} ).map(t=>t.code),['ONE-42']);
  assert.deepEqual(R.tokens('ONE-42: (ONE-43), [ONE-44]! ONE-45? custom:ONE-46',{prefixes:['ONE']}).map(t=>t.code),['ONE-42','ONE-43','ONE-44','ONE-45']);
});
test('maps and prefixes are supplied per current account snapshot, never retained globally',()=>{
  const text='ONE-42';
  assert.equal(R.tokens(text,{rows:[{id:'first',code:text}]} )[0].confirmed,true);
  assert.deepEqual(R.tokens(text,{rows:[],prefixes:[]}),[]);
  assert.equal(R.tokens(text,{prefixes:['ONE']})[0].confirmed,false);
  assert.equal(R.tokens(text,{rows:[{id:'second',code:text}]} )[0].confirmed,true);
  assert.equal(R.entity({kind:'code',id:text},[{id:'second',code:text}]).item.id,'second');
});
test('matching bounds text and token count without network work',()=>{
  assert.equal(R.tokens('ONE-42 '.repeat(2000),{prefixes:['ONE']}).length,1000);
  assert.deepEqual(R.tokens(' '.repeat(200000)+'ONE-42',{prefixes:['ONE']}),[]);
  assert.deepEqual(R.tokens(' '.repeat(199994)+'ONE-4222',{prefixes:['ONE']}),[]);
  assert.deepEqual(R.tokens('NOPE-1,'.repeat(20000)+'https://site',{prefixes:['ONE']}),[]);
});
