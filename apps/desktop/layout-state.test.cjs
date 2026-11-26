const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Layout=require('./layout-state.js');
const {LayoutSettings}=require('./layout.cjs');
const Tree=require('./sidebar-state.js');
test('layout accepts only bounded numbers and a default-on reading preference',()=>{
  assert.equal(Layout.config({version:1,sidebarWidth:280,replyHeight:180}).centeredReading,true);
  for(const value of [null,[],{sidebarWidth:NaN},{sidebarWidth:Infinity},{sidebarWidth:94},{sidebarWidth:641},{replyHeight:71},{replyHeight:1201},{replyHeight:1.5},{centeredReading:1},{version:2},{apiKey:'no'}])assert.throws(()=>Layout.config(value));
  const preferred=Layout.config({sidebarWidth:500,replyHeight:500});
  for(const [width,height] of [[320,150],[640,400],[1140,650],[2280,1400]]){
    const b=Layout.bounds(width,height),side=Layout.clamp(preferred.sidebarWidth,b.sidebarMin,b.sidebarMax),reply=Layout.clamp(preferred.replyHeight,b.replyMin,b.replyMax);
    assert.ok(side+6<width);assert.ok(reply+6<height);assert.ok(side>=95);assert.ok(reply>=72);
  }
  assert.equal(preferred.sidebarWidth,500);assert.equal(preferred.replyHeight,500);
});
test('layout loads defaults without rewriting corrupt data and atomically saves isolated preferences',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'layout-unit-'));
  try{
    const settings=new LayoutSettings(dir);assert.deepEqual((await settings.load()).config,Layout.defaults());
    await fs.writeFile(settings.file,'broken');assert.match((await settings.load()).error,/invalid/);assert.equal(await fs.readFile(settings.file,'utf8'),'broken');
    await assert.rejects(settings.save({replyHeight:'secret'}));
    await Promise.all([settings.save({...Layout.defaults(),sidebarWidth:350}),settings.save({...Layout.defaults(),replyHeight:300,centeredReading:false})]);
    const loaded=await new LayoutSettings(dir).load();assert.equal(loaded.config.replyHeight,300);assert.equal(loaded.config.centeredReading,false);
    assert.deepEqual(await fs.readdir(dir),['layout.json']);assert.equal((await fs.stat(settings.file)).mode&0o777,0o600);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('tree project/captain/crew IDs preserve ancestry, sibling sort and filtered context without fabricated nesting',()=>{
  const s=new Tree.State(),c=Tree.defaults();
  s.accept({projects:[{id:'p',name:'Project'}],captains:[{id:'captain',projectId:'p',isCaptain:true,title:'Captain'}],threads:[{id:'crew-z',projectId:'p',parentId:'captain',title:'Z crew',status:'working'},{id:'standalone',projectId:'p',title:'A standalone'},{id:'crew-a',projectId:'p',parentId:'captain',title:'A crew'}],activity:[]});
  Object.assign(c,{projectRoots:true,sort:'name',expanded:['project:p','captain']});
  const rows=s.rows(c,'p').filter(r=>r.item);
  assert.deepEqual(rows.map(r=>[r.item.id,r.depth,r.parent]),[['project:p',0,undefined],['standalone',1,'project:p'],['captain',1,'project:p'],['crew-a',2,'captain'],['crew-z',2,'captain']]);
  c.expanded=[];c.text='Z crew';assert.deepEqual(s.rows(c,'p').filter(r=>r.item).map(r=>r.item.id),['project:p','captain','crew-z']);assert.deepEqual(c.expanded,[]);
  c.mode='activity';assert.deepEqual(s.rows(c,'p').map(r=>[r.item.id,r.depth]),[['crew-z',0]]);
});
