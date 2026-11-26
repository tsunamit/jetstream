const {_electron} = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-rich-'));
  const out = process.argv[2] || path.join(os.tmpdir(), 'capy-rich-renders');
  await fs.mkdir(out, {recursive:true});
  let app;
  try {
    app = await _electron.launch({args:['.','--demo','--disable-gpu','--user-data-dir=' + profile]});
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    const requests = [];
    page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
    await page.locator('#entries .diagram svg').waitFor();
    assert.match(await page.locator('.diagram svg').textContent(), /Build/);
    assert.notEqual(await page.locator('.diagram rect').first().evaluate(n => getComputedStyle(n).fill), 'rgb(0, 0, 0)');
    const rich = page.locator('[data-message-id="rich-demo"]');
    assert.equal(await rich.locator('table tbody tr').count(), 3);
    assert.equal(await rich.locator('blockquote').count(), 1);
    assert.equal(await rich.locator('ol li').count(), 3);
    assert.equal(await rich.locator('strong').innerText(), 'three checks');
    await page.waitForFunction(() => [...document.querySelectorAll('.image-button img')].every(img => img.complete && img.naturalWidth > 0));
    await rich.getByRole('button', {name:'Copy code',exact:true}).first().click();
    await rich.getByRole('button', {name:'Copied',exact:true}).waitFor();
    assert.match(await app.evaluate(({clipboard}) => clipboard.readText()), /npm ci\nnpm run smoke/);
    await rich.locator('h2').evaluate(n => n.scrollIntoView({block:'start'}));
    await capture('01-markdown.png');
    await rich.locator('.diagram').scrollIntoViewIfNeeded();
    await capture('02-diagram.png');
    await rich.locator('.image-button').click();
    await page.locator('.image-viewer[open] img').waitFor();
    await capture('03-image-preview.png');
    const previous = await page.evaluate(() => historyIndex);
    await page.keyboard.press('Control+o');
    assert.equal(await page.evaluate(() => historyIndex), previous);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.image-viewer').count(), 0);
    const saveTo = path.join(profile, 'release-checklist.txt');
    await app.evaluate(({dialog}, saveTo) => {dialog.showSaveDialog = async () => ({canceled:false,filePath:saveTo});}, saveTo);
    await rich.locator('.attachment').filter({hasText:'text copy'}).getByRole('button',{name:'Save file…'}).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.attachment button')].some(b => b.disabled));
    assert.match(await fs.readFile(saveTo,'utf8'), /Confirm rollback steps/);
    assert.deepEqual(await page.evaluate(() => [typeof require,typeof process]), ['undefined','undefined']);
    await assert.rejects(page.evaluate(() => desk.media('t1','../../etc/passwd','preview')));
    await assert.rejects(page.evaluate(() => desk.media('t1','demo-checklist','preview')));
    await assert.rejects(page.evaluate(() => desk.openLink('file:///etc/passwd')));
    await assert.rejects(page.evaluate(() => desk.openLink('https://example.com')));
    const result = await page.evaluate(async () => {
      const item = {text:[
        '<script>window.pwned = true</script><img src="https://evil.example/track" onerror="window.pwned=true">',
        '[bad](javascript:alert(1)) [file](file:///etc/passwd) [data](data:text/html,hello)',
        '![tracking](https://evil.example/image.png) ![local](file:///etc/passwd) ![traversal](../../secret.png)',
        '```mermaid\n%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA-->B\n```',
        '```mermaid\nflowchart LR\nA-->B\nclick A "https://evil.example"\n```',
        '```mermaid\nnot a diagram\n```',
        '```mermaid\nsequenceDiagram\nAlice->>Bob: Hello\nBob-->>Alice: Ready\n```'
      ].join('\n\n')};
      const rendered = await richText.render(item,'t1');
      rendered.id = 'hostile'; document.getElementById('entries').append(rendered);
      return {pwned:Boolean(window.pwned), scripts:rendered.querySelectorAll('script,img,iframe,object,foreignObject').length,
        links:[...rendered.querySelectorAll('a')].map(a => a.getAttribute('href')),
        diagrams:rendered.querySelectorAll('.diagram svg').length,
        failures:[...rendered.querySelectorAll('.diagram')].filter(d => d.textContent.includes('unavailable')).length,
        events:[...rendered.querySelectorAll('*')].flatMap(n => [...n.attributes].filter(a => /^on/i.test(a.name))).length};
    });
    assert.deepEqual(result, {pwned:false,scripts:0,links:[],diagrams:1,failures:3,events:0});
    const diagramFonts = await page.locator('.diagram svg text').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).fontFamily));
    assert.ok(diagramFonts.length > 0);
    for (const font of diagramFonts) assert.match(font, /^ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace$/);
    assert.equal(await page.locator('#hostile').getByRole('button',{name:/Open remote image/}).count(),1);
    await page.evaluate(async () => {
      document.getElementById('entries').append(await richText.render({text:'',attachments:[{file:{fileId:'missing',name:'missing.png',mediaType:'image/png',sizeBytes:5}}]},'t1'));
    });
    await page.locator('.attachment').filter({hasText:'missing.png'}).scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Load image · retry',exact:true}).waitFor();
    await page.getByRole('button',{name:'Load image · retry',exact:true}).click();
    await page.getByRole('button',{name:'Load image · retry',exact:true}).waitFor();
    assert.deepEqual(requests, []);
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(640,600));
    await rich.locator('table').scrollIntoViewIfNeeded();
    await capture('04-minimum-layout.png');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#transcript').evaluate(n => n.scrollWidth <= n.clientWidth),true);
    await app.close();
    app = await _electron.launch({args:['.','--live','--disable-gpu','--user-data-dir=' + path.join(profile,'live')],env:{...process.env,CAPY_API_KEY:''}});
    const livePage = await app.firstWindow();
    await livePage.waitForFunction(() => typeof window.richText?.render === 'function');
    await livePage.locator('#connection-state').getByText('OFFLINE',{exact:true}).waitFor();
    await app.evaluate(({shell}) => {global.openedLinks = []; shell.openExternal = async url => {global.openedLinks.push(url);};});
    await livePage.evaluate(async () => {
      document.getElementById('entries').append(await richText.render({text:'[Open documentation](https://docs.capy.ai/api-reference/overview)'},'t1'));
    });
    assert.deepEqual(await app.evaluate(() => global.openedLinks), []);
    await livePage.getByRole('link',{name:'Open documentation'}).click();
    assert.deepEqual(await app.evaluate(() => global.openedLinks), ['https://docs.capy.ai/api-reference/overview']);
    await assert.rejects(livePage.evaluate(() => desk.openLink('javascript:alert(1)')));
    console.log('PASS: Markdown, table, code copy, Mermaid flow/sequence, offline image/enlarge/save, hostile HTML/URLs/paths/directives, minimum layout, sandbox, zero demo network');
    async function capture(name) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await app.evaluate(async ({BrowserWindow}) => {
        const image = await BrowserWindow.getAllWindows()[0].capturePage();
        if (image.isEmpty()) throw new Error('Empty screenshot');
        return image.toPNG().toString('base64');
      });
      await fs.writeFile(path.join(out,name), Buffer.from(png,'base64'));
    }
  } finally {await app?.close(); await fs.rm(profile,{recursive:true,force:true});}
})().catch(error => {console.error(error);process.exitCode=1;});
