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
 assert.ok(app.includes('fetchVerifiedAsset'), 'Missing static converter self-diagnosis');
 assert.ok(app.includes('await verifyConverter();'), 'Document open must verify deployed converter first');
 assert.doesNotMatch(app, /method\s*:\s*['\"](?:POST|PUT|PATCH)['\"]/i,
   'The demo must not upload fictional documents to a server');
});
test('build scripts pin source versions and validate converter digest',()=>{
 const shell=read('scripts/build-poc.sh');
 for(const value of ['sha256sum --check','git -C "$RANUTS" apply --check','--frozen-lockfile','resolve-eurooffice-deb.mjs'])
  assert.ok(shell.includes(value),`Missing reproducibility measure: ${value}`);
});
test('Pages packaging guards nested ONLYOFFICE editor paths and gzip stream',()=>{
 const pkg=read('scripts/package-site.mjs');
 for(const value of ['assetRoots','index.html','new DecompressionStream(\'gzip\')','x2t.wasm.gz','web-apps/apps/documenteditor/main/index.html','900*1024*1024'])
  assert.ok(pkg.includes(value),`Missing deployment guard: ${value}`);
});


test('legal notices are staged from source checkout rather than required in Vite dist',()=>{
 const packaging=read('scripts/package-site.mjs');
 assert.match(packaging,/publishLegalDocument\('LICENSE'/);
 assert.match(packaging,/publishLegalDocument\('NOTICE'/);
 assert.match(packaging,/ranutsCheckout/);
 assert.doesNotMatch(packaging,/\['index\.html','editor\.html','history\.html','sdkjs','web-apps','assets','LICENSE'/);
});

test('converter mismatch is blocked at the final build boundary',()=>{
 const sh=read('scripts/build-poc.sh');
 assert.match(sh,/install -Dm644 "\$X2T\/x2t\.wasm" "\$RANUTS\/dist\//);
 assert.match(sh,/check-converter-pair\.mjs" "\$ROOT\/dist\/office\//);
 const pkg=read('scripts/package-site.mjs');
 assert.match(pkg,/examineConverter\(wasmBytes/);
 assert.match(pkg,/converterWasmSha256/);
 assert.match(pkg,/converterRevision/);
});

test('static test UI verifies deployed converter and does not mark document as rendered on open acknowledgment',()=>{
 const markup=read('site/index.html');
 const js=read('site/poc.js');
 assert.match(markup,/id="converterCheck"/);
 assert.match(js,/x2t\.wasm\.gz/);
 assert.match(js,/crypto\.subtle\.digest/);
 assert.match(js,/Open acknowledged; check rendered pages/);
});


test('stale Ranuts compressed converter is removed at source, build and deploy boundaries',()=>{
 const sh=read('scripts/build-poc.sh');
 assert.match(sh,/rm -f "\$RANUTS\/public\/\$CONVERTER_REL\/x2t\.wasm\.br"/);
 assert.match(sh,/rm -f "\$RANUTS\/dist\/\$CONVERTER_REL\/x2t\.wasm\.br"/);
 const pkg=read('scripts/package-site.mjs');
 assert.match(pkg,/Removed legacy x2t\.wasm\.br/);
 assert.doesNotMatch(pkg,/brotliDecompressSync/);
 assert.match(pkg,/if \(!existsSync\(raw\)\)/);
 assert.match(read('scripts/verify-site.mjs'),/Stale x2t\.wasm\.br remains/);
});

test('v9.3.5 official engine is distinguished from pinned RC converter',()=>{
 const cfg=JSON.parse(read('scripts/versions.json'));
 assert.equal(cfg.editor.releaseTag,'v9.3.5');
 assert.equal(cfg.editor.debVersion,'9.3.5');
 assert.equal(cfg.converter.version,'9.3.5-rc.1.build.1');
 assert.match(cfg.converter.compatibility,/Experimental/);
 const sh=read('scripts/build-poc.sh');
 assert.match(sh,/dpkg-deb -f/);
 assert.match(sh,/editor\.debVersion/);
 assert.match(read('scripts/package-site.mjs'),/converterCompatibility/);
});
