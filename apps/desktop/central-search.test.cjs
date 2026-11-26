const {test}=require('node:test'),assert=require('node:assert/strict');
const {rows}=require('./central-search.js');
const K=require('./keymaps.js');
test('central search remaps and unmaps without rewriting custom configurations',()=>{
 const saved={...K.defaults(true),leader:',',mappings:{centralSearch:['<leader>sf'],resultsGlobal:['<C-g>'],reply:['e']}};
 const original=JSON.stringify(saved);assert.deepEqual(K.compile(K.migrate(saved),true).find(b=>b.id==='centralSearch').keys,[',','s','f']);assert.equal(JSON.stringify(saved),original);
 assert.ok(!K.compile({...saved,mappings:{centralSearch:[]}},true).some(b=>b.id==='centralSearch'));
 const conflict={...saved,mappings:{reply:['<leader>p']}};
 assert.throws(()=>K.migrate(conflict,true),e=>e.config===conflict&&/repair/.test(e.message));
});
test('central hierarchy uses IDs, explicit asks and authoritative unread, not waiting/owed',()=>{
 const data={projects:[{id:'p',name:'Jetstream',code:'JETS'}],captains:[{id:'c',name:'Release captain',title:'Coordinate',projectId:'p'}],threads:[{id:'c',title:'Duplicate'},{id:'child',title:'Inspect',captain:{jamId:'c'},needsYou:true,projectId:'p'},{id:'ask',title:'Choose',ask:{key:'active',text:'Choose a build'},projectId:'p'},{id:'flag',title:'Input',needsYou:true},{id:'unread',title:'New',hasUnreads:true},{id:'wait',title:'Waiting',status:'waiting',owed:true,queuedAt:'now'},{id:'old',archived:true}],activity:[]};
 const result=rows(data,'',new Map([['wait',10]]));
 assert.deepEqual(result.map(i=>i.id),['ask','flag','unread','wait','c']);
 assert.equal(result[0].detail,'Choose a build');assert.equal(result[3].reason,'Recent');
 assert.equal(result.filter(i=>i.id==='c').length,1);assert.equal(result.at(-1).isCaptain,true);
 assert.equal(rows(data,'insp',new Map())[0].parentId,'c');
 assert.deepEqual(rows(data,'JETS',new Map()).map(i=>i.id),['ask','child','c']);
 assert.equal(rows(data,'release',new Map())[0].id,'c');
 assert.equal(rows(data,'',new Map(),i=>i.id==='wait')[2].id,'wait');
});
