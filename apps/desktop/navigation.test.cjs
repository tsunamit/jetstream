const {test}=require('node:test');
const assert=require('node:assert/strict');
const N=require('./navigation.js'),K=require('./keymaps.js');
test('list action contract clamps repeated motions and uses actual viewport geometry',()=>{
 let current=-1,count=40,height=200,scroll=0,find=0;
 const rows=()=>Array.from({length:count},(_,i)=>({getBoundingClientRect:()=>({top:i*20-scroll})}));
 const host={get clientHeight(){return height;},get scrollTop(){return scroll;},set scrollTop(v){scroll=Math.max(0,v);},getBoundingClientRect:()=>({top:0,bottom:height})};
 const controller=N.list({rows,index:()=>current,select:i=>{current=i;},viewport:()=>host,find:()=>find++});
 controller.perform('Next');assert.equal(current,0);
 for(let i=0;i<100;i++)controller.perform('Next');assert.equal(current,39);
 controller.perform('First');assert.equal(current,0);scroll=0;
 controller.perform('HalfDown');assert.equal(current,5);assert.equal(scroll,100);
 controller.perform('HalfUp');assert.equal(current,0);assert.equal(scroll,0);
 height=400;controller.perform('PageDown');assert.equal(current,20);assert.equal(scroll,400);
 controller.perform('Find');assert.equal(find,1);assert.ok(!controller.capabilities.includes('Collapse'));
 controller.perform('Collapse');controller.perform('Last');assert.equal(current,39);
 count=0;current=-1;controller.perform('Next');controller.perform('PageUp');controller.perform('Last');assert.equal(current,-1);
});
test('surface defaults share motions without reserving query typing or editor ownership',()=>{
 const bindings=K.compile(K.defaults(true),true);
 for(const scope of ['navigator','chat','pickerBrowse'])for(const key of ['gg','G','<C-d>','<C-u>','<C-f>','<C-b>','/'])assert.ok(bindings.some(b=>K.activeScopes(scope).includes(b.scope)&&b.notation===key),scope+' '+key);
 for(const key of ['j','k','g','/','i'])assert.ok(!bindings.some(b=>K.activeScopes('picker').includes(b.scope)&&b.keys[0]===key));
 assert.ok(!K.activeScopes('composerNormal').includes('chat'));
 assert.throws(()=>K.compile({...K.defaults(true),mappings:{pickerBrowseNext:['<Down>']}},true),/conflicts/);
 const saved={...K.defaults(true),mappings:{navigatorFirst:[],pickerBrowseFind:['f'],navigatorExpand:['e']}};
 assert.equal(K.migrate(saved,true),saved);
 assert.ok(!K.compile(saved,true).some(b=>b.id==='navigatorFirst'));
 assert.throws(()=>K.migrate({...K.defaults(true),mappings:{reply:['gg']}},true),/repair/);
});
test('chunk movement respects a clipped parent viewport',()=>{
 let selected=0,scroll=0;
 const host={scrollTop:0,getBoundingClientRect:()=>({top:0,bottom:300})};
 const rows=Array.from({length:30},(_,i)=>({getBoundingClientRect:()=>({top:i*20-scroll})}));
 const controller=N.list({rows:()=>rows,index:()=>selected,select:i=>selected=i,viewport:()=>host,visible:()=>({top:0,bottom:120})});
 controller.perform('HalfDown');assert.equal(selected,3);assert.equal(host.scrollTop,60);
});
