import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRelease} from '../scripts/resolve-release.mjs';
import {chooseVerifiedDeb, packageMatches} from '../scripts/select-release-deb.mjs';
const make = name => ({name, size: 600_000_000,
  browser_download_url: `https://github.com/Euro-Office/DocumentServer/releases/download/v9.3.5/${name}`});
const plan = names => selectRelease({tag_name: 'v9.3.5', draft: false, prerelease: false, assets: names.map(make)});
const control = (arch, version = '9.3.5-1', name = 'euro-office-documentserver') =>
  ({arch, version, name, downloadedSha256: 'a'.repeat(64)});
test('official dual-architecture release checks only the target architecture', async () => {
  let checked = [];
  const result = await chooseVerifiedDeb(plan(['eo_9.3.5_amd64.deb', 'eo_9.3.5_arm64.deb']), async a => {
    checked.push(a.name);
    return control('amd64');
  });
  assert.deepEqual(checked, ['eo_9.3.5_amd64.deb']);
  assert.equal(result.arch, 'amd64');
});
test('one entirely arbitrary filename works by internal control fields', async () => {
  const result = await chooseVerifiedDeb(plan(['euro-office-new-very-very-new-real-new.deb']),
    async () => control('amd64'));
  assert.equal(result.name, 'euro-office-new-very-very-new-real-new.deb');
  assert.equal(result.packageName, 'euro-office-documentserver');
  assert.equal(result.packageVersion, '9.3.5-1');
  assert.equal(result.version, '9.3.5');
});
test('two arbitrary filenames are both inspected, with architecture defining the match', async () => {
  const result = await chooseVerifiedDeb(plan(['something.deb', 'another.deb']),
    async a => control(a.name === 'another.deb' ? 'amd64' : 'arm64'));
  assert.equal(result.url.endsWith('/another.deb'), true);
});
test('duplicate matching AMD64 packages are rejected instead of guessed', async () => {
  await assert.rejects(chooseVerifiedDeb(plan(['one.deb', 'two.deb']), async () => control('amd64')),
    /found 2/);
});
test('no matching package identity or architecture is rejected', async () => {
  await assert.rejects(chooseVerifiedDeb(plan(['one.deb']), async () => control('arm64')),
    /found 0/);
  await assert.rejects(chooseVerifiedDeb(plan(['one.deb']), async () => control('amd64', '9.3.4-1')),
    /found 0/);
  await assert.rejects(chooseVerifiedDeb(plan(['one.deb']), async () => control('amd64', '9.3.5-1', 'other-package')),
    /found 0/);
});
test('package exact version and Debian revision accepted, version-like prefixes rejected', () => {
  assert.ok(packageMatches(control('amd64', '9.3.5'), '9.3.5', 'amd64'));
  assert.ok(packageMatches(control('amd64', '9.3.5-0'), '9.3.5', 'amd64'));
  assert.equal(packageMatches(control('amd64', '9.3.50-1'), '9.3.5', 'amd64'), false);
});
test('an asset inspection error stops selection rather than guessing', async () => {
  await assert.rejects(chooseVerifiedDeb(plan(['one.deb', 'two.deb']), async a => {
    if (a.name === 'two.deb') throw Error('download failed');
    return control('amd64');
  }), /download failed/);
});
