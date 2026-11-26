const {_electron} = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-layout-'));
  const out = process.argv[2] || path.join(os.tmpdir(), 'capy-layout-renders');
  await fs.mkdir(out, {recursive:true});
  let app;
  try {
    app = await _electron.launch({args:['.','--demo','--disable-gpu','--user-data-dir=' + profile]});
    const page = await app.firstWindow();
    await page.getByRole('heading', {name:'Tighten the release checklist'}).waitFor();
    await page.waitForFunction(() => !navigating && historyIndex >= 0);
    await checkLayout();
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1140,800));
    await show([
      {source:'user',text:'Can we ship the new chat layout?',createdAt:'2026-11-25T23:12:00Z'},
      {source:'agent',text:'The user turns now share the same left edge as replies.\n\n- Tinted rows separate your messages.\n- Code, images and keyboard selection still work.',createdAt:'2026-11-25T23:13:00Z'},
      {source:'user',text:'Keep the timestamps quiet, please.',createdAt:'2026-11-25T23:14:00Z'},
      {source:'assistant',text:'Done. The role labels stay available to screen readers.',createdAt:'2026-11-25T23:15:00Z'}
    ]);
    await checkLayout();await capture('00-compact-conversation.png');
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1140,1000));
    const markdown = [
      {source:'user', text:'What should we check before shipping?', createdAt:'2026-11-20T17:12:00Z'},
      {source:'agent', text:[
        '## Three checks, then ship',
        'Start with the packaged app. It catches missing assets that a passing build won’t.',
        '| Check | Look for |\n| --- | --- |\n| Packaged app | Clean startup, images loaded |\n| Smoke tests | Navigation and replies |\n| Rollback | A known-good build |',
        'Run the checks from the Tower:',
        '```sh\nnpm test && npm run smoke\n```',
        'If anything fails, **keep the current release** and fix that check first.'
      ].join('\n\n'), createdAt:'2026-11-20T17:13:00Z'}
    ];
    await show(markdown);
    await checkLayout();
    await capture('01-conversation.png');
    await show([
      {source:'user', text:'Can you show the release path and the preview?', createdAt:'2026-11-20T17:15:00Z'},
      {source:'assistant', text:[
        'The package goes through the smoke checks before it’s ready to ship.',
        '```mermaid\nflowchart LR\nBuild --> Package\nPackage --> Smoke\nSmoke --> Ready\n```',
        '![Release checklist preview](demo:release-preview)'
      ].join('\n\n'), attachments:[{file:{fileId:'demo-image',name:'release-preview.png',mediaType:'image/png',sourcePath:'demo:release-preview'}}], createdAt:'2026-11-20T17:16:00Z'}
    ]);
    await page.locator('.diagram svg').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll("#transcript img")].every(img => img.complete && img.naturalWidth));
    await capture('02-diagram-media.png');
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(640,600));
    await checkLayout();
    await capture('03-minimum-width.png');
    await show([...markdown, {source:'user',text:'Short reply'}, {source:'assistant',text:'`' + 'long_token_'.repeat(120) + '`\n\n```text\n' + 'wide code '.repeat(80) + '\n```\n\n| Column | Column |\n| --- | --- |\n| ' + 'wide_cell_'.repeat(50) + ' | value |'}]);
    await checkLayout();
    await page.locator('#draft .cm-content').focus();
    await page.waitForFunction(()=>composer.view.hasFocus);
    await page.evaluate(()=>composer.view.dispatch({}));
    assert.equal(await page.locator('#draft .cm-editor').evaluate(n => getComputedStyle(n).outlineStyle), 'solid');
    assert.equal(await page.locator('#draft .cm-editor').evaluate(n => getComputedStyle(n).outlineWidth), '2px');
    for (const zoom of [.5, 1, 2]) {
      await app.evaluate(({BrowserWindow}, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom);
      await checkLayout();
    }
    console.log('PASS: aligned full-width distinct user/assistant rows, borderless rich content/composer, keyboard focus, 640px and 50–200% zoom overflow including long tokens/code/tables');

    async function show(items) {
      await app.evaluate(({ipcMain}, items) => {
        ipcMain.removeHandler('desk:messages');
        ipcMain.handle('desk:messages', () => ({value:{items,beforeCursor:null}}));
      }, items);
      await page.evaluate(async () => {messageState=new Transcript.Pager();await loadMessages(); transcript.scrollTop = 0;});
    }
    async function checkLayout() {
      const fonts = await page.locator('body, h1, h2, button, input, select, textarea, kbd, .markdown, .markdown p, .markdown th, .markdown td, .markdown code, .diagram svg text').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).fontFamily));
      assert.ok(fonts.length > 0);
      for (const font of fonts) assert.match(font, /^ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace$/);
      const layout = await page.evaluate(() => {
        const entries = document.getElementById('entries');
        const area = entries.getBoundingClientRect();
        return {
          overflow: scrollX !== 0 || scrollY !== 0 || document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth || transcript.scrollWidth > transcript.clientWidth,
          messages:[...entries.querySelectorAll('article')].map(n => {
            const rect = n.getBoundingClientRect(), style = getComputedStyle(n);
            return {role:n.dataset.role,left:Math.round(rect.left-area.left),right:Math.round(area.right-rect.right),width:rect.width,area:area.width,border:style.borderWidth,radius:style.borderRadius,padding:style.padding,outline:style.outlineStyle,background:style.backgroundColor};
          }),
          borders:[...document.querySelectorAll('.code-block,.attachment,.image-button,.markdown td,.markdown th,#composer,#draft')].map(n => getComputedStyle(n).borderWidth)
        };
      });
      assert.equal(layout.overflow,false);
      for (const m of layout.messages) {
        assert.equal(m.border,'0px');
        assert.equal(m.outline,'none');
        assert.equal(m.radius,'0px');
        assert.equal(m.right,0);
        assert.equal(m.left,0);
        assert.equal(m.width,m.area);
        assert.equal(m.padding,layout.messages[0].padding);
        if (m.role === 'assistant') {
          assert.equal(m.left,0);
          assert.equal(m.width,m.area);
          assert.equal(m.background,'rgba(0, 0, 0, 0)');
        } else {
          assert.notEqual(m.background,'rgba(0, 0, 0, 0)');
        }
      }
      assert.ok(layout.borders.every(width => width === '0px'));
      const short = page.locator('article[data-role="user"]').filter({hasText:'Short reply'});
      if (await short.count()) assert.equal(await short.evaluate(n => n.offsetWidth), await page.locator('#entries').evaluate(n=>n.offsetWidth));
    }
    async function capture(name) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await app.evaluate(async ({BrowserWindow}) => {
        const image = await BrowserWindow.getAllWindows()[0].capturePage();
        if (image.isEmpty()) throw new Error('Empty screenshot');
        return image.toPNG().toString('base64');
      });
      await fs.writeFile(path.join(out,name),Buffer.from(png,'base64'));
    }
  } finally {await app?.close(); await fs.rm(profile,{recursive:true,force:true});}
})().catch(error => {console.error(error);process.exitCode=1;});
