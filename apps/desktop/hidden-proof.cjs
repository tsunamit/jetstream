const {_electron} = require('playwright-core');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const profile = await fs.mkdtemp(path.join(os.tmpdir(),'capy-hidden-proof-'));
 let app;
 try {
  app = await _electron.launch({args:['.','--demo','--test-hidden','--user-data-dir=' + profile]});
  assert.equal(await fs.realpath(await app.evaluate(({app})=>app.getPath('userData'))),await fs.realpath(profile));
  const page = await app.firstWindow();
  await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
  await page.waitForFunction(()=>document.getElementById('entries').innerText.length>50 && !navigating);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const proof = await app.evaluate(async ({BrowserWindow,nativeImage}) => {
   const w = BrowserWindow.getAllWindows()[0], image = await w.capturePage(), bytes = image.toBitmap();
   return {visible:w.isVisible(),focused:w.isFocused(),size:image.getSize(),colors:new Set(Array.from({length:Math.floor(bytes.length/4)},(_,i)=>bytes.readUInt32LE(i*4))).size,png:image.toPNG().toString('base64')};
  });
  assert.equal(proof.visible,false); assert.equal(proof.focused,false); assert.ok(proof.size.width >= 640); assert.ok(proof.colors > 100);
  const text = await page.locator('#entries').innerText(); assert.ok(text.length > 50);
  await fs.mkdir('/Users/ryan/.capy/work/JETS-11-mac/renders',{recursive:true});
  await fs.writeFile('/Users/ryan/.capy/work/JETS-11-mac/renders/hidden-proof.png',Buffer.from(proof.png,'base64'));
  delete proof.png; console.log('PASS hidden actual rendered capture',JSON.stringify({...proof,textLength:text.length}));
 } finally {await app?.close(); await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
