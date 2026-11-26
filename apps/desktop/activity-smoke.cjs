const {_electron}=require('./test-support.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-activity-'));let app;
 try{
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
  const page=await app.firstWindow();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>typeof workActivity!=='undefined'&&keyReady&&thread&&!navigating&&!messageBusy);
  const shot=async name=>{
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const proof=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],image=await w.capturePage(),bytes=image.toBitmap();return {visible:w.isVisible(),focused:w.isFocused(),colors:new Set(Array.from({length:Math.floor(bytes.length/4)},(_,i)=>bytes.readUInt32LE(i*4))).size,png:image.toPNG().toString('base64')};});
   assert.equal(proof.visible,false);assert.equal(proof.focused,false);assert.ok(proof.colors>100);
   if(process.argv[2]){await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(path.join(process.argv[2],name+'.png'),Buffer.from(proof.png,'base64'));}
  };
  await page.locator('#conversation').focus();await page.keyboard.press('i');await page.locator('#draft .cm-content').fill('Keep my draft');await page.keyboard.press('Escape');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const before=await page.evaluate(()=>({id:thread.id,draft:draft.value,history:history.length,index:historyIndex,position:chatLocation(chatPosition),anchor:chatLocation(chatAnchor)}));
  const originalSize=await page.evaluate(()=>[innerWidth,innerHeight]);
  await page.keyboard.type(' k');await page.locator('#work-activity[open]').waitFor();await page.waitForFunction(()=>!workActivity.loading);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'activity-board');
  await page.evaluate(()=>{
   workActivity.model=new ActivityState.State();
   workActivity.data={projects:[{id:'fixture-project',name:'Fixture project'}],captains:[{id:'fixture-captain',projectId:'fixture-project',title:'Release captain',status:'working'}],threads:[
    {id:'fixture-ask',projectId:'fixture-project',title:'Choose the release candidate',needsYou:true,ask:{key:'fixture',text:'Pick A or B before the release can continue.'},status:'waiting'},
    {id:'fixture-done',projectId:'fixture-project',parentId:'fixture-captain',title:'Verify resize boundaries',status:'idle'},
    {id:'fixture-work',projectId:'fixture-project',title:'Improve keyboard navigation',status:'working'},
    {id:'fixture-reply',projectId:'fixture-project',title:'Investigate scrolling latency',status:'idle'}]};
   workActivity.model.sentReply('fixture-reply');workActivity.model.frame('fixture-done',{event:'turn',data:{phase:'start'}});
   workActivity.model.frame('fixture-done',{event:'transcript',id:'fixture-cursor',data:{id:'fixture-result',source:'assistant',text:'Fixture result: resize limits are verified. Ready for your review.'}});
   workActivity.model.frame('fixture-done',{event:'turn',data:{phase:'end',outcome:'settled'}});workActivity.column=0;workActivity.rows=[0,0,0];workActivity.render(false);
  });
  assert.match(await page.locator('#activity-preview-text').innerText(),/Pick A or B/);
  assert.deepEqual(await page.locator('.activity-column h3').allTextContents(),['Needs you · 1','Recently finished · 1','Working · 3']);
  await shot('activity-wide');
  await page.getByRole('button',{name:'List',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'List',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-ask');
  const listBounds=await page.evaluate(()=>({list:$('activity-board').getBoundingClientRect().right,preview:$('activity-preview').getBoundingClientRect().left}));assert.ok(listBounds.list<=listBounds.preview,'Sectioned list stays left of the preview');
  assert.equal(await page.locator('.activity-column').count(),3);assert.match(await page.locator('#activity-keys').innerText(),/h\/l sections/);
  await page.keyboard.press('j');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-done');
  await shot('activity-list');
  await page.keyboard.press('j');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-reply');await page.keyboard.press('k');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-done');
  await page.evaluate(()=>{globalThis.activityFixtureThreads=workActivity.data.threads;workActivity.data.threads=workActivity.data.threads.filter(i=>i.id!=='fixture-done');workActivity.select(0,0);});
  await page.keyboard.press('j');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-reply','List navigation skips empty sections');
  await page.evaluate(()=>{workActivity.data.threads=activityFixtureThreads;workActivity.render();});await page.keyboard.press('h');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-done');
  await page.getByRole('button',{name:'Columns',exact:true}).click();assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-done');assert.equal(await page.evaluate(()=>document.activeElement.id),'activity-board');await page.keyboard.press('h');
  await page.keyboard.press('l');assert.match(await page.locator('#activity-preview-text').innerText(),/Fixture result/);assert.match(await page.locator('#activity-preview-meta').innerText(),/crew of Release captain/);
  assert.equal(await page.evaluate(()=>workActivity.model.finished.size),1);await page.keyboard.press('l');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-reply');
  await page.keyboard.press('j');assert.notEqual(await page.evaluate(()=>workActivity.selected().id),'fixture-reply');await page.keyboard.press('k');assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-reply');
  await page.evaluate(()=>{workActivity.data.threads.reverse();workActivity.render();});assert.equal(await page.evaluate(()=>workActivity.selected().id),'fixture-reply');
  const sizes=[[980,700],[600,600],[390,500],[320,420]];
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setMinimumSize(300,300));
  for(const [width,height] of sizes){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);
   await page.waitForFunction(size=>innerWidth===size[0]&&innerHeight===size[1],[width,height]);
   const bounds=await page.evaluate(()=>{const r=$('work-activity').getBoundingClientRect();return {right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:$('work-activity').scrollWidth>$('work-activity').clientWidth};});
   assert.ok(bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,JSON.stringify(bounds));assert.equal(bounds.overflow,false);assert.equal(bounds.dialogOverflow,false);
   if(width===600)await shot('activity-compact');
   await page.getByRole('button',{name:'List',exact:true}).click();
   const vertical=await page.evaluate(()=>({overflow:$('work-activity').scrollWidth>$('work-activity').clientWidth,sections:[...document.querySelectorAll('.activity-column')].map(n=>getComputedStyle(n).display),list:$('activity-board').getBoundingClientRect().right,preview:$('activity-preview').getBoundingClientRect().left}));assert.equal(vertical.overflow,false);assert.ok(vertical.sections.every(display=>display!=='none'));
   if(width>=600)assert.ok(vertical.list<=vertical.preview,'List layout keeps its preview on the right');
   if(width===600)await shot('activity-list-compact');
   await page.getByRole('button',{name:'Columns',exact:true}).click();
  }
  await page.keyboard.press('h');assert.equal(await page.evaluate(()=>workActivity.column),1);assert.equal(await page.locator('.activity-column.active').count(),1);
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),originalSize);
  await page.waitForFunction(size=>innerWidth===size[0]&&innerHeight===size[1],originalSize);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>workActivity.dialog.open),false);
  assert.deepEqual(await page.evaluate(()=>({id:thread.id,draft:draft.value,history:history.length,index:historyIndex,position:chatLocation(chatPosition),anchor:chatLocation(chatAnchor)})),before);
  assert.equal(await page.evaluate(()=>composer.focused()),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,800));
  await page.keyboard.press('i');await page.keyboard.type(' k');assert.equal(await page.evaluate(()=>workActivity.dialog.open),false);assert.match(await page.evaluate(()=>draft.value),/ k/);await page.keyboard.press('Escape');
  await page.keyboard.type(' k');await page.locator('#work-activity[open]').waitFor();await page.waitForFunction(()=>!workActivity.loading);await page.keyboard.press('Escape');
  await page.evaluate(()=>{transcript.scrollTop=0;});
  const scrollBefore=await page.evaluate(()=>transcript.scrollTop);
  await page.keyboard.type(' k');await page.locator('#work-activity[open]').waitFor();await page.waitForFunction(()=>!workActivity.loading);await page.keyboard.press('Escape');
  assert.ok(Math.abs(await page.evaluate(()=>transcript.scrollTop)-scrollBefore)<=1,'Cancel restores reading scroll without viewport changes');
  await page.locator('#conversation').focus();await page.keyboard.type(' pf');await page.locator('#picker[open]').waitFor();assert.ok(await page.locator('#picker-preview').isVisible());await page.keyboard.press('Escape');
  await page.evaluate(async()=>{await workActivity.open();workActivity.data.threads=[{...thread,status:'working'}];workActivity.data.captains=[];workActivity.column=2;workActivity.rows=[0,0,0];workActivity.render(false);});
  await page.keyboard.press('Enter');await page.waitForFunction(()=>!workActivity.dialog.open&&!navigating&&!messageBusy);assert.equal(await page.evaluate(()=>thread.id),before.id);
  assert.equal(await page.evaluate(()=>workActivity.timer),null);
  await page.locator('#keymaps-button').click();await page.locator('#map-workActivity').fill('<leader>pf');await page.locator('#keymaps-form').evaluate(f=>f.requestSubmit());assert.match(await page.locator('#keymaps-error').innerText(),/conflict|collision|already|overlap/i);
  await page.locator('#map-workActivity').fill('<leader>zk');await page.locator('#keymaps-form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>$('keymaps-error').textContent.startsWith('Saved.'));await page.locator('#close-keymaps').click();
  await page.locator('#conversation').focus();await page.keyboard.type(' zk');await page.locator('#work-activity[open]').waitFor();await page.waitForFunction(()=>!workActivity.loading);
  const current=await page.evaluate(()=>({id:liveStream.id,token:liveStream.token}));
  await page.evaluate(()=>{workActivity.model=new ActivityState.State();workActivity.data={projects:[],captains:[],threads:[{...thread,status:'idle'}]};workActivity.render(false);});
  await app.evaluate(({BrowserWindow},batch)=>BrowserWindow.getAllWindows()[0].webContents.send('desk:stream',batch),{...current,events:[{event:'turn',data:{phase:'start'}},{event:'transcript',id:'A'.repeat(26),data:{id:'activity-hook-result',source:'assistant',text:'Fixture streamed completion',createdAt:new Date().toISOString()}},{event:'turn',data:{phase:'end',outcome:'settled'}}]});
  await page.waitForFunction(()=>workActivity.model.finished.has(thread.id));
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:threadReceipt');ipcMain.handle('desk:threadReceipt',(_event,value)=>({value:{id:value.id,hasUnreads:false}}));});
  await page.evaluate(()=>readState.write(thread.id,'read','A'.repeat(26)));assert.equal(await page.evaluate(()=>workActivity.model.finished.size),0,'Confirmed read hook clears observed completion');
  await page.keyboard.press('Escape');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:send');ipcMain.handle('desk:send',()=>({error:'Fixture send rejected'}));});
  await page.evaluate(()=>outgoing.submit({threadId:thread.id,text:'Fixture rejected message',clientKey:'fixture-rejected',createdAt:new Date().toISOString()},null));
  assert.equal(await page.evaluate(()=>workActivity.model.sent.size),0,'Rejected sends do not change monitoring order');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:send');ipcMain.handle('desk:send',()=>({value:{id:'B'.repeat(26),deduped:false}}));});
  await page.evaluate(()=>outgoing.submit({threadId:thread.id,text:'Fixture accepted message',clientKey:'fixture-accepted',createdAt:new Date().toISOString()},null));
  assert.equal(await page.evaluate(()=>workActivity.model.sent.has(thread.id)),true,'Accepted send hook records recent reply');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:activity');ipcMain.handle('desk:activity',()=>({error:'Fixture unavailable'}));});
  await page.evaluate(()=>workActivity.open());assert.match(await page.locator('#activity-health').innerText(),/Stale.*Fixture unavailable/);await page.keyboard.press('Escape');
  await app.evaluate(({ipcMain})=>{global.activityReleases=[];global.activityBoth=new Promise(resolve=>{global.activityBothReady=resolve;});ipcMain.removeHandler('desk:activity');ipcMain.handle('desk:activity',()=>new Promise(resolve=>{activityReleases.push(()=>resolve({value:{threads:[],captains:[],projects:[],activity:[]}}));if(activityReleases.length===2)activityBothReady();}));});
  await page.evaluate(()=>{globalThis.activityOpening=workActivity.open();});await page.locator('#work-activity[open]').waitFor();assert.equal(await page.evaluate(()=>workActivity.loading),true);
  const reopened=await page.evaluate(async()=>{const closed=new Promise(resolve=>activityDialog.addEventListener('close',resolve,{once:true}));activityDialog.close();globalThis.activityReopening=workActivity.open();const request=workActivity.request;await closed;return {open:activityDialog.open,loading:workActivity.loading,sameRequest:request===workActivity.request,focus:document.activeElement.id};});
  assert.deepEqual(reopened,{open:true,loading:true,sameRequest:true,focus:'activity-board'},'A queued close event must not cancel the reopened panel');
  await app.evaluate(()=>activityBoth);
  await page.keyboard.press('Escape');await app.evaluate(()=>activityReleases.forEach(release=>release()));await page.evaluate(()=>Promise.all([activityOpening,activityReopening]));assert.equal(await page.evaluate(()=>workActivity.dialog.open),false);assert.equal(await page.evaluate(()=>workActivity.timer),null);
  assert.deepEqual(errors,[]);console.log('PASS activity hidden rendering, three columns/right preview, known ask/result, recent reply order, selection, responsive bounds, reversible composer/draft/history, Insert isolation, Enter commit, timer cleanup, keymap collision/remap and search split preview');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
