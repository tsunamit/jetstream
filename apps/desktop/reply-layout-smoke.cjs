const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-reply-layout-')),before=process.argv.includes('--before');
 const out=path.join(os.homedir(),'.capy/work/JETS-39/renders',before?'before':'after');let app;
 await fs.mkdir(out,{recursive:true});
 try {
  app=await _electron.launch({args:['.','--demo','--test-hidden','--user-data-dir='+profile]});
  const page=await app.firstWindow();await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>keyReady&&!navigating&&layoutView.ready);
  const shot=async name=>{await page.waitForTimeout(150);const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Test window visible');return(await w.capturePage()).toPNG().toString('base64');});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(png,'base64'));};
  for(const [width,height,zoom] of [[1200,850,1],[640,600,1],[640,600,2]]) {
   await app.evaluate(({BrowserWindow},s)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(s[0],s[1]);w.webContents.setZoomFactor(s[2]);},[width,height,zoom]);
   await page.evaluate(()=>{composer.setText('');composer.normal();});await shot(`${width}-${zoom}-empty-normal`);
   if(!before){
    await page.locator('#edit-reply').click();assert.equal(await page.evaluate(()=>composer.mode()),'insert');
    assert.equal(await page.locator('#send').isDisabled(),true);
    assert.equal(await page.locator('#composer-title').evaluate(n=>getComputedStyle(n).clipPath),'inset(50%)');
   }
   await page.evaluate(()=>{composer.insert();composer.setText('A concise reply, ready to queue.');});await shot(`${width}-${zoom}-filled-insert`);
   if(!before){
    assert.equal(await page.locator('#notice').innerText(),'');
    const geometry=await page.evaluate(()=>{const line=composer.view.contentDOM.querySelector('.cm-line').getBoundingClientRect(),actions=document.querySelector('#composer .composer-actions').getBoundingClientRect(),send=$('send').getBoundingClientRect(),edit=$('edit-reply').getBoundingClientRect();return {left:line.left-actions.left,right:send.right-actions.right,center:send.y+send.height/2-edit.y-edit.height/2,contained:send.bottom<=$('composer').getBoundingClientRect().bottom,root:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight};});
    assert.ok(Math.abs(geometry.left)<1,JSON.stringify(geometry));assert.ok(Math.abs(geometry.right)<1,JSON.stringify(geometry));assert.ok(Math.abs(geometry.center)<1,JSON.stringify(geometry));assert.ok(geometry.contained);assert.ok(geometry.root);
   }
   await page.evaluate(()=>{composer.setText('A long wrapped draft. '.repeat(250));composer.view.dispatch({selection:{anchor:composer.view.state.doc.length}});composer.measure(true);});await shot(`${width}-${zoom}-long`);
  }
  if(!before){
   await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:send');ipcMain.handle('desk:send',()=>new Promise((_resolve,reject)=>{globalThis.rejectReply=()=>reject(Error('Fixture offline: delivery uncertain'));}));});
   await page.evaluate(()=>{composer.setText('Keep this draft on failure');$('composer').requestSubmit($('send'));});await page.waitForFunction(()=>pending);await shot('sending');assert.equal(await page.locator('#send').isDisabled(),true);
   await app.evaluate(()=>globalThis.rejectReply());await page.waitForFunction(()=>!pending&&$('notice').textContent.includes('Fixture offline'));
   await page.locator('#notice').scrollIntoViewIfNeeded();await shot('error');assert.equal(await page.evaluate(()=>draft.value),'Keep this draft on failure');assert.ok(await page.getByRole('button',{name:'Retry send'}).count());
   assert.ok(await page.evaluate(()=>$('notice').getBoundingClientRect().top>=draft.getBoundingClientRect().bottom),'failure must not overlap the editor');
   await page.locator('#send').scrollIntoViewIfNeeded();assert.ok(await page.locator('#send').isVisible());
   await page.evaluate(()=>say('Queued · accepted.',50));await page.waitForFunction(()=>$('notice').textContent==='');
   await page.evaluate(()=>{say('Queued · accepted.',50);fail(Error('Persistent actionable failure'));});await page.waitForTimeout(100);assert.equal(await page.locator('#notice').innerText(),'Persistent actionable failure');
  }
  console.log('PASS hidden reply layout states '+(before?'before':'after')+' at wide, 640×600 and 200% zoom');
 }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
