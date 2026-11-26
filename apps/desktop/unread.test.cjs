const test=require('node:test'),assert=require('node:assert/strict');
const {State}=require('./unread-state.js'),Tree=require('./sidebar-state.js'),{api}=require('./api.cjs');
test('read API uses narrow fixed-origin PUT and real event cursor, without body for unread',async()=>{
 const calls=[],client=api('fixture',async(url,init)=>{calls.push({url,init});return Response.json({id:'t',hasUnreads:false});});
 await client.receipt('t','read','01J00000000000000000000001');await client.receipt('t','unread');await client.thread('t');
 assert.equal(calls[0].url.href,'https://api.capy.ai/api/v1/threads/t/read');assert.equal(calls[0].init.method,'PUT');assert.equal(calls[0].init.redirect,'error');assert.deepEqual(JSON.parse(calls[0].init.body),{eventId:'01J00000000000000000000001'});
 assert.equal(calls[1].init.method,'PUT');assert.equal(calls[1].init.body,undefined);assert.equal(calls[2].init.method,'GET');
 assert.throws(()=>client.receipt('t','read','tool-call'));assert.throws(()=>client.receipt('../bad','unread'));assert.throws(()=>client.receipt('t','bad'));
});
test('server state is authoritative; stale polls and old receipts cannot overwrite newer observations',()=>{
 const m=new State();assert.equal(m.accept({id:'a',hasUnreads:true}).hasUnreads,true);const start=m.version;
 const rev=m.begin('a','read');assert.equal(m.accept({id:'a',hasUnreads:false},m.version).hasUnreads,true);
 m.finish('a',rev,{hasUnreads:false});assert.equal(m.accept({id:'a',hasUnreads:true},start).hasUnreads,false);
 const older=m.begin('a','read');m.touch('a');m.finish('a',older,{hasUnreads:false});m.accept({id:'a',hasUnreads:true},m.version);assert.equal(m.get('a').value,true);
 const unread=m.begin('a','unread');m.finish('a',unread,{hasUnreads:true});m.visit('a','a');assert.equal(m.get('a').hold,true);m.visit('a','b');assert.equal(m.get('a').hold,false);
 const failed=m.begin('a','read');m.finish('a',failed,null,Error());assert.equal(m.get('a').value,true);assert.match(m.get('a').error,/retry/);
 assert.equal(new State().get('a').value,undefined);
});
test('unread filter preserves captain hierarchy and counts only known unread threads',()=>{
 const state=new Tree.State();state.accept({projects:[],activity:[],captains:[{id:'c',isCaptain:true,projectId:'p',title:'Captain',hasUnreads:false}],threads:[{id:'a',parentId:'c',projectId:'p',title:'A',hasUnreads:true},{id:'b',projectId:'p',title:'B'}]});
 const cfg=Tree.config({...Tree.defaults(),status:'unread',expanded:['c']});assert.deepEqual(state.rows(cfg,'p').filter(r=>r.item).map(r=>r.item.id),['c','a']);cfg.mode='activity';assert.deepEqual(state.rows(cfg,'p').map(r=>r.item.id),['a']);
});
