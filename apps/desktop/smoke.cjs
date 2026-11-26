const { _electron } = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-test-'));
  const out = process.argv[2];
  let app;
  try {
    app = await _electron.launch({ args: ['.', '--demo', '--disable-gpu', '--user-data-dir=' + profile] });
    const page = await app.firstWindow();
    async function screenshot(name) {
      if (!out) return;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const image = await BrowserWindow.getAllWindows()[0].capturePage();
        if (image.isEmpty()) throw new Error('Electron returned an empty screenshot.');
        return image.toPNG().toString('base64');
      });
      await fs.writeFile(path.join(out, name), Buffer.from(png, 'base64'));
    }
    page.setDefaultTimeout(8000);
    await page.getByText('DEMO · SAMPLE DATA').waitFor();
    await page.getByRole('heading', { name: 'Tighten the release checklist' }).waitFor();
    await page.getByText('Put the packaged-app check first', { exact:false }).waitFor();
    assert.deepEqual(await page.evaluate(() => [typeof process, typeof require]), ['undefined', 'undefined']);
    await screenshot('01-workspace.png');
    await page.getByRole('button', { name:'Earlier messages' }).click();
    await page.getByText('The first pass at the release checklist is ready.').waitFor();
    await page.getByRole('button', { name:'More threads' }).click();
    await page.getByText('Pick a versioning scheme').waitFor();
    await page.locator('#navigator').focus();
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name:'Review the command palette' }).waitFor();
    await page.getByRole('button', { name:/Tighten the release checklist/ }).click();
    await page.getByText('Put the packaged-app check first', { exact:false }).waitFor();
    await page.keyboard.type('gt');
    assert.equal(await page.locator('#pane').textContent(), 'conversation');
    await page.keyboard.press('i');
    await page.keyboard.type('gt j k i ?');
    assert.equal(await page.evaluate(() => draft.value), 'gt j k i ?');
    assert.equal(await page.locator('#mode').textContent(), 'COMPOSER INSERT');
    await page.locator('#draft .cm-content').fill('I’ll test the packaged app first, then check the rollback steps.');
    await screenshot('02-compose.png');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mode').textContent(), 'COMPOSER NORMAL');
    await page.keyboard.press('i');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await page.getByText('Saved in demo.', {exact:true}).waitFor();
    await page.locator('article').getByText('I’ll test the packaged app first', { exact:false }).waitFor();
    await page.getByRole('button', { name:'Refresh' }).click();
    await page.locator('article').getByText('I’ll test the packaged app first', { exact:false }).waitFor();
    await page.getByRole('button', { name:'? Shortcuts' }).click();
    await page.getByRole('heading', { name:'Keyboard shortcuts' }).waitFor();
    await screenshot('03-shortcuts.png');
    await page.keyboard.press('Escape');
    await page.locator('#projects').selectOption('p2');
    await page.getByText('No threads in this project.').waitFor();
    console.log('PASS: demo projects, threads, history, keyboard and mouse navigation, compose and queue, shortcuts');
  } finally {
    await app?.close();
    await fs.rm(profile, { recursive:true, force:true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
