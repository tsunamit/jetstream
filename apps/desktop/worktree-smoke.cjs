const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const out=process.argv[2];
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-worktree-'));
 let app,page;
 async function launch(){
  app=await _electron.launch({args:['.','--live','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
  page=await app.firstWindow();page.setDefaultTimeout(10000);
  await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&document.getElementById('connection-state').textContent==='OFFLINE');
  await app.evaluate(()=>{
   global.testCalls=[];global.testOffline=false;global.testReject=false;
   global.testProjects=[{id:'p1',name:'Jetstream'},{id:'p2',name:'Observatory'}];
   global.testModels=[{id:'catalog-sol',name:'Sol',billing:'Codex plan',route:'member_seat',reasoningModes:['low','medium','high'],fast:true,pro:false,ultrafast:false},{id:'catalog-fable',name:'Fable',billing:'Capy API',route:'capy',reasoningModes:['none','max'],fast:false,pro:true,ultrafast:true}];
   global.testThreads=[{id:'t1',projectId:'p1',title:'Verify release candidate',status:'working',lastActivityAt:'2026-11-23T08:00:00Z'},{id:'crew1',projectId:'p1',title:'Inspect the signed bundle',status:'waiting',captain:{jamId:'captain1',name:'Release captain'},needsYou:true},{id:'old',projectId:'p1',title:'Previous release',status:'archived',archived:true},{id:'t2',projectId:'p2',title:'Track nightly observations',status:'idle'}];
   global.fetch=async(url,init)=>{
    const u=new URL(url);global.testCalls.push({path:u.pathname,query:Object.fromEntries(u.searchParams),method:init.method,body:init.body?JSON.parse(init.body):null});
    if(global.testOffline)throw Error('Fixture offline');
    const json=items=>Response.json(items);
    if(u.pathname.endsWith('/projects'))return json({items:global.testProjects});
    if(u.pathname.endsWith('/models'))return json({items:global.testModels,default:{modelId:'catalog-sol',source:'personal',skipped:[]}});
    if(u.pathname.endsWith('/captains'))return json({items:[{id:'captain1',projectId:'p1',name:'Release captain',title:'Coordinate the release',status:'working'}],cursor:null});
    if(u.pathname.endsWith('/threads')&&init.method==='GET'){
     const items=global.testThreads.filter(t=>t.projectId===u.searchParams.get('projectId'));
     const second=u.searchParams.get('cursor');return json({items:second?items.slice(1):items.slice(0,1),cursor:!second&&items.length>1?'123:next':null});
    }
    if(u.pathname.endsWith('/threads')&&init.method==='POST'){
     if(global.testReject)return Response.json({_tag:'ModelSelection.Rejected',message:'Do not expose this body'}, {status:400});
     await new Promise(r=>setTimeout(r,150));
     const body=JSON.parse(init.body),item={id:'created-'+global.testCalls.filter(c=>c.method==='POST').length,projectId:body.projectId,title:'Review streaming lifecycle',status:'working'};global.testThreads.push(item);return json(item);
    }
    if(u.pathname.endsWith('/messages'))return json({items:[{id:'msg',source:'assistant',text:'The signed release is ready for your review.\n\nThis is an isolated API fixture, not a live account.',createdAt:'2026-11-23T08:00:00Z'}],beforeCursor:null});
    throw Error('Unexpected fixture path '+u.pathname);
   };
  });
  await page.locator('#connect').click();await page.locator('#key').fill('capy_'+'x'.repeat(43));await page.locator('#key-form').evaluate(f=>f.requestSubmit(document.getElementById('save-key')));
  await page.waitForFunction(()=>workTree.state.updated>0&&!navigating);
 }
 async function shot(name){if(!out)return;await fs.mkdir(out,{recursive:true});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Test became visible');return(await w.capturePage()).toPNG().toString('base64');});await fs.writeFile(path.join(out,name),Buffer.from(png,'base64'));}
 try{
  await launch();
  assert.equal(await page.locator('#threads [data-id="old"]').count(),0);
  assert.equal(await page.locator('#threads [data-id="crew1"]').count(),0);
  assert.ok((await app.evaluate(()=>global.testCalls)).some(c=>c.query.cursor==='123:next'));
  await page.locator('#threads [data-id="captain1"]').focus();await page.keyboard.press('l');
  await page.locator('#threads [data-id="crew1"]').waitFor();
  assert.equal(await page.locator('#threads [data-id="crew1"]').getAttribute('aria-level'),'2');
  await page.keyboard.press('j');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'crew1');
  await page.keyboard.press('h');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'captain1');
  await page.keyboard.press('Enter');await page.locator('#threads [data-id="crew1"]').waitFor();await page.waitForFunction(()=>!navigating);
  await page.locator('#tree-options').evaluate(d=>d.open=true);
  await page.locator('#tree-project').selectOption('all');
  await page.locator('#threads [data-id="t2"]').waitFor();
  await page.locator('#tree-status').selectOption('needs-you');assert.equal(await page.locator('#threads [data-id="t1"]').count(),0);await page.locator('#threads [data-id="crew1"]').waitFor();await page.locator('#tree-status').selectOption('all');
  await page.getByLabel('Show archived',{exact:true}).check();await page.locator('#threads [data-id="old"]').waitFor();await page.getByLabel('Show archived',{exact:true}).uncheck();
  await page.locator('#tree-sort').selectOption('name');
  await page.locator('#threads [data-id="crew1"]').click();await page.getByRole('heading',{name:'Inspect the signed bundle'}).waitFor();
  await page.locator('#tree-options').evaluate(d=>d.open=false);await page.locator('#navigator').evaluate(n=>n.scrollTop=0);
  await shot('tree.png');
  await page.locator('#tree-mode').selectOption('activity');
  await app.evaluate(()=>{global.testThreads[0].status='idle';});
  await page.locator('#tree-refresh').click();await page.locator('#threads').getByText(/just finished turn/).waitFor();
  await shot('activity.png');
  await page.locator('#threads [data-id="t1"]').focus();await page.locator('#tree-refresh').evaluate(b=>b.click());await page.waitForFunction(()=>!workTree.busy);assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'t1');
  await app.evaluate(()=>{global.testOffline=true;});await page.locator('#tree-refresh').click();await page.locator('#tree-health').getByText(/STALE/).waitFor();
  assert.match(await page.locator('#threads [data-id="captain1"]').innerText(),/working.*stale/);
  await app.evaluate(()=>{global.testOffline=false;});await page.locator('#tree-refresh').click();await page.waitForFunction(()=>!workTree.state.stale);
  await page.locator('#tree-options').evaluate(d=>d.open=true);await page.locator('#tree-text').fill('observations');assert.equal(await page.locator('#threads button').count(),1);await page.locator('#tree-text').fill('');await page.locator('#tree-options').evaluate(d=>d.open=false);
  await page.locator('#navigator').focus();await page.keyboard.type(' tn');await page.locator('#new-thread[open]').waitFor();await page.waitForFunction(()=>newThread.ready);
  assert.equal(await page.locator('#new-submit').isDisabled(),true);
  assert.equal(await page.locator('#new-machine option:disabled').count(),2);
  await page.locator('#new-project').selectOption('p2');await page.locator('#new-model').selectOption('catalog-sol');await page.locator('#new-reasoning').selectOption('high');await page.locator('[data-mode="fast"]').check();await page.locator('#new-size').selectOption('medium');await page.locator('#new-prompt').fill('Review the thread lifecycle and explain any missing stream events.');
  for(const size of ['small','medium','large','ultra','hyper','bigguy']){await page.locator('#new-size').selectOption(size);assert.equal(await page.evaluate(()=>newThread.options().machineSize),size);}await page.locator('#new-size').selectOption('medium');
  await page.locator('#new-prompt').focus();await page.keyboard.type(' jk tn');assert.ok((await page.locator('#new-prompt').inputValue()).endsWith(' jk tn'));
  await shot('new-thread.png');
  await app.evaluate(()=>{global.testReject=true;});await page.locator('#new-submit').click();await page.locator('#new-error').getByText(/Selected model is unavailable/).waitFor();
  assert.ok(!(await page.locator('#new-error').innerText()).includes('Do not expose'));
  const failed=await app.evaluate(()=>global.testCalls.find(c=>c.method==='POST').body);
  await app.evaluate(()=>{global.testReject=false;});
  await page.locator('#new-thread-form').evaluate(f=>{f.requestSubmit(document.getElementById('new-submit'));f.requestSubmit(document.getElementById('new-submit'));});
  await page.getByRole('heading',{name:'Review streaming lifecycle'}).waitFor();await page.waitForFunction(()=>!workTree.busy&&!newThread.busy&&!navigating);
  const posts=await app.evaluate(()=>global.testCalls.filter(c=>c.method==='POST'));
  assert.equal(posts.length,2);assert.equal(posts[1].body.requestId,failed.requestId);
  assert.deepEqual(posts[1].body.model,{modelId:'catalog-sol',reasoningMode:'high',modes:{fast:true}});assert.equal(posts[1].body.machineSize,'medium');assert.equal(posts[1].body.projectId,'p2');
  assert.equal(await page.locator('#projects').inputValue(),'p2');assert.ok(await page.locator('#threads [data-id^="created-"]').count());
  await page.locator('#back').click();await page.getByRole('heading',{name:'Inspect the signed bundle'}).waitFor();await page.locator('#forward').click();await page.getByRole('heading',{name:'Review streaming lifecycle'}).waitFor();
  await page.locator('#new-thread-button').click();await page.waitForFunction(()=>newThread.ready);assert.equal(await page.locator('#new-model').inputValue(),'catalog-sol');assert.equal(await page.locator('#new-reasoning').inputValue(),'high');assert.equal(await page.locator('#new-size').inputValue(),'medium');
  await page.locator('#new-model').selectOption('catalog-fable');await page.locator('#new-reasoning').selectOption('max');await page.locator('[data-mode="pro"]').check();await page.locator('[data-mode="ultrafast"]').check();assert.equal(await page.locator('[data-mode="fast"]').isDisabled(),true);
  await page.locator('#new-prompt').fill('Second independent request');await page.locator('#new-submit').click();await page.waitForFunction(()=>!newThread.busy&&!navigating&&!workTree.busy);
  const invalid=await page.evaluate(async()=>{try{await desk.createThread({requestId:crypto.randomUUID(),projectId:'p2',message:'no',model:{modelId:'catalog-sol',reasoningMode:'max'}});return false;}catch(e){return e.message;}});assert.match(invalid,/Unsupported reasoning/);
  const beforeDedupe=await app.evaluate(()=>global.testCalls.filter(c=>c.method==='POST').length);
  const ids=await page.evaluate(async()=>{const input={requestId:crypto.randomUUID(),projectId:'p2',message:'Fixture main IPC dedupe'};return(await Promise.all([desk.createThread(input),desk.createThread(input)])).map(t=>t.id);});assert.equal(ids[0],ids[1]);assert.equal(await app.evaluate(()=>global.testCalls.filter(c=>c.method==='POST').length),beforeDedupe+1);
  await page.evaluate(()=>workTree.save());await app.close();app=null;
  await launch();assert.equal(await page.locator('#tree-mode').inputValue(),'activity');assert.equal(await page.locator('#tree-project').inputValue(),'all');assert.equal(await page.locator('#tree-sort').inputValue(),'name');assert.ok(await page.evaluate(()=>workTree.config.expanded.includes('captain1')));
  assert.equal(await page.evaluate(()=>workTree.state.finished.size),0);
  await page.locator('#projects').selectOption('p2');await page.waitForFunction(()=>!navigating);
  await page.locator('#new-thread-button').click();await page.waitForFunction(()=>newThread.ready);assert.equal(await page.locator('#new-model').inputValue(),'catalog-fable');assert.equal(await page.locator('#new-reasoning').inputValue(),'max');assert.equal(await page.locator('[data-mode="pro"]').isChecked(),true);
  await page.locator('#new-prompt').fill('Keep this prompt while availability changes');await app.evaluate(()=>{global.testModels=global.testModels.filter(m=>m.id!=='catalog-fable');});await page.locator('#new-reload').click();await page.waitForFunction(()=>newThread.ready);assert.equal(await page.locator('#new-model').inputValue(),'catalog-fable');assert.equal(await page.locator('#new-submit').isDisabled(),true);assert.equal(await page.locator('#new-prompt').inputValue(),'Keep this prompt while availability changes');
  await page.locator('#new-model').selectOption('');assert.equal(await page.locator('#new-submit').isDisabled(),false);
  await page.keyboard.press('Escape');await page.locator('#new-thread').waitFor({state:'hidden'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(640,600));
  await page.locator('#new-thread-button').click();await page.waitForFunction(()=>newThread.ready);await shot('new-thread-narrow.png');assert.equal(await page.evaluate(()=>document.getElementById('new-thread').scrollWidth<=document.getElementById('new-thread').clientWidth),true);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
  console.log('PASS real API fixture contracts, complete paging, ID crew hierarchy, keyboard expansion, all-project filters, observed outcomes, stale recovery, creation catalog/modes, rejection/retry dedupe, history and scoped defaults reload; hidden only');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
