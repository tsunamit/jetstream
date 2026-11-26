const {_electron}=require('./test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-bare-refs-'));let app;
  try {
    app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
    const page=await app.firstWindow();page.setDefaultTimeout(10000);
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(()=>keyReady&&!messageBusy&&thread?.id==='t1');
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('desk:messages');
      ipcMain.removeHandler('desk:messages');ipcMain.handle('desk:messages',async(event,id,...args)=>{
        if(id!=='t1')return original(event,id,...args);
        return {value:{items:[{id:'bare-body',source:'assistant',text:'Follow (JET-**103**), then JET-999 or OTHER-8. Unknown ISSUE-21 stays plain.\n\n`JET-103` and [JET-103](https://example.com/JET-103) stay unchanged. https://example.com/JET-103 /JET-103 éJET-103 JET-103_suffix\n\n```text\nJET-103\n```\n\nA captain: JET-**C1**.\n\n'+('Wrap this body line without changing its geometry or cursor projection. '.repeat(12))+'JET-103.'}],beforeCursor:null}};
      });
    });
    await page.evaluate(async()=>{
      const data=workTree.enabled?workTree.state.data:catalog;
      data.projects.find(p=>p.id==='p1').code='JET';
      data.projects.push({id:'other-project',code:'OTHER',name:'Other'});
      data.threads.push({id:'opaque-cross-project',projectId:'other-project',code:'OTHER-8',title:'Cross-project destination'});
      await openThread({id:'t2',projectId:'p1',title:'Review the command palette'});
      messageCache.delete('t1');messageViews.delete('t1');
      await openThread({id:'t1',projectId:'p1',title:'Tighten the release checklist'},{focus:'conversation'});
    });
    const settle=()=>page.waitForFunction(()=>!messageBusy&&!navigating);
    await settle();
    const card=page.locator('[data-message-id="bare-body"]');
    assert.equal(await card.locator('.reference-candidate').count(),1);
    assert.equal(await card.locator('code [data-reference]').count(),0);
    assert.equal(await card.locator('a a').count(),0);
    assert.equal(await card.locator('[data-reference]').filter({hasText:'ISSUE-21'}).count(),0);
    assert.equal(await card.locator('strong a').filter({hasText:'103'}).count(),1,'Inline markup may split one semantic reference into linked pieces');
    assert.equal(await card.locator('strong a').filter({hasText:'C1'}).count(),1,'Exact known nonnumeric codes remain supported');
    const original=await page.evaluate(()=>({text:chatText().text,geometry:chatText().pieces.filter(p=>p.node.nodeType===Node.TEXT_NODE).map(p=>[p.start,p.end])}));
    const projection=await page.evaluate(async()=>{
      const render=await richText.render({id:'probe',text:'Start JET-**103**, tail.\n\nJET-999.'},'t1');
      const decorated=render.textContent;
      for(const a of render.querySelectorAll('[data-reference]'))a.replaceWith(...a.childNodes);
      return {decorated,plain:render.textContent};
    });
    assert.equal(projection.decorated,projection.plain);
    const locate=async(code,offset=0)=>{
      await page.locator('#conversation').focus();
      await page.evaluate(({code,offset})=>{chatPosition=chatText().text.indexOf(code)+offset;chatAnchor=chatPosition+1;chatLineVisual=false;paintChat();keyboardMode();},{code,offset});
    };
    const saved=()=>page.evaluate(()=>({id:thread.id,location:chatLocation(chatPosition),anchor:chatLocation(chatAnchor),visual:chatLineVisual,draft:draft.value,index:historyIndex,scroll:transcript.scrollTop}));
    await page.evaluate(()=>{draft.value='Keep my bare reference draft';});
    for(const offset of [0,4,5,6]){
      await locate('JET-103',offset);const source=await saved();
      await page.keyboard.type('gd');await page.waitForFunction(()=>thread.id==='t2');await settle();
      await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
      assert.deepEqual(await saved(),source,'Back restores semantic token position, Visual selection, draft, scroll and history');
      await page.keyboard.press('Control+i');await page.waitForFunction(()=>thread.id==='t2');await settle();
      await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    }
    await locate('JET-999',3);
    const before=await saved();await page.keyboard.type('gd');
    assert.deepEqual(await saved(),before,'Unresolved candidate does not change destination/history/draft');
    assert.match(await page.locator('#notice').innerText(),/Cannot resolve JET-999.*supported code lookup/);
    await card.locator('.reference-candidate').click();assert.equal(await page.evaluate(()=>thread.id),'t1');
    await card.locator('.reference-candidate').focus();await page.keyboard.press('Enter');
    assert.match(await page.locator('#notice').innerText(),/may also be an issue/);
    if(process.argv[2]){
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await fs.mkdir(process.argv[2],{recursive:true});
      await fs.writeFile(path.join(process.argv[2],'bare-references.png'),Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')),'base64'));
    }
    await card.locator('a').filter({hasText:/^OTHER-8$/}).click();await page.waitForFunction(()=>thread.id==='opaque-cross-project');await settle();
    assert.equal(await page.evaluate(()=>project),'other-project');
    await page.locator('#conversation').focus();await page.keyboard.press('Control+o');await page.waitForFunction(()=>thread.id==='t1');await settle();
    await page.evaluate(()=>{const data=workTree.enabled?workTree.state.data:catalog;data.threads.push({id:'ambiguous',projectId:'p1',code:'JET-103'});});
    await locate('JET-103',5);await page.keyboard.type('gd');assert.equal(await page.evaluate(()=>thread.id),'t1');assert.match(await page.locator('#notice').innerText(),/ambiguous/);
    await page.evaluate(()=>{const data=workTree.enabled?workTree.state.data:catalog;data.threads=data.threads.filter(row=>row.code!=='JET-103');});
    await page.keyboard.type('gd');assert.equal(await page.evaluate(()=>thread.id),'t1');assert.match(await page.locator('#notice').innerText(),/Cannot resolve/);
    assert.equal(await page.evaluate(()=>chatText().text),original.text,'Decorated wrappers never change yank text');
    for(const width of [640,1280]){
      await page.setViewportSize({width,height:850});
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      const geometry=await page.evaluate(()=>{
        const card=document.querySelector('[data-message-id="bare-body"]');
        const measure=()=>{
          resetChatProjection();const projection=chatText(),rects=[];
          for(const piece of projection.pieces)if(piece.node.nodeType===Node.TEXT_NODE){
            for(let index=0;index<piece.node.length;index++){
              const range=document.createRange();range.setStart(piece.node,index);range.setEnd(piece.node,index+1);
              const rect=range.getBoundingClientRect();rects.push([rect.x,rect.y+transcript.scrollTop,rect.width,rect.height].map(n=>Math.round(n*100)/100));
            }
          }
          const control=new ChatGeometry.Controller(transcript),steps=[];
          let position=projection.text.indexOf('Wrap this');
          for(let index=0;index<8;index++){position=control.move(projection,position,1);steps.push(position);}
          return {text:projection.text,rects,steps};
        };
        const scroll=transcript.scrollTop,before=measure();
        for(const link of card.querySelectorAll('[data-reference]'))link.replaceWith(...link.childNodes);
        transcript.scrollTop=scroll;
        const after=measure();
        ReferenceTargets.decorate(card,referenceNavigation.codes(),referenceNavigation.bind);
        return {before,after};
      });
      assert.deepEqual(geometry.before,geometry.after,'Reference wrappers preserve every character rectangle and wrapped vertical motion at '+width);
    }
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
    console.log('PASS bare references: rich inline boundaries, excluded code/link/URL/unknown prefix, unresolved mouse/Enter/gd, exact cross-project mapping, stale/ambiguous maps and semantic history/draft');
  } finally {await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
