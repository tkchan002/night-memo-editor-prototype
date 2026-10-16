import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNightMemoFixture,summariseFixture} from '../src/night-memo-fixture.js';
for(const [name,stress,admissions,infections] of [['normal',false,10,10],['stress',true,72,38]]){
 test(name+' report has all three editable tables and expected data',()=>{
  const document=makeNightMemoFixture({stress}), s=summariseFixture(document);
  assert.equal(s.tableCount,3);assert.equal(s.admissions,admissions);assert.equal(s.infections,infections);
  const tables=document.main.filter(x=>x.type==='table');
  assert.equal(tables[0].colgroup.length,13);assert.equal(tables[1].colgroup.length,9);
  assert.equal(tables[0].trList[0].pagingRepeat,true);
  assert.equal(tables[0].trList[1].pagingRepeat,true);
  assert.equal(tables[1].trList[0].pagingRepeat,true);
  assert.equal(tables[0].trList[2].tdList.length,13);
  assert.equal(tables[1].trList[1].tdList.length,9);
  assert.ok(JSON.stringify(document).includes('Additional Report'));
 });
}
test('fixture contains fictional testing text and can serialize to JSON',()=>{
 const x=makeNightMemoFixture({stress:true});
 const restored=JSON.parse(JSON.stringify(x));
 assert.deepEqual(restored,x);
});
