const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {UserConfig, defaults, validate, configPath} = require('./user-config.cjs');
const {mainFiles, classify} = require('./dev-watch.cjs');
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'jetstream-config-test-'));
  const file = path.join(directory,'settings','config.json');
  const legacyDirectory = path.join(directory,'legacy'); fs.mkdirSync(legacyDirectory);
  const events=[];
  const store = new UserConfig({file,legacyDirectory,mac:true,emit:state=>events.push(state),...options});
  t.after(()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});});
  return {directory,file,legacyDirectory,store,events};
}
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate) {
  for(let i=0;i<100;i++) {if(predicate())return;await pause(30);}
  assert.fail('Config watcher did not settle');
}
test('missing config creates private defaults and migrates custom maps, unmaps and sizes once', t=>{
  const {file,legacyDirectory,store}=fixture(t);
  const keymaps={...defaults(true).keymaps,version:2,leader:',',mappings:{reply:['e'],up:[],reloadConfig:['<leader>vr']}};
  fs.writeFileSync(path.join(legacyDirectory,'keymaps.json'),JSON.stringify(keymaps));
  fs.writeFileSync(path.join(legacyDirectory,'layout.json'),JSON.stringify({version:1,sidebarWidth:333,replyHeight:244,centeredReading:false}));
  store.start();
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.equal(store.config.keymaps.version,3);
  assert.deepEqual(store.config.keymaps.mappings,keymaps.mappings);
  assert.equal(store.config.layout.replyHeight,244);
  store.migrateToolActivity(false);
  assert.equal(store.config.showToolActivity,false);
  store.migrateToolActivity(true);
  assert.equal(store.config.showToolActivity,false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(legacyDirectory,'keymaps.json'))).version,2);
});
test('existing config wins over legacy and preserves unknown harmless fields in bounded UI updates',t=>{
  const {file,legacyDirectory,store}=fixture(t);
  fs.mkdirSync(path.dirname(file));
  const config={...defaults(true),notes:{purpose:'Keyboard preferences'},showToolActivity:false};
  fs.writeFileSync(file,JSON.stringify(config));
  fs.writeFileSync(path.join(legacyDirectory,'keymaps.json'),'{broken');
  store.start();store.migrateToolActivity(true);
  assert.equal(store.config.showToolActivity,false);
  store.update('layout',{...store.config.layout,sidebarWidth:400},store.revision);
  const saved=JSON.parse(fs.readFileSync(file));
  assert.deepEqual(saved.notes,config.notes);
  assert.deepEqual(saved.keymaps,config.keymaps);
  assert.equal(saved.showToolActivity,false);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
});
test('a config created concurrently with first migration is never overwritten by legacy preferences',t=>{
  const {file,store}=fixture(t);
  const external=JSON.stringify({...defaults(true),notes:'Created by editor'});
  const link=fs.linkSync;
  fs.linkSync=(source,destination)=>{
    if(destination===file&&!fs.existsSync(file))fs.writeFileSync(file,external);
    return link(source,destination);
  };
  try {store.start();} finally {fs.linkSync=link;}
  store.migrateToolActivity(false);
  assert.equal(fs.readFileSync(file,'utf8'),external);
  assert.equal(store.config.showToolActivity,true);
});
test('invalid syntax, schema, collisions and private fields preserve last good file and settings',t=>{
  const {file,store}=fixture(t);store.start();
  const good=structuredClone(store.config);
  for(const invalid of ['{\n  "version": ', JSON.stringify({...good,version:999}),JSON.stringify({...good,showToolActivity:'yes'}),JSON.stringify({...good,layout:{...good.layout,replyHeight:99999}}),JSON.stringify({...good,keymaps:{...good.keymaps,mappings:{reply:['j']}}}),JSON.stringify({...good,apiKey:'fixture'}),JSON.stringify({...good,metadata:{tokens:[]}}),JSON.stringify({...good,keymaps:{...good.keymaps,mappings:{send:['x']}}})]) {
    fs.writeFileSync(file,invalid);
    const result=store.load(false);
    assert.ok(result.error.includes(file));
    assert.deepEqual(result.config,good);
    assert.throws(()=>store.update('layout',good.layout,result.revision));
    assert.equal(fs.readFileSync(file,'utf8'),invalid);
  }
  fs.writeFileSync(file,'{\n invalid');
  assert.match(store.load(false).error,/line 2/);
});
test('first corrupt file uses defaults without rewriting; invalid legacy files are not lost',t=>{
  const {file,store}=fixture(t);fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,'{bad');
  const result=store.start();assert.match(result.error,/invalid JSON/);assert.deepEqual(result.config,defaults(true));assert.equal(fs.readFileSync(file,'utf8'),'{bad');
  const other=fixture(t);fs.writeFileSync(path.join(other.legacyDirectory,'keymaps.json'),'{bad');
  assert.match(other.store.start().error,/migration stopped/);assert.equal(fs.existsSync(other.file),false);
});
test('conflicting legacy maps remain available for explicit repair without losing valid sizes or tool visibility',t=>{
  const {file,legacyDirectory,store}=fixture(t);
  const legacy={version:2,leader:',',timeout:650,mappings:{reply:['j'],up:[]}};
  fs.writeFileSync(path.join(legacyDirectory,'keymaps.json'),JSON.stringify(legacy));
  fs.writeFileSync(path.join(legacyDirectory,'layout.json'),JSON.stringify({...defaults(true).layout,replyHeight:244}));
  const result=store.start();assert.match(result.error,/conflicts/);assert.equal(fs.existsSync(file),false);
  assert.deepEqual(result.repairKeymaps.mappings,legacy.mappings);
  store.migrateToolActivity(false);
  const repaired={...result.repairKeymaps,mappings:{reply:['e'],up:[]}};
  store.update('keymaps',repaired,store.revision);
  assert.equal(store.config.layout.replyHeight,244);assert.equal(store.config.showToolActivity,false);
  assert.deepEqual(store.config.keymaps.mappings.up,[]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(legacyDirectory,'keymaps.json'))),legacy);
});
test('directory watcher survives atomic editor rename, invalid saves, deletion and recreation',async t=>{
  const {file,store,events}=fixture(t);store.start();
  const good={...store.config,showToolActivity:false};
  const replace=value=>{fs.writeFileSync(file+'.editor',value);fs.renameSync(file+'.editor',file);};
  replace(JSON.stringify(good));await until(()=>store.config.showToolActivity===false);
  replace('{bad');await until(()=>store.error.includes('invalid JSON'));
  assert.equal(store.config.showToolActivity,false);
  fs.unlinkSync(file);await until(()=>store.diskRevision==='missing');
  assert.equal(store.config.showToolActivity,false);assert.ok(!fs.existsSync(file));
  replace(JSON.stringify({...good,showToolActivity:true}));await until(()=>!store.error&&store.config.showToolActivity);
  const count=events.length;await pause(300);assert.equal(events.length,count);
});
test('external edits win over stale GUI saves, even before debounce notices; UI writes are serialized synchronously',t=>{
  const {file,store}=fixture(t);store.start();const revision=store.revision;
  const external={...store.config,notes:'External edit',layout:{...store.config.layout,sidebarWidth:399}};
  fs.writeFileSync(file,JSON.stringify(external));
  assert.throws(()=>store.update('showToolActivity',false,revision),/changed on disk/);
  assert.equal(store.config.layout.sidebarWidth,399);
  const next=store.revision;
  store.update('showToolActivity',false,next);
  assert.throws(()=>store.update('layout',defaults(true).layout,next),/changed on disk/);
  assert.equal(JSON.parse(fs.readFileSync(file)).notes,'External edit');
});
test('legacy tool migration cannot overwrite an external edit before renderer startup',t=>{
  const {file,store}=fixture(t);store.start();
  fs.writeFileSync(file,JSON.stringify({...store.config,showToolActivity:true,notes:'External'}));
  store.migrateToolActivity(false);
  assert.equal(store.config.showToolActivity,true);assert.equal(store.config.notes,'External');
});
test('external writes during temporary-file preparation are detected before rename',t=>{
  const {file,store}=fixture(t);store.start();
  const external=JSON.stringify({...store.config,notes:'External won'});
  const write=fs.writeFileSync;
  fs.writeFileSync=(destination,...args)=>{
    write(destination,...args);
    if(destination.startsWith(file+'.')&&destination.endsWith('.tmp'))write(file,external);
  };
  try { assert.throws(()=>store.update('showToolActivity',false,store.revision),/changed during save/); }
  finally { fs.writeFileSync=write; }
  assert.equal(fs.readFileSync(file,'utf8'),external);
  assert.equal(store.config.notes,'External won');
  assert.deepEqual(fs.readdirSync(path.dirname(file)),['config.json']);
});
test('oversized and symlinked files are rejected without mutation',t=>{
  const {file,store,directory}=fixture(t);store.start();
  fs.writeFileSync(file,' '.repeat(65537));assert.match(store.load(false).error,/64 KiB/);
  assert.throws(()=>store.update('showToolActivity',false,store.revision),/64 KiB/);
  const destination=path.join(directory,'other.json');fs.writeFileSync(destination,JSON.stringify(defaults(true)));
  fs.unlinkSync(file);fs.symlinkSync(destination,file);
  assert.match(store.load(false).error,/Symlinks/);
  assert.throws(()=>store.update('showToolActivity',false,store.revision),/Symlinks/);
  assert.equal(JSON.parse(fs.readFileSync(destination)).showToolActivity,true);
});
test('sensitive state and executable configuration are rejected; file access failure still supplies defaults',t=>{
  for(const key of ['apiKey','auth','authorization','history','drafts','session','messages','providers','accounts','profile','models','plugins','exec','includes']) {
    assert.throws(()=>validate({...defaults(true),[key]:{}},true),/private or unsafe/);
  }
  const {file,store}=fixture(t);fs.writeFileSync(path.dirname(file),'Not a directory');
  assert.ok(store.start().error.includes(file));
  assert.deepEqual(store.migrateToolActivity(false).config,defaults(true));
});
test('stable and Dev config paths separate from legacy profiles; overrides are guarded; validator is restart-only',()=>{
  assert.equal(configPath({home:'/home/test'}),'/home/test/.config/jetstream/config.json');
  assert.equal(configPath({home:'/home/test',dev:true}),'/home/test/.config/jetstream-dev/profiles/default/config.json');
  assert.equal(configPath({home:'/home/test',dev:true,args:['--dev-profile=feature']}),'/home/test/.config/jetstream-dev/profiles/feature/config.json');
  assert.equal(configPath({profile:'/tmp/profile',args:['--test-hidden']}),'/tmp/profile/config.json');
  assert.throws(()=>configPath({args:['--config-file=/tmp/custom']}),/unpackaged Dev/);
  assert.throws(()=>configPath({dev:true,packaged:true,args:['--config-file=/tmp/custom']}));
  assert.throws(()=>configPath({dev:true,args:['--config-file=relative']}));
  assert.equal(configPath({dev:true,args:['--config-file=/tmp/custom']}),'/tmp/custom');
  assert.equal(mainFiles.has('user-config.cjs'),true);assert.equal(classify('user-config.cjs'),'restart');
  assert.doesNotThrow(()=>validate(defaults(true),true));
  const example=JSON.parse(fs.readFileSync(path.join(__dirname,'config.example.json')));
  assert.doesNotThrow(()=>validate(example,true));assert.doesNotThrow(()=>validate(example,false));
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'config.schema.json'))).properties.version.const,1);
});
