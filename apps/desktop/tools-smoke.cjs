const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-tools-'));let app;
  try{
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});const page=await app.firstWindow();
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>keyReady&&!messageBusy&&!navigating);
    await page.locator('.image-button[data-loaded]').waitFor();
    assert.equal(await page.evaluate(()=>showToolActivity),true);
    await app.evaluate(({ipcMain})=>{
      global.messageCalls=0;ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',()=>{messageCalls++;return {value:{items:[
        {id:'question',source:'user',text:'What changed?'},
        {id:'tool-summary',source:'tool',text:'Public summary: checked the package.',arguments:{secret:'PRIVATE_ARGS'},reasoning:'PRIVATE_REASONING'},
        {id:'answer',source:'assistant',text:'The aligned rows are ready.\n\n![Preview](demo:release-preview)',attachments:[{file:{fileId:'demo-image',sourcePath:'demo:release-preview',name:'preview.png',mediaType:'image/png'}}]}
      ],beforeCursor:null}};});
    });
    await page.evaluate(async()=>{messageState=new Transcript.Pager();await loadMessages();liveStream.record.accept({event:'tool_call',data:{callId:'live-tool',text:'Public summary: checking the release.'}});liveStream.schedule();});
    await page.locator('[data-preview="live-tool"]').waitFor();await page.locator('[data-message-id="answer"] .image-button[data-loaded]').waitFor();
    assert.equal(await page.locator('[data-source="tool"]').count(),2);assert.doesNotMatch(await page.locator('#entries').innerText(),/PRIVATE_/);
    await page.locator('#conversation').focus();await page.evaluate(()=>{chatPosition=chatText().text.indexOf('aligned');chatAnchor=chatPosition+7;paintChat();});
    const state=()=>page.evaluate(()=>{const stable=position=>{const location=chatLocation(position);if(location?.messageId)delete location.index;return location;};return {position:stable(chatPosition),anchor:stable(chatAnchor),history:historyIndex,request:navigationRequest,items:messageState.items.map(i=>i.id),live:[...liveStream.record.live.keys()]};});
    const before=await state(),calls=await app.evaluate(()=>messageCalls);
    await press('vt');await page.waitForFunction(()=>!showToolActivity&&!liveStream.rendering&&!liveStream.dirty&&!document.querySelector('[data-source="tool"]'));
    assert.deepEqual(await state(),before);assert.equal(await app.evaluate(()=>messageCalls),calls);
    assert.equal(await page.locator('[data-message-id="answer"] .image-button[data-loaded]').count(),1);
    assert.equal(await page.locator('#tool-visibility-status').isVisible(),true);
    await capture('tool-activity-hidden.png');
    await press('vt');await page.locator('[data-preview="live-tool"]').waitFor();assert.equal(await page.locator('[data-source="tool"]').count(),2);
    await capture('tool-activity-shown.png');
    await page.evaluate(()=>{chatPosition=chatText().text.indexOf('Public summary');chatAnchor=chatPosition+8;paintChat(false);});
    await press('vt');await page.waitForFunction(()=>!showToolActivity&&!liveStream.rendering&&!liveStream.dirty);
    assert.equal(await page.evaluate(()=>chatAnchor),null);assert.match(await page.locator('#notice').innerText(),/selection.*cleared/);
    await page.evaluate(()=>{liveStream.record.accept({event:'boundary',data:{messageId:'answer'}});liveStream.record.accept({event:'transcript',data:{id:'live-tool',source:'tool',text:'Public summary: release checked.'}});liveStream.needsCommit=true;liveStream.schedule();});
    await page.waitForFunction(()=>!liveStream.rendering&&!liveStream.dirty&&liveStream.record.live.size===0);
    assert.equal(await page.locator('[data-source="tool"]').count(),0);
    await press('vt');await page.locator('[data-message-id="live-tool"]').waitFor();assert.equal(await page.locator('[data-preview="live-tool"]').count(),0);assert.equal(await page.locator('[data-message-id="live-tool"]').count(),1);
    await press('vt');await page.waitForFunction(()=>!showToolActivity&&!liveStream.dirty);
    await page.reload();await page.waitForFunction(()=>keyReady&&!messageBusy&&!navigating);
    assert.equal(await page.evaluate(()=>showToolActivity),false);assert.equal(await page.locator('[data-source="tool"]').count(),0);
    await page.evaluate(async()=>{const config={...keyConfig,mappings:{...keyConfig.mappings,toggleToolActivity:['<leader>vx']}};await desk.saveKeymaps(config,(await desk.userConfig()).revision);});
    await page.reload();await page.waitForFunction(()=>keyReady&&!messageBusy&&!navigating);assert.match(await page.locator('#toggle-tool-activity').getAttribute('title'),/Space v x/);
    await page.locator('#conversation').focus();await press('vt');assert.equal(await page.evaluate(()=>showToolActivity),false);await press('vx');await page.waitForFunction(()=>showToolActivity);await press('vx');await page.waitForFunction(()=>!showToolActivity&&!liveStream.dirty);
    await app.evaluate(({ipcMain})=>{messageCalls=0;ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',(_event,id,query)=>{messageCalls++;const n=Number(query.after||0);return {value:{items:n<2?[{id:'sparse-tool-'+n,source:'tool',text:'Public tool summary '+n}]:[{id:'sparse-answer',source:'assistant',text:'Visible answer after hidden tool-only pages.'}],cursor:n<2?String(n+1):null}};});});
    await page.evaluate(async()=>{liveStream.record=new StreamRecord();messageState=new Transcript.Pager();await loadMessages();});
    await page.locator('[data-message-id="sparse-answer"]').waitFor();assert.equal(await app.evaluate(()=>messageCalls),3);assert.equal(await page.locator('[data-source="tool"]').count(),0);assert.equal(await page.evaluate(()=>messageState.items.length),3);
    await page.evaluate(()=>{const row=document.createElement('article');row.dataset.source='tool';row.dataset.messageId='cached-tool';row.textContent='Public cached summary';messageViews.set('cache-proof',{nodes:[row],scroll:0});const saved=new Transcript.Pager();saved.started=true;saved.items=[{id:'cached-tool',source:'tool',text:'Public cached summary'}];globalThis.cacheCheck=displayThread({id:'cache-proof',title:'Cached tool view',projectId:project},saved);if($('entries').querySelector('[data-source="tool"]'))throw Error('Hidden tool flashed during cached navigation');});
    await page.evaluate(()=>cacheCheck);
    console.log('PASS tool activity default/persistence/remap, local-only toggle, public-summary-only rendering, assistant image retention, semantic selection/fallback, live-to-commit reconciliation and sparse tool-only pagination');
    async function press(sequence){await page.keyboard.press('Space');for(const key of sequence)await page.keyboard.press(key);}
    async function capture(name){if(!process.argv[2])return;await fs.mkdir(process.argv[2],{recursive:true});const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));await fs.writeFile(path.join(process.argv[2],name),Buffer.from(png,'base64'));}
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
