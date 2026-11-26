const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-images-'));let app;
  try{
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
    const page=await app.firstWindow();
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>typeof liveStream!=='undefined'&&keyReady&&!messageBusy&&!navigating);
    await page.locator('[data-message-id="rich-demo"] .image-button[data-loaded]').waitFor();
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('desk:media');global.mediaCalls=[];
      ipcMain.removeHandler('desk:media');
      ipcMain.handle('desk:media',async(event,...args)=>{mediaCalls.push(args);if(global.holdImage)await new Promise(r=>global.releaseImage=r);return original(event,...args);});
    });
    const show=async text=>{
      await app.evaluate(({ipcMain},text)=>{ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',()=>({value:{items:[{id:'question',source:'user',text:'Can you show the release preview?'},{id:'image-answer',source:'assistant',text,attachments:[{file:{fileId:'demo-image',sourcePath:'demo:release-preview',name:'release-preview.png',mediaType:'image/png'}}]}],beforeCursor:null}}));},text);
      await page.evaluate(async()=>{messageState=new Transcript.Pager();await loadMessages();transcript.scrollTop=0;});
    };
    await show('Here is the preview.\n\n![Release preview](capy-file:demo-image)\n\nThe same file: ![Second reference](demo:release-preview)\n\nKeep this paragraph selected while the image loads.');
    await page.locator('.image-button[data-loaded]').first().waitFor({timeout:5000}).catch(async error=>{console.log(await app.evaluate(()=>mediaCalls),await page.locator('#entries').innerText());throw error;});
    await page.waitForFunction(()=>[...document.querySelectorAll('.image-button img')].length===2&&[...document.querySelectorAll('.image-button img')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.locator('.attachment').count(),2,'No extra attachment card for an inline file');
    assert.equal(await page.getByRole('button',{name:'Load image',exact:true}).count(),0);
    await page.locator('#conversation').focus();
    await page.evaluate(()=>{chatPosition=chatText().pieces.find(p=>p.object&&p.node.matches('.image-button')).start;chatAnchor=chatPosition;paintChat();});
    const before=await page.evaluate(()=>({location:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),scroll:transcript.scrollTop,history:historyIndex}));
    await page.keyboard.press('Enter');await page.locator('.image-viewer[open] img').waitFor();
    await capture('image-overlay.png');
    await page.keyboard.press('Escape');await page.locator('.image-viewer').waitFor({state:'detached'});
    assert.deepEqual(await page.evaluate(()=>({location:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),scroll:transcript.scrollTop,history:historyIndex})),before);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1140,1000));
    await page.evaluate(()=>{chatAnchor=null;paintChat(false);transcript.scrollTop=0;});await capture('automatic-images.png');
    await app.evaluate(()=>{global.holdImage=true;});
    await show('A delayed image: ![Late](demo:release-preview)\n\nPreserve this selection.');
    await page.waitForTimeout(150);
    await app.evaluate(()=>{if(!global.releaseImage)throw Error('Automatic request did not start');});
    await page.evaluate(()=>{const p=chatText().text.indexOf('Preserve');chatPosition=p+2;chatAnchor=p+8;paintChat(false);});
    const selection=await page.evaluate(()=>({position:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),history:historyIndex,scroll:transcript.scrollTop}));
    await app.evaluate(()=>{holdImage=false;releaseImage();});
    await page.locator('.image-button[data-loaded]').waitFor();
    assert.deepEqual(await page.evaluate(()=>({position:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),history:historyIndex,scroll:transcript.scrollTop})),selection);
    await app.evaluate(()=>{global.holdImage=true;});
    await show('Stale image: ![Late](demo:release-preview)');
    await page.waitForTimeout(150);
    await page.evaluate(()=>{navigationRequest++;$('entries').replaceChildren();});
    await app.evaluate(()=>{holdImage=false;releaseImage();});await page.waitForTimeout(150);
    assert.equal(await page.locator('#entries img').count(),0,'Stale results cannot paint a destination that was left');
    await page.evaluate(()=>{liveStream.record.live.clear();liveStream.needsCommit=true;liveStream.record.accept({event:'boundary',data:{messageId:'image-answer'}});liveStream.record.accept({event:'transcript',data:{id:'stream-image',source:'assistant',text:'![Stream preview](demo:release-preview)',attachments:[{file:{fileId:'demo-image',sourcePath:'demo:release-preview',name:'release-preview.png',mediaType:'image/png'}}]}});liveStream.schedule();});
    await page.locator('[data-message-id="stream-image"] .image-button[data-loaded]').waitFor();
    console.log('PASS automatic actual attachment previews, exact inline refs, no duplicate attachment card, semantic Enter/Esc overlay, Visual/scroll/history preservation, stale navigation discard and streaming image commit');
    async function capture(name){if(!process.argv[2])return;await fs.mkdir(process.argv[2],{recursive:true});const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));await fs.writeFile(path.join(process.argv[2],name),Buffer.from(png,'base64'));}
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
