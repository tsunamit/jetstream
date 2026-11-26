const {test}=require('node:test');
const assert=require('node:assert/strict');
const {adjacent}=require('./chat-geometry.js');
test('visual rows search neighboring geometry, not logical paragraphs, with logarithmic probes',()=>{
 let probes=0;
 const rect=p=>{probes++;return {top:Math.floor(p/40)*20,bottom:Math.floor(p/40)*20+18,left:p%40*8,right:p%40*8+8};};
 assert.deepEqual(adjacent(1000000,7,1,rect),{from:40,to:79,rect:{top:20,bottom:38,left:0,right:8}});
 assert.ok(probes<70,probes);
 probes=0;
 assert.deepEqual(adjacent(1000000,47,-1,rect),{from:0,to:39,rect:{top:0,bottom:18,left:312,right:320}});
 assert.ok(probes<70,probes);
 assert.equal(adjacent(80,40,1,rect),null);
 assert.equal(adjacent(80,0,-1,rect),null);
 assert.equal(adjacent(0,0,1,rect),null);
});
