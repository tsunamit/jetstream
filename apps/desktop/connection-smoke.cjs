const { _electron } = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-connection-'));
  let app;
  try {
    app = await _electron.launch({ args: ['.', '--demo', '--user-data-dir=' + profile], env: { ...process.env, CAPY_API_KEY: '' } });
    let logs = ''; app.process().stdout?.on('data', bytes => logs += bytes); app.process().stderr?.on('data', bytes => logs += bytes);
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof keyReady !== 'undefined' && keyReady && !navigating && thread?.id === 't1');
    await app.evaluate(() => {
      global.fixtureCalls = []; global.rejectFixture = false; global.slowFixture = false; global.postDelay = false;
      global.fetch = async (url, init) => {
        const u = new URL(url); global.fixtureCalls.push({ path: u.pathname, method: init.method });
        if (global.slowFixture) await new Promise(r => setTimeout(r, 500));
        if (global.rejectFixture) return new Response('', { status: 401 });
        if (init.method === 'POST') { if (global.postDelay) await new Promise(r => setTimeout(r, 500)); return Response.json({ id: 'created', projectId: 'p1', title: 'Created fixture', status: 'idle' }); }
        if (u.pathname.endsWith('/projects')) return Response.json({ items: [{ id: 'p1', name: 'Live fixture' }] });
        if (u.pathname.endsWith('/captains')) return Response.json({ items: [], cursor: null });
        if (u.pathname.endsWith('/threads')) return Response.json({ items: [{ id: 't1', projectId: 'p1', title: 'Live identity', status: 'idle' }], cursor: null });
        if (u.pathname.endsWith('/models')) return Response.json({ items: [], default: {} });
        if (u.pathname.endsWith('/messages')) return Response.json({ items: [{ id: 'live-message', source: 'assistant', text: 'Live fixture only' }], cursor: null, beforeCursor: null });
        throw Error('Unexpected fixture route');
      };
    });
    async function ready(mock) {
      await page.waitForFunction(mock => typeof demoMode !== 'undefined' && demoMode === mock && typeof keyReady !== 'undefined' && keyReady && !navigating && !changingConnection && (mock ? thread?.id === 't1' : workTree.loaded), mock);
    }
    async function mode(value) { await page.locator('#connection-mode').selectOption(value); await ready(value === 'mock'); }
    async function openLive() { await page.locator('#threads [data-id="t1"]').click(); await page.waitForFunction(() => !navigating && !messageBusy && thread?.id === 't1'); }
    async function text(value) { await page.evaluate(value => { draft.value = value; drafts.set(thread.id, value); updateSend(); }, value); }
    async function shot(name) {
      if (!process.argv[2]) return;
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const png = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w.isVisible() || w.isFocused()) throw Error('Visible fixture window'); return (await w.capturePage()).toPNG().toString('base64'); });
      await fs.mkdir(process.argv[2], { recursive: true }); await fs.writeFile(path.join(process.argv[2], name), Buffer.from(png, 'base64'));
    }
    await text('Mock draft, shared thread ID');
    await page.evaluate(() => togglePin());
    await page.evaluate(async () => { const config = Keymaps.defaults(true); config.timeout = 777; await desk.saveKeymaps(config); });
    assert.equal((await app.evaluate(() => fixtureCalls)).length, 0);
    await page.locator('#connection-mode').selectOption('live'); await page.locator('#connection[open]').waitFor();
    assert.equal(await page.locator('#connection-mode').inputValue(), 'mock');
    assert.equal((await app.evaluate(() => fixtureCalls)).length, 0);
    await page.locator('#key').fill('invalid'); await page.locator('#save-key').click(); await page.getByText('Enter a valid Capy API key.', { exact: true }).waitFor();
    await page.locator('#key').fill('capy_' + 'x'.repeat(43)); await page.locator('#save-key').click(); await ready(false); await openLive();
    assert.equal(await page.evaluate(() => draft.value), '');
    assert.match(await page.locator('#saved-key-status').innerText(), /session only/);
    assert.equal(await page.evaluate(() => pins.length), 0); assert.equal(await page.evaluate(() => visits.has('c1')), false);
    await page.evaluate(() => showPicker('pins')); assert.equal(await page.evaluate(() => collection), 'threads'); assert.equal(await page.locator('#picker [data-picker="pins"]').isDisabled(), true); await page.locator('#close-picker').click();
    await text('Live draft, shared thread ID');
    const liveCount = (await app.evaluate(() => fixtureCalls)).length;
    await mode('mock');
    assert.equal(await page.evaluate(() => draft.value), 'Mock draft, shared thread ID');
    assert.equal(await page.evaluate(() => pins.includes('t1')), true);
    assert.equal(await page.locator('#entries').getByText('Live fixture only', { exact: true }).count(), 0);
    assert.equal((await app.evaluate(() => fixtureCalls)).length, liveCount);
    assert.equal(await page.evaluate(async () => (await desk.keymaps()).config.timeout), 777);
    await shot('mock-mode.png');
    await app.evaluate(() => { rejectFixture = true; });
    await page.locator('#connection-mode').selectOption('live'); await page.getByText(/Live connection failed/).waitFor();
    assert.equal(await page.locator('#connection-mode').inputValue(), 'mock'); assert.match(await page.locator('#connection-state').innerText(), /DEMO/);
    await app.evaluate(() => { rejectFixture = false; }); await mode('live'); await openLive();
    assert.equal(await page.evaluate(() => draft.value), 'Live draft, shared thread ID');
    await app.evaluate(() => { postDelay = true; });
    await page.evaluate(() => { $('composer').requestSubmit($('send')); $('composer').requestSubmit($('send')); });
    await page.waitForFunction(() => pending);
    assert.match(await page.evaluate(async () => { try { await desk.setMode('mock'); return ''; } catch (e) { return e.message; } }), /active send/);
    await page.locator('#connection-mode').selectOption('mock'); await page.getByText(/Wait for the active send/).waitFor();
    assert.equal(await page.locator('#connection-mode').inputValue(), 'live');
    await page.waitForFunction(() => !pending); assert.equal((await app.evaluate(() => fixtureCalls.filter(c => c.method === 'POST'))).length, 1);
    await app.evaluate(() => { slowFixture = true; });
    await page.evaluate(() => { workTree.refresh(true).catch(() => {}); loadMessages().catch(() => {}); });
    await mode('mock'); const mockCount = (await app.evaluate(() => fixtureCalls)).length;
    await page.waitForTimeout(700); assert.equal((await app.evaluate(() => fixtureCalls)).length, mockCount);
    assert.equal(await page.locator('#threads').getByText('Live identity', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => history.every(v => !v.item || v.item.title !== 'Live identity')), true);
    await app.evaluate(() => { slowFixture = false; }); await mode('live'); await openLive();
    await page.locator('#connect').click(); await page.locator('#connection[open]').waitFor(); await shot('secure-connection.png');
    await page.setViewportSize({ width: 640, height: 600 }); await shot('secure-connection-narrow.png'); await page.setViewportSize({ width: 1140, height: 760 });
    await page.locator('#forget-key').click(); await ready(true);
    assert.equal(await page.evaluate(() => draft.value), 'Mock draft, shared thread ID');
    assert.match(await page.locator('#notice').innerText(), /does not revoke/);
    assert.equal((await page.evaluate(() => desk.status())).saved, false);
    await page.locator('#connection-mode').selectOption('live'); await page.locator('#connection[open]').waitFor();
    await page.locator('#key').focus(); await page.keyboard.type('jk mode'); assert.equal(await page.locator('#key').inputValue(), 'jk mode');
    await page.locator('#close-connect').click(); await page.waitForFunction(() => $('key').value === '');
    assert.equal((await fs.readdir(profile)).includes('credential.bin'), false);
    assert.equal((await fs.readFile(path.join(profile, 'connection.json'), 'utf8')).includes('capy_'), false);
    async function audit(directory) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await audit(file);
        else if (entry.isFile()) assert.equal((await fs.readFile(file)).includes('capy_' + 'x'.repeat(43)), false, 'Plaintext fixture found in temporary profile: ' + entry.name);
      }
    }
    await audit(profile); assert.equal(logs.includes('capy_' + 'x'.repeat(43)), false);
    console.log('PASS hidden mode lifecycle: dormant mock, session-only warning, failed transition, scoped drafts/history, stale reads, one POST, write lock, forget and form/keymap safety; native Keychain not accessed');
  } finally { await app?.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
