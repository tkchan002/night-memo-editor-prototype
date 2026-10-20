import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDebAsset} from '../scripts/resolve-eurooffice-deb.mjs';

const make = (name, extra = {}) => ({
  name,
  size: 543_000_000,
  browser_download_url: `https://github.com/Euro-Office/DocumentServer/releases/download/v9.3.5/${encodeURIComponent(name)}`,
  digest: `sha256:${'a'.repeat(64)}`,
  ...extra,
});
const release = assets => ({tag_name:'v9.3.5',draft:false,prerelease:false,assets});

test('resolve exact final release, tolerate upstream version/build filename suffix',()=>{
  const selected = selectDebAsset(release([
    make('euro-office-documentserver_9.3.5-0_arm64.deb'),
    make('euro-office-documentserver-9.3.5-0.x86_64.rpm'),
    make('euro-office-documentserver_9.3.5-0_amd64.deb'),
  ]));
  assert.equal(selected.name,'euro-office-documentserver_9.3.5-0_amd64.deb');
  assert.equal(selected.tag,'v9.3.5');
  assert.match(selected.digest,/^sha256:[a-f0-9]{64}$/);
});
test('refuse missing or ambiguous amd64 Debian release',()=>{
  assert.throws(()=>selectDebAsset(release([make('euro-office-documentserver_9.3.5_arm64.deb')])),/found 0/);
  assert.throws(()=>selectDebAsset(release([
    make('euro-office-documentserver_9.3.5-0_amd64.deb'),
    make('euro-office-documentserver_9.3.5-1_amd64.deb'),
  ])),/found 2/);
});
test('never accept rc release, wrong tag or an untrusted asset URL',()=>{
  assert.throws(()=>selectDebAsset({...release([make('euro-office-documentserver_9.3.5_amd64.deb')]),tag_name:'v9.3.5-rc.1'}),/Expected published, final/);
  assert.throws(()=>selectDebAsset({...release([make('euro-office-documentserver_9.3.5_amd64.deb')]),prerelease:true}),/Expected published, final/);
  assert.throws(()=>selectDebAsset(release([make('euro-office-documentserver_9.3.5_amd64.deb', {browser_download_url:'https://evil.example/payload.deb'})])),/Unexpected official release asset URL/);
  assert.throws(()=>selectDebAsset(release([make('euro-office-documentserver_9.3.5_amd64.deb', {digest:'md5:1234'})])),/Unexpected release checksum/);
});
test('reject fake or tiny packages masquerading as full DocumentServer build',()=>{
  assert.throws(()=>selectDebAsset(release([make('euro-office-documentserver_9.3.5_amd64.deb',{size:1000})])),/found 0/);
  assert.throws(()=>selectDebAsset(release([make('other-package_9.3.5_amd64.deb')])),/found 0/);
});
