const {test} = require('node:test');
const assert = require('node:assert/strict');
const K = require('./keymaps.js');
test('defaults, leader expansion, case and platform chords', () => {
  for (const mac of [true, false]) assert.ok(K.compile(K.defaults(mac), mac).length > 25);
  const config = {...K.defaults(false), leader:','};
  assert.deepEqual(K.compile(config).find(b => b.id === 'results').keys, [',','r','d']);
  assert.deepEqual(K.parse('gT<C-S-j><D-k>', ',', false), ['g','T','C:S:j','C:k']);
  assert.equal(K.eventKey({key:'J',ctrlKey:true,shiftKey:true}), 'C:S:j');
  assert.equal(K.eventKey({key:'?', shiftKey:true}), '?');
});
test('unmapping, strict schema, native and unsupported chords, ambiguity rejection', () => {
  const config = (mappings = {}) => ({...K.defaults(false), mappings});
  assert.ok(!K.compile(config({reply:[]})).some(b => b.id === 'reply'));
  for (const bad of [
    config({reply:['j']}), config({reply:['g']}), config({reply:['<leader>']}),
    config({reply:['<M-j>']}), config({reply:['<C-c>']}), config({reply:['<Tab>']}),
    config({resultsGlobal:['x']}), config({send:['x']}), config({pickerNext:['j']}),
    config({wat:[]}), config({reply:'i'}), {...config(),timeout:0},
    {...config(),leader:'ab'}, {...config(),leader:'<Left>'}, {...config(),version:4}
  ]) assert.throws(() => K.compile(bad), JSON.stringify(bad));
  assert.throws(() => K.compile(config({resultsGlobal:['<C-o>']})), /conflicts/);
});
test('legacy migration preserves overrides, unmaps and leader; detects new prefix conflicts', () => {
  const saved = {version:1,leader:',',timeout:500,mappings:{threads:['<leader>t'],results:['<leader>u'],running:['<leader>r'],reply:['e'],up:[],chatDown:['j']}};
  const migrated = K.migrate(saved);
  assert.equal(migrated.version,3);
  assert.equal(migrated.leader,',');
  assert.equal(migrated.timeout,500);
  assert.deepEqual(migrated.mappings,{reply:['e'],up:[]});
  assert.deepEqual(K.compile(migrated).find(b => b.id === 'running').keys,[',','r','r']);
  assert.deepEqual(K.migrate({...saved,mappings:{results:['<leader>z']}}).mappings.results,['<leader>z']);
  const conflict = {...saved,mappings:{reply:['<leader>r']}};
  assert.throws(() => K.migrate(conflict), error => /migration blocked.*conflicts/.test(error.message) && error.config.mappings.reply[0] === '<leader>r');
  assert.deepEqual(conflict.mappings,{reply:['<leader>r']});
});
test('half-page defaults remain outside composer and preserve overrides',()=>{
 const config={...K.defaults(false),mappings:{chatHalfDown:['<C-e>'],chatHalfUp:[]}};
 assert.deepEqual(K.migrate(config),config);
 const bindings=K.compile(config);
 assert.deepEqual(bindings.find(b=>b.id==='chatHalfDown').keys,['C:e']);
 assert.ok(!bindings.some(b=>b.id==='chatHalfUp'));
 assert.ok(!bindings.filter(b=>b.id.includes('Half')).some(b=>K.activeScopes('composer').includes(b.scope)||K.activeScopes('composerNormal').includes(b.scope)));
});
test('new default conflicts retain version two overrides for repair; editor defaults retire without deleting explicit aliases',()=>{
 const config={...K.defaults(false),mappings:{reply:['<C-d>']}};
 assert.throws(()=>K.migrate(config),e=>e.config===config&&/repair/.test(e.message));
 assert.ok(!K.compile(K.defaults(false)).some(b=>b.id.startsWith('draft')));
 assert.ok(K.compile({...K.defaults(false),mappings:{draftUndo:['<C-e>']}}).some(b=>b.id==='draftUndo'));
});
test('window and Insert-escape migration changes only exact prior defaults once',()=>{
 const saved={version:2,leader:',',timeout:500,mappings:{navigator:['<C-w>h'],conversation:['<C-w>l'],switchPane:['gt','gT'],normal:['<Esc>'],reply:['e'],up:[],resultsGlobal:['<C-k>']}};
 const original=JSON.stringify(saved), migrated=K.migrate(saved);
 assert.equal(migrated.version,3);assert.equal(JSON.stringify(saved),original);
 assert.deepEqual(migrated.mappings,{reply:['e'],up:[]});
 const bindings=K.compile(migrated);
 assert.ok(bindings.some(b=>b.id==='windowDown'&&b.keys.join('')===',wj'));
 assert.ok(bindings.some(b=>b.id==='normal'&&b.keys.join('')==='jk'));
 assert.deepEqual(bindings.find(b=>b.id==='resultsGlobal').keys,['C:S:k']);
 assert.deepEqual(K.compile(K.migrate({version:2,leader:'<Space>',timeout:900,mappings:{}},true),true).find(b=>b.id==='resultsGlobal').keys,['M:k']);
 assert.throws(()=>K.parse('<C-l>','',false),/Reserved/);
 const custom={...K.defaults(false),mappings:{normal:['<Esc>'],windowUp:[],reply:['e']}};
 assert.equal(K.migrate(custom),custom);
 assert.ok(!K.compile(custom).some(b=>b.id==='normal'&&b.notation==='jk'));
 assert.ok(!K.compile(custom).some(b=>b.id==='windowUp'));
 assert.throws(()=>K.compile({...K.defaults(false),mappings:{windowLeft:['<C-j>']}}),/conflicts/);
 const conflicting={version:2,leader:'<Space>',timeout:900,mappings:{navigator:['<C-w>h','<A-h>']}};
 const before=JSON.stringify(conflicting);
 assert.throws(()=>K.migrate(conflicting),error=>/migration blocked/.test(error.message)&&JSON.stringify(error.config.mappings.navigator)===JSON.stringify(conflicting.mappings.navigator));
 assert.equal(JSON.stringify(conflicting),before);
});
test('window keys use the active leader without capturing unrelated text or picker scopes',()=>{
 const config={...K.defaults(true),leader:';',mappings:{...K.defaults(true).mappings,normal:['<Esc>','jj']}};
 const bindings=K.compile(config,true);
 assert.ok(bindings.some(b=>b.id==='windowUp'&&b.keys.join('')===';wk'));
 assert.ok(K.activeScopes('composer').includes('windows'));
 assert.ok(!K.activeScopes('text').includes('windows'));
 assert.ok(!K.activeScopes('picker').includes('windows'));
 assert.throws(()=>K.compile({...K.defaults(false),mappings:{normal:['j<C-k>']}}),/text scopes/);
});
