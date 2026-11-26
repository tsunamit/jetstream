const playwright = require('playwright-core');
const assert = require('node:assert/strict');
module.exports = {...playwright,_electron:{...playwright._electron,launch:async options=>{
  const args=[...options.args];
  if(!args.includes('--test-hidden'))args.push('--test-hidden');
  assert.ok(args.includes('--demo') || args.includes('--live') && !options.env?.CAPY_API_KEY);
  assert.ok(args.some(arg=>arg.startsWith('--user-data-dir=')));
  const app=await playwright._electron.launch({...options,args});
  const profile=args.find(arg=>arg.startsWith('--user-data-dir=')).slice(16);
  assert.equal(require('node:fs').realpathSync(await app.evaluate(({app})=>app.getPath('userData'))),require('node:fs').realpathSync(profile));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused())),false);
  const firstWindow=app.firstWindow.bind(app);
  app.firstWindow=async()=>{const page=await firstWindow();const session=await page.context().newCDPSession(page);await session.send('Emulation.setFocusEmulationEnabled',{enabled:true});return page;};
  return app;
}}};
