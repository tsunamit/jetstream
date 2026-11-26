const {_electron} = require('./test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-branding-'));
  const out = process.argv[2] || path.join(os.homedir(),'.capy/work/JETS-35/renders');
  await fs.mkdir(out,{recursive:true});
  try {
    for (const dev of [false,true]) {
      let app;
      try {
        app = await _electron.launch({args:['.','--demo','--user-data-dir='+path.join(root,dev?'dev':'stable'),...(dev?['--dev-launch']:[])]});
        const page = await app.firstWindow();
        await page.getByRole('heading',{name:'Tighten the release checklist'}).waitFor();
        await page.waitForFunction(()=>!navigating && document.querySelector('#entries').innerText.length>50);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await page.title(),dev?'Jetstream Dev':'Jetstream');
        assert.equal((await page.locator('.brand').innerText()).trim(),dev?'▰ Jetstream Dev':'▰ Jetstream');
        const proof = await app.evaluate(async ({app,BrowserWindow}) => {
          const window = BrowserWindow.getAllWindows()[0], image = await window.capturePage(), bytes = image.toBitmap();
          return {name:app.getName(),title:window.getTitle(),visible:window.isVisible(),focused:window.isFocused(),userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),colors:new Set(Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4))).size,png:image.toPNG().toString('base64')};
        });
        assert.equal(proof.name,dev?'Jetstream Dev':'Jetstream');
        assert.equal(proof.title,proof.name);
        assert.equal(proof.visible,false);
        assert.equal(proof.focused,false);
        assert.equal(proof.sessionData,proof.userData);
        assert.ok(proof.colors>100);
        await fs.writeFile(path.join(out,dev?'jetstream-dev-hidden.png':'jetstream-hidden.png'),Buffer.from(proof.png,'base64'));
        delete proof.png;
        console.log('PASS hidden branded rendering',JSON.stringify(proof));
      } finally {await app?.close();}
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
