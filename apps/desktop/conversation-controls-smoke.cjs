const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-model-runtime-'));let app;
  try{
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
    const page=await app.firstWindow();await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&!messageBusy&&thread?.id==='t1');
    await app.evaluate(()=>{
      global.calls=[];global.posts=[];global.holdMetadata=false;global.metadataWait=[];global.rejectModels=false;global.holdModels=false;global.modelWait=[];
      global.catalog=[{id:'model-a',name:'Model A',billing:'Fixture subscription',reasoningModes:['low','high'],fast:true,pro:false,ultrafast:false},{id:'model-b',name:'Model B',billing:'Capy API',reasoningModes:['medium'],fast:false,pro:true,ultrafast:false}];
      global.fetch=async(url,init)=>{
        const u=new URL(url);if(u.origin!=='https://api.capy.ai')throw Error('Unexpected origin');
        calls.push({path:u.pathname,method:init.method,body:init.body&&JSON.parse(init.body)});
        if(u.pathname.endsWith('/stream'))return new Response(new ReadableStream({start(c){init.signal.addEventListener('abort',()=>c.close());}}),{headers:{'Content-Type':'text/event-stream'}});
        if(init.method==='POST')return new Promise((resolve,reject)=>posts.push({resolve,reject,body:JSON.parse(init.body)}));
        if(u.pathname.endsWith('/projects'))return Response.json({items:[{id:'p',name:'Fixture'}]});
        if(u.pathname.endsWith('/captains'))return Response.json({items:[],cursor:null});
        if(u.pathname.endsWith('/threads'))return Response.json({items:['a','b'].map(id=>({id,projectId:'p',title:'Fixture '+id,status:'idle'})),cursor:null});
        if(u.pathname.endsWith('/models')){if(holdModels)await new Promise(resolve=>modelWait.push(resolve));return rejectModels?new Response('',{status:503}):Response.json({items:catalog,default:{}});}
        if(u.pathname.endsWith('/messages'))return Response.json({items:[{id:'history',source:'assistant',text:'Stable conversation context'}],cursor:null,beforeCursor:null});
        if(/\/threads\/[ab]$/.test(u.pathname)){
          const id=u.pathname.split('/').at(-1);
          if(holdMetadata)await new Promise(resolve=>metadataWait.push(resolve));
          return Response.json({id,lastModelId:id==='a'?'model-old':'model-b',hasUnreads:false,machine:id==='a'?'cloud':'device',device:{name:'Fake Mac'}});
        }
        if(init.method==='PUT')return Response.json({id:'a',hasUnreads:false});
        throw Error('Unexpected fixture path '+u.pathname);
      };
    });
    await page.evaluate(()=>changeConnection(()=>desk.connect('capy_'+'x'.repeat(43),false)));
    await page.waitForFunction(()=>typeof keyReady!=='undefined'&&!demoMode&&keyReady&&workTree.loaded);
    await page.evaluate(()=>openThread(workTree.state.data.threads.find(t=>t.id==='a'),{focus:'conversation'}));
    await page.waitForFunction(()=>!messageBusy&&!conversationControls.loading);
    assert.match(await page.locator('#conversation-last-model').innerText(),/model-old/);
    assert.match(await page.locator('#conversation-runtime').innerText(),/unknown.*not exposed/);
    await page.evaluate(()=>{draft.value='Preserved draft';updateSend();});
    const beforePosts=await app.evaluate(()=>posts.length);
    await page.locator('#conversation-model').click();await page.waitForFunction(()=>!$('model-apply').disabled);
    await page.locator('#reply-model').selectOption('model-a');await page.locator('#reply-reasoning').selectOption('high');
    await page.locator('#reply-modes [data-mode="fast"]').check();
    assert.equal(await page.locator('#reply-modes [data-mode="pro"]').isDisabled(),true);
    await page.locator('#model-apply').click();
    assert.match(await page.locator('#conversation-model').innerText(),/Next message: model-a/);
    assert.match(await page.locator('#conversation-last-model').innerText(),/model-old/);
    assert.equal(await page.evaluate(()=>draft.value),'Preserved draft');assert.equal(await app.evaluate(()=>posts.length),beforePosts);
    await page.evaluate(()=>{$('conversation').focus();});await page.keyboard.type(' tm');
    await page.locator('#conversation-settings[open]').waitFor();await page.waitForFunction(()=>!$('model-apply').disabled);
    await page.locator('#reply-model').selectOption('model-b');
    assert.equal(await page.locator('#reply-reasoning').inputValue(),'');
    assert.equal(await page.locator('#reply-modes [data-mode="fast"]').isChecked(),false);
    await page.locator('#reply-reasoning').selectOption('medium');await page.locator('#reply-modes [data-mode="pro"]').check();
    await page.locator('#model-close').click();assert.match(await page.locator('#conversation-model').innerText(),/model-a/);
    await app.evaluate(()=>{rejectModels=true;});await page.locator('#conversation-model').click();
    await page.waitForFunction(()=>$('model-error').textContent.includes('HTTP 503'));
    assert.equal(await page.locator('#model-apply').isDisabled(),true);
    await page.locator('#model-close').click();await app.evaluate(()=>{rejectModels=false;});
    await page.evaluate(()=>{$('composer').requestSubmit($('send'));});await page.waitForFunction(()=>pending);
    await waitPosts(1);
    const first=await app.evaluate(()=>posts[0].body);
    assert.deepEqual(first.model,{modelId:'model-a',reasoningMode:'high',modes:{fast:true}});assert.equal(first.delivery,'queue');
    await app.evaluate(()=>posts[0].resolve(new Response('',{status:400})));
    await page.waitForFunction(()=>!pending&&document.querySelector('[data-outgoing="failed"] button'));
    assert.equal(await page.evaluate(()=>draft.value),'Preserved draft');assert.match(await page.locator('#conversation-model').innerText(),/model-a/);
    await page.locator('#conversation-model').click();await page.waitForFunction(()=>!$('model-apply').disabled);
    await page.locator('#reply-model').selectOption('model-b');await page.locator('#reply-reasoning').selectOption('medium');
    await page.locator('#reply-modes [data-mode="pro"]').check();await page.locator('#model-apply').click();
    await page.locator('[data-outgoing="failed"] button').click();await waitPosts(2);
    assert.deepEqual(await app.evaluate(()=>posts[1].body),first,'Retry keeps the original model and client key');
    await app.evaluate(()=>posts[1].resolve(Response.json({id:'01J00000000000000000000011',deduped:false})));
    await page.waitForFunction(()=>!pending);assert.match(await page.locator('#conversation-model').innerText(),/model-b/,'Newer next-message selection survives earlier receipt');
    await page.evaluate(()=>{draft.value='Second draft';updateSend();$('composer').requestSubmit($('send'));});await waitPosts(3);
    assert.deepEqual(await app.evaluate(()=>posts[2].body.model),{modelId:'model-b',reasoningMode:'medium',modes:{pro:true}});
    await app.evaluate(()=>posts[2].resolve(Response.json({id:'01J00000000000000000000012',deduped:false})));
    await page.waitForFunction(()=>!pending);assert.equal(await page.evaluate(()=>conversationControls.choices.has('a')),false);
    await page.locator('#conversation-model').click();await page.waitForFunction(()=>!$('model-apply').disabled);
    await page.evaluate(()=>{conversationControls.choices.set('a',{modelId:'retired'});});await page.locator('#model-reload').click();
    await page.waitForFunction(()=>$('reply-model').value==='retired'&&!$('model-apply').disabled);await page.locator('#model-apply').click();
    await page.waitForFunction(()=>$('model-error').textContent.includes('no longer available'));assert.equal(await page.evaluate(()=>conversationControls.choices.get('a').modelId),'retired');
    await page.locator('#reply-model').selectOption('');await page.locator('#model-apply').click();
    await app.evaluate(()=>{holdMetadata=true;});
    await page.evaluate(()=>conversationControls.select(thread));await page.waitForFunction(()=>conversationControls.loading);
    assert.match(await page.locator('#conversation-runtime').innerText(),/loading/);
    await page.evaluate(()=>openThread(workTree.state.data.threads.find(t=>t.id==='b'),{focus:'conversation'}));
    await app.evaluate(()=>{holdMetadata=false;for(const resolve of metadataWait)resolve();metadataWait=[];});
    await page.waitForFunction(()=>thread?.id==='b'&&!conversationControls.loading&&!messageBusy);
    assert.match(await page.locator('#conversation-last-model').innerText(),/model-b/,'Stale a metadata cannot overwrite b');
    assert.match(await page.locator('#conversation-runtime').innerText(),/unknown/,'Undocumented device data cannot become a host claim');
    await app.evaluate(()=>{holdModels=true;});await page.evaluate(()=>{void conversationControls.open();});
    await app.evaluate(async()=>{for(let i=0;i<100&&!modelWait.length;i++)await new Promise(r=>setTimeout(r,20));if(!modelWait.length)throw Error('Missing model request');});
    await page.evaluate(()=>openThread(workTree.state.data.threads.find(t=>t.id==='a'),{focus:'conversation'}));
    await app.evaluate(()=>{holdModels=false;for(const resolve of modelWait)resolve();modelWait=[];});
    await page.waitForFunction(()=>!conversationControls.loading&&!$('conversation-settings').open&&!messageBusy);
    assert.equal(await page.evaluate(()=>conversationControls.choices.size),0,'Stale catalog never saves a choice into the new context');
    await page.evaluate(()=>openThread(workTree.state.data.threads.find(t=>t.id==='b'),{focus:'conversation'}));
    await page.evaluate(()=>{draft.value='Insert owns typing';insertDraft();});
    await page.keyboard.type(' tm');assert.equal(await page.locator('#conversation-settings').evaluate(n=>n.open),false);
    await page.evaluate(()=>normalDraft());await page.keyboard.type(' tm');await page.locator('#conversation-settings[open]').waitFor();
    await page.waitForFunction(()=>!$('model-apply').disabled);
    await page.locator('#reply-model').selectOption('model-a');await page.locator('#reply-reasoning').selectOption('high');await page.locator('#reply-modes [data-mode="fast"]').check();
    if(process.argv[2]){
      await fs.mkdir(process.argv[2],{recursive:true});
      await shot('model-controls.png');
    }
    await page.locator('#model-apply').click();
    if(process.argv[2])await shot('model-runtime.png');
    await page.setViewportSize({width:640,height:600});
    const geometry=await page.locator('#conversation-model').boundingBox();assert.ok(geometry.x>=0&&geometry.x+geometry.width<=640);
    await page.locator('#conversation-model').click();await page.waitForFunction(()=>!$('model-apply').disabled);
    const applyBox=await page.locator('#model-apply').boundingBox();assert.ok(applyBox.y>=0&&applyBox.y+applyBox.height<=600);
    if(process.argv[2])await shot('model-controls-narrow.png');await page.locator('#model-close').click();
    await page.setViewportSize({width:1140,height:728});
    const postCount=await app.evaluate(()=>posts.length);await app.evaluate(()=>{catalog=catalog.filter(m=>m.id!=='model-a');});
    await page.evaluate(()=>{draft.value='Stale catalog draft';updateSend();$('composer').requestSubmit($('send'));});
    await page.waitForFunction(()=>!pending&&document.querySelector('[data-outgoing="failed"] button'));
    assert.equal(await app.evaluate(()=>posts.length),postCount,'Main process revalidates catalog before any POST');
    assert.equal(await page.evaluate(()=>draft.value),'Stale catalog draft');
    assert.match(await page.locator('#notice').innerText(),/no longer available/);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
    console.log('PASS hidden model controls: no save sends, last/next scope, catalog constraints, reload failure, original-model retry, newer selection retention, stale metadata, unknown host, keyboard Normal/Insert ownership');
    async function waitPosts(count){await app.evaluate(async(_,count)=>{for(let i=0;i<100&&posts.length<count;i++)await new Promise(r=>setTimeout(r,20));if(posts.length!==count)throw Error('Missing fixture POST');},count);}
    async function shot(name){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];assertHidden(w);return(await w.capturePage()).toPNG().toString('base64');function assertHidden(w){if(w.isVisible()||w.isFocused())throw Error('Visible test');}});await fs.writeFile(path.join(process.argv[2],name),Buffer.from(png,'base64'));}
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
