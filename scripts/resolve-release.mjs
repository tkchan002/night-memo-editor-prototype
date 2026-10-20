/** Resolve an official Euro-Office DocumentServer GitHub release at BUILD TIME.
 * The result is authoritative only for the editor assets. Browser x2t remains
 * independently pinned to the RC1 pair until a matching stable converter exists.
 * Never guess asset URLs or silently fall back to a different release.
 */
import { appendFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com/repos/Euro-Office/DocumentServer/releases';
const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|hotfix)\.[A-Za-z0-9.-]+)?$/;
const DIGEST_PATTERN = /^sha256:([a-f0-9]{64})$/i;
const NAME_PATTERN = /^euro-office-documentserver_(\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|hotfix)\.[A-Za-z0-9.-]+)?)_amd64\.deb$/;

export function validateTag(tag) {
  if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) throw new Error(`Invalid Euro-Office release tag: ${tag}`);
  return tag;
}

export function selectRelease(data, requestedTag = '') {
  if (!data || typeof data !== 'object' || data.draft || typeof data.tag_name !== 'string')
    throw new Error('GitHub API did not return a published release');
  const tag = validateTag(data.tag_name);
  if (requestedTag && tag !== requestedTag) throw new Error(`Requested ${requestedTag}, got ${tag}`);
  if (!requestedTag && data.prerelease) throw new Error('The latest release is marked prerelease: refusing to select it as stable');
  const version = tag.slice(1);
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const candidates = assets.filter(asset => {
    const m = typeof asset.name === 'string' ? asset.name.match(NAME_PATTERN) : null;
    return m && m[1] === version;
  });
  if (candidates.length !== 1) throw new Error(`Expected exactly one matching amd64 .deb asset for ${tag}; found ${candidates.length}`);
  const asset = candidates[0];
  if (!Number.isSafeInteger(asset.size) || asset.size < 100_000_000)
    throw new Error(`Suspicious official .deb size for ${tag}: ${asset.size}`);
  const url = new URL(asset.browser_download_url);
  const expectedPath = `/Euro-Office/DocumentServer/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.pathname !== expectedPath || url.search || url.hash)
    throw new Error(`Unexpected asset download location for ${tag}`);
  const digest = asset.digest == null ? '' : String(asset.digest);
  if (digest && !DIGEST_PATTERN.test(digest)) throw new Error(`Unsupported official asset digest: ${digest}`);
  return {
    tag, version, name: asset.name, url: url.href, size: asset.size,
    sha256: digest ? digest.match(DIGEST_PATTERN)[1].toLowerCase() : '',
    assetId: asset.id,
    publishedAt: data.published_at || '',
    converterVersion: '9.3.5-rc.1.build.1',
    converterCompatibility: 'UNVERIFIED_WITH_SELECTED_EDITOR_VERSION'
  };
}

export async function fetchRelease({requestedTag = '', token = '', fetchImpl = fetch} = {}) {
  if (requestedTag) validateTag(requestedTag);
  const endpoint = requestedTag ? `${API}/tags/${encodeURIComponent(requestedTag)}` : `${API}/latest`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NurseMemo-EuroOffice-browser-PoC',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(endpoint, {headers, signal: AbortSignal.timeout(20_000)});
  if (!response.ok) throw new Error(`GitHub release API returned HTTP ${response.status} for ${requestedTag || 'latest stable'}`);
  return selectRelease(await response.json(), requestedTag);
}

async function run() {
  const info = await fetchRelease({
    requestedTag: process.env.EO_REQUESTED_TAG?.trim() || '',
    token: process.env.GH_TOKEN || ''
  });
  const location = resolve('.work/release-selection.json');
  await mkdir(dirname(location),{recursive:true});
  await writeFile(location, JSON.stringify(info,null,2)+'\n');
  // All emitted values were validated: prevent unexpected multiline GITHUB_ENV contents.
  if (process.env.GITHUB_ENV) {
    const values = {
      EO_RELEASE_TAG: info.tag,
      EO_RELEASE_VERSION: info.version,
      EO_DEB_URL: info.url,
      EO_DEB_NAME: info.name,
      EO_RELEASE_ASSET_SHA256: info.sha256,
      EO_RELEASE_ASSET_ID: String(info.assetId || '')
    };
    await appendFile(process.env.GITHUB_ENV, Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
  } else {
    console.log('Local execution: no GITHUB_ENV; invoke the build with values from .work/release-selection.json');
  }
  console.log(`Selected official Euro-Office ${info.tag} (${info.name}, ${(info.size/1024/1024).toFixed(1)} MiB)`);
  console.log(info.sha256 ? 'Official GitHub asset SHA256 available and will be checked.' : 'WARNING: GitHub release metadata supplied no SHA256 digest; download SHA will be recorded but authenticity is not independently checksum-verified.');
  console.log('COMPATIBILITY EXPERIMENT: browser x2t stays pinned at 9.3.5-rc.1.build.1; DOCX/PDF round trips MUST be tested.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(`RELEASE RESOLUTION FAILED: ${error.message}`); process.exitCode = 1; });
}
