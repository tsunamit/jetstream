const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-zoom-'));
  const out=process.argv[2] || path.join(os.tmpdir(),'capy-zoom-renders');
  await fs.mkdir(out,{recursive:true});
  let app,page;
  const launch=async()=>{
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
    page=await app.firstWindow();
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>keyReady && !navigating && thread && !draft.disabled);
  };
  const input=async(key,shift=false,extra={})=>{
    await app.evaluate(({BrowserWindow},input)=>{
      const wc=BrowserWindow.getAllWindows()[0].webContents;
      let prevented=false;
      wc.emit('before-input-event',{preventDefault:()=>{prevented=true;}},input);
      return prevented;
    },{type:'keyDown',key,meta:process.platform==='darwin',control:process.platform!=='darwin',shift,...extra});
    await page.waitForTimeout(35);
  };
  const zoom=()=>app.evaluate(({BrowserWindow})=>Math.round(BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()*100)/100);
  const root=async()=>assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,w:document.documentElement.scrollWidth<=innerWidth,h:document.documentElement.scrollHeight<=innerHeight})),{x:0,y:0,w:true,h:true});
  try {
    await launch();
    await page.evaluate(()=>{draft.value='keep this draft\nsecond line';draft.setSelectionRange(5,5);});
    for(const alias of ['i','o','a']) {
      await page.locator('#conversation').focus();await page.keyboard.press(alias);
      assert.equal(await page.evaluate(()=>composer.focused() && composer.mode()==='insert'),true);
      assert.equal(await page.evaluate(()=>draft.value),'keep this draft\nsecond line');
      assert.equal(await page.evaluate(()=>draft.selectionStart),5);
    }
    await page.keyboard.type('+-=0oa');
    assert.match(await page.evaluate(()=>draft.value),/\+\-=0oa/);
    await page.evaluate(()=>{draft.value='alpha\nbeta';draft.setSelectionRange(1,1);composer.normal();});
    await page.keyboard.press('a');assert.equal(await page.evaluate(()=>composer.mode()),'insert');
    await page.keyboard.press('Escape');await page.keyboard.press('o');
    assert.equal(await page.evaluate(()=>composer.mode()),'insert');assert.equal(await page.evaluate(()=>draft.value.split('\n').length),3);
    const state=await page.evaluate(()=>({text:draft.value,selection:draft.selectionStart,mode:composer.mode()}));
    for(const [key,shift] of [['=',false],['=',true],['+',true]])await input(key,shift);
    assert.equal(await zoom(),1.3);
    assert.deepEqual(await page.evaluate(()=>({text:draft.value,selection:draft.selectionStart,mode:composer.mode()})),state);
    assert.equal(await page.evaluate(()=>composer.focused()),true);
    await input('0');assert.equal(await zoom(),1);
    await app.evaluate(({BrowserWindow})=>{
      const wc=BrowserWindow.getAllWindows()[0].webContents;
      wc.sendInputEvent({type:'keyDown',keyCode:'=',modifiers:process.platform==='darwin'?['meta']:['control']});
      wc.sendInputEvent({type:'keyUp',keyCode:'=',modifiers:process.platform==='darwin'?['meta']:['control']});
    });
    await page.waitForFunction(()=>document.getElementById('zoom-indicator').textContent==='110%');assert.equal(await zoom(),1.1);
    assert.deepEqual(await page.evaluate(()=>({text:draft.value,selection:draft.selectionStart,mode:composer.mode()})),state);
    await input('0');
    await input('/',false);await input('=',false,{isComposing:true});assert.equal(await zoom(),1);
    await page.locator('#conversation').focus();await page.keyboard.press('0');assert.equal(await zoom(),1);
    await page.keyboard.press('v');await page.keyboard.press('l');
    const visual=await page.evaluate(()=>({position:chatPosition,anchor:chatAnchor,text:selectedChat(chatText())}));
    await input('=');
    assert.deepEqual(await page.evaluate(()=>({position:chatPosition,anchor:chatAnchor,text:selectedChat(chatText())})),visual);
    await page.keyboard.press('Escape');await input('0');
    for(let i=0;i<25;i++)await input('=',false,{isAutoRepeat:true});assert.equal(await zoom(),2);
    for(const size of [[1140,760],[640,600]]) {
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
      await page.waitForTimeout(200);await root();
      for(const dialog of ['shortcuts','keymaps-settings','connection','new-thread','picker']) {
        await page.locator('#'+dialog).evaluate(n=>n.showModal());
        await input('-');assert.equal(await zoom(),1.9);await input('=');assert.equal(await zoom(),2);
        await page.locator('#'+dialog).evaluate(n=>{n.scrollTop=n.scrollHeight;});await root();
        assert.equal(await page.locator('#'+dialog).evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=-1 && r.top>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;}),true,dialog+' fits zoomed viewport');
        await page.locator('#'+dialog).evaluate(n=>n.close());
      }
      const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(out,'zoom-200-'+size.join('x')+'.png'),Buffer.from(png,'base64'));
    }
    await page.evaluate(()=>showPicker('threads'));
    await page.locator('#picker-search').fill('oa+-0');await input('0');assert.equal(await zoom(),1);
    assert.equal(await page.locator('#picker-search').inputValue(),'oa+-0');
    await page.keyboard.type('oa');assert.equal(await page.locator('#picker-search').inputValue(),'oa+-0oa');
    await page.keyboard.press('Escape');
    for(let i=0;i<25;i++)await input('-');assert.equal(await zoom(),0.5);
    await input('=');assert.equal(await zoom(),0.6);
    await page.reload();await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>keyReady);assert.equal(await zoom(),0.6);
    await page.evaluate(async()=>{await desk.setMode('live');await desk.setMode('mock');});assert.equal(await zoom(),0.6);
    await app.close();app=null;await launch();assert.equal(await zoom(),0.6);
    await input('0');assert.equal(await zoom(),1);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile,'appearance.json'),'utf8')),{version:1,zoomPercent:100});
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
    console.log('PASS zoom aliases/bounds/repeats, focus/draft, editor Vim, dialogs/picker, composing pass-through, reload/mode/restart persistence and hidden min-size root bounds');
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
