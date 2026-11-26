const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-provider-'));let app;
  try{
    app=await _electron.launch({args:['.','--demo','--test-provider=memory','--user-data-dir='+profile],env:{...process.env,CAPY_API_KEY:''}});
    const page=await app.firstWindow();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&!navigating&&thread?.id==='t1'&&providerInfo?.id==='memory'&&!messageBusy);
    assert.equal(await page.evaluate(()=>providerInfo.capabilities.hierarchy.supported),false);
    assert.equal(await page.locator('#activity-links').isHidden(),true);
    assert.equal(await page.locator('#send').innerText(),'Send reply');
    assert.equal(await page.evaluate(async()=>(await client.info()).id),'memory');
    await page.evaluate(()=>showPicker('captains'));
    assert.equal(await page.locator('#picker').evaluate(dialog=>dialog.open),false);
    assert.match(await page.locator('#notice').innerText(),/no captain or crew/);
    assert.match(await page.locator('#entries').innerText(),/In-memory provider content/);
    assert.doesNotMatch(await page.locator('#entries').innerText(),/release checklist/i);
    await page.locator('#conversation-model').click();await page.waitForFunction(()=>!$('model-apply').disabled);
    await page.locator('#reply-model').selectOption('memory/model');await page.locator('#model-apply').click();
    await page.evaluate(()=>{draft.value='Sent through the provider contract';updateSend();});
    await page.locator('#send').click();await page.waitForFunction(()=>!pending&&[...outgoing.items.values()].some(i=>i.state==='accepted'));
    assert.equal(await page.evaluate(()=>[...outgoing.items.values()].at(-1).receiptId),'message/1');
    assert.equal(await page.evaluate(()=>[...outgoing.items.values()].at(-1).delivery),'local');
    assert.match(await page.locator('#entries').innerText(),/Sent through the provider contract/);
    assert.doesNotMatch(await page.locator('#entries').innerText(),/Queued · accepted/);
    await page.waitForFunction(()=>readState.cursor()==='cursor:message/1');
    const read=await page.evaluate(()=>client.markRead({id:'t1',action:'read',eventId:readState.cursor()}));assert.equal(read.hasUnreads,false);
    await page.locator('#threads [data-id="t2"]').click();await page.waitForFunction(()=>!navigating&&!messageBusy&&thread?.id==='t2');
    assert.match(await page.locator('#entries').innerText(),/In-memory provider content/);
    await page.locator('#threads [data-id="t1"]').click();await page.waitForFunction(()=>!navigating&&!messageBusy&&thread?.id==='t1');
    await page.locator('#new-thread-button').click();await page.waitForFunction(()=>!newThread.loading);
    await page.locator('#new-prompt').fill('Unsupported creation stays disabled');
    assert.equal(await page.locator('#new-submit').isDisabled(),true);
    assert.match(await page.locator('#new-submit').getAttribute('title'),/cannot create/);await page.locator('#new-close').click();
    await page.evaluate(()=>{draft.value='Memory-only draft';drafts.set('t1','Memory-only draft');updateSend();});
    const memoryScope=await page.evaluate(()=>providerInfo.scope);
    await app.evaluate(()=>{
      global.fetch=async(url,init)=>{
        const u=new URL(url);
        if(u.pathname.endsWith('/projects'))return Response.json({items:[{id:'p1',name:'Capy account fixture'}]});
        if(u.pathname.endsWith('/captains'))return Response.json({items:[],cursor:null});
        if(u.pathname.endsWith('/models'))throw Object.assign(Error('Fixture network failed'),{code:'ECONNRESET'});
        if(u.pathname.endsWith('/threads'))return Response.json({items:[{id:'t1',projectId:'p1',title:'Same ID, other provider',status:'idle'}],cursor:null});
        if(u.pathname.endsWith('/messages'))return Response.json({items:[{id:'capy-message',source:'assistant',text:'Capy fixture account only'}],cursor:null,beforeCursor:null});
        if(u.pathname.endsWith('/t1'))return Response.json({id:'t1',hasUnreads:false});
        if(u.pathname.endsWith('/stream'))return new Response('',{status:404});
        throw Error('Unexpected fixture route');
      };
    });
    await page.locator('#connect').click();await page.locator('#key').fill('capy_'+'x'.repeat(43));await page.locator('#remember-key').uncheck();await page.locator('#save-key').click();
    await page.waitForFunction(()=>typeof providerInfo!=='undefined'&&providerInfo?.id==='capy'&&!changingConnection&&keyReady&&workTree.loaded);
    await page.locator('#threads [data-id="t1"]').click();await page.waitForFunction(()=>!navigating&&!messageBusy&&thread?.id==='t1');
    assert.equal(await page.evaluate(()=>draft.value),'');
    assert.notEqual(await page.evaluate(()=>providerInfo.scope),memoryScope);
    assert.match(await page.locator('#entries').innerText(),/Capy fixture account only/);
    assert.doesNotMatch(await page.locator('#entries').innerText(),/Sent through the provider contract/);
    assert.equal(await page.evaluate(async()=>{try{await client.models();}catch(error){return error.code;}}),'provider');
    await page.locator('#connection-mode').selectOption('mock');
    await page.waitForFunction(()=>typeof providerInfo!=='undefined'&&providerInfo?.id==='memory'&&!changingConnection&&keyReady&&!navigating&&thread?.id==='t1');
    assert.equal(await page.evaluate(()=>draft.value),'Memory-only draft');
    assert.equal(await page.evaluate(()=>conversationControls.choices.size),0);
    assert.equal(await page.evaluate(()=>outgoing.items.size),0);
    assert.equal(await page.evaluate(()=>providerInfo.scope),memoryScope);
    const capture=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {hidden:!w.isVisible()&&!w.isFocused(),png:(await w.capturePage()).toPNG().toString('base64')};});
    assert.equal(capture.hidden,true);assert.ok(Buffer.from(capture.png,'base64').length>20000);
    if(process.argv[2]){await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(path.join(process.argv[2],'provider-memory.png'),Buffer.from(capture.png,'base64'));}
    const stale=await page.evaluate(async()=>{
      await desk.setMode('live');
      try{await client.content('t1',{});return 'unexpected success';}catch(error){return {code:error.code,message:error.message};}
    });
    assert.equal(stale.code,'stale','An old facade cannot start a new-provider read before the renderer reloads: '+JSON.stringify(stale));
    const staleSettings=await page.evaluate(async()=>{
      try{await client.saveWorkspaceSettings(workTree.config);return 'unexpected success';}catch(error){return error.code;}
    });
    assert.equal(staleSettings,'stale','A delayed settings save cannot write old provider IDs into the new account');
    const staleAfterInfo=await page.evaluate(async()=>{
      await client.info();
      try{await client.content('t1',{});return 'unexpected success';}catch(error){return error.code;}
    });
    assert.equal(staleAfterInfo,'stale','Reading new provider metadata does not silently rebind an old renderer');
    assert.deepEqual(errors,[]);
    console.log('PASS provider shell: memory send/stream/opaque read/model/navigation, capability gates, account/provider cache isolation; hidden capture verified');
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
