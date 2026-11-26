const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-config-smoke-'));
  const out=process.argv[2]||path.join(os.tmpdir(),'jetstream-config-renders');
  await fs.mkdir(out,{recursive:true});
  const file=path.join(profile,'config.json');
  let app,page;
  async function launch(extra=[]) {
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile,...extra]});
    page=await app.firstWindow();page.setDefaultTimeout(10000);
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>userSettings.ready&&!navigating);
  }
  const read=async()=>JSON.parse(await fs.readFile(file,'utf8'));
  async function replace(config) {
    await fs.writeFile(file+'.editor',typeof config==='string'?config:JSON.stringify(config,null,2));
    await fs.rename(file+'.editor',file);
  }
  async function state() {
    return page.evaluate(()=>({draft:draft.value,editor:composer.snapshot(),chatPosition,chatAnchor,chatLineVisual,history:JSON.stringify(history),historyIndex,thread:thread.id}));
  }
  async function shot(name) {
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const png=await app.evaluate(async({BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0],assertHidden=window.isVisible()||window.isFocused();
      if(assertHidden)throw Error('Visible or focused test window');
      return(await window.capturePage()).toPNG().toString('base64');
    });
    await fs.writeFile(path.join(out,name),Buffer.from(png,'base64'));
  }
  try {
    await launch();
    assert.equal(await page.evaluate(async()=>(await desk.userConfig()).path),file);
    assert.equal((await fs.stat(file)).mode&0o777,0o600);
    const opened=await page.evaluate(()=>desk.openConfig('/arbitrary/path'));
    assert.deepEqual(opened,{opened:false,path:file});
    await app.evaluate(({shell,ipcMain})=>{
      shell.openPath=()=>{throw Error('Native editor must not open');};
      globalThis.configCommands={openConfig:0,reloadConfig:0};
      for(const name of ['openConfig','reloadConfig']) {
        const handler=ipcMain._invokeHandlers.get('desk:'+name);
        ipcMain._invokeHandlers.set('desk:'+name,(...args)=>{configCommands[name]++;return handler(...args);});
      }
    });
    await page.locator('#keymaps-button').click();await page.locator('#open-config').click();
    assert.equal(await page.locator('#keymaps-settings').evaluate(node=>node.open),true);
    await page.locator('#close-keymaps').click();
    await app.evaluate(({ipcMain})=>{
      ipcMain.removeHandler('desk:messages');
      ipcMain.handle('desk:messages',()=>({value:{items:[{id:'config-reading',source:'assistant',text:Array.from({length:80},(_,index)=>'Reading paragraph '+index+'. Keep this line anchored through a config reload. '.repeat(3)).join('\n\n')}],beforeCursor:null}}));
    });
    await page.evaluate(async()=>{messageState=new Transcript.Pager();await loadMessages();});
    await page.evaluate(()=>{composer.setText('Draft survives config reload\nSecond line');normalDraft();composer.view.focus();});
    await page.keyboard.press('v');await page.keyboard.press('l');
    await page.evaluate(()=>{chatPosition=1400;chatAnchor=1350;chatLineVisual=false;paintChat(false);const range=chatRanges(chatText(),1400,1401)[0].getBoundingClientRect();transcript.scrollTop+=range.top-transcript.getBoundingClientRect().top-30;});
    const readingY=await page.evaluate(()=>chatRanges(chatText(),1400,1401)[0].getBoundingClientRect().top-transcript.getBoundingClientRect().top);
    const stale=await page.evaluate(()=>desk.userConfig());
    const visual=await state();assert.match(visual.editor.mode,/visual/);
    const custom=await read();custom.keymaps.leader=',';custom.keymaps.timeout=1300;custom.keymaps.mappings.reloadConfig=['<leader>vr'];custom.keymaps.mappings.openConfig=['<leader>vo'];custom.layout.sidebarWidth=340;custom.layout.centeredReading=false;custom.notes={purpose:'Fixture preferences'};
    await replace(custom);
    await page.waitForFunction(()=>keyConfig.leader===','&&layoutView.config.sidebarWidth===340);
    assert.deepEqual(await state(),visual);
    assert.ok(Math.abs(await page.evaluate(()=>chatRanges(chatText(),1400,1401)[0].getBoundingClientRect().top-transcript.getBoundingClientRect().top)-readingY)<=27,'external layout reload keeps the reading line anchored');
    await page.evaluate(state=>applyUserConfig(state),stale);
    assert.equal(await page.evaluate(()=>keyConfig.leader),',','out-of-order IPC snapshots cannot overwrite a newer config generation');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{$('conversation').focus();cancelChatVisual();});
    await page.keyboard.type(',');
    assert.equal(await page.evaluate(()=>keySequence.length),1);
    custom.keymaps.leader=';';await replace(custom);
    await page.waitForFunction(()=>keyConfig.leader===';'&&keySequence.length===0);
    await page.keyboard.type('rd');assert.equal(await page.locator('#picker').evaluate(n=>n.open),false);
    await page.keyboard.type(';vo');await page.keyboard.type(';vr');
    await page.evaluate(()=>desk.userConfig());
    assert.deepEqual(await app.evaluate(()=>configCommands),{openConfig:2,reloadConfig:1},'custom commands use the guarded config operations');
    await page.evaluate(()=>{composer.view.focus();composer.insert();});
    await page.keyboard.type('j');
    custom.keymaps.timeout=1400;await replace(custom);
    await page.waitForFunction(()=>keyConfig.timeout===1400);
    await page.keyboard.type('k');
    assert.equal(await page.evaluate(()=>composer.mode()),'insert');
    assert.ok((await page.evaluate(()=>draft.value)).includes('jk'),'old pending Insert escape must not consume new input');
    await page.keyboard.type('jk');assert.equal(await page.evaluate(()=>composer.mode()),'normal');
    await page.keyboard.press('d');assert.equal(await page.evaluate(()=>composer.idle()),false);
    custom.layout.sidebarWidth=350;await replace(custom);await page.waitForFunction(()=>layoutView.config.sidebarWidth===350);
    assert.equal(await page.evaluate(()=>composer.idle()),false,'reload keeps Vim operator ownership');
    await page.keyboard.press('Escape');
    const beforeInvalid=await state();
    await replace('{\n "version": 1, broken');
    await page.waitForFunction(()=>keyConfigIssue.includes('line 2'));
    assert.deepEqual(await state(),beforeInvalid);
    assert.equal(await fs.readFile(file,'utf8'),'{\n "version": 1, broken');
    await page.locator('#keymaps-button').click();await shot('config-invalid.png');
    await page.locator('#centered-reading').click();
    await page.waitForFunction(()=>$('layout-status').textContent.includes('invalid JSON')&&!layoutView.config.centeredReading);
    assert.equal(await fs.readFile(file,'utf8'),'{\n "version": 1, broken');
    await page.locator('#reset-keymaps').click();
    await page.waitForFunction(()=>$('keymaps-error').textContent.includes('invalid JSON'));
    assert.equal(await fs.readFile(file,'utf8'),'{\n "version": 1, broken');
    await replace(custom);await page.locator('#reload-config').click();
    await page.waitForFunction(()=>$('keymaps-error').textContent==='Config reloaded.');
    await page.locator('#map-timeout').fill('1500');
    const external={...custom,showToolActivity:false};await replace(external);
    await page.waitForFunction(()=>!showToolActivity);
    await page.getByRole('button',{name:'Save keymaps',exact:true}).click();
    await page.waitForFunction(()=>$('keymaps-error').textContent.includes('changed on disk'));
    assert.equal((await read()).keymaps.timeout,1400);
    await page.locator('#reload-config').click();
    await page.locator('#map-timeout').fill('1600');await page.getByRole('button',{name:'Save keymaps',exact:true}).click();
    await page.waitForFunction(()=>keyConfig.timeout===1600);
    assert.deepEqual((await read()).notes,custom.notes);
    assert.equal((await read()).showToolActivity,false);
    await page.locator('#centered-reading').check();await page.waitForFunction(()=>layoutView.config.centeredReading);
    await page.waitForFunction(()=>$('layout-status').textContent==='Layout saved');
    assert.equal((await read()).layout.centeredReading,true);
    await page.locator('#reset-layout').click();await page.waitForFunction(()=>layoutView.config.sidebarWidth===280);
    await page.waitForFunction(()=>$('layout-status').textContent==='Layout saved');
    assert.equal((await read()).showToolActivity,false);assert.deepEqual((await read()).notes,custom.notes);
    assert.equal((await read()).keymaps.timeout,1600);
    await page.locator('#reset-keymaps').click();await page.waitForFunction(()=>keyConfig.leader==='<Space>');
    assert.equal((await read()).layout.centeredReading,true);assert.equal((await read()).showToolActivity,false);
    await page.locator('#reload-config').click();await shot('config-settings.png');
    await page.locator('#close-keymaps').click();
    await page.locator('#sidebar-resize').focus();await page.keyboard.press('ArrowRight');
    const resizeExternal=await read();resizeExternal.layout.sidebarWidth=410;await replace(resizeExternal);
    await page.waitForFunction(()=>layoutView.config.sidebarWidth===410&&!layoutView.saveTimer);
    await page.waitForTimeout(350);
    assert.equal((await read()).layout.sidebarWidth,410,'an external save wins over a pending GUI resize');
    const stable=await read();await fs.unlink(file);
    await page.waitForFunction(()=>keyConfigIssue.includes('missing'));
    assert.equal(await page.evaluate(()=>keyConfig.timeout),900);
    await replace(stable);await page.waitForFunction(()=>!keyConfigIssue);
    await page.evaluate(()=>localStorage.setItem('showToolActivity','false'));
    await app.close();app=null;
    await fs.unlink(file);
    await fs.writeFile(path.join(profile,'keymaps.json'),JSON.stringify({version:2,leader:',',timeout:650,mappings:{reply:['e'],up:[]}}));
    await fs.writeFile(path.join(profile,'layout.json'),JSON.stringify({version:1,sidebarWidth:380,replyHeight:234,centeredReading:false}));
    await launch();
    assert.equal(await page.evaluate(()=>keyConfig.leader),',');
    assert.deepEqual(await page.evaluate(()=>keyConfig.mappings.up),[]);
    assert.equal(await page.evaluate(()=>layoutView.config.replyHeight),234);
    assert.equal(await page.evaluate(()=>showToolActivity),false);
    assert.equal((await read()).keymaps.version,3);
    assert.equal(JSON.parse(await fs.readFile(path.join(profile,'keymaps.json'))).version,2);
    const migrated=await read();await page.evaluate(()=>localStorage.setItem('showToolActivity','true'));
    await app.close();app=null;await launch(['--dev-launch','--dev-profile=config-test']);
    assert.deepEqual(await read(),migrated,'an existing config wins even over changed legacy storage');
    assert.equal(await page.evaluate(async()=>(await desk.userConfig()).path),file,'hidden Dev remains temporary');
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(window=>window.isVisible()||window.isFocused())),false);
    console.log('PASS editable config: private temporary paths, editor stub, atomic live reload, Vim Visual/operator/Insert and draft/chat/history preservation, chord cancellation, actionable invalid-file errors, stale-form rejection, bounded resets, migration and hidden Dev');
  } finally {await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
