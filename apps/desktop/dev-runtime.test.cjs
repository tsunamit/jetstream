const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {profile}=require('./dev-runtime.cjs');
const app={getPath:name=>{assert.equal(name,'appData');return '/private/app-data';}};
test('Dev profile cannot collide with stable or escape its own root',()=>{
  assert.equal(profile(app,[]),path.join('/private/app-data','Capy Terminal Dev','profiles','default'));
  assert.equal(profile(app,['--dev-profile=ui']),path.join('/private/app-data','Capy Terminal Dev','profiles','ui'));
  assert.throws(()=>profile(app,['--dev-profile=../../stable']));
  assert.throws(()=>profile(app,['--user-data-dir=/stable']));
});
test('isolated hidden harness controls its temporary profile',()=>{
  const temporary=path.join(require('node:os').tmpdir(),'dev-hidden');
  assert.equal(profile(app,['--test-hidden','--user-data-dir='+temporary]),temporary);
  assert.throws(()=>profile(app,['--test-hidden','--user-data-dir=/stable']));
});
test('unavailable Keychain keeps Dev credentials session-only without a prompt',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os');
  const {Connection}=require('./connection.cjs');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'capy-dev-key-'));
  const key='capy_'+'x'.repeat(43);
  const storage={isEncryptionAvailable:()=>false,encryptString:()=>assert.fail('Must not prompt or encrypt'),decryptString:()=>assert.fail('Must not prompt or decrypt')};
  try{
    const connection=new Connection({directory,storage,validate:async()=>({items:[]})});
    await connection.start();await connection.connect(key,true);
    assert.equal(connection.status().source,'session');assert.match(connection.status().warning,/session only/);
    assert.equal((await fs.readdir(directory)).includes('credential.bin'),false);
    assert.equal((await fs.readFile(path.join(directory,'connection.json'),'utf8')).includes(key),false);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('failed source syntax leaves both bundles intact and recovers',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os');
  const {build}=require('./dev-build.cjs');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'capy-dev-build-'));
  try{
    for(const name of ['rich-entry.js','composer-entry.js','renderer.js'])await fs.writeFile(path.join(directory,name),'const valid = 1;');
    await build(directory);
    const before=await fs.readFile(path.join(directory,'rich.bundle.js'),'utf8');
    await fs.writeFile(path.join(directory,'renderer.js'),'const syntax = ;');
    await assert.rejects(build(directory));
    assert.equal(await fs.readFile(path.join(directory,'rich.bundle.js'),'utf8'),before);
    await fs.writeFile(path.join(directory,'renderer.js'),'const repaired = true;');
    await build(directory);assert.equal((await fs.readdir(directory)).some(name=>name.endsWith('.dev-tmp')),false);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
