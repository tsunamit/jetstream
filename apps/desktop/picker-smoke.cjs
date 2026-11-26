const { _electron } = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-pickers-'));
  const output = process.argv[2];
  let app;
  try {
    app = await _electron.launch({ args:['.', '--demo', '--disable-gpu', '--user-data-dir=' + profile] });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    await page.getByRole('heading', { name:'Tighten the release checklist' }).waitFor();
    await page.locator('#draft .cm-content').fill('Keep my draft');
    await page.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+Shift+k');
    await page.locator('#picker-title').getByText('Recent results', { exact:true }).waitFor();
    assert.equal(await page.locator('#picker-list [role=option]').count(), 4);
    await page.keyboard.press('ArrowDown');
    assert.match(await page.locator('#preview-text').innerText(), /nightly signal/);
    await page.keyboard.press('ArrowDown');
    assert.match(await page.locator('#preview-text').innerText(), /welcome copy/);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => draft.value), 'Keep my draft');
    assert.equal(await page.locator('#draft').evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+Shift+k');
    await page.locator('#picker-search').fill('offln');
    assert.equal(await page.locator('#picker-list [role=option]').count(), 2);
    if (output) await capture('04-recent-results.png');
    await page.keyboard.press('Enter');
    await page.locator('.jump-target').getByText('Added a disconnected screen', { exact:false }).waitFor();
    await page.keyboard.press('Space');
    await page.keyboard.press('a');
    await page.locator('#pin-list button').waitFor();
    await page.keyboard.press('Space');
    await page.keyboard.type('rt');
    await page.locator('#picker-search').fill('checklist');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name:'Tighten the release checklist' }).waitFor();
    assert.equal(await page.evaluate(() => draft.value), 'Keep my draft');
    await page.keyboard.press('Space');
    await page.keyboard.press('1');
    await page.getByRole('heading', { name:'Add an offline empty state' }).waitFor();
    await page.keyboard.press('Space');
    await page.keyboard.press('h');
    assert.equal(await page.locator('#picker-list [role=option]').count(), 1);
    if (output) await capture('05-pinned.png');
    await page.keyboard.press('Escape');
    for (const [key, title] of [['rr','What’s running'], ['n','What needs me']]) {
      await page.keyboard.press('Space');
      await page.keyboard.type(key);
      assert.equal(await page.locator('#picker-title').innerText(), title);
      assert.equal(await page.locator('#picker-list [role=option]').count(), 1);
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+Shift+k');
    await page.locator('#picker-search').fill('zzzzzzz');
    assert.equal(await page.locator('#picker-list [role=option]').count(), 0);
    assert.equal(await page.locator('#picker-open').isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.locator('#pin-list button').waitFor();
    assert.match(await page.locator('#pin-list').innerText(), /offline/);
    console.log('PASS: result search, previews, exact update jump, draft and focus restoration, pins, reload persistence, all collections and empty search');

    async function capture(name) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(output, name), Buffer.from(png, 'base64'));
    }
  } finally {
    await app?.close();
    await fs.rm(profile, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
