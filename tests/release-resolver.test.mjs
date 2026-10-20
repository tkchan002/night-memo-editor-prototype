import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRelease, candidatesFor, validateTag, fetchRelease, architectureHint} from '../scripts/resolve-release.mjs';
const tag = 'v9.3.5';
const item = (name = 'euro-office-new-very-very-new-real-new.deb') => ({
  name, size: 600_000_000, id: 33,
  browser_download_url: `https://github.com/Euro-Office/DocumentServer/releases/download/${tag}/${name}`
});
const data = (assets = [item()]) => ({tag_name: tag, assets, prerelease: false, draft: false});
test('completely renamed package is retained for real metadata inspection', () => {
  const x = selectRelease(data());
  assert.equal(x.candidates[0].name, 'euro-office-new-very-very-new-real-new.deb');
  assert.equal(x.converterPolicy, 'COMPILE_FROM_EXACT_RELEASE_CORE');
});
test('amd64 and arm64 official release: skip arm64 for an AMD64 workflow', () => {
  const x = selectRelease(data([item('euro-office_9.3.5_amd64.deb'), item('euro-office_9.3.5_arm64.deb')]));
  assert.deepEqual(x.candidates.map(a => a.name), ['euro-office_9.3.5_amd64.deb']);
  assert.deepEqual(x.skippedOtherArchitecture, ['euro-office_9.3.5_arm64.deb']);
});
test('unknown filenames stay eligible, even alongside explicit AMD64 package', () => {
  const x = selectRelease(data([item('mystery.deb'), item('release_amd64.deb'), item('release_arm64.deb')]));
  assert.deepEqual(x.candidates.map(a => a.name), ['release_amd64.deb', 'mystery.deb']);
});
test('two renamed unknown assets are resolved later by inspecting package metadata', () => {
  assert.equal(selectRelease(data([item('a.deb'), item('b.deb')])).candidates.length, 2);
});
test('known architecture aliases are recognized as hints with boundary checks', () => {
  assert.equal(architectureHint('euro_9.3_x86_64.deb'), 'amd64');
  assert.equal(architectureHint('euro_9.3.aarch64.deb'), 'arm64');
  assert.equal(architectureHint('fakeamd64.deb'), null);
  assert.equal(architectureHint('both_amd64_arm64.deb'), null);
});
test('release without large deb fails and lists published asset names', () =>
  assert.throws(() => selectRelease(data([{name: 'release.rpm'}])), /release.rpm/));
test('only explicit ARM64 artifacts fail on AMD64 runner', () =>
  assert.throws(() => selectRelease(data([item('euro_arm64.deb')])), /No possible amd64/));
test('invalid external URLs rejected even for skipped arm64 asset', () =>
  assert.throws(() => selectRelease(data([item('euro_amd64.deb'), {...item('euro_arm64.deb'), browser_download_url: 'https://evil.example/a.deb'}])), /official GitHub/));
test('duplicate package names fail safely', () =>
  assert.throws(() => selectRelease(data([item('a.deb'), item('a.deb')])), /Duplicate/));
test('missing package digest is explicit', () => assert.equal(selectRelease(data()).candidates[0].sha256, ''));
test('official asset digest is honored', () => {
  const x = selectRelease(data([{...item(), digest: 'sha256:' + 'b'.repeat(64)}]));
  assert.equal(x.candidates[0].sha256, 'b'.repeat(64));
});
test('reject unsigned tags and prerelease as latest', () => {
  assert.throws(() => validateTag('main'));
  assert.throws(() => selectRelease({...data(), prerelease: true}), /prerelease/);
});
test('API latest endpoint used with mock', async () => {
  let used;
  const r = await fetchRelease({fetchImpl: async u => {used = u; return {ok: true, json: async () => data()};}});
  assert.match(used, /releases\/latest$/);
  assert.equal(r.tag, tag);
});
test('reject tiny false .deb and file extension tricks', () => {
  assert.equal(candidatesFor(data([{...item(), size: 99}])).length, 0);
  assert.equal(candidatesFor(data([item('bad.deb.exe')])).length, 0);
});
