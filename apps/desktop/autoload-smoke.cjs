const { _electron } = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
(async () => {
 const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-autoload-')); let app;
 try {
  app = await _electron.launch({ args: ['.', '--live', '--user-data-dir=' + profile], env: { ...process.env, CAPY_API_KEY: '' } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof keyReady !== 'undefined' && keyReady);
  await app.evaluate(() => {
   global.historyCalls = []; global.historyExtra = false; global.historyDelay = false;
   global.fetch = async (url) => {
    const u = new URL(url), json = value => Response.json(value);
    if (u.pathname.endsWith('/projects')) return json({ items: [{ id: 'p', name: 'History fixture' }] });
    if (u.pathname.endsWith('/captains')) return json({ items: [], cursor: null });
    if (u.pathname.endsWith('/threads')) return json({ items: ['long','other','large','delayed','cycle'].map(id => ({ id, projectId: 'p', title: id + ' history', status: 'idle' })), cursor: null });
    if (u.pathname.endsWith('/messages')) {
     const id = u.pathname.split('/').at(-2), n = Number(u.searchParams.get('after') || 0);
     historyCalls.push({ id, n });
     if (historyDelay && id === 'delayed') await new Promise(r => setTimeout(r, 150));
     if (id === 'large') return json({ items: [], cursor: String(n + 1), beforeCursor: null });
     if (id === 'cycle') return json({ items: [], cursor: n === 8 ? '1' : String(n + 1), beforeCursor: null });
     const text = n === 11 ? 'Latest committed fixture' : n === 12 ? 'New automatic fixture update' : Array.from({ length: 30 }, (_, i) => 'Page ' + n + ' body line ' + i + ' — history stays chronological.').join('\n\n');
     return json({ items: id === 'other' ? [{ id: 'other-body', source: 'assistant', text: 'Other history fixture' }] : n > 0 && n < 8 ? [{ id: 'tool-' + n, source: 'tool', text: '' }] : [{ id: 'body-' + n, source: 'assistant', text }], cursor: id === 'other' || n === (historyExtra ? 12 : 11) ? null : String(n + 1), beforeCursor: null });
    }
    throw Error('Unexpected history fixture route');
   };
  });
  await page.locator('#connect').click(); await page.locator('#key').fill('capy_' + 'x'.repeat(43)); await page.locator('#save-key').click();
  await page.waitForFunction(() => typeof workTree !== 'undefined' && workTree.state.updated > 0 && !navigating);
  async function open(id) { await page.locator('#threads [data-id="' + id + '"]').click(); await page.waitForFunction(() => !navigating); }
  await open('long');
  await page.waitForFunction(() => !messageBusy && !messageState.next && messageState.items.some(i => i.id === 'body-11'));
  assert.equal((await app.evaluate(() => historyCalls.filter(c => c.id === 'long'))).length, 12);
  assert.match(await page.locator('#message-health').innerText(), /latest/);
  assert.equal(await page.evaluate(() => transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 3), true);
  assert.equal(await page.locator('#entries article').last().getAttribute('data-message-id'), 'body-11');
  const firstCount = (await app.evaluate(() => historyCalls)).length;
  await open('other'); await open('long');
  assert.equal(await page.locator('#entries article').last().getAttribute('data-message-id'), 'body-11');
  const reopen = (await app.evaluate(() => historyCalls)).slice(firstCount).filter(c => c.id === 'long');
  assert.equal(reopen.some(c => c.n < 11), false);
  await page.evaluate(() => { clearTimeout(messageTimer); pane = 'conversation'; chatPosition = chatText().text.indexOf('body line 5'); chatAnchor = chatPosition + 7; paintChat(false); transcript.scrollTop = 20; globalThis.fixtureSelection = chatText().text.slice(selectedChat(chatText()).from, selectedChat(chatText()).to); });
  const scroll = await page.evaluate(() => transcript.scrollTop);
  await app.evaluate(() => { historyExtra = true; }); await page.evaluate(() => scheduleMessages(0));
  await page.waitForFunction(() => !messageBusy && messageState.items.some(i => i.id === 'body-12'));
  assert.equal(await page.evaluate(() => transcript.scrollTop), scroll);
  assert.equal(await page.evaluate(() => { const p = chatText(), s = selectedChat(p); return p.text.slice(s.from, s.to); }), await page.evaluate(() => fixtureSelection));
  if (process.argv[2]) {
   await page.evaluate(() => { chatAnchor = null; paintChat(false); keyboardMode(); transcript.scrollTop = transcript.scrollHeight; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
   const png = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w.isVisible() || w.isFocused()) throw Error('Visible history fixture'); return (await w.capturePage()).toPNG().toString('base64'); });
   await fs.mkdir(process.argv[2], { recursive: true }); await fs.writeFile(path.join(process.argv[2], 'automatic-latest.png'), Buffer.from(png, 'base64'));
  }
  await app.evaluate(() => { historyDelay = true; }); await open('delayed');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenCount = (await app.evaluate(() => historyCalls.filter(c => c.id === 'delayed'))).length;
  await page.waitForTimeout(400); assert.equal((await app.evaluate(() => historyCalls.filter(c => c.id === 'delayed'))).length, hiddenCount);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await open('other'); const cancelCount = (await app.evaluate(() => historyCalls.filter(c => c.id === 'delayed'))).length;
  await page.waitForTimeout(400); assert.equal((await app.evaluate(() => historyCalls.filter(c => c.id === 'delayed'))).length, cancelCount);
  await open('cycle'); await page.waitForFunction(() => !messageBusy && $('message-health').textContent.includes('unchanged'));
  const cycleCount = (await app.evaluate(() => historyCalls.filter(c => c.id === 'cycle'))).length;
  await page.waitForTimeout(400); assert.equal((await app.evaluate(() => historyCalls.filter(c => c.id === 'cycle'))).length, cycleCount); assert.ok(cycleCount <= 10);
  await open('large'); await page.waitForFunction(() => !messageBusy && $('message-health').textContent.includes('Paused after 200'), null, { timeout: 15000 });
  assert.equal((await app.evaluate(() => historyCalls.filter(c => c.id === 'large'))).length, 200);
  assert.equal(await page.evaluate(() => messageState.next !== null), true);
  console.log('PASS hidden auto history: 12 sparse pages without clicks, latest landing, chronological merge, session cache, automatic updates without viewport/Visual jumps, hidden/thread cancellation, cross-batch cycle stop and transparent 200-page cap');
 } finally { await app?.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
