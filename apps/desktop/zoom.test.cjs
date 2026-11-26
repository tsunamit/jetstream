const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Zoom,percent,action} = require('./zoom.cjs');
const K = require('./keymaps.js');
test('native zoom aliases, repeats and unrelated/composing input',()=>{
  for (const mac of [true,false]) {
    const input={type:'keyDown',key:'=',meta:mac,control:!mac};
    for (const key of ['=','+']) for (const shift of [true,false]) assert.equal(action({...input,key,shift,isAutoRepeat:true},mac),'in');
    assert.equal(action({...input,key:'-'},mac),'out');assert.equal(action({...input,key:'0'},mac),'reset');
    for (const extra of [{type:'keyUp'},{isComposing:true},{alt:true},{meta:true,control:true},{meta:false,control:false},{key:'/'},{key:'0',shift:true},{key:'-',shift:true}]) assert.equal(action({...input,...extra},mac),null);
    for (const key of ['=','+','0']) assert.throws(()=>K.compile({...K.defaults(mac),mappings:{reply:[`<D-${key}>`]}},mac),/Reserved/);
    assert.throws(()=>K.compile({...K.defaults(mac),mappings:{reply:['<D-->']}},mac));
  }
});
test('bounded zoom persists only validated appearance and fails safely',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'capy-zoom-unit-'));
  try {
    const zoom=new Zoom(directory);zoom.load();assert.equal(zoom.value,100);
    for(let i=0;i<40;i++)zoom.change('in');assert.equal(zoom.value,200);
    for(let i=0;i<40;i++)zoom.change('out');assert.equal(zoom.value,50);
    zoom.change('reset');zoom.change('in');
    const restarted=new Zoom(directory);restarted.load();assert.equal(restarted.value,110);
    assert.deepEqual(JSON.parse(fs.readFileSync(zoom.file)),{version:1,zoomPercent:110});
    assert.equal(fs.statSync(zoom.file).mode & 0o777,0o600);
    assert.deepEqual(fs.readdirSync(directory),['appearance.json']);
    for(const value of [null,NaN,49,201,55,'100'])assert.throws(()=>percent(value));
    for(const saved of [{version:1,zoomPercent:500},{version:1,zoomPercent:100,key:'fixture'},null]) {
      const bytes=JSON.stringify(saved);fs.writeFileSync(zoom.file,bytes);
      const invalid=new Zoom(directory);invalid.load();assert.equal(invalid.value,100);assert.ok(invalid.error);assert.equal(fs.readFileSync(zoom.file,'utf8'),bytes);
    }
    assert.throws(()=>zoom.change('wat'));fs.writeFileSync(path.join(directory,'blocked'),'file');
    const blocked=new Zoom(path.join(directory,'blocked'));blocked.change('in');assert.equal(blocked.value,110);assert.match(blocked.error,/could not be saved/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('reply aliases respect overrides, unmaps and conflicting default repair',()=>{
  assert.deepEqual(K.compile(K.defaults(true),true).filter(b=>b.id==='reply').map(b=>b.notation),['i','o','a']);
  for(const reply of [[],['i'],['e']]) {
    const saved={...K.defaults(true),mappings:{reply}};assert.equal(K.migrate(saved,true),saved);
    assert.deepEqual(K.compile(saved,true).filter(b=>b.id==='reply').map(b=>b.notation),reply);
  }
  const conflict={...K.defaults(true),mappings:{pin:['a']}};
  assert.throws(()=>K.migrate(conflict,true),error=>error.config===conflict && /repair/.test(error.message));
});
