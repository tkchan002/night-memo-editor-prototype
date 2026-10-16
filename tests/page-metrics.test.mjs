import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePageCounts,fitPageImage,imageDataUri,PAGE_MM} from '../src/page-metrics.js';

test('A4 landscape page has expected dimensions',()=>{
 assert.deepEqual(PAGE_MM,{width:297,height:210});
});
test('page-locked fitting retains aspect ratio and never crops a page',()=>{
 for (const [w,h] of [[1123,794],[794,1123],[1200,1200]]){
  const v=fitPageImage(w,h);
  assert.ok(v.x>=-0.00001&&v.y>=-0.00001);
  assert.ok(v.width<=297.0001&&v.height<=210.0001);
  assert.ok(Math.abs(v.width/v.height-w/h)<0.0001);
 }
});
test('page comparisons detect previous 7 vs 10 page problem',()=>{
 assert.equal(comparePageCounts(7,10).match,false);
 assert.equal(comparePageCounts(7,10).difference,3);
 assert.equal(comparePageCounts(7,7).match,true);
});
test('invalid counts and missing page sizes fail clearly',()=>{
 assert.throws(()=>comparePageCounts(0,1));
 assert.throws(()=>comparePageCounts(2,2.5));
 assert.throws(()=>fitPageImage(0,100));
});
test('data URI handling accepts PNG/JPEG and rejects arbitrary HTML',()=>{
 assert.equal(imageDataUri('aGVsbG8='),'data:image/png;base64,aGVsbG8=');
 assert.equal(imageDataUri('data:image/png;base64,aGVsbG8='),'data:image/png;base64,aGVsbG8=');
 assert.throws(()=>imageDataUri('<script>bad</script>'));
});
