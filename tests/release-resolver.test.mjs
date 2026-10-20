import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelease, validateTag, fetchRelease } from '../scripts/resolve-release.mjs';

const version = '9.3.5';
const tag = `v${version}`;
const name = `euro-office-documentserver_${version}_amd64.deb`;
const url = `https://github.com/Euro-Office/DocumentServer/releases/download/${tag}/${name}`;
const asset = (overrides={}) => ({ name, browser_download_url:url, size:600_000_000, id:123,
  digest:`sha256:${'a'.repeat(64)}`, ...overrides });
const release = (overrides={}) => ({tag_name:tag,prerelease:false,draft:false,published_at:'2026-10-09T00:00:00Z',assets:[asset()],...overrides});

test('selects exactly the official latest stable amd64 .deb and recorded GitHub SHA256',()=>{
  const info=selectRelease(release());
  assert.equal(info.tag,tag);
  assert.equal(info.url,url);
  assert.equal(info.sha256,'a'.repeat(64));
  assert.equal(info.converterVersion,'9.3.5-rc.1.build.1');
  assert.match(info.converterCompatibility,/UNVERIFIED/);
});
test('supports a manually selected tagged prerelease but excludes prereleases from latest',()=>{
  const rc='v9.3.6-rc.1';
  const a={name:'euro-office-documentserver_9.3.6-rc.1_amd64.deb',size:600_000_000,
    browser_download_url:`https://github.com/Euro-Office/DocumentServer/releases/download/${rc}/euro-office-documentserver_9.3.6-rc.1_amd64.deb`};
  const data=release({tag_name:rc,prerelease:true,assets:[a]});
  assert.throws(()=>selectRelease(data),/prerelease/);
  assert.equal(selectRelease(data,rc).tag,rc);
});
test('fails when the latest release has no eligible .deb',()=>{
  assert.throws(()=>selectRelease(release({assets:[]})),/exactly one/);
  assert.throws(()=>selectRelease(release({assets:[asset(),asset()]})),/exactly one/);
  assert.throws(()=>selectRelease(release({assets:[asset({size:300})]})),/Suspicious/);
});
test('rejects wrong project or insecure asset URL and malformed GitHub digest',()=>{
  assert.throws(()=>selectRelease(release({assets:[asset({browser_download_url:url.replace('github.com','evil.example')})]})),/Unexpected asset/);
  assert.throws(()=>selectRelease(release({assets:[asset({digest:'sha256:NOT_A_REAL_DIGEST'})]})),/digest/);
});
test('accepts missing GitHub digest only with explicit empty checksum',()=>{
  const info=selectRelease(release({assets:[asset({digest:null})]}));
  assert.equal(info.sha256,'');
});
test('rejects invalid or untrusted tags before any fetch',()=>{
  for(const candidate of ['9.3.5','latest','main','v9.3.5\nDANGER=x','v9.3.5;curl','v9.3.5/../foo'])
    assert.throws(()=>validateTag(candidate),/Invalid/);
});
test('GitHub API resolver requests /latest and records correct stable version',async()=>{
  let seenUrl='';
  const fakeFetch=async endpoint=>{seenUrl=endpoint;return {ok:true,json:async()=>release()};};
  const info=await fetchRelease({fetchImpl:fakeFetch});
  assert.equal(seenUrl,'https://api.github.com/repos/Euro-Office/DocumentServer/releases/latest');
  assert.equal(info.tag,tag);
});
test('resolver refuses invalid API response and mismatched pinned tag',()=>{
  assert.throws(()=>selectRelease(null),/published release/);
  assert.throws(()=>selectRelease(release({draft:true})),/published release/);
  assert.throws(()=>selectRelease(release(),'v9.3.4'),/Requested/);
});
