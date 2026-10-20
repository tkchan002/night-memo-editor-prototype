import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const get=x=>readFileSync(x,'utf8');
test('no old converter packages or RC1 fallback',()=>{const b=get('scripts/build-poc.sh');assert.doesNotMatch(b,/npm pack|9\.3\.5-rc\.1\.build\.1|gh release download editor-inputs/);assert.match(b,/build-matching-wasm\.sh/);});
test('matches exact DocumentServer gitlink not a floating branch',()=>{const s=get('scripts/prepare-release-core.sh');assert.match(s,/rev-parse HEAD:core/);assert.match(s,/gitlink/);});
test('runs strict source port then compiled docker export',()=>{let x=get('scripts/build-matching-wasm.sh');assert.match(x,/preflight-wasm-port\.sh/);assert.match(x,/apply-wasm-port\.py/);assert.match(x,/docker buildx build/);assert.match(x,/create-converter-manifest\.mjs/);});
test('hosting uses SHA of built bytes, no hardcoded binary',()=>{const x=get('scripts/package-site.mjs');assert.match(x,/pairing.wasmSha256.slice/);assert.match(x,/browserConverterVersion: releaseVersion/);assert.doesNotMatch(x,/PINNED\.wasm/);});
test('no auto-publishing release or altering Nurse Memo',()=>{const w=get('.github/workflows/eurooffice-matched-build.yml');assert.match(w,/workflow_dispatch:/);assert.doesNotMatch(w,/create-release|upload-release-asset|npm publish/);});

test('preflight occurs before costly Debian selection and requires a non-mutating merge check',()=>{const w=get('.github/workflows/eurooffice-matched-build.yml');const pos=w.indexOf('Preflight exact-source WASM compatibility');assert.ok(pos>0 && pos<w.indexOf('Identify exact AMD64 Debian package'));const pre=get('scripts/preflight-wasm-port.sh');assert.match(pre,/apply-wasm-port\.py.*--check/);assert.match(pre,/official-core-commit\.txt/);});

test('baseline source uses pinned commit and exact named ref, never git describe aliases',()=>{
  const pre=get('scripts/preflight-wasm-port.sh');
  const helper=get('scripts/verify-git-tag-checkout.sh');
  const official=get('scripts/prepare-release-core.sh');
  assert.match(pre,/269dd9b8bc9e869fc250f26cefbb908344a533c5/);
  assert.match(pre,/verify-git-tag-checkout\.sh/);
  assert.match(official,/verify-git-tag-checkout\.sh/);
  assert.match(pre,/bash "\$ROOT\/scripts\/verify-git-tag-checkout\.sh"/);
  assert.match(official,/bash "\$ROOT\/scripts\/verify-git-tag-checkout\.sh"/);
  assert.match(helper,/refs\/tags\/\$TAG\^\{commit\}/);
  assert.doesNotMatch(helper,/\bdescribe\s+--tags\b/);
  assert.doesNotMatch(pre,/describe --tags/);
  assert.doesNotMatch(official,/describe --tags/);
});
