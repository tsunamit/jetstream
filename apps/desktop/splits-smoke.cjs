const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-splits-')),out=process.argv[2]||path.join(os.tmpdir(),'capy-splits-renders');
  await fs.mkdir(out,{recursive:true});let app,page;
  async function launch(){
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});page=await app.firstWindow();page.setDefaultTimeout(10000);
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();await page.waitForFunction(()=>!navigating&&keyReady&&layoutView.ready);
  }
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const size=async(w,h)=>{await app.evaluate(({BrowserWindow},s)=>BrowserWindow.getAllWindows()[0].setSize(...s),[w,h]);await settle();};
  const prefs=()=>page.evaluate(()=>({...layoutView.config}));
  async function drag(id,dx,dy,release=true){const b=await page.locator('#'+id).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:6});if(release)await page.mouse.up();await settle();}
  async function root(){const b=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,iw:innerWidth,ih:innerHeight,tw:transcript.scrollWidth,tc:transcript.clientWidth,x:scrollX,y:scrollY}));assert.equal(b.w,b.iw,JSON.stringify(b));assert.equal(b.h,b.ih,JSON.stringify(b));assert.equal(b.tw,b.tc,JSON.stringify(b));assert.equal(b.x,0);assert.equal(b.y,0);}
  async function shot(name){await settle();const image=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible window');const image=await w.capturePage();return {png:image.toPNG().toString('base64'),size:image.getSize()};});assert.ok(image.size.width>=640);await fs.writeFile(path.join(out,name),Buffer.from(image.png,'base64'));}
  try{
    await launch();assert.equal((await prefs()).centeredReading,true);await size(1700,1000);
    const items=[{id:'long',source:'assistant',text:'A long reading paragraph. '.repeat(300)},{id:'user',source:'user',text:'The same content alignment across user and assistant turns.'},{id:'tool',source:'tool',text:'Public tool summary'},{id:'rich',source:'assistant',text:'```text\n'+'long code '.repeat(180)+'\n```\n\n| A | B |\n| --- | --- |\n| '+'cell_'.repeat(180)+' | data |\n\n```mermaid\nflowchart LR\nA --> B\n```'}];
    await app.evaluate(({ipcMain},items)=>{ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',()=>({value:{items,beforeCursor:null}}));},items);
    await page.evaluate(async()=>{messageState=new Transcript.Pager();await loadMessages();transcript.scrollTop=0;});await page.locator('.diagram svg').waitFor();
    const widths=()=>page.evaluate(()=>{const a=$('entries').querySelector('article'),body=a.querySelector('.markdown');return {row:a.getBoundingClientRect().width,body:body.getBoundingClientRect().width,left:body.getBoundingClientRect().left-a.getBoundingClientRect().left};});
    assert.ok((await widths()).body<=901);assert.ok((await widths()).left>100);await shot('centered-wide.png');
    await drag('sidebar-resize',360,0);assert.ok((await widths()).left<30);await drag('sidebar-resize',-360,0);assert.ok((await widths()).left>100);
    await page.evaluate(()=>{draft.value='Draft survives resize\nSecond line';composer.insert();draft.setSelectionRange(5,5);});
    const editor=await page.evaluate(()=>({value:draft.value,selection:composer.snapshot().selection,mode:composer.mode(),focus:document.activeElement.id}));
    await drag('sidebar-resize',100,0);await drag('reply-resize',0,-90);
    assert.equal((await prefs()).sidebarWidth,380);assert.equal((await prefs()).replyHeight,218);
    assert.deepEqual(await page.evaluate(()=>({value:draft.value,selection:composer.snapshot().selection,mode:composer.mode(),focus:document.activeElement.id})),editor);
    await page.evaluate(()=>{normalDraft();$('conversation').focus();chatPosition=1400;chatAnchor=1350;paintChat(false);const r=chatRanges(chatText(),1400,1401)[0].getBoundingClientRect();transcript.scrollTop+=r.top-transcript.getBoundingClientRect().top-30;});
    const before=await page.evaluate(()=>({position:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),selected:selectedChat(chatText()),focus:document.activeElement.id}));
    const anchorY=await page.evaluate(()=>{const r=chatRanges(chatText(),1400,1401)[0].getBoundingClientRect();return r.top-transcript.getBoundingClientRect().top;});
    await drag('sidebar-resize',60,0);
    assert.deepEqual(await page.evaluate(()=>({position:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),selected:selectedChat(chatText()),focus:document.activeElement.id})),before);
    assert.ok(Math.abs(await page.evaluate(()=>chatRanges(chatText(),1400,1401)[0].getBoundingClientRect().top-transcript.getBoundingClientRect().top)-anchorY)<=27,'reading line remains anchored');
    await page.evaluate(()=>{chatAnchor=null;const n=$('entries').querySelector('.markdown p').firstChild;const r=document.createRange();r.setStart(n,20);r.setEnd(n,45);getSelection().removeAllRanges();getSelection().addRange(r);});
    const selected=await page.evaluate(()=>getSelection().toString());await drag('reply-resize',0,20);assert.equal(await page.evaluate(()=>getSelection().toString()),selected);
    await page.evaluate(()=>getSelection().removeAllRanges());
    await drag('sidebar-resize',-80,0,false);
    await page.evaluate(()=>{liveStream.record.live.set('during-drag',{id:'live-drag',source:'assistant',text:'Remote update while resizing'});liveStream.schedule();});
    await page.locator('[data-preview="during-drag"]').waitFor();assert.equal(await page.evaluate(()=>Boolean(layoutView.drag)),true);await page.mouse.up();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');
    await page.locator('#sidebar-resize').focus();await page.keyboard.press('ArrowRight');assert.equal((await prefs()).sidebarWidth,370);assert.equal(await page.locator('#mode').innerText(),'RESIZE');
    await page.keyboard.press('Home');assert.equal(await page.locator('#sidebar-resize').getAttribute('aria-valuenow'),await page.locator('#sidebar-resize').getAttribute('aria-valuemin'));
    await page.keyboard.press('End');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#sidebar-resize').getAttribute('aria-valuenow'),await page.locator('#sidebar-resize').getAttribute('aria-valuemax'));
    await page.locator('#reply-resize').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Home');await page.keyboard.press('End');assert.equal(await page.locator('#reply-resize').getAttribute('aria-valuenow'),await page.locator('#reply-resize').getAttribute('aria-valuemax'));
    await page.keyboard.press('Control+j');assert.equal(await page.evaluate(()=>composer.focused()),true);await page.keyboard.press('Control+k');assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');
    await page.evaluate(async()=>{await saveKeymaps({...keyConfig,mappings:{...keyConfig.mappings,resetLayout:['<leader>zz']}});});await page.keyboard.type(' zz');assert.equal((await prefs()).sidebarWidth,280);assert.equal((await prefs()).replyHeight,128);
    await page.evaluate(async()=>{await saveKeymaps(Keymaps.defaults(keyMac));});
    await page.evaluate(()=>layoutView.reset());await page.waitForFunction(()=>$('layout-status').textContent==='Layout saved');
    await drag('sidebar-resize',100,0,false);await page.evaluate(()=>layoutView.drag.handle.dispatchEvent(new PointerEvent('pointercancel',{pointerId:layoutView.drag.id})));await page.mouse.up();assert.equal((await prefs()).sidebarWidth,280);assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('resizing')),false);
    const touch=await page.context().newCDPSession(page),handle=await page.locator('#sidebar-resize').boundingBox(),point={x:handle.x+3,y:handle.y+50};
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+40}]});await settle();assert.equal((await prefs()).sidebarWidth,320);await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settle();assert.equal((await prefs()).sidebarWidth,280);await touch.detach();
    await page.locator('#keymaps-button').click();await page.locator('#centered-reading').uncheck();assert.equal((await prefs()).centeredReading,false);await page.locator('#close-keymaps').click();assert.ok((await widths()).body>1000);await shot('full-width-wide.png');
    await page.evaluate(()=>{layoutView.config.centeredReading=true;layoutView.config.sidebarWidth=600;layoutView.config.replyHeight=450;layoutView.apply();});
    await size(1500,900);assert.ok((await widths()).body<1000);await size(1900,1000);assert.ok((await widths()).left>100);
    for(const zoom of [.5,1,2])for(const [w,h] of [[640,600],[1140,800]]){
      await app.evaluate(({BrowserWindow},z)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z),zoom);await size(w,h);await root();
      assert.ok(await page.locator('#transcript').evaluate(n=>n.clientHeight>=40));
      await page.evaluate(()=>toggleSidebar(false,false));await root();await page.evaluate(()=>toggleSidebar(true,false));await root();
    }
    assert.equal((await prefs()).sidebarWidth,600);assert.equal((await prefs()).replyHeight,450);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));await size(1700,1000);
    assert.equal(await page.locator('#sidebar-resize').getAttribute('aria-valuenow'),'600');
    await page.evaluate(()=>{layoutView.config.sidebarWidth=330;layoutView.config.replyHeight=240;layoutView.apply();transcript.scrollTop=transcript.scrollHeight;});await settle();await drag('reply-resize',0,30);
    assert.ok(await page.locator('#transcript').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight<2),'tail remains tail');
    await page.evaluate(()=>{layoutView.config.replyHeight=240;layoutView.config.centeredReading=false;layoutView.apply();layoutView.save();});await page.waitForTimeout(300);
    const saved=await prefs();await page.evaluate(async()=>{await desk.setMode('live');await desk.setMode('mock');});assert.deepEqual(await prefs(),saved);
    await page.reload();await page.waitForFunction(()=>layoutView.ready);assert.deepEqual(await prefs(),saved);
    await app.close();app=null;await launch();assert.deepEqual(await prefs(),saved);
    await size(640,600);await shot('narrow.png');await root();
    await page.evaluate(async()=>{
      await workTree.activate();const p=project;
      workTree.state.accept({projects:[{id:p,name:'Release project'}],captains:[{id:'captain-layout',projectId:p,isCaptain:true,title:'Release captain',status:'idle'}],threads:[{id:'crew-z',projectId:p,parentId:'captain-layout',title:'Z bundle audit',status:'working',hasUnreads:true},{id:'crew-a',projectId:p,parentId:'captain-layout',title:'A layout checks',status:'idle'},{id:'standalone-layout',projectId:p,title:'Standalone release notes',status:'waiting'}],activity:[]});
      Object.assign(workTree.config,{projectRoots:true,expanded:['project:'+p],sort:'name'});workTree.controls();workTree.render();
    });
    const rootId=await page.evaluate(()=>'project:'+project);
    const context=await page.evaluate(()=>thread.id);await page.locator('[data-kind="project"]').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>thread.id),context);await page.evaluate(()=>readState.explicit('unread'));assert.equal(await page.evaluate(id=>readState.model.items.has(id),rootId),false);
    await size(1140,900);const captain=page.locator('[data-id="captain-layout"]');await captain.focus();await page.keyboard.press('l');await page.locator('[data-id="crew-a"]').waitFor();assert.equal(await page.locator('[data-id="crew-a"]').getAttribute('aria-level'),'3');
    await page.keyboard.press('l');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'crew-a');await page.keyboard.press('h');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'captain-layout');
    await page.keyboard.press('h');assert.equal(await captain.getAttribute('aria-expanded'),'false');await page.keyboard.press('h');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),rootId);
    await page.evaluate(()=>{workTree.config.text='bundle';workTree.render();});assert.equal(await page.locator('[data-id="crew-z"]').count(),1);assert.equal(await captain.getAttribute('aria-expanded'),'true');
    assert.deepEqual(await page.locator('#threads button').evaluateAll(rows=>rows.map(r=>r.dataset.id)),[rootId,'captain-layout','crew-z']);
    await page.locator('[data-id="crew-z"]').focus();await page.evaluate(()=>workTree.render());assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'crew-z');
    await page.evaluate(()=>{workTree.config.text='';workTree.config.expanded.push('captain-layout');workTree.render();});
    assert.deepEqual(await page.locator('#threads [data-parent="captain-layout"]').evaluateAll(rows=>rows.map(r=>r.dataset.id)),['crew-a','crew-z']);
    await page.locator('[data-id="crew-z"]').focus();await page.evaluate(()=>{globalThis.treeFixture=workTree.state.data;workTree.state.data={...workTree.state.data,threads:workTree.state.data.threads.filter(i=>i.id!=='crew-z')};workTree.render();});assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'captain-layout');assert.equal(await page.evaluate(()=>thread.id),context);await page.evaluate(()=>{workTree.state.data=treeFixture;workTree.render();});
    await page.evaluate(()=>{$('navigator').scrollTop=$('threads').offsetTop-100;});await size(1500,1100);await shot('hierarchy.png');await page.evaluate(()=>workTree.save());
    const treeSaved=await page.evaluate(()=>({...workTree.config}));await page.reload();await page.waitForFunction(()=>!navigating&&layoutView.ready);await page.evaluate(()=>workTree.activate());assert.deepEqual(await page.evaluate(()=>({...workTree.config})),treeSaved);
    await page.evaluate(()=>{layoutView.config.centeredReading=true;layoutView.apply();layoutView.save();});
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',()=>({value:{items:[{id:'layout-user',source:'user',text:'Keep the conversation centered when there is room, but let the sidebar and reply keep their own space.'},{id:'layout-assistant',source:'assistant',text:'## A quieter reading column\n\nThe chat text stays left-aligned within a centered column on wide panes. Narrow panes use all the available space.\n\n- Drag either separator to resize.\n- Focus a separator and use the arrow keys.\n- Reset the sizes in Keymaps → View layout.'},{id:'layout-tool',source:'tool',text:'Layout check finished. No root overflow.'}],beforeCursor:null}}));});
    await page.evaluate(async()=>{messageState=new Transcript.Pager();await loadMessages();transcript.scrollTop=0;});await size(1700,1000);await shot('reading-enabled.png');
    await page.locator('#keymaps-button').click();await page.locator('#centered-reading').uncheck();await shot('view-setting.png');await page.locator('#close-keymaps').click();await shot('reading-disabled.png');
    await page.locator('#keymaps-button').click();await page.locator('#centered-reading').check();await page.locator('#close-keymaps').click();await size(640,600);await page.evaluate(()=>transcript.scrollTop=0);await shot('reading-narrow.png');
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
    console.log('PASS hidden split drag/cancel, editor and body selection/focus, live update during capture, keyboard bounds/reset, reading width, preferred-size recovery, 50–200% root bounds, mode/reload/restart persistence and project/Captain/crew hierarchy');
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
