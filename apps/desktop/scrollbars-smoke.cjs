const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-scrollbars-'));
  const out=process.argv[2]||path.join(os.tmpdir(),'jetstream-scrollbars-renders');
  await fs.mkdir(out,{recursive:true});
  let app,page;
  const settle=async()=>{await page.waitForTimeout(100);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  const visible=async(selector,host)=>assert.ok(await page.locator(selector).evaluate((node,selector)=>{
    const r=node.getBoundingClientRect(),b=document.querySelector(selector).getBoundingClientRect();
    return r.top>=b.top-1&&r.bottom<=b.bottom+1;
  },host),selector+' follows keyboard selection');
  const rails=async()=>assert.deepEqual(await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('body,body *')].filter(n=>n.clientHeight&&/(auto|scroll)/.test(getComputedStyle(n).overflow));
    return nodes.filter(n=>getComputedStyle(n).scrollbarWidth!=='none'||getComputedStyle(n).scrollbarGutter!=='auto'||getComputedStyle(n,'::-webkit-scrollbar').display!=='none').map(n=>n.id||n.className);
  }),[]);
  const shot=async name=>{
    await settle();
    const proof=await app.evaluate(async({BrowserWindow})=>{
      const w=BrowserWindow.getAllWindows()[0],image=await w.capturePage(),bytes=image.toBitmap();
      return {visible:w.isVisible(),focused:w.isFocused(),colors:new Set(Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4))).size,png:image.toPNG().toString('base64')};
    });
    assert.equal(proof.visible,false);assert.equal(proof.focused,false);assert.ok(proof.colors>100);
    await fs.writeFile(path.join(out,name+'.png'),Buffer.from(proof.png,'base64'));
  };
  try{
    app=await _electron.launch({args:['.','--demo','--disable-features=OverlayScrollbar','--user-data-dir='+profile]});
    page=await app.firstWindow();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>keyReady&&layoutView.ready&&!navigating&&!messageBusy);
    await page.addStyleTag({content:'*{scrollbar-gutter:stable}*::-webkit-scrollbar{display:block;width:18px;height:18px;background:magenta}*::-webkit-scrollbar-thumb{background:cyan}'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(640,600));
    await page.evaluate(async()=>{
      const text='Reading anchor\n\n'+Array.from({length:30},(_,i)=>'Wrapped paragraph '+i+' with content '.repeat(16)).join('\n\n')+
        '\n\n```text\n'+('horizontal_code_'.repeat(100))+'\n```\n\n| '+Array.from({length:25},(_,i)=>'Column '+i).join(' | ')+' |\n| '+Array(25).fill('---').join(' | ')+' |\n| '+Array(25).fill('wide_cell').join(' | ')+' |';
      const card=document.createElement('article');card.dataset.messageId='scroll-fixture';card.append(await richText.render({id:'scroll-fixture',source:'assistant',text},thread.id));
      $('entries').replaceChildren(card);resetChatProjection();$('conversation').focus();chatAnchor=null;chatPosition=0;paintChat();
      for(let i=0;i<60;i++)appendThreadRow({id:'scroll-row-'+i,projectId:project,title:'Scrollable navigator row '+i,status:'idle'});
    });
    await settle();await rails();
    for(const selector of ['#navigator','#transcript']){
      assert.ok(await page.locator(selector).evaluate(n=>{n.scrollTop=0;n.scrollTop=200;return n.scrollTop>0&&n.offsetWidth-n.clientWidth<=1;}),selector+' has overflow without a rail');
      await page.locator(selector).evaluate(n=>n.scrollTop=0);
      const b=await page.locator(selector).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.wheel(0,350);await settle();
      assert.ok(await page.locator(selector).evaluate(n=>n.scrollTop>0),selector+' wheel still works');
    }
    await page.locator('#threads button').first().focus();
    for(let i=0;i<35;i++)await page.keyboard.press('j');
    assert.ok(await page.locator('#navigator').evaluate(n=>n.scrollTop>0));
    await visible('#threads button:focus','#navigator');
    await page.evaluate(()=>{$('navigator').scrollTop=0;toggleSidebar(false,false);toggleSidebar(true,true);});
    await visible('#threads button:focus','#navigator');
    await page.evaluate(()=>{$('conversation').focus();chatPosition=0;chatAnchor=null;paintChat();});
    await page.keyboard.type('35j');assert.ok(await page.evaluate(()=>transcript.scrollTop>0));
    await page.evaluate(()=>{chatQuery='horizontal_code_';findChat(1);});
    await page.keyboard.type('$');
    assert.ok(await page.locator('.markdown pre').evaluate(n=>n.scrollLeft>0),'body cursor reveals horizontal code');
    await page.evaluate(()=>{
      const projection=chatText(),range=chatRanges(projection,chatPosition,Motions.move(projection.text,chatPosition,'Right'))[0],r=range.getBoundingClientRect(),b=document.querySelector('.markdown pre').getBoundingClientRect();
      if(r.left<b.left-1||r.right>b.right+1)throw Error('Body cursor is horizontally clipped');
    });
    for(const selector of ['.markdown pre','.markdown table']){
      const n=page.locator(selector);await n.focus();await page.keyboard.press('Home');
      assert.equal(await n.evaluate(n=>n.scrollLeft),0);await page.keyboard.press('ArrowRight');
      assert.ok(await n.evaluate(n=>n.scrollLeft>0),selector+' arrows stay local');
      await page.keyboard.press('End');assert.ok(await n.evaluate(n=>n.scrollLeft>=n.scrollWidth-n.clientWidth-1));
      if(selector==='.markdown pre')await shot('horizontal-code');
      await page.keyboard.press('Home');
      const b=await n.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+Math.min(25,b.height/2));await page.mouse.wheel(180,0);await settle();
      assert.ok(await n.evaluate(n=>n.scrollLeft>0),selector+' horizontal wheel still works');
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');
    }
    await page.evaluate(()=>{
      transcript.scrollTop=220;chatAnchor=chatPosition;
      globalThis.readingBefore={scroll:transcript.scrollTop,position:chatPosition,anchor:chatAnchor,horizontal:document.querySelector('pre').scrollLeft};
      preserveMediaLayout(()=>{const card=document.createElement('article');card.textContent='Background output';$('entries').append(card);});
      paintChat(false);
    });await settle();
    assert.deepEqual(await page.evaluate(()=>({scroll:transcript.scrollTop,position:chatPosition,anchor:chatAnchor,horizontal:document.querySelector('pre').scrollLeft})),await page.evaluate(()=>readingBefore));
    await shot('scrollbar-free-chat');
    await page.evaluate(async()=>{
      globalThis.scrollCatalog={projects:[{id:project,name:'Fixture project'}],captains:[],activity:[],threads:Array.from({length:60},(_,i)=>({id:'scroll-picker-'+i,projectId:project,title:'Picker row '+i,status:'idle'}))};
      catalog=scrollCatalog;await showPicker('threads');browsePicker();
    });
    for(let i=0;i<35;i++)await page.keyboard.press('j');
    assert.equal(await page.evaluate(()=>selected),35);assert.ok(await page.locator('#picker-list').evaluate(n=>n.scrollTop>0));
    await visible('#picker-list [aria-selected="true"]','#picker-list');
    await page.evaluate(()=>{$('picker-list').scrollTop=0;renderPicker();});
    assert.equal(await page.locator('#picker-list').evaluate(n=>n.scrollTop),0,'passive picker repaint does not reveal selection');
    await page.keyboard.press('j');await visible('#picker-list [aria-selected="true"]','#picker-list');await rails();await shot('scrollbar-free-picker');
    await page.evaluate(()=>$('preview-text').textContent='Long preview content. '.repeat(200));await page.locator('#picker-preview').focus();await page.keyboard.press('ArrowDown');await settle();
    assert.ok(await page.locator('#picker-preview').evaluate(n=>n.scrollTop>0),'focused picker preview scrolls with native arrows');await page.keyboard.press('Escape');
    await page.evaluate(async()=>{
      await workActivity.open();workActivity.model=new ActivityState.State();workActivity.data={...scrollCatalog,threads:scrollCatalog.threads.map(i=>({...i,status:'working'}))};workActivity.select(2,0);
    });
    for(let i=0;i<35;i++)await page.keyboard.press('j');
    await visible('.activity-card[aria-selected="true"]','.activity-column.active .activity-rows');
    await page.evaluate(()=>{document.querySelector('.activity-column.active .activity-rows').scrollTop=0;workActivity.render();});
    assert.equal(await page.locator('.activity-column.active .activity-rows').evaluate(n=>n.scrollTop),0,'background activity paint does not reveal selection');
    await page.keyboard.press('j');await visible('.activity-card[aria-selected="true"]','.activity-column.active .activity-rows');
    await page.evaluate(()=>workActivity.setLayout('list'));await page.keyboard.press('j');await visible('.activity-card[aria-selected="true"]','#activity-board');await rails();await shot('scrollbar-free-activity');
    await page.evaluate(()=>$('activity-preview-text').textContent='Long activity preview. '.repeat(200));await page.locator('#activity-preview').focus();await page.keyboard.press('ArrowDown');await settle();
    assert.ok(await page.locator('#activity-preview').evaluate(n=>n.scrollTop>0),'focused activity preview scrolls with native arrows');await page.keyboard.press('Escape');
    await page.locator('#edit-reply').click();await page.keyboard.insertText(Array.from({length:100},(_,i)=>'Reply line '+i+' wrapped '.repeat(20)).join('\n'));await settle();
    assert.ok(await page.locator('.cm-scroller').evaluate(n=>n.scrollTop>0&&n.scrollHeight>n.clientHeight));
    assert.ok(await page.evaluate(()=>{const v=composer.view,r=v.coordsAtPos(v.state.selection.main.head),b=v.scrollDOM.getBoundingClientRect();return r.top>=b.top-1&&r.bottom<=b.bottom+1;}));await rails();
    await page.locator('#keymaps-button').click();await page.locator('#map-leader').focus();
    for(let i=0;i<150;i++){if(await page.evaluate(()=>document.activeElement.id==='reset-keymaps'))break;await page.keyboard.press('Tab');}
    assert.equal(await page.evaluate(()=>document.activeElement.id),'reset-keymaps');await visible('#reset-keymaps','#keymaps-settings');await rails();await page.keyboard.press('Escape');
    for(const zoom of [.5,1,2]){
      await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),zoom);await settle();await rails();
      assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,w:document.documentElement.scrollWidth<=innerWidth,h:document.documentElement.scrollHeight<=innerHeight,chat:transcript.scrollWidth<=transcript.clientWidth})),{x:0,y:0,w:true,h:true,chat:true});
      assert.ok(await page.evaluate(()=>{const body=$('entries').querySelector('.markdown').getBoundingClientRect(),head=document.querySelector('.thread-head'),reply=draft.getBoundingClientRect();return Math.abs(body.left-head.getBoundingClientRect().left-parseFloat(getComputedStyle(head).paddingLeft))<1&&Math.abs(body.left-reply.left)<1;}));
    }
    assert.deepEqual(errors,[]);console.log('PASS hidden scrollbar-free forced rails, programmatic/wheel overflow, keyboard sidebar/picker/activity, horizontal code/table/body cursor, passive repaint and reading anchors, composer caret, dialog Tab, 640x600 at 50–200% bounds/gutters');
  }finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
