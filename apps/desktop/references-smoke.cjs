const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-references-'));let app;
  try {
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
    const page=await app.firstWindow();page.setDefaultTimeout(8000);
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>keyReady&&!messageBusy&&typeof readState!=='undefined');
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('desk:messages');
      ipcMain.removeHandler('desk:messages');
      ipcMain.handle('desk:messages',async(event,id,...args)=>{
        const value=await original(event,id,...args);if(id!=='t1')return value;
        return {value:{items:[{id:'refs-one',source:'assistant',sender:{id:'c1',relation:'captain'},text:[
          'Explore [Review](capy://thread/t2), [Captain](capy://captain/c1), JET-103 and [this view](capy://message/refs-two).',
          '[Proof](drive://captain-test/renders/proof.png) · [Notes](capy-file:demo-checklist) · [missing Drive](drive://other/secret.md) · [missing](capy-file:nope).',
          '[Late](capy://thread/jam_01234567890123456789012345) · [wrong type](capy://captain/t2) · [bad](capy://thread/../../secret) · [External](https://example.com/help).',
          '[js](javascript:alert(1)) [file](file:///etc/passwd) [cmd](command:run) [local](/Users/ryan/secret)',
          '```mermaid\nflowchart LR\nSource --> Destination\n```',
          '![Proof image](drive://captain-test/renders/proof.png)',
          ...Array.from({length:12},(_,i)=>'Reading paragraph '+i+' preserves its place on return.')
        ].join('\n\n'),references:[{location:'captain-test',path:'renders/proof.png',version:'v1',fileId:'demo-image'}],attachments:[{file:{fileId:'demo-image',name:'release-preview.png',mediaType:'image/png',sourcePath:'demo:release-preview'}},{file:{fileId:'demo-checklist',name:'checklist.txt',mediaType:'text/plain'}}]},
        {id:'refs-two',source:'assistant',text:'Target view. Return to the source reference.'}],beforeCursor:null}};
      });
    });
    await page.evaluate(async()=>{await openThread({id:'t2',projectId:'p1',title:'Review the command palette'});messageCache.delete('t1');messageViews.delete('t1');await openThread({id:'t1',projectId:'p1',title:'Tighten the release checklist'},{focus:'conversation'});});
    await page.locator('[data-message-id="refs-one"] .image-button').scrollIntoViewIfNeeded();
    await page.locator('[data-message-id="refs-one"] .image-button[data-loaded]').waitFor();
    assert.equal(await page.locator('[data-message-id="refs-one"] .attachment').count(),2,'Structured inline Drive image uses its existing copy without a duplicate card');
    await assert.rejects(page.evaluate(()=>desk.referenceContext('thread','../../secret')));
    await assert.rejects(page.evaluate(()=>desk.referenceContext('code','JET-103')));
    assert.equal(await page.evaluate(()=>chatText().text.includes('From captain')),false,'Sender links stay metadata, outside body yank/cursor projection');
    const link=name=>page.locator('[data-message-id="refs-one"] a').filter({hasText:new RegExp('^'+name+'$')}).first();
    const settle=()=>page.waitForFunction(()=>!messageBusy&&!navigating);
    const state=()=>page.evaluate(()=>({id:thread.id,index:historyIndex,location:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),visual:chatLineVisual,draft:draft.value,scroll:transcript.scrollTop}));
    const cursor=async label=>{
      await page.locator('#conversation').focus();
      await page.evaluate(label=>{const p=chatText().pieces.find(p=>p.node.nodeType===Node.TEXT_NODE&&p.node.parentElement.closest('[data-reference]')?.textContent===label);if(!p)throw Error('Missing cursor reference '+label);chatPosition=p.start;paintChat();keyboardMode();},label);
    };
    await page.locator('#edit-reply').click();await page.locator('#draft .cm-content').fill('Preserve my unsent exploration draft');
    await cursor('Review');
    await page.evaluate(()=>{chatAnchor=chatPosition+3;paintChat();});
    const source=await state();
    assert.match(await page.locator('#active-keys').innerText(),/g d open reference/);
    await capture('references.png');
    await page.keyboard.type('gd');await page.waitForFunction(()=>thread.id==='t2');await settle();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');
    await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    assert.deepEqual(await state(),source,'Back restores semantic body/Visual/draft/scroll state');
    await page.keyboard.press('Control+i');await page.waitForFunction(()=>thread.id==='t2');await settle();
    await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    await link('Captain').click();await page.waitForFunction(()=>thread.id==='c1');await settle();
    assert.equal(await page.evaluate(()=>thread.isCaptain),true);
    await page.locator('#back').click();await settle();assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Captain');
    await link('this view').click();await settle();assert.equal(await page.evaluate(()=>updateTarget),'refs-two');
    await page.locator('#back').click();await settle();
    await cursor('Proof');await page.keyboard.type('gd');await page.locator('.reference-viewer img').waitFor();
    const objectIndex=await page.evaluate(()=>historyIndex);
    assert.equal(await page.evaluate(()=>history[historyIndex].reference.kind),'attachment');
    assert.equal(await page.evaluate(()=>readState.visible()),false,'Object views cannot automatically mark the conversation read');
    assert.equal(await page.evaluate(()=>JSON.stringify(history[historyIndex].reference).includes('data:')),false);
    await capture('reference-image.png');
    await page.keyboard.press('Control+o');await page.locator('.reference-viewer').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>historyIndex),objectIndex-1);
    await page.keyboard.press('Control+i');await page.locator('.reference-viewer img').waitFor();
    await page.keyboard.press('Escape');await page.locator('.reference-viewer').waitFor({state:'detached'});
    await link('Notes').click();await page.getByText('This file cannot be navigated internally.',{exact:false}).waitFor();
    await capture('reference-fallback.png');
    await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
    await page.locator('.reference-viewer').getByRole('button',{name:'Save file…'}).click();await page.getByText('Save canceled.',{exact:true}).waitFor();
    const savePath=path.join(profile,'copy.txt');
    await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},savePath);
    await page.locator('.reference-viewer').getByRole('button',{name:'Save file…'}).click();await page.getByText('Saved.',{exact:true}).waitFor();
    assert.match(await fs.readFile(savePath,'utf8'),/Confirm rollback steps/);
    await page.keyboard.press('Escape');
    await link('missing Drive').click();assert.match(await page.locator('#notice').innerText(),/Drive browsing/);
    await link('missing').click();assert.match(await page.locator('#notice').innerText(),/not carried/);
    await link('wrong type').click();assert.equal(await page.evaluate(()=>thread.id),'t1');assert.match(await page.locator('#notice').innerText(),/type/);
    assert.equal(await page.locator('[data-message-id="refs-one"] a').filter({hasText:/^(js|file|cmd|local)$/}).count(),0);
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:openLink');global.external=[];ipcMain.handle('desk:openLink',(_event,url)=>{external.push(url);return {value:null};});});
    await link('External').click();assert.deepEqual(await app.evaluate(()=>external),['https://example.com/help']);
    await page.evaluate(()=>{keyConfig.mappings.chatReference=['go'];keyBindings=Keymaps.compile(keyConfig,keyMac);});
    await cursor('Review');await page.keyboard.type('gd');assert.equal(await page.evaluate(()=>thread.id),'t1');
    await page.keyboard.type('go');await page.waitForFunction(()=>thread.id==='t2');await settle();await page.keyboard.press('Control+o');await settle();
    await page.locator('#edit-reply').click();await page.keyboard.press('Escape');
    const editorIndex=await page.evaluate(()=>historyIndex);
    await page.keyboard.type('gd');await page.keyboard.press('Control+o');await page.keyboard.press('Control+i');
    assert.equal(await page.evaluate(()=>historyIndex),editorIndex,'Editor owns gd and its jump list');
    await page.locator('#conversation').focus();
    await page.evaluate(()=>{keyConfig.mappings.chatReference=['gd'];keyBindings=Keymaps.compile(keyConfig,keyMac);chatPosition=chatText().pieces.find(p=>p.object&&p.node.matches('.diagram')).start;paintChat();});
    await page.keyboard.type('gd');await page.getByText('Diagram source · read-only',{exact:true}).waitFor();
    assert.match(await page.locator('.reference-viewer pre').innerText(),/Source --> Destination/);
    await page.keyboard.press('Escape');await page.locator('.reference-viewer').waitFor({state:'detached'});
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('desk:media');ipcMain.removeHandler('desk:media');ipcMain.handle('desk:media',async(event,...args)=>{if(global.mediaFailure&&args[2]==='preview')return {error:'Fixture unavailable'};if(global.mediaHeld&&args[2]==='preview')await new Promise(resolve=>global.releaseMedia=resolve);return original(event,...args);});global.mediaFailure=true;});
    await link('Proof').click();await page.getByText('Image unavailable. Close and retry.',{exact:true}).waitFor();
    await page.keyboard.press('Escape');await page.locator('.reference-viewer').waitFor({state:'detached'});
    await app.evaluate(()=>{mediaFailure=false;mediaHeld=true;});
    await link('Proof').click();await page.getByText('Loading image…',{exact:true}).waitFor();
    await page.keyboard.press('Control+o');await page.locator('.reference-viewer').waitFor({state:'detached'});
    const returnedFocus=await page.evaluate(()=>document.activeElement.textContent);
    await app.evaluate(()=>{mediaHeld=false;releaseMedia();});await page.waitForTimeout(100);
    assert.equal(await page.locator('.reference-viewer').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.textContent),returnedFocus);
    await link('Proof').click();await page.locator('.reference-viewer img').waitFor();
    await page.evaluate(()=>{const next=document.createElement('a');next.textContent='Continue to Captain';referenceNavigation.bind(next,{kind:'captain',id:'c1',label:'Captain'});referenceDialog.append(next);});
    await page.getByRole('link',{name:'Continue to Captain'}).click();await page.waitForFunction(()=>thread.id==='c1');await settle();
    await page.keyboard.press('Control+o');await page.locator('.reference-viewer img').waitFor();
    await page.keyboard.press('Control+o');await page.locator('.reference-viewer').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>thread.id),'t1','Mixed context/object chain uses one history');
    await link('Late').click();await page.getByRole('heading',{name:'Reference unavailable',exact:true}).waitFor();
    await page.locator('#conversation').focus();await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:referenceContext');global.referenceCalls=0;ipcMain.handle('desk:referenceContext',()=>{referenceCalls++;return new Promise(resolve=>global.releaseReference=()=>resolve({value:{id:'jam_01234567890123456789012345',projectId:'p1',title:'Delayed destination'}}));});});
    await link('Late').click({noWaitAfter:true});
    await page.waitForFunction(()=>thread.id==='jam_01234567890123456789012345');
    await page.locator('#conversation').focus();await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    await app.evaluate(()=>releaseReference());await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>thread.id),'t1');assert.notEqual(await page.locator('#title').innerText(),'Delayed destination');
    await page.locator('#conversation').focus();await page.keyboard.press('Control+i');await page.waitForFunction(()=>thread.id==='jam_01234567890123456789012345');
    await app.evaluate(async()=>{for(let i=0;referenceCalls<2&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,10));if(referenceCalls<2)throw Error('Forward did not retry context lookup');releaseReference();});await page.getByRole('heading',{name:'Delayed destination',exact:true}).waitFor();
    await page.locator('#conversation').focus();await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    await page.evaluate(()=>{const data=workTree.enabled?workTree.state.data:catalog;data.threads.push({id:'ambiguous',projectId:'p1',code:'JET-103',title:'Other'});});
    const count=await page.evaluate(()=>history.length);await cursor('JET-103');await page.keyboard.type('gd');
    assert.equal(await page.evaluate(()=>history.length),count);assert.equal(await page.evaluate(()=>thread.id),'t1');assert.match(await page.locator('#notice').innerText(),/ambiguous/);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
    console.log('PASS reference exact identity/captain/code/view, mouse and gd/remap, draft/Visual/history, image/source/fallback, stale lookup, editor ownership and hostile links');
    async function capture(name){if(!process.argv[2])return;await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(path.join(process.argv[2],name),Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')),'base64'));}
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
