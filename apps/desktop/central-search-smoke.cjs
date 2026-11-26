const {_electron}=require('./test-support.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-central-'));let app;
 try{
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
  const page=await app.firstWindow();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const shot=async name=>{if(!process.argv[2])return;await fs.mkdir(process.argv[2],{recursive:true});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible test');return(await w.capturePage()).toPNG().toString('base64');});await fs.writeFile(path.join(process.argv[2],name+'.png'),Buffer.from(png,'base64'));};
  await page.waitForFunction(()=>typeof readState!=='undefined'&&keyReady&&!messageBusy);
  await app.evaluate(()=>{
   global.calls=[];global.gate=false;global.offline=false;
   global.items=[{id:'ask',projectId:'p1',title:'Choose the release',needsYou:true,ask:{key:'request',text:'Pick the signed candidate'},status:'waiting',hasUnreads:true},{id:'new',projectId:'p2',title:'New observations',status:'idle',hasUnreads:true},{id:'wait',projectId:'p1',title:'External build waiting',status:'waiting',owed:true},{id:'crew',projectId:'p2',title:'Inspect artifacts',status:'working',needsYou:true,captain:{jamId:'captain',name:'Release captain'}},{id:'captain',projectId:'p1',title:'Duplicate captain'},{id:'same-title',projectId:'p1',title:'Inspect artifacts',status:'idle'}];
   global.fetch=async(url,init)=>{
    const u=new URL(url),parts=u.pathname.split('/'),id=parts.at(-2);calls.push({path:u.pathname,method:init.method});
    if(offline)throw Error('Fixture offline');
    if(u.pathname.endsWith('/stream')){const body=new ReadableStream({start(c){init.signal.addEventListener('abort',()=>{try{c.close();}catch{}},{once:true});}});return new Response(body,{headers:{'Content-Type':'text/event-stream'}});}
    if(u.pathname.endsWith('/projects'))return Response.json({items:[{id:'p1',name:'Jetstream'},{id:'p2',name:'Observatory'}]});
    if(u.pathname.endsWith('/captains'))return Response.json({items:[{id:'captain',projectId:'p1',title:'Coordinate release',name:'Release captain',status:'working',hasUnreads:false}],cursor:null});
    if(u.pathname.endsWith('/threads')){const snapshot=items.filter(i=>i.projectId===u.searchParams.get('projectId'));if(gate)await new Promise(r=>global.release=r);return Response.json({items:snapshot,cursor:null});}
    if(u.pathname.endsWith('/messages'))return Response.json({items:[{id:'message-'+id,source:'assistant',text:'Known fixture conversation',createdAt:'2026-11-24T12:00:00Z'}],beforeCursor:null});
    const item=items.find(i=>i.id===parts.at(-1));if(item)return Response.json(item);
    throw Error('Unexpected route '+u.pathname);
   };
  });
  await page.locator('#connect').click();await page.locator('#key').fill('capy_'+'x'.repeat(43));await page.locator('#remember-key').uncheck();await page.locator('#save-key').click();
  await page.waitForFunction(()=>!demoMode&&workTree.state.data.threads.some(i=>i.id==='new')&&!navigating&&!messageBusy);
  await page.evaluate(()=>openThread(workTree.state.data.threads.find(i=>i.id==='ask'),{focus:'conversation'}));await page.waitForFunction(()=>thread?.id==='ask'&&!navigating&&!messageBusy);
  await page.locator('#conversation').focus();await page.keyboard.press('i');await page.locator('#draft .cm-content').fill('Preserve this draft');await page.keyboard.press('Escape');
  await page.locator('#conversation').focus();const prior=await page.evaluate(()=>({index:historyIndex,length:history.length,draft:draft.value,id:thread.id,scroll:transcript.scrollTop}));await page.keyboard.type(' pf');await page.locator('#picker[open]').waitFor();
  await page.waitForFunction(()=>!pickerLoading);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'picker-search');
  assert.deepEqual(await page.evaluate(()=>matches.map(i=>i.id)),['ask','new','captain','same-title','wait']);
  assert.match(await page.locator('#picker-list').innerText(),/Needs input/);assert.ok(!(await page.locator('#picker-list').innerText()).includes('undefined'));
  assert.equal(await page.evaluate(()=>matches.filter(i=>i.id==='captain').length),1);
  await shot('central-search-attention');
  const requests=await app.evaluate(()=>calls.length),id=await page.evaluate(()=>thread.id);
  await page.locator('#picker-search').fill('artfcts');assert.deepEqual(await page.evaluate(()=>matches.map(i=>i.id)),['crew','same-title']);
  assert.match(await page.locator('#picker-list').innerText(),/crew of Coordinate release/);
  assert.equal(await page.evaluate(()=>thread.id),id);assert.equal(await app.evaluate(()=>calls.length),requests);
  await page.keyboard.type('jk');assert.equal(await page.locator('#picker-search').inputValue(),'artfctsjk');
  await page.locator('#picker-search').fill('observatory');assert.deepEqual(await page.evaluate(()=>matches.map(i=>i.id)),['crew','new']);
  await page.keyboard.press('Control+g');assert.equal(await page.evaluate(()=>document.activeElement.id),'picker-list');await page.keyboard.press('j');assert.equal(await page.evaluate(()=>matches[selected].id),'new');
  await page.keyboard.press('i');await page.locator('#picker-search').fill('different');await page.keyboard.press('Escape');assert.equal(await page.locator('#picker-search').inputValue(),'observatory');assert.equal(await page.evaluate(()=>matches[selected].id),'new');
  await page.keyboard.press('Control+PageDown');await page.keyboard.press('Control+PageUp');assert.equal(await page.locator('#picker-search').inputValue(),'observatory');assert.equal(await page.evaluate(()=>matches[selected].id),'new');
  await page.evaluate(()=>{visits.set('new',100);catalog.threads.find(i=>i.id==='new').needsYou=true;readState.paint();});assert.equal(await page.evaluate(()=>matches[selected].id),'new');
  assert.equal(await app.evaluate(()=>calls.filter(c=>c.method==='PUT').length),0);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>draft.value),'Preserve this draft');assert.equal(await page.evaluate(()=>thread.id),id);assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');assert.deepEqual(await page.evaluate(()=>({index:historyIndex,length:history.length,draft:draft.value,id:thread.id,scroll:transcript.scrollTop})),prior);
  await app.evaluate(()=>global.gate=true);await page.evaluate(()=>{catalog=null;globalThis.opening=showPicker('centralSearch');});
  await page.locator('#picker[open]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'picker-search');assert.match(await page.locator('#picker-count').innerText(),/loading/);
  await page.keyboard.press('Escape');await app.evaluate(()=>{gate=false;release();});await page.evaluate(()=>opening);assert.equal(await page.evaluate(()=>picker.open),false);
  await page.locator('#find').click();await page.waitForFunction(()=>!pickerLoading);await page.locator('#picker-search').fill('artfcts');
  await shot('central-search-crew');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>thread?.id==='crew'&&!navigating&&!messageBusy);assert.equal(await page.locator('#projects').inputValue(),'p2');
  await page.evaluate(()=>{workTree.config.project='all';workTree.render();workTree.focus('ask');});await page.keyboard.type(' pf');await page.waitForFunction(()=>!pickerLoading);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.dataset.id==='ask');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'ask','Refresh must restore the originating navigator identity, not a detached node');
  await page.locator('#find').click();await page.waitForFunction(()=>!pickerLoading);await app.evaluate(()=>global.offline=true);await page.evaluate(()=>showPicker('centralSearch'));assert.match(await page.locator('#picker-count').innerText(),/stale/);await page.keyboard.press('Escape');
  await page.locator('#keymaps-button').click();await page.locator('#map-centralSearch').fill('<leader>sf');await page.locator('#keymaps-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>document.getElementById('keymaps-error').textContent.startsWith('Saved.'));
  assert.match(await page.locator('#find').innerText(),/s f/);
  assert.deepEqual(errors,[]);console.log('PASS central API hierarchy, attention, query/browse, preview safety, delayed cancel, refresh identity, open context, stale cache, remap and hidden rendering');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
