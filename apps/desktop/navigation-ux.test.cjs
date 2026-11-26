const test=require('node:test'),assert=require('node:assert/strict'),Keymaps=require('./keymaps.js');
test('picker collection actions share Query/Browse without changing native form or editor ownership',()=>{
 for(const mac of [false,true]) {
  const bindings=Keymaps.compile(Keymaps.defaults(mac),mac);
  for(const scope of ['picker','pickerBrowse'])for(const id of ['pickerCollectionNext','pickerCollectionPrevious'])assert.ok(Keymaps.activeScopes(scope).includes(bindings.find(b=>b.id===id).scope));
  for(const scope of ['text','composer','composerNormal','chat'])assert.ok(!Keymaps.activeScopes(scope).includes('picker'));
  assert.ok(Keymaps.activeScopes('chatControl').includes('windows'));
  assert.ok(!Keymaps.activeScopes('text').includes('windows'));
  assert.throws(()=>Keymaps.parse('<Tab>',' ',mac),/reserved/i);
 }
});
test('new collection binding conflicts preserve custom maps for repair',()=>{
 const saved={...Keymaps.defaults(true),mappings:{pickerNext:['<C-PageDown>']}};
 const original=JSON.stringify(saved);
 assert.throws(()=>Keymaps.migrate(saved,true),error=>error.message.includes('conflicts')&&error.config===saved);
 assert.equal(JSON.stringify(saved),original);
 saved.mappings.pickerCollectionNext=[];
 assert.doesNotThrow(()=>Keymaps.compile(saved,true));
});
