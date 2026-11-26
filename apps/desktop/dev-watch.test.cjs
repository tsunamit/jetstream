const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {classify, watch} = require('./dev-watch.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(build = async()=>{}) {
  let change;
  const events=[], handle=new EventEmitter();
  handle.close=()=>{handle.closed=true;};
  const watcher=watch({directory:'.',build,emit:event=>events.push(event),delay:5,watchDirectory:(_directory,callback)=>{change=callback;return handle;}});
  return {events,handle,watcher,change:name=>change('change',name)};
}
test('classifies safe flat source changes without bundle feedback',()=>{
  for(const name of ['style.css','main.cjs','preload.cjs','renderer.js','composer-entry.js','index.html'])assert.ok(classify(name));
  assert.equal(classify('dev-watch.cjs'),'restart');
  assert.equal(classify('activity.css'),'style');
  for(const name of ['../main.cjs','../activity.css','file:///activity.css','activity.css?key=private','rich.bundle.js','composer.bundle.js','dev-watch.test.cjs','send-smoke.cjs','credential.bin'])assert.equal(classify(name),null,name);
});
test('style-only update does not rebuild or request renderer reload',async()=>{
  let builds=0;const f=fixture(async()=>{builds++;});
  try{f.change('style.css');f.change('style.css');await pause(30);assert.equal(builds,0);assert.equal(f.events.length,1);assert.equal(f.events[0].type,'style');}finally{f.watcher.close();}
});
test('coalesces multiple local stylesheets without a renderer rebuild',async()=>{
  let builds=0;const f=fixture(async()=>{builds++;});
  try{f.change('style.css');f.change('activity.css');await pause(30);assert.equal(builds,0);assert.deepEqual(f.events,[{type:'style',changes:['style.css','activity.css']}]);}finally{f.watcher.close();}
});
test('build errors recover on the next save',async()=>{
  let builds=0;const f=fixture(async()=>{if(++builds===1)throw Error('syntax');});
  try{f.change('renderer.js');await pause(30);assert.equal(f.events[0].type,'error');f.change('renderer.js');await pause(30);assert.equal(f.events[1].type,'renderer');}finally{f.watcher.close();}
});
test('serializes builds and suppresses callbacks after cleanup',async()=>{
  let finish,builds=0;const f=fixture(()=>{builds++;return new Promise(resolve=>{finish=resolve;});});
  f.change('renderer.js');await pause(20);f.change('composer-entry.js');await pause(20);assert.equal(builds,1);
  f.watcher.close();finish();await pause(20);assert.deepEqual(f.events,[]);assert.equal(f.handle.closed,true);assert.equal(builds,1);
});
test('main and preload changes request explicit restart',async()=>{
  const f=fixture();try{f.change('main.cjs');f.change('preload.cjs');await pause(30);assert.equal(f.events[0].type,'restart');}finally{f.watcher.close();}
});
