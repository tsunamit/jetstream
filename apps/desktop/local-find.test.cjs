const {test}=require('node:test');
const assert=require('node:assert/strict');
const {matches}=require('./local-find.js');
test('literal smartcase matches keep UTF16 ranges across lines and unicode',()=>{
  assert.deepEqual(matches('Hi hi HI','hi'),[{start:0,end:2},{start:3,end:5},{start:6,end:8}]);
  assert.deepEqual(matches('Hi hi HI','Hi'),[{start:0,end:2}]);
  assert.deepEqual(matches('😀 café\n東京','café\n東京'),[{start:3,end:10}]);
  assert.deepEqual(matches('İ x X','x'),[{start:2,end:3},{start:4,end:5}]);
  assert.deepEqual(matches('a.* aXX','.*'),[{start:1,end:3}]);
  assert.equal(matches('a'.repeat(10000),'a').length,2000);
  assert.deepEqual(matches('abc',''),[]);
});
