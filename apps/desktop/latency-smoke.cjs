const {_electron}=require('./test-support.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-latency-'));let app;
 try {
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
  const page=await app.firstWindow();page.setDefaultTimeout(8000);
  await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&thread&&!messageBusy);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({ipcMain})=>{
   globalThis.gates=[];
   for(const name of ['messages','cancelMessages','activity','workspace','models','media']) {
    ipcMain.removeHandler('desk:'+name);
    ipcMain.handle('desk:'+name,(_event,...args)=>new Promise(resolve=>gates.push({name,args,resolve})));
   }
  });
  await page.evaluate(()=>{
   clearTimeout(messageTimer);clearTimeout(workTree.timer);
   globalThis.fixtureData={projects:[{id:'delay-p',name:'Deferred project'},{id:'other-p',name:'Other project'}],threads:['A','B','C'].map(id=>({id,title:'Destination '+id,code:'DELAY-'+id,projectId:'delay-p',status:'idle'})),captains:[{id:'captain-delay',title:'Delayed captain',projectId:'other-p',isCaptain:true}],activity:[]};
   projectPicker.replaceChildren(...fixtureData.projects.map(p=>new Option(p.name,p.id)));project='delay-p';projectPicker.value=project;
   catalog=fixtureData;workTree.enabled=true;workTree.loaded=true;workTree.config=WorkTree.defaults();workTree.state.accept(fixtureData);workTree.controls();workTree.render();
   globalThis.commitTimes=[];
   globalThis.commit=id=>{const start=performance.now();const result=openThread(fixtureData.threads.find(t=>t.id===id),{focus:'conversation'});commitTimes.push(performance.now()-start);return result;};
   commit('A');
  });
  await page.waitForFunction(()=>thread?.id==='A'&&messageBusy);
  const before=await page.evaluate(()=>{
   commit('B');
   return {id:thread.id,title:$('title').textContent,focus:document.activeElement.id,empty:!$('entries').children.length,draft:composer.id,back:$('back').disabled,loading:$('message-health').textContent};
  });
  assert.deepEqual(before,{id:'B',title:'Destination B',focus:'conversation',empty:true,draft:'B',back:false,loading:'Loading history toward latest…'});
  assert.equal(await page.evaluate(()=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'j',ctrlKey:true,bubbles:true,cancelable:true}));return composer.focused();}),true);
  await page.evaluate(()=>{insertDraft();});await page.keyboard.type('B draft before data');
  assert.equal(await page.evaluate(()=>draft.value),'B draft before data');
  await page.evaluate(()=>{for(let i=0;i<5;i++){focusWindow('conversation');focusWindow('navigator');focusWindow('composer');}focusWindow('navigator');});
  if(process.argv[2]) {
   await fs.mkdir(process.argv[2],{recursive:true});
   const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible latency test');return(await w.capturePage()).toPNG().toString('base64');});
   await fs.writeFile(path.join(process.argv[2],'destination-loading.png'),Buffer.from(png,'base64'));
  }
  await page.evaluate(()=>{commit('C');traverseHistory(-1);});
  assert.equal(await page.evaluate(()=>thread.id),'B');
  assert.equal(await page.evaluate(()=>draft.value),'B draft before data');
  await page.evaluate(()=>{traverseHistory(1);});
  assert.equal(await page.evaluate(()=>thread.id),'C');
  const resolve=async(id,error=false)=>{
   for(let tries=0;!await app.evaluate((_electron,id)=>gates.some(g=>g.name==='messages'&&g.args[0]===id),id);tries++) {if(tries>1000)throw Error('Missing deferred request '+id);await new Promise(r=>setTimeout(r,5));}
   await app.evaluate((_electron,{id,error})=>{
    for(const g of gates.filter(g=>g.name==='messages'&&g.args[0]===id))g.resolve(error?{error:'Rejected '+id}:{value:{items:[{id:'body-'+id,source:'assistant',text:'Loaded body '+id,...(id==='media-old'?{attachments:[{file:{fileId:'slow-image',name:'Deferred image',mediaType:'image/png'}}]}:{})}],cursor:null}});
    gates=gates.filter(g=>g.name!=='messages'||g.args[0]!==id);
   },{id,error});
  };
  await resolve('A',true);await resolve('B');
  assert.equal(await page.evaluate(()=>thread.id),'C');assert.equal(await page.locator('#entries article').count(),0);
  await page.waitForFunction(()=>$('message-health').textContent.includes('Loading'));
  await page.evaluate(()=>focusWindow('navigator'));await resolve('C');
  await page.waitForFunction(()=>!messageBusy&&$('entries').textContent.includes('Loaded body C'));
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'C');
  await page.evaluate(()=>{fixtureData.threads.push({id:'media-old',title:'Media deferred',projectId:'delay-p'});commit('media-old');});
  await resolve('media-old');await page.waitForFunction(()=>!messageBusy);
  await waitMedia();
  await page.evaluate(()=>{commit('C');});await page.waitForFunction(()=>!messageBusy);
  await app.evaluate(()=>{for(const g of gates.filter(g=>g.name==='media'))g.resolve({error:'stale media rejection'});gates=gates.filter(g=>g.name!=='media');});
  await page.evaluate(()=>{commit('media-old');});await page.waitForFunction(()=>!messageBusy);
  assert.equal(await page.locator('#entries .image-button[data-loaded]').count(),0);assert.equal(await page.getByRole('button',{name:'Load image',exact:true}).count(),1);
  await page.evaluate(()=>{clearTimeout(messageTimer);});
  await waitMedia();
  await app.evaluate(()=>{for(const g of gates.filter(g=>g.name==='media'))g.resolve({value:{data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6QAAAABJRU5ErkJggg=='}});gates=gates.filter(g=>g.name!=='media');});
  await page.locator('#entries .image-button[data-loaded]').waitFor();
  await page.evaluate(()=>{commit('C');});await page.waitForFunction(()=>!messageBusy);
  assert.equal(await page.locator('#notice').innerText(),'');
  async function waitMedia(){
    for(let tries=0;!await app.evaluate(()=>gates.some(g=>g.name==='media'));tries++){
      if(tries>200)throw Error('Missing automatic media request');await page.waitForTimeout(10);
    }
  }
  await page.evaluate(()=>{commit('B');});await page.waitForFunction(()=>messageBusy);
  await resolve('B',true);await page.waitForFunction(()=>!messageBusy);
  assert.match(await page.locator('#message-health').innerText(),/failed/i);
  await page.evaluate(()=>{clearTimeout(messageTimer);focusWindow('composer');$('refresh').click();});
  assert.equal(await page.evaluate(()=>composer.focused()),true);
  await resolve('B');await page.waitForFunction(()=>!messageBusy&&$('entries').textContent.includes('Loaded body B'));
  assert.equal(await page.evaluate(()=>composer.focused()),true);assert.equal(await page.evaluate(()=>draft.value),'B draft before data');
  const cached=await page.evaluate(()=>{commit('C');return {body:$('entries').textContent,health:$('message-health').textContent};});
  assert.match(cached.body,/Loaded body C/);assert.match(cached.health,/Cached/);
  await page.evaluate(()=>{$('entries').firstElementChild.classList.add('jump-target');commit('B');commit('C');});
  assert.equal(await page.locator('#entries .jump-target').count(),0);
  await page.evaluate(()=>{
   globalThis.originalRender=richText.render;globalThis.releaseRender=null;
   richText.render=(item,id)=>id==='render-old'?new Promise(resolve=>{releaseRender=()=>{const node=document.createElement('p');node.textContent='Stale rendered media';resolve(node);};}):originalRender(item,id);
   fixtureData.threads.push({id:'render-old',title:'Render deferred',projectId:'delay-p'});commit('render-old');
  });
  await resolve('render-old');await page.waitForFunction(()=>typeof releaseRender==='function');
  await page.evaluate(()=>{commit('C');focusWindow('navigator');releaseRender();richText.render=originalRender;});
  await page.waitForFunction(()=>thread.id==='C'&&!messageBusy);
  assert.doesNotMatch(await page.locator('#entries').innerText(),/Stale rendered/);assert.equal(await page.locator('#title').innerText(),'Destination C');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'C');
  await page.evaluate(()=>{clearTimeout(messageTimer);catalog=null;demoMode=false;showPicker('threads');});
  assert.equal(await page.evaluate(()=>picker.open&&document.activeElement===search),true);
  assert.match(await page.locator('#picker-count').innerText(),/loading/);
  await page.keyboard.type('Destination');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!picker.open);
  await app.evaluate(()=>{for(const g of gates.filter(g=>g.name==='activity'))g.resolve({error:'late catalog failure'});gates=gates.filter(g=>g.name!=='activity');});
  assert.equal(await page.evaluate(()=>picker.open),false);assert.doesNotMatch(await page.locator('#notice').innerText(),/catalog/);
  await page.evaluate(()=>{showPicker('threads');});
  await page.keyboard.type('Destination B');
  await app.evaluate(()=>{for(const g of gates.filter(g=>g.name==='activity'))g.resolve({value:{projects:[{id:'delay-p',name:'Deferred project'}],threads:['A','B','C'].map(id=>({id,title:'Destination '+id,projectId:'delay-p'})),captains:[],activity:[]}});gates=gates.filter(g=>g.name!=='activity');});
  await page.waitForFunction(()=>matches.length===1);
  await page.locator('#picker-open').click();
  await page.waitForFunction(()=>!picker.open&&thread.id==='B');
  await page.evaluate(()=>focusWindow('navigator'));
  await resolve('B');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'B');
  const scope=await page.evaluate(()=>{
   workTree.state.updated=0;projectPicker.value='other-p';selectProject();
   return {project,thread:thread?.id,title:$('title').textContent,empty:!$('entries').children.length};
  });
  assert.deepEqual(scope,{project:'other-p',thread:undefined,title:'Open a thread',empty:true});
  await page.evaluate(()=>{workTree.expand('captain-delay',true);openThread(fixtureData.captains[0],{projectId:'other-p',focus:'conversation'});});
  assert.equal(await page.locator('#title').innerText(),'Delayed captain');
  await page.evaluate(()=>{newThread.open();});
  assert.equal(await page.evaluate(()=>$('new-thread').open),true);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!$('new-thread').open);
  await page.evaluate(()=>focusWindow('navigator'));
  await app.evaluate(()=>{for(const g of gates.filter(g=>g.name==='models'))g.resolve({value:{items:[]}});gates=gates.filter(g=>g.name!=='models');});
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'captain-delay');
  const times=await page.evaluate(()=>commitTimes);
  assert.ok(Math.max(...times)<250,'Secondary local commit budget');
  assert.deepEqual(errors,[]);
  console.log('PASS deferred IPC ownership: synchronous shell/context/history/focus, hung cancellation independent, rapid A/B/C and Back/Forward, early drafts, stale failure/results, cache, retry focus, picker cancel/query, project/captain and creation shells',JSON.stringify({commitMilliseconds:times}));
 } finally {await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
