import test from 'node:test';
import assert from 'node:assert/strict';
import {examineConverter, PINNED} from '../scripts/check-converter-pair.mjs';

const fixture = ns => {
  // Tiny valid WebAssembly binary importing `<ns>.f` as a function.
  const base=Buffer.from('0061736d01000000010401600000','hex');
  const name=Buffer.from(ns);
  const payload=Buffer.concat([Buffer.from([1,name.length]),name,Buffer.from([1,0x66,0,0])]);
  return Buffer.concat([base, Buffer.from([2,payload.length]),payload]);
};
const jsGlue='var imports={"a":wasmImports};';
const expected = {wasm:null,js:null,importModule:'a'};
test('matching a imports and a JS glue succeed',()=>{
 const result=examineConverter(fixture('a'),jsGlue,expected);
 assert.equal(result.ok,true,result.errors.join('; '));
 assert.deepEqual(result.importedModules,['a']);
});
test('WASM importing env is rejected before publishing even if it compiles',()=>{
 const result=examineConverter(fixture('env'),jsGlue,expected);
 assert.equal(result.ok,false);
 assert.match(result.errors.join('; '),/imports modules \["env"\]/);
});
test('WASM a with JS that supplies env is rejected',()=>{
 const result=examineConverter(fixture('a'),'var imports={"env":wasmImports};',expected);
 assert.equal(result.ok,false);
 assert.match(result.errors.join('; '),/does not supply/);
});
test('production converter pins both digest hashes',()=>{
 assert.match(PINNED.wasm,/^[0-9a-f]{64}$/);
 assert.match(PINNED.js,/^[0-9a-f]{64}$/);
 assert.equal(PINNED.importModule,'a');
 const altered=examineConverter(fixture('a'),jsGlue);
 assert.equal(altered.ok,false);
 assert.ok(altered.errors.some(x=>x.includes('SHA-256 mismatch')));
});
