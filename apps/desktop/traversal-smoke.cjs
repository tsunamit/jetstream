const {_electron} = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(),'capy-traversal-'));
  let app;
  try {
    app = await _electron.launch({args:['.','--demo','--disable-gpu','--user-data-dir=' + profile]});
    const page = await app.firstWindow(); page.setDefaultTimeout(8000);
    await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(() => keyReady && !navigating);
    const items = [
      {id:'a',source:'user',text:'Alpha **bold** and [link](https://example.com).\nLine two.',createdAt:'2026-11-20T17:12:00Z'},
      {id:'empty',source:'assistant',text:'',createdAt:'2026-11-20T17:13:00Z'},
      {id:'b',source:'assistant',text:'## Heading\n\n- First item\n- Second *item*\n\n```js\nconst x = 1;\nnext();\n```\n\n| Name | Value |\n| --- | --- |\n| cell | two |\n\n```mermaid\nflowchart LR\nSecretLabel --> OtherLabel\n```',createdAt:'2026-11-20T17:14:00Z'},
      {id:'attachment',source:'agent',text:'',attachments:[{file:{fileId:'demo-image',name:'sample.png',mediaType:'image/png'},title:'Sample attachment'}],createdAt:'2026-11-20T17:15:00Z'},
      {id:'last',source:'assistant',text:'Omega ends here.',createdAt:'2026-11-20T17:16:00Z'}
    ];
    await app.evaluate(({ipcMain},items) => {
      ipcMain.removeHandler('desk:messages');
      ipcMain.handle('desk:messages',() => ({value:{items,beforeCursor:null}}));
    },items);
    await page.evaluate(async () => {messageState=new Transcript.Pager();await loadMessages(); chatPosition = 0; $('conversation').focus(); paintChat();});
    await page.locator('.diagram svg').waitFor();
    const projected = await page.evaluate(() => chatText().text);
    for (const body of ['Alpha bold and link.\nLine two.','Heading','First item','Second item','const x = 1;\nnext();','cell','Sample attachment','Omega ends here.']) assert.ok(projected.includes(body),body);
    for (const chrome of ['CAPY','YOU','AGENT','17:12','Copy code','Save file','Load image','opens preview','Diagram source','SecretLabel','OtherLabel']) assert.ok(!projected.includes(chrome),chrome);
    assert.equal(await page.locator('article').count(),4);
    const walked = await page.evaluate(async () => {
      const visited = [], count = chatText().text.length + 5;
      chatPosition = 0; paintChat();
      for (let i = 0; i < count; i++) {
        const p = chatText();
        const piece = p.pieces.find(piece => piece.start <= chatPosition && piece.end > chatPosition);
        if (!piece) throw Error('Cursor entered a synthetic gap at ' + chatPosition);
        visited.push(chatPosition);
        const old = chatPosition;
        $('conversation').dispatchEvent(new KeyboardEvent('keydown',{key:'l',repeat:i > 0,bubbles:true,cancelable:true}));
        await Promise.resolve();
        if (old === chatPosition) break;
      }
      const backward = [chatPosition];
      for (let i = 0; i < count; i++) {
        const old = chatPosition;
        $('conversation').dispatchEvent(new KeyboardEvent('keydown',{key:'h',repeat:true,bubbles:true,cancelable:true}));
        await Promise.resolve();
        if (old === chatPosition) break;
        backward.push(chatPosition);
      }
      return {visited,backward};
    });
    assert.ok(walked.visited.length > 80);
    assert.deepEqual(walked.backward,[...walked.visited].reverse());
    await page.keyboard.type('gg}');
    assert.equal(await page.evaluate(() => chatText().text.slice(chatPosition,chatPosition + 7)),'Heading');
    await page.keyboard.type('}'); assert.equal(await page.evaluate(() => chatText().pieces.find(p=>p.start===chatPosition)?.node.matches('.image-button')),true);
    await page.keyboard.type('}'); assert.equal(await page.evaluate(() => chatText().text.slice(chatPosition,chatPosition + 5)),'Omega');
    await page.keyboard.type('{{{'); assert.equal(await page.evaluate(() => chatPosition),0);
    await page.keyboard.type('vG');
    const selection = await page.evaluate(() => {
      const ranges = [...CSS.highlights.get('chat-selection')];
      return {text:ranges.map(range => range.toString()).join(''),bad:ranges.some(range => range.startContainer.parentElement.closest('header,button,.code-toolbar,summary,svg')),
        native:window.getSelection().toString(),expected:chatText().text.replace(/\uFFFC/g,'').trimEnd()};
    });
    assert.equal(selection.bad,false); assert.equal(selection.native,'');
    assert.ok(selection.text.includes('const x = 1;')); assert.ok(!selection.text.includes('17:'));
    if (process.argv[2]) {
      await fs.mkdir(process.argv[2],{recursive:true});
      const png = await app.evaluate(async ({BrowserWindow}) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(process.argv[2],'mixed-markdown-visual.png'),Buffer.from(png,'base64'));
    }
    await page.keyboard.type('y');
    assert.equal((await app.evaluate(({clipboard}) => clipboard.readText())).trimEnd(),selection.expected);
    await page.evaluate(() => {const p = chatText(); chatPosition = p.text.indexOf('Omega'); paintChat();});
    const before = await page.evaluate(() => chatPosition);
    await page.locator('.image-button').scrollIntoViewIfNeeded();
    await page.locator('.image-button img').waitFor();
    await page.waitForFunction(() => chatPosition > 0 && chatText().text.slice(chatPosition,chatPosition + 5) === 'Omega');
    assert.equal(await page.evaluate(() => chatPosition), before);
    await page.locator('#conversation').focus();
    assert.equal(await page.evaluate(() => chatText().pieces.filter(p => p.object && p.node.matches('.image-button')).length),1);
    await page.evaluate(() => {chatPosition = chatText().pieces.find(p => p.object && p.node.matches('.diagram')).start; paintChat();});
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#entries .markdown details').getAttribute('open'),'');
    assert.ok(await page.evaluate(() => chatText().text.includes('SecretLabel')));
    await page.locator('#conversation').focus();
    await page.evaluate(() => {chatPosition = chatText().text.indexOf('Omega'); paintChat();});
    const saved = await page.evaluate(() => chatPosition);
    await page.getByRole('button',{name:/Review the command palette/}).click();
    await page.waitForFunction(() => thread.id === 't2' && !navigating);
    await page.locator('#back').click(); await page.waitForFunction(() => thread.id === 't1' && !navigating);
    assert.ok(await page.evaluate(() => chatText().pieces.some(p => p.start <= chatPosition && p.end > chatPosition)));
    assert.ok(await page.evaluate(() => chatPosition) <= saved);
    assert.equal(await page.evaluate(() => chatText().text.slice(chatPosition,chatPosition + 5)),'Omega');
    await page.evaluate(() => {
      cancelChatVisual(); const node = $('entries').querySelector('.markdown p').firstChild;
      const range = document.createRange(); range.setStart(node,0); range.setEnd(node,5);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.locator('#chat-copy').click();
    assert.equal(await app.evaluate(({clipboard}) => clipboard.readText()),'Alpha');
    console.log('PASS: mixed Markdown body-only traversal forward/backward, held motions across messages, logical breaks, empty/attachment-only messages, atomic diagrams/images, metadata-free visual ranges/yank, async media anchoring, history reprojection and native mouse selection');
  } finally {await app?.close(); await fs.rm(profile,{recursive:true,force:true});}
})().catch(error => {console.error(error); process.exitCode = 1;});
