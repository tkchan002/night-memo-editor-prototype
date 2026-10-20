import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, copyFile, stat, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {downloadAndInspect, chooseVerifiedDeb} from '../scripts/select-release-deb.mjs';
const exec = promisify(execFile);

test('real dpkg-deb control inspection keeps the asset filename, checks digest and identifies package', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eurooffice-inspect-'));
  try {
    const pkgDir = join(dir, 'package');
    await mkdir(join(pkgDir, 'DEBIAN'), {recursive: true});
    await mkdir(join(pkgDir, 'usr', 'share', 'doc', 'euro'), {recursive: true});
    await writeFile(join(pkgDir, 'DEBIAN', 'control'),
      'Package: euro-office-documentserver\nVersion: 9.3.5-0\nArchitecture: amd64\nMaintainer: Test <test@example.invalid>\nDescription: test package\n');
    await writeFile(join(pkgDir, 'usr', 'share', 'doc', 'euro', 'README'), 'fixture');
    const original = join(dir, 'fixture.deb');
    await exec('dpkg-deb', ['--build', pkgDir, original]);
    const bytes = await readFile(original);
    const asset = {name: 'completely-new-name.deb', url: 'https://github.com/Euro-Office/DocumentServer/releases/download/v9.3.5/completely-new-name.deb',
      size: (await stat(original)).size, sha256: createHash('sha256').update(bytes).digest('hex')};
    const directory = join(dir, 'downloaded');
    const downloader = async (_url, destination) => copyFile(original, destination);
    const meta = await downloadAndInspect(asset, {directory, downloader});
    assert.equal(meta.name, 'euro-office-documentserver');
    assert.equal(meta.version, '9.3.5-0');
    assert.equal(meta.arch, 'amd64');
    const selected = await chooseVerifiedDeb({tag: 'v9.3.5', version: '9.3.5', targetArch: 'amd64',
      candidates: [asset]}, async () => meta);
    assert.equal(selected.name, asset.name);
    assert.equal(selected.packageName, 'euro-office-documentserver');
    assert.equal(selected.packageVersion, '9.3.5-0');
    assert.equal(selected.downloadedSha256, asset.sha256);
    assert.equal((await stat(join(directory, asset.name))).size, asset.size);
    await assert.rejects(downloadAndInspect({...asset, sha256: 'b'.repeat(64)},
      {directory, downloader}), /digest mismatch/);
    await assert.rejects(downloadAndInspect({...asset, size: asset.size + 1},
      {directory, downloader}), /size differs/);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
