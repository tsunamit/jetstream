const test=require('node:test');
const assert=require('node:assert/strict');
const {Pager}=require('./transcript.js');
const item=(id,source='assistant')=>({id,source,text:id});
test('oldest first, sparse/tool pages, overlap and refresh preserve all exchanges',()=>{
 const p=new Pager();
 p.accept({items:[item('u','user'),item('a'),item('tool','tool')],cursor:'c1',beforeCursor:null},{});
 assert.deepEqual(p.query('newer'),{after:'c1'});
 p.accept({items:[],cursor:'c2',beforeCursor:'b'},p.query('newer'));
 p.accept({items:[item('a'),item('u2','user'),item('a2')],cursor:null,beforeCursor:'b'},p.query('newer'));
 assert.deepEqual(p.items.map(i=>i.id),['u','a','tool','u2','a2']);
 assert.equal(p.before,null);
 assert.deepEqual(p.query('newer'),{after:'c2'});
 p.accept({items:[item('a2'),item('a3')],cursor:null,beforeCursor:'b'},p.query('newer'));
 assert.equal(p.items.length,6);
});
test('older overlap does not reverse order or duplicate; invalid pages are atomic',()=>{
 const p=new Pager();p.accept({items:[item('b'),item('c')],cursor:null,beforeCursor:'older'},{});
 p.accept({items:[item('a'),item('b')],cursor:null,beforeCursor:null},p.query('older'));
 assert.deepEqual(p.items.map(i=>i.id),['a','b','c']);
 assert.throws(()=>p.accept({items:[],cursor:42,beforeCursor:null},{}),/Invalid transcript page/);
 assert.equal(p.items.length,3);
});
test('repeated and cyclic forward cursors stop a batch but remain retryable',()=>{
 const p=new Pager();p.accept({items:[],cursor:'c',beforeCursor:null},{});
 assert.equal(p.accept({items:[],cursor:'c',beforeCursor:null},{after:'c'}),false);
 assert.deepEqual(p.query('newer'),{after:'c'});
});
