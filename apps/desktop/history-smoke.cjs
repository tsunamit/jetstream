const { _electron } = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-history-'));
  let app;
  try {
    app = await _electron.launch({ args: ['.', '--demo', '--disable-gpu', '--user-data-dir=' + profile] });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const state = () => page.evaluate(() => ({ index: historyIndex, length: history.length, id: thread?.id, target: updateTarget, scroll: transcript.scrollTop, focus: document.activeElement.id, pane }));
    const settled = () => page.waitForFunction(() => !navigating && historyIndex >= 0);
    const key = async chord => { await page.keyboard.press(chord); await settled(); };
    const back = async () => { await page.locator('#back').click(); await settled(); };
    const forward = async () => { await page.locator('#forward').click(); await settled(); };
    await page.getByRole('heading', { name: 'Tighten the release checklist' }).waitFor();
    await settled();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1140, 600));
    assert.equal((await state()).length, 1);
    assert.equal(await page.locator('#back').isDisabled(), true);
    assert.equal(await page.locator('#forward').isDisabled(), true);
    await page.locator('#conversation').focus();
    await key('Control+o');
    assert.equal((await state()).index, 0);
    await page.keyboard.type('gt');
    await page.keyboard.press('i');
    await page.keyboard.press('Escape');
    assert.equal((await state()).length, 1);

    await page.locator('#earlier').click();
    await page.getByText('The first pass at the release checklist is ready.').waitFor();
    await page.locator('#edit-reply').click();
    await page.locator('#draft .cm-content').fill('A draft stays here');
    await page.locator('#draft').evaluate(el => el.setSelectionRange(3, 7));
    await page.evaluate(() => { transcript.scrollTop = 60; });
    const initial = await state();
    assert.ok(initial.scroll > 0, 'scroll restoration must exercise a nonzero offset');
    await key(process.platform==='darwin'?'Meta+k':'Control+Shift+k');
    await page.keyboard.press('Control+o');
    await page.keyboard.press('Control+i');
    assert.equal((await state()).length, 1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal((await state()).length, 1);
    assert.equal((await state()).focus, 'draft-input');
    assert.equal((await state()).scroll, initial.scroll);

    await key(process.platform==='darwin'?'Meta+k':'Control+Shift+k');
    await page.locator('#picker-search').fill('offln');
    await key('Enter');
    assert.equal((await state()).target, 'done-1');
    assert.equal((await state()).length, 2);
    await page.locator('#edit-reply').click();
    await page.locator('#draft .cm-content').fill('B draft');
    await page.locator('#conversation').focus();
    await page.getByRole('button', { name: /Review the command palette/ }).click();
    await settled();
    await page.locator('#conversation').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('a');
    await page.locator('#pin-list button').waitFor();
    await back();
    assert.equal((await state()).target, 'done-1');
    assert.equal(await page.evaluate(() => draft.value), 'B draft');
    await page.locator('#conversation').focus();
    await page.keyboard.press('Space');
    await key('1');
    assert.equal((await state()).id, 't2');
    await page.locator('#conversation').focus();
    await key('Control+o');
    assert.equal((await state()).target, 'done-1');
    assert.equal(await page.locator('.jump-target').getAttribute('data-message-id'), 'done-1');
    await key('Alt+ArrowLeft');
    assert.equal((await state()).id, 't1');
    assert.equal((await state()).focus, 'draft-input');
    assert.equal((await state()).pane, 'composer');
    assert.equal((await state()).scroll, initial.scroll);
    assert.equal(await page.evaluate(() => draft.value), 'A draft stays here');
    assert.deepEqual(await page.locator('#draft').evaluate(el => [el.selectionStart, el.selectionEnd]), [3, 7]);
    assert.equal(await page.getByText('The first pass at the release checklist is ready.').count(), 1);

    const beforeInput = await state();
    for (const chord of ['Control+o', 'Control+i', 'Alt+ArrowLeft', 'Alt+ArrowRight']) await key(chord);
    assert.equal((await state()).index, beforeInput.index);
    assert.equal(await page.evaluate(() => draft.value), 'A draft stays here');
    await key('Escape');
    await key('Control+w');
    await key('k');
    await key('Control+i');
    assert.equal((await state()).target, 'done-1');
    if (process.argv[2]) {
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.mkdir(process.argv[2], { recursive: true });
      await fs.writeFile(path.join(process.argv[2], '06-exact-result-history.png'), Buffer.from(png, 'base64'));
    }
    await key('Alt+ArrowRight');
    assert.equal((await state()).id, 't2');
    assert.equal(await page.locator('#forward').isDisabled(), true);
    await key('Control+i');
    assert.equal((await state()).id, 't2');
    const tab = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(tab, false);
    const focusBeforeTab = (await state()).focus;
    await page.keyboard.press('Tab');
    assert.notEqual((await state()).focus, focusBeforeTab);
    assert.equal((await state()).id, 't2');

    await page.locator('#help').click();
    await key('Control+o');
    assert.equal((await state()).id, 't2');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { $('connect').hidden = false; });
    await page.locator('#connect').click();
    await page.locator('#key').fill('not-a-real-key');
    for (const chord of ['Control+o', 'Control+i', 'Alt+ArrowLeft']) await key(chord);
    assert.equal((await state()).id, 't2');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { $('connect').hidden = true; });

    await back();
    await page.getByRole('button', { name: /Clean up onboarding copy/ }).click();
    await settled();
    assert.equal(await page.locator('#forward').isDisabled(), true);
    assert.equal((await state()).length, 3);
    await page.getByRole('button', { name: /Clean up onboarding copy/ }).click();
    await settled();
    assert.equal((await state()).length, 3);
    await page.locator('#projects').selectOption('p2');
    await settled();
    await page.getByText('No threads in this project.').waitFor();
    await page.locator('#projects').focus();
    await key('Control+o');
    assert.equal(await page.locator('#projects').inputValue(), 'p2');
    await back();
    assert.equal(await page.locator('#projects').inputValue(), 'p1');
    assert.equal((await state()).id, 't4');
    await forward();
    assert.equal(await page.locator('#projects').inputValue(), 'p2');
    await page.evaluate(() => showPicker('results'));
    await page.keyboard.press('Enter');
    await settled();
    assert.equal(await page.locator('#projects').inputValue(), 'p1');
    assert.equal((await state()).target, 'done-1');

    await page.evaluate(async () => {
      for (let index = 0; index < 105; index++) await openThread(catalog.threads[index % 2], { focus: 'conversation' });
    });
    assert.equal((await state()).length, 100);
    assert.equal((await state()).index, 99);
    await back();
    assert.equal((await state()).length, 100);
    if (process.argv[2]) {
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.mkdir(process.argv[2], { recursive: true });
      await fs.writeFile(path.join(process.argv[2], '06-view-history.png'), Buffer.from(png, 'base64'));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(640, 600));
      await page.waitForFunction(() => innerWidth === 640);
      for (const id of ['back', 'forward', 'find', 'help']) {
        const bounds = await page.locator('#' + id).boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 640, id + ' must remain visible at minimum width');
      }
      const narrow = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(process.argv[2], '07-history-narrow.png'), Buffer.from(narrow, 'base64'));
    }
    console.log('PASS: history boundaries, exact results, pins, branching, deduplication, 100-view bound, preview cancellation, project restoration, paginated scroll, drafts, selection, focus, normal-mode shortcuts, Tab and dialog/input safety');
  } finally {
    await app?.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
