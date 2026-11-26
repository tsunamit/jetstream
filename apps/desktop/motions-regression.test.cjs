const {test}=require('node:test');
const assert=require('node:assert/strict');
const {move}=require('./motions.js');
test('adjacent motions match grapheme boundaries at every UTF-16 offset',()=>{
 const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 for(const text of ['', 'plain text', '\r\nnext\n', 'a\u0301b', 'a👩‍💻b', '👨‍👩‍👧‍👦x', '🇨🇦🇺🇸', '👍🏽👍', 'क्‍ष', '\ud800x\udc00']) {
  const boundaries=[...segmenter.segment(text)].map(part=>part.index);
  for(let position=-1;position<=text.length+1;position++) {
   const p=Math.max(0,Math.min(text.length,position));
   assert.equal(move(text,position,'Left'),boundaries.filter(index=>index<p).at(-1)??0,JSON.stringify({text,position,motion:'Left'}));
   assert.equal(move(text,position,'Right'),boundaries.find(index=>index>p)??text.length,JSON.stringify({text,position,motion:'Right'}));
  }
 }
});
