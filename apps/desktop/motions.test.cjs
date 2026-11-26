const {test} = require('node:test');
const assert = require('node:assert/strict');
const {move,line} = require('./motions.js');
test('bounded character, word, logical-line and buffer motions', () => {
  const text = 'one two\nthree\nx';
  assert.equal(move(text,0,'Left'),0);
  assert.equal(move(text,0,'Word'),4);
  assert.equal(move(text,7,'BackWord'),4);
  assert.equal(move(text,2,'Down'),10);
  assert.equal(move(text,10,'Up'),2);
  assert.equal(move(text,10,'Down'),15);
  assert.equal(move(text,9,'Start'),8);
  assert.equal(move(text,9,'End'),13);
  assert.deepEqual(line(text,9),[8,14]);
  assert.deepEqual(line('',0),[0,0]);
  assert.deepEqual(line('\na',0),[0,1]);
  assert.equal(move('a👩‍💻b',1,'Right'),6);
  assert.equal(move('a👩‍💻b',6,'Left'),1);
});
