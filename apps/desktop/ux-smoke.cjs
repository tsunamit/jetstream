const {_electron}=require('./test-support.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'capy-ux-'));let app;
 try {
  app=await _electron.launch({args:['.','--demo','--user-data-dir='+profile]});
  const page=await app.firstWindow();page.setDefaultTimeout(8000);
  await page.waitForFunction(()=>typeof keyReady!=='undefined'&&keyReady&&thread&&!messageBusy);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id===thread.id),true);
  await page.locator('.image-button[data-loaded]').waitFor();
  const cursorVisible=()=>page.evaluate(()=>{
   const p=chatText(),piece=p.pieces.find(p=>p.start<=chatPosition&&p.end>chatPosition),b=transcript.getBoundingClientRect();
   const r=piece&&(piece.object?piece.node:chatRanges(p,chatPosition,Motions.move(p.text,chatPosition,'Right'))[0])?.getBoundingClientRect();
   return !!r&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
  });
  const shot=async name=>{if(!process.argv[2])return;await fs.mkdir(process.argv[2],{recursive:true});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w.isVisible()||w.isFocused())throw Error('Visible UX test');return(await w.capturePage()).toPNG().toString('base64');});await fs.writeFile(path.join(process.argv[2],name+'.png'),Buffer.from(png,'base64'));};
  const length=await page.evaluate(()=>history.length);
  const scroll=await page.evaluate(()=>transcript.scrollTop);
  await page.locator('#conversation').focus();assert.ok(await cursorVisible());
  assert.equal(await page.evaluate(()=>transcript.scrollTop),scroll);
  await page.keyboard.press('j');assert.ok(await cursorVisible());
  await page.keyboard.press('Control+j');await page.keyboard.press('Control+k');assert.ok(await cursorVisible());
  assert.equal(await page.evaluate(()=>history.length),length);
  await page.evaluate(async()=>{
   clearTimeout(messageTimer);const node=await richText.render({source:'assistant',text:'Before diagram\n\n```mermaid\nflowchart LR\n A-->B\n```\n\nAfter diagram'},thread.id);
   const article=document.createElement('article');article.dataset.messageId='ux-diagram';article.append(node);$('entries').replaceChildren(article);chatPosition=chatText().pieces.find(p=>p.object).start;$('conversation').focus();paintChat();
  });
  const anchor=await page.evaluate(()=>chatPosition);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  assert.equal(await page.locator('#mode').innerText(),'CHAT CONTROL');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');assert.equal(await page.evaluate(()=>chatPosition),anchor);
  await page.keyboard.press('Enter');await page.keyboard.press('Control+j');assert.equal(await page.evaluate(()=>composer.focused()),true);
  await page.keyboard.press('Escape');assert.match(await page.locator('#active-keys').innerText(),/g t cycle windows/);assert.doesNotMatch(await page.locator('#active-keys').innerText(),/Show shortcuts/);
  await page.keyboard.press('?');assert.equal(await page.evaluate(()=>effectiveScope().scope),'dialog');await page.keyboard.press('Escape');
  await page.keyboard.press('/');assert.equal(await page.evaluate(()=>effectiveScope().scope),'editorPrompt');assert.equal(await page.locator('#mode').innerText(),'COMPOSER PROMPT');
  await page.keyboard.press('Escape');await page.locator('#conversation').focus();
  await page.evaluate(async()=>{
   const body=await richText.render({source:'assistant',text:'![Sample](demo:release-preview)',attachments:[{file:{fileId:'demo-image',sourcePath:'demo:release-preview',name:'sample.png',mediaType:'image/png'}}]},thread.id),article=document.createElement('article');article.append(body);$('entries').replaceChildren(article);chatPosition=chatText().pieces.find(p=>p.object).start;paintChat();
  });
  const imageAnchor=await page.evaluate(()=>chatPosition);await page.keyboard.press('Enter');await page.locator('.image-viewer[open]').waitFor();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.image-viewer').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'conversation');assert.equal(await page.evaluate(()=>chatPosition),imageAnchor);
  await page.locator('#connect').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'key');assert.equal(await page.locator('#connection').getAttribute('aria-labelledby'),'connection-title');assert.match(await page.locator('#mode').innerText(),/Connect/);assert.match(await page.locator('#active-keys').innerText(),/Tab/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>showPicker('results'));await page.locator('#picker-search').fill('off');await page.keyboard.press('Control+g');
  const pickerState=await page.evaluate(()=>({id:matches[selected]?.id,query:search.value,history:history.length,thread:thread.id}));
  await page.keyboard.press('Control+PageDown');assert.equal(await page.evaluate(()=>collection),'pins');
  await page.keyboard.press('Control+PageUp');assert.equal(await page.evaluate(()=>collection),'results');assert.deepEqual(await page.evaluate(()=>({id:matches[selected]?.id,query:search.value,history:history.length,thread:thread.id})),pickerState);
  assert.match(await page.locator('#active-keys').innerText(),/collection/);assert.doesNotMatch(await page.locator('#active-keys').innerText(),/Chat:/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{workTree.enabled=true;workTree.loaded=true;workTree.state.accept(catalog);workTree.config=WorkTree.defaults();workTree.controls();workTree.render();workTree.focus(thread.id);workTree.config.text='offline';workTree.controls();workTree.render();});
  await page.locator('#conversation').focus();assert.match(await page.locator('#filter-summary').innerText(),/offline/);assert.ok(await page.locator('#clear-filters').isVisible());
  const context=await page.evaluate(()=>thread.id);await page.locator('#clear-filters').click();assert.equal(await page.evaluate(()=>thread.id),context);assert.equal(await page.evaluate(()=>workTree.config.text),'');
  await app.evaluate(({ipcMain})=>{globalThis.releaseModels=null;ipcMain.removeHandler('desk:models');ipcMain.handle('desk:models',()=>new Promise(resolve=>{releaseModels=()=>resolve({value:{items:[]}});}));});
  await page.evaluate(()=>{newThread.open();});assert.equal(await page.evaluate(()=>document.activeElement.id),'new-prompt');
  await page.keyboard.type('A prompt before options arrive');await shot('create-prompt');await page.locator('#new-close').focus();
  await app.evaluate(()=>releaseModels());await page.waitForFunction(()=>!newThread.loading);assert.equal(await page.evaluate(()=>document.activeElement.id),'new-close');
  assert.equal(await page.locator('#new-prompt').inputValue(),'A prompt before options arrive');await page.keyboard.press('Escape');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(640,600));
  await page.waitForFunction(()=>compactShell.matches&&!$('chat-actions').open);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(async()=>{await loadMessages(false,true);clearTimeout(messageTimer);});
  await page.evaluate(()=>{draft.value='One line';$('notice').textContent='';$('conversation').focus();});
  assert.ok(await page.evaluate(()=>transcript.clientHeight>=200),'Minimum useful transcript height');await shot('shell-minimum');
  await page.evaluate(()=>showPicker('results'));
  const layout=await page.evaluate(()=>{
   const rect=id=>$(id).getBoundingClientRect(),d=rect('picker'),q=rect('picker-search'),r=$('picker-list').querySelector('[aria-selected="true"]')?.getBoundingClientRect(),p=rect('picker-preview'),f=$('picker-keys').getBoundingClientRect();
   return {query:q.top>=d.top&&q.bottom<=d.bottom,row:!!r&&r.top>=d.top&&r.bottom<=d.bottom,preview:p.top>=d.top&&p.bottom<=d.bottom,footer:f.top>=d.top&&f.bottom<=d.bottom,outerScroll:$('picker').scrollHeight-$('picker').clientHeight};
  });
  assert.deepEqual(layout,{query:true,row:true,preview:true,footer:true,outerScroll:0});
  const contrast=await page.evaluate(()=>{
   const node=$('picker-list').querySelector('[aria-selected="true"] .result-summary');if(!node)return 0;
   const luminance=color=>{const v=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return v[0]*0.2126+v[1]*0.7152+v[2]*0.0722;};
   const fg=luminance(getComputedStyle(node).color),bg=luminance(getComputedStyle(node.parentElement).backgroundColor);return(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
  });assert.ok(contrast>=4.5);await shot('picker-minimum');
  await page.keyboard.press('Control+g');await page.keyboard.press('G');
  const selectedViewport=await page.evaluate(()=>({id:matches[selected]?.id,scroll:$('picker-list').scrollTop}));assert.ok(selectedViewport.scroll>0);
  await page.keyboard.press('Control+PageDown');await page.keyboard.press('Control+PageUp');
  assert.deepEqual(await page.evaluate(()=>({id:matches[selected]?.id,scroll:$('picker-list').scrollTop})),selectedViewport);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{demoMode=false;showPicker('results');});
  assert.equal(await page.evaluate(()=>collection),'threads');
  await page.keyboard.press('Control+PageUp');assert.equal(await page.evaluate(()=>collection),'centralSearch');
  await page.keyboard.press('Control+PageUp');assert.equal(await page.evaluate(()=>collection),'captains');
  await page.keyboard.press('Control+PageUp');assert.equal(await page.evaluate(()=>collection),'needs');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('PASS keyboard UX: visible chat target without scroll jump, rich-control Esc/window return, effective hints/native forms/editor prompts, per-collection query/ID and live skip, persistent filters/clear, prompt-first async safety, >=200px minimum transcript, simultaneous picker query/row/preview/footer, selected contrast',contrast);
 } finally {await app?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
