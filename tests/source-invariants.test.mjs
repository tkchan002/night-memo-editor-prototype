import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root = new URL('../',import.meta.url);
const read = rel => readFileSync(new URL(rel,root),'utf8');
test('publisher transplant retains browser-only Word adapters',()=>{
 const script=read('scripts/vendor/eurooffice-into-ranuts.py');
 assert.match(script,/SDK_GLUE\s*=/);
 assert.match(script,/web_glue\['?/);
 assert.match(script,/documenteditor/);
 assert.match(script,/sdkjs\/common\/AllFonts\.js/);
 assert.match(script,/sdkjs\/common\/wasm/);
});
test('publisher patch provides iframe events and path-aware x2t worker',()=>{
 const patch=read('scripts/vendor/ranuts-document.patch');
 for (const value of ['document:user-save','document:modified','document:saved','WORKER_URL','BASE_PATH'])
   assert.ok(patch.includes(value),`Missing bridge compatibility: ${value}`);
});
test('the site communicates using bounded origin/source-checked iframe messages',()=>{
 const app=read('site/poc.js');
 for (const value of ['event.origin!==editorOrigin','event.source!==frame.contentWindow','document:open-buffer','document:save','document:set-readonly','document:get-state'])
  assert.ok(app.includes(value),`Missing browser harness behavior: ${value}`);
 assert.ok(!app.includes('fetch('),'The demo must not upload fictional files to a server');
});
test('build scripts pin source versions and validate converter digest',()=>{
 const shell=read('scripts/build-poc.sh');
 for(const value of ['1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd','9.3.5-rc.1','sha256sum --check','git -C "$RANUTS" apply --check','--frozen-lockfile'])
  assert.ok(shell.includes(value),`Missing reproducibility measure: ${value}`);
});
test('Pages packaging guards nested ONLYOFFICE editor paths and gzip stream',()=>{
 const pkg=read('scripts/package-site.mjs');
 for(const value of ['assetRoots','index.html','new DecompressionStream(\'gzip\')','x2t.wasm.gz','web-apps/apps/documenteditor/main/index.html','900*1024*1024'])
  assert.ok(pkg.includes(value),`Missing deployment guard: ${value}`);
});
