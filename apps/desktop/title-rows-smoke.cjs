const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-title-rows-'));let app;
  try{
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&thread&&!navigating&&!messageBusy);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>{
      globalThis.rowData={projects:[{id:project,name:'Release project'}],captains:[{id:'title-cap',projectId:project,isCaptain:true,title:'Coordinate release',status:'idle'}],threads:[
        {id:'title-work',projectId:project,parentId:'title-cap',title:'Check the signed bundle with a deliberately long title to keep readable across narrow panes',code:'ROW-1',status:'working',hasUnreads:true},
        {id:'title-idle',projectId:project,title:'Review notes',status:'idle'},
        {id:'title-ask',projectId:project,title:'Choose candidate',status:'waiting',needsYou:true,ask:{key:'pick',text:'Pick A or B before continuing.'}},
        {id:'title-fail',projectId:project,title:'Investigate failure',status:'failed'}],activity:[]};
      workTree.enabled=true;workTree.config={...WorkTree.defaults(),projectRoots:true,expanded:['project:'+project,'title-cap']};
      workTree.state.accept(rowData);catalog=rowData;workTree.controls();workTree.render();
      pins=['title-work'];renderPins();
      globalThis.visibleRowText=node=>{const clone=node.cloneNode(true);clone.querySelectorAll('.row-details,.work-indicator,.unread-label,.attention-indicator,.tree-disclosure').forEach(n=>n.remove());return clone.textContent.trim();};
    });
    const work=page.locator('#threads [data-id="title-work"]');await work.waitFor();
    assert.equal(await work.getAttribute('aria-level'),'3');assert.equal(await work.getAttribute('data-parent'),'title-cap');
    assert.match(await work.getAttribute('title'),/crew of Coordinate release/);
    await assertRows('#threads button');
    assert.equal(await work.locator('.working svg').count(),1);assert.equal(await work.locator('.unread-dot').count(),1);
    assert.equal(await page.locator('#threads [data-id="title-idle"] .work-indicator').isHidden(),true);
    assert.equal(await page.locator('#threads [aria-label="Needs input"]').count(),1);assert.equal(await page.locator('#threads [aria-label="Failed"]').count(),1);
    assert.match(await work.textContent(),/Unread/);
    const accessible=await work.ariaSnapshot();assert.match(accessible,/crew of Coordinate release/);assert.match(accessible,/Working/);assert.match(accessible,/Unread/);
    const clipped=await work.locator('.row-details').first().evaluate(n=>({width:n.getBoundingClientRect().width,clip:getComputedStyle(n).clipPath,position:getComputedStyle(n).position}));
    assert.deepEqual(clipped,{width:1,clip:'inset(50%)',position:'absolute'});
    await assertRows('#pin-list button');
    await work.evaluate(n=>n.scrollIntoView({block:'center'}));await capture('title-sidebar.png');
    await page.evaluate(()=>{showPicker('centralSearch');search.value='signed';renderPicker(false);});
    assert.equal(await page.locator('#picker-list [role="option"]').count(),1);await assertRows('#picker-list [role="option"]');
    assert.match(await page.locator('#picker-list [role="option"]').getAttribute('title'),/crew of Coordinate release/);
    assert.equal(await page.locator('#picker-list .result-summary').count(),0);
    await capture('title-picker.png');await page.keyboard.press('Escape');
    await page.evaluate(async()=>{await workActivity.open();workActivity.data=rowData;workActivity.render(false);});
    await assertRows('.activity-card');assert.match(await page.locator('#activity-preview-text').innerText(),/Pick A or B/);
    assert.deepEqual(await page.locator('.activity-column h3').allTextContents(),['Needs you','Recently finished','Working']);
    await capture('title-activity.png');
    await page.getByRole('button',{name:'List',exact:true}).click();await assertRows('.activity-card');await capture('title-activity-list.png');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(640,600));
    for(const zoom of [.5,1,2]){
      await app.evaluate(({BrowserWindow},z)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z),zoom);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);
      assert.equal(await page.evaluate(()=>$('work-activity').scrollWidth<=$('work-activity').clientWidth),true);
    }
    assert.deepEqual(errors,[]);console.log('PASS title-only tree/sidebar/pins/picker/activity columns and list; accessible ancestry/state, fresh cube/unread dot/attention, long titles, reduced motion, 50–200% root bounds');
    async function assertRows(selector){for(const row of await page.locator(selector).all())assert.equal(await row.evaluate(n=>visibleRowText(n)),await row.locator('.thread-name').evaluate(n=>visibleRowText(n)));}
    async function capture(name){if(!process.argv[2])return;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const proof=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],im=await w.capturePage(),b=im.toBitmap();return {visible:w.isVisible(),focused:w.isFocused(),colors:new Set(Array.from({length:b.length/4},(_,i)=>b.readUInt32LE(i*4))).size,png:im.toPNG().toString('base64')};});assert.equal(proof.visible,false);assert.equal(proof.focused,false);assert.ok(proof.colors>100);await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(path.join(process.argv[2],name),Buffer.from(proof.png,'base64'));}
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
