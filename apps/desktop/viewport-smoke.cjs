const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-viewport-'));
  const out=process.argv[2] || path.join(os.tmpdir(),'capy-viewport-renders');
  await fs.mkdir(out,{recursive:true});
  let app;
  try {
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
    const page=await app.firstWindow();
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>!navigating && historyIndex>=0);
    await page.evaluate(()=>{for(let i=0;i<35;i++)appendThreadRow({id:'viewport-row-'+i,projectId:project,title:'Scrollable navigator fixture '+i,status:'idle'});});
    for(const size of [[1140,800],[640,600],[1440,900],[640,600]]) {
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
      await app.evaluate(({ipcMain})=>{
        const items=Array.from({length:35},(_,i)=>({source:i%2?'user':'assistant',text:`Message ${i}\n\n`+'Long transcript content '.repeat(30)+'\n\n```text\n'+'wide code '.repeat(100)+'\n```\n\n| A | B |\n| --- | --- |\n| '+'cell_'.repeat(80)+' | value |'}));
        ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',()=>({value:{items,beforeCursor:null}}));
      });
      await page.evaluate(async()=>{
        messageState=new Transcript.Pager();await loadMessages();transcript.scrollTop=0;
        draft.value=Array.from({length:80},(_,i)=>'Composer line '+i+' long wrapped content '.repeat(5)).join('\n');
      });
      await settle();
      await root();
      const bounds=await shell();
      for(const selector of ['#navigator','#transcript','.cm-scroller']) {
        const pane=page.locator(selector);
        assert.ok(await pane.evaluate(n=>n.scrollHeight>n.clientHeight),selector+' must scroll');
        await pane.evaluate(n=>{n.scrollTop=0;});
        const rect=await pane.boundingBox();
        await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
        await page.mouse.wheel(0,700);
        await page.waitForTimeout(120);
        assert.ok(await pane.evaluate(n=>n.scrollTop>0),selector+' wheel scroll');
        await pane.evaluate(n=>{n.scrollTop=n.scrollHeight;});
        await page.mouse.wheel(0,2000);
        await root();
      }
      await page.evaluate(()=>{scrollTo(0,10000);document.querySelector('#entries article:last-child').scrollIntoView();document.querySelector('#threads button:last-child').focus();document.querySelector('#send').scrollIntoView();});
      await root();
      for(let i=0;i<25;i++)await page.keyboard.press('Tab');
      await page.keyboard.press('PageDown');await page.keyboard.press('End');
      await root();
      assert.deepEqual(await shell(),bounds);
      await page.locator('#keymaps-button').click();
      await page.locator('#map-leader').waitFor();
      await page.locator('#reset-keymaps').evaluate(n=>n.scrollIntoView());
      assert.ok(await page.locator('#reset-keymaps').isVisible());
      await inside('#reset-keymaps');
      await root();
      await page.locator('#close-keymaps').click();
      for(const [dialog,last] of [['#shortcuts','#active-shortcuts dd:last-child'],['#new-thread','#new-submit'],['#connection','#save-key'],['#picker','#picker-open']]) {
        await page.locator(dialog).evaluate(n=>n.showModal());
        await page.locator(last).evaluate(n=>n.scrollIntoView({block:'nearest'}));
        await inside(last);await root();
        await page.locator(dialog).evaluate(n=>n.close());
      }
      await page.evaluate(()=>{
        document.querySelector('#title').textContent='Long wrapped title '.repeat(30);
        document.querySelector('#notice').textContent='Long status notice '.repeat(20);
        document.querySelector('#active-keys').textContent='long customized keymap hint '.repeat(40);
        document.querySelector('#connection-state').textContent='Long connection status '.repeat(20);
      });
      await settle();await root();
      await shell();
      assert.ok(await page.locator('#transcript').evaluate(n=>n.clientHeight>=40));
      const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(out,`viewport-${size.join('x')}.png`),Buffer.from(png,'base64'));
      await page.evaluate(()=>{document.querySelector('#connection-state').textContent='DEMO';document.querySelector('#title').textContent='Tighten the release checklist';document.querySelector('#notice').textContent='';keyboardMode();});
      await page.evaluate(()=>{draft.value='A multiline reply stays in its own pane.\nThe statusline remains visible.';transcript.scrollTop=0;document.querySelector('.top').scrollTop=0;document.querySelector('.thread-head').scrollTop=0;document.querySelector('#composer').scrollTop=0;});
      await settle();await root();
      const normal=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(out,`normal-${size.join('x')}.png`),Buffer.from(normal,'base64'));
    }
    console.log('PASS viewport root dimensions/scroll, wheel chaining, keyboard/focus/scrollIntoView, independent panes, resize, wrapped chrome, editor autoheight and internal dialog controls');
    async function settle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
    async function root(){await settle();const state=await page.evaluate(()=>({height:document.documentElement.scrollHeight,client:document.documentElement.clientHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,top:document.scrollingElement.scrollTop,left:document.scrollingElement.scrollLeft,body:document.body.scrollTop,bodyHeight:document.body.scrollHeight,bodyClient:document.body.clientHeight}));assert.equal(state.height,state.client,JSON.stringify(state));assert.equal(state.bodyHeight,state.bodyClient,JSON.stringify(state));assert.equal(state.width,state.viewport);assert.equal(state.top,0);assert.equal(state.left,0);assert.equal(state.body,0);}
    async function inside(selector){assert.ok(await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect(),d=n.closest('dialog').getBoundingClientRect();return r.top>=d.top && r.bottom<=d.bottom && r.top>=0 && r.bottom<=innerHeight;}),selector+' reachable inside dialog');}
    async function shell(){return page.evaluate(()=>['.top','#statusline'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();if(r.top<0||r.bottom>innerHeight+.1)throw Error(s+' outside viewport');return [r.top,r.bottom];}));}
  } finally {await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
