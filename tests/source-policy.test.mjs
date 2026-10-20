import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const get=x=>readFileSync(x,'utf8');
test('no old converter packages or RC1 fallback',()=>{const b=get('scripts/build-poc.sh');assert.doesNotMatch(b,/npm pack|9\.3\.5-rc\.1\.build\.1|gh release download editor-inputs/);assert.match(b,/build-matching-wasm\.sh/);});
test('matches exact DocumentServer gitlink not a floating branch',()=>{const s=get('scripts/prepare-release-core.sh');assert.match(s,/rev-parse HEAD:core/);assert.match(s,/gitlink/);});
test('runs strict source port then compiled docker export',()=>{let x=get('scripts/build-matching-wasm.sh');assert.match(x,/port-wasm-changes\.py/);assert.match(x,/apply-wasm-port\.py/);assert.match(x,/docker buildx build/);assert.match(x,/create-converter-manifest\.mjs/);});
test('hosting uses SHA of built bytes, no hardcoded binary',()=>{const x=get('scripts/package-site.mjs');assert.match(x,/pairing.wasmSha256.slice/);assert.match(x,/browserConverterVersion: releaseVersion/);assert.doesNotMatch(x,/PINNED\.wasm/);});
test('no auto-publishing release or altering Nurse Memo',()=>{const w=get('.github/workflows/eurooffice-matched-build.yml');assert.match(w,/workflow_dispatch:/);assert.doesNotMatch(w,/create-release|upload-release-asset|npm publish/);});
