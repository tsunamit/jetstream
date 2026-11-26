const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-create-'));let app;
  try{
    app=await _electron.launch({args:['.','--live','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
    const page=await app.firstWindow();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady);
    await app.evaluate(()=>{
      global.posts=[];global.projectItems=[{id:'p1',name:'Jetstream'},{id:'p2',name:'Observatory'}];global.created=[];
      global.rejectCreate=false;global.catalogFailure=false;global.delayNextModel=false;
      global.fetch=async(url,init)=>{
        const u=new URL(url),json=Response.json;
        if(u.pathname.endsWith('/projects'))return json({items:global.projectItems});
        if(u.pathname.endsWith('/models')){
          if(global.catalogFailure)return json({}, {status:403});
          const result={items:[{id:'m1',name:'Sol',billing:'Fixture subscription',reasoningModes:['low','high'],fast:true,pro:false,ultrafast:false}],default:{modelId:'m1'}};
          if(global.delayNextModel){global.delayNextModel=false;await new Promise(resolve=>{global.releaseCatalog=resolve;});result.items.push({id:'stale-model',name:'Stale',reasoningModes:[]});}
          return json(result);
        }
        if(u.pathname.endsWith('/captains'))return json({items:[{id:'captain-entity-one',projectId:'p1',name:'Release captain',status:'idle'},{id:'captain-entity-two',projectId:'p2',name:'Observatory captain',status:'idle'},{id:'retired',projectId:'p1',name:'Retired',archived:true}],cursor:null});
        if(u.pathname.endsWith('/threads')&&init.method==='POST'){
          const body=JSON.parse(init.body);global.posts.push(body);
          if(global.rejectCreate)return json({_tag:'capy/CrewRefused',message:'Never show this server payload'}, {status:409});
          await new Promise(r=>setTimeout(r,120));
          const item={id:'created-thread',projectId:body.projectId,title:'Created fixture',status:'working',...(body.captainId?{captain:{jamId:body.captainId,name:'Release captain'}}:{})};global.created.push(item);return json(item);
        }
        if(u.pathname.endsWith('/threads'))return json({items:global.created.filter(t=>t.projectId===u.searchParams.get('projectId')),cursor:null});
        if(u.pathname.endsWith('/messages'))return json({items:[],cursor:null,beforeCursor:null});
        if(u.pathname.endsWith('/created-thread'))return json({...global.created[0],hasUnreads:false});
        if(u.pathname.endsWith('/stream'))return new Response('',{status:404});
        throw Error('Unexpected fixture route '+u.pathname);
      };
    });
    await page.locator('#connect').click();await page.locator('#key').fill('capy_'+'x'.repeat(43));await page.locator('#remember-key').uncheck();await page.locator('#save-key').click();
    await page.waitForFunction(()=>keyReady&&!changingConnection&&workTree.loaded&&!workTree.busy);
    assert.equal(await page.evaluate(()=>thread),undefined);
    await page.locator('#toggle-sidebar').click();assert.equal(await page.locator('#navigator').isVisible(),false);
    await page.locator('#new-thread-top-button').click();await page.waitForFunction(()=>newThread.ready);
    assert.equal(await page.locator('#new-prompt').evaluate(e=>e===document.activeElement),true);
    assert.equal(await page.locator('#new-project').inputValue(),'p1');assert.equal(await page.locator('#new-captain').inputValue(),'');
    assert.deepEqual(await page.locator('#new-captain option').evaluateAll(xs=>xs.map(x=>x.value)),['','captain-entity-one']);
    await page.locator('#new-captain').selectOption('captain-entity-one');await page.locator('#new-model').selectOption('m1');await page.locator('#new-reasoning').selectOption('high');await page.locator('[data-mode="fast"]').check();
    await page.locator('#new-prompt').fill('Keep my draft and exact options');
    await page.keyboard.type(' jk tn');assert.match(await page.locator('#new-prompt').inputValue(),/ jk tn$/);
    const draft=await page.locator('#new-prompt').inputValue();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#new-thread-top-button').evaluate(e=>e===document.activeElement),true);
    await page.locator('#new-thread-top-button').click();await page.waitForFunction(()=>newThread.ready);
    assert.equal(await page.locator('#new-prompt').inputValue(),draft);assert.equal(await page.locator('#new-captain').inputValue(),'captain-entity-one');
    await page.locator('#new-project').selectOption('p2');assert.equal(await page.locator('#new-captain').inputValue(),'');assert.equal(await page.locator('#new-model').inputValue(),'');assert.equal(await page.locator('#new-prompt').inputValue(),draft);
    assert.deepEqual(await page.locator('#new-captain option').evaluateAll(xs=>xs.map(x=>x.value)),['','captain-entity-two']);
    await page.locator('#new-project').selectOption('p1');await page.locator('#new-captain').selectOption('captain-entity-one');
    assert.equal(await app.evaluate(()=>global.posts.length),0);
    await app.evaluate(()=>{global.catalogFailure=true;});await page.locator('#new-reload').click();await page.waitForFunction(()=>!newThread.loading);
    assert.equal(await page.locator('#new-submit').isDisabled(),true);assert.match(await page.locator('#new-error').innerText(),/HTTP 403/);assert.equal(await page.locator('#new-prompt').inputValue(),draft);
    await app.evaluate(()=>{global.catalogFailure=false;});await page.locator('#new-reload').click();await page.waitForFunction(()=>newThread.ready);
    await app.evaluate(()=>{global.projectItems=[];});await page.locator('#new-reload').click();await page.waitForFunction(()=>!newThread.loading);assert.match(await page.locator('#new-error').innerText(),/No projects/);assert.equal(await page.locator('#new-submit').isDisabled(),true);
    await app.evaluate(()=>{global.projectItems=[{id:'p1',name:'Jetstream'},{id:'p2',name:'Observatory'}];});await page.locator('#new-reload').click();await page.waitForFunction(()=>newThread.ready);
    await app.evaluate(()=>{global.delayNextModel=true;});await page.locator('#new-reload').click();await page.waitForFunction(()=>newThread.loading);await page.locator('#new-close').click();
    await page.locator('#new-thread-top-button').click();await page.waitForFunction(()=>newThread.ready);await app.evaluate(()=>global.releaseCatalog());await page.waitForTimeout(70);
    assert.equal(await page.locator('#new-model option[value="stale-model"]').count(),0);
    await page.locator('#new-project').selectOption('p1');await page.locator('#new-captain').selectOption('captain-entity-one');await page.locator('#new-model').selectOption('m1');await page.locator('#new-reasoning').selectOption('high');await page.locator('[data-mode="fast"]').check();
    if(process.argv[2]){
      await fs.mkdir(process.argv[2],{recursive:true});
      for(const zoom of [1,2]){
        await app.evaluate(({BrowserWindow},factor)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(640,600);w.webContents.setZoomFactor(factor);},zoom);
        await page.waitForTimeout(70);await page.locator('#new-prompt').focus();
        assert.equal(await page.locator('#new-thread').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
        for(let i=0;i<12;i++){await page.keyboard.press('Tab');const ok=await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return $('new-thread').contains(e)&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;});assert.equal(ok,true,'Tab target remains within viewport');}
        await page.locator('#new-prompt').focus();
        const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];assertHidden= !w.isVisible()&&!w.isFocused();if(!assertHidden)throw Error('Visible test');return (await w.capturePage()).toPNG().toString('base64');});
        await fs.writeFile(path.join(process.argv[2],'new-thread-'+(zoom*100)+'.png'),Buffer.from(png,'base64'));
      }
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    }
    await app.evaluate(()=>{global.rejectCreate=true;});await page.locator('#new-submit').click();await page.waitForFunction(()=>!newThread.busy);
    assert.match(await page.locator('#new-error').innerText(),/Captain access refused/);assert.doesNotMatch(await page.locator('#new-error').innerText(),/server payload/);assert.equal(await app.evaluate(()=>global.created.length),0);
    await app.evaluate(()=>{global.rejectCreate=false;});await page.locator('#new-thread-form').evaluate(f=>{f.requestSubmit($('new-submit'));f.requestSubmit($('new-submit'));});
    await page.waitForFunction(()=>!newThread.busy&&!navigating&&!workTree.busy&&thread?.id==='created-thread');
    const posts=await app.evaluate(()=>global.posts);assert.equal(posts.length,2);assert.equal(posts[0].requestId,posts[1].requestId);assert.equal(posts[1].captainId,'captain-entity-one');assert.deepEqual(posts[1].model,{modelId:'m1',reasoningMode:'high',modes:{fast:true}});
    await page.locator('#new-thread-top-button').click();await page.waitForFunction(()=>newThread.ready);assert.equal(await page.locator('#new-prompt').inputValue(),'');assert.equal(await page.locator('#new-captain').inputValue(),'');await page.keyboard.press('Escape');
    await page.locator('#conversation').focus();await page.keyboard.type(' tn');await page.locator('#new-thread[open]').waitFor();await page.waitForFunction(()=>newThread.ready);await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
    console.log('PASS empty workspace/header entry, scoped Captain catalog, draft/cancel/reset, project change, permissions/retry/no projects, stale catalogs, atomic assignment refusal/requestId retry/duplicate submit, keyboard/focus, 640x600 at 100/200%; hidden fixtures only');
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
