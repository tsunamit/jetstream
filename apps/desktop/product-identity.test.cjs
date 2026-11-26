const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const identity = require('./product-identity.cjs');
const {profile} = require('./dev-runtime.cjs');
const {Connection} = require('./connection.cjs');

function application(root) {
  const paths = {appData:root};
  return {paths, name:'Jetstream', getPath:name=>paths[name], setPath(name,value){paths[name]=value;}, setName(name){this.name=name;}, setAboutPanelOptions(value){this.about=value;}};
}

test('stable retains its legacy profile and encryption identity before display rename', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'jetstream-migration-'));
  const app = application(root);
  identity.initialize(app, []);
  assert.equal(app.name,'Capy Terminal');
  assert.equal(app.paths.userData,path.join(root,'Capy Terminal'));
  assert.equal(app.paths.sessionData,app.paths.userData);
  const cryptoIdentity = {account:app.name, service:app.name+' Safe Storage'};
  const key = 'capy_'+'m'.repeat(43);
  const ciphertext = Buffer.from('mock encrypted credential');
  await fs.mkdir(app.paths.userData);
  const fixtures = {'credential.bin':ciphertext,'connection.json':'{"mode":"live"}','keymaps.json':'{"version":1}','zoom.json':'{"percent":110}','workspace-fixture.json':'{"pins":[]}'};
  try {
    for (const [name,bytes] of Object.entries(fixtures)) await fs.writeFile(path.join(app.paths.userData,name),bytes);
    const storage = {isEncryptionAvailable:()=>true, decryptString(bytes){assert.deepEqual(bytes,ciphertext);assert.deepEqual(cryptoIdentity,{account:'Capy Terminal',service:'Capy Terminal Safe Storage'});return key;},encryptString:()=>assert.fail('Rename must not re-encrypt credentials')};
    assert.equal(identity.display(app,false),'Jetstream');
    assert.deepEqual(app.about,{applicationName:'Jetstream'});
    const connection = new Connection({directory:app.getPath('userData'),storage,validate:async candidate=>assert.equal(candidate,key)});
    await connection.start();
    assert.equal(connection.status().connected,true);
    assert.equal(connection.status().source,'saved');
    for (const [name,bytes] of Object.entries(fixtures)) assert.deepEqual(await fs.readFile(path.join(app.paths.userData,name)),Buffer.from(bytes));
    assert.deepEqual(await fs.readdir(root),['Capy Terminal']);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('Dev keeps its legacy root and crypto name separately from stable', () => {
  const app = application('/fixture');
  identity.initialize(app,[]);
  const stable = app.paths.userData;
  const directory = profile(app,['--dev-profile=ui']);
  assert.equal(directory,path.join('/fixture','Capy Terminal Dev','profiles','ui'));
  assert.notEqual(directory,stable);
  app.setName(identity.devName);
  const service = app.name+' Safe Storage';
  identity.display(app,true);
  assert.equal(app.name,'Jetstream Dev');
  assert.equal(service,'Capy Terminal Dev Safe Storage');
});

test('explicit isolated harness profile remains the session and config root', () => {
  const app = application('/must-not-use');
  const directory = path.join(os.tmpdir(),'jetstream-test-profile');
  identity.initialize(app,['--test-hidden','--user-data-dir='+directory]);
  assert.equal(app.paths.userData,directory);
  assert.equal(app.paths.sessionData,directory);
});

test('package metadata and launchers use Jetstream without changing bundle or signing identity', async () => {
  const metadata = require('./package.json');
  assert.equal(metadata.devDependencies.electron,'45.4.1');
  assert.equal(metadata.name,'jetstream-desktop');
  assert.equal(metadata.productName,'Jetstream');
  assert.match(metadata.scripts.pack,/electron-packager \. 'Jetstream'/);
  assert.match(metadata.scripts.pack,/--app-bundle-id=local\.ryan\.capy-terminal(?: |$)/);
  assert.match(metadata.scripts.postpack,/codesign --force --deep --sign - 'dist\/Jetstream-darwin-arm64\/Jetstream\.app'/);
  const launcher = await fs.readFile(path.join(__dirname,'Jetstream Dev.command'),'utf8');
  assert.match(launcher,/exec node dev-launch\.cjs/);
  assert.equal((await fs.stat(path.join(__dirname,'Jetstream Dev.command'))).mode & 0o111,0o111);
  const ignore = new RegExp(metadata.scripts.pack.match(/--ignore='([^']+)'/)[1].replaceAll('\\\\','\\'));
  for (const name of ['Jetstream Dev.command','Capy Terminal Dev.command','dev-runtime.cjs','branding-smoke.cjs','product-identity.test.cjs']) assert.equal(ignore.test('/'+name),true,name);
  assert.equal(ignore.test('/product-identity.cjs'),false);
});

test('main initializes compatibility before ready and changes only display at ready', async () => {
  const main = await fs.readFile(path.join(__dirname,'main.cjs'),'utf8');
  const initialize = main.indexOf('identity.initialize(app, process.argv)');
  const ready = main.indexOf('app.whenReady().then(async () => {');
  const display = main.indexOf('identity.display(app, Boolean(dev))');
  assert.ok(initialize>0 && initialize<ready && ready<display);
  assert.equal(require('./dev-watch.cjs').classify('product-identity.cjs'),'restart');
});
