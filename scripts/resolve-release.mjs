/**
 * Plan an official Euro-Office release download without assuming that release
 * assets have stable filenames. Debian package metadata decides identity later.
 * Architecture tokens in filenames are only used to avoid downloading known
 * non-target architectures, never to accept a package without validation.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com/repos/Euro-Office/DocumentServer/releases';
const TAG = /^v\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|hotfix)\.[A-Za-z0-9.-]+)?$/;
const HEX = /^sha256:([a-f0-9]{64})$/i;
export const TARGET_ARCH = 'amd64';

export function validateTag(tag) {
  if (typeof tag !== 'string' || !TAG.test(tag)) throw Error(`Invalid release tag: ${tag}`);
  return tag;
}

export function candidatesFor(data) {
  return (Array.isArray(data?.assets) ? data.assets : []).filter(a =>
    typeof a.name === 'string' && /^[A-Za-z0-9_.+~-]+\.deb$/.test(a.name) &&
    Number.isSafeInteger(a.size) && a.size > 100_000_000);
}

// A hint is NOT trusted package identity; dpkg-deb must confirm the real value.
// Supports Debian's amd64/arm64 tokens and common x86_64/aarch64 aliases.
export function architectureHint(name) {
  const tokens = [...name.matchAll(/(?:^|[._+-])(amd64|x86_64|arm64|aarch64)(?=[._+-]|$)/gi)]
    .map(m => /^(amd64|x86_64)$/i.test(m[1]) ? 'amd64' : 'arm64');
  const distinct = [...new Set(tokens)];
  return distinct.length === 1 ? distinct[0] : null;
}

function verifiedAsset(a, tag) {
  let url;
  try { url = new URL(a.browser_download_url); } catch { throw Error(`Invalid asset URL for ${a.name}`); }
  const expected = `/Euro-Office/DocumentServer/releases/download/${tag}/${a.name}`;
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { throw Error(`Bad URL encoding for ${a.name}`); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
      url.username || url.password || decoded !== expected || url.search || url.hash) {
    throw Error(`Release asset URL is not the expected official GitHub location: ${a.name}`);
  }
  const digest = a.digest || '';
  if (digest && !HEX.test(digest)) throw Error(`Unsupported asset digest for ${a.name}`);
  return {name: a.name, url: url.href, size: a.size,
    sha256: digest ? HEX.exec(digest)[1].toLowerCase() : '',
    assetId: a.id ?? null, archHint: architectureHint(a.name)};
}

export function selectRelease(data, requested = '', targetArch = TARGET_ARCH) {
  if (!data || data.draft || !data.tag_name) throw Error('Release is absent or draft');
  const tag = validateTag(data.tag_name);
  if (requested && tag !== requested) throw Error(`Requested ${requested}, got ${tag}`);
  if (!requested && data.prerelease) throw Error('Latest release is a prerelease');
  if (targetArch !== 'amd64' && targetArch !== 'arm64') throw Error(`Unsupported target architecture: ${targetArch}`);
  const raw = candidatesFor(data);
  if (raw.length === 0) {
    const listed = (Array.isArray(data.assets) ? data.assets : []).map(a => a.name).join(', ') || '(none)';
    throw Error(`No large .deb assets on ${tag}. Published assets: ${listed}`);
  }
  const seen = new Set();
  const assets = raw.map(a => {
    if (seen.has(a.name)) throw Error(`Duplicate .deb asset name: ${a.name}`);
    seen.add(a.name);
    return verifiedAsset(a, tag);
  });
  // Explicit other-architecture hints safely avoid downloading an unrelated
  // package. Unknown names are retained, even when a named candidate exists:
  // their control metadata may also match (which must cause an ambiguity error).
  const candidates = assets.filter(a => a.archHint === null || a.archHint === targetArch);
  if (!candidates.length) throw Error(`No possible ${targetArch} Debian package on ${tag}. Published .deb assets: ${assets.map(a => a.name).join(', ')}`);
  // Prefer a matching filename *for download order only*, not for acceptance.
  candidates.sort((a, b) => Number(b.archHint === targetArch) - Number(a.archHint === targetArch));
  return {tag, version: tag.slice(1), targetArch, publishedAt: data.published_at || '',
    converterPolicy: 'COMPILE_FROM_EXACT_RELEASE_CORE', candidates,
    skippedOtherArchitecture: assets.filter(a => a.archHint && a.archHint !== targetArch).map(a => a.name)};
}

export async function fetchRelease({requestedTag = '', token = '', fetchImpl = fetch} = {}) {
  if (requestedTag) validateTag(requestedTag);
  const url = requestedTag ? `${API}/tags/${requestedTag}` : `${API}/latest`;
  const headers = {Accept: 'application/vnd.github+json',
    'User-Agent': 'EuroOffice-Ranuts-Approach-B', 'X-GitHub-Api-Version': '2022-11-28'};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {headers, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`GitHub API HTTP ${response.status}`);
  return selectRelease(await response.json(), requestedTag);
}

async function main() {
  const plan = await fetchRelease({requestedTag: (process.env.EO_REQUESTED_TAG || '').trim(),
    token: process.env.GH_TOKEN || ''});
  const target = resolve('.work/release-candidates.json');
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, JSON.stringify(plan, null, 2) + '\n');
  if (process.env.GITHUB_ENV) {
    await appendFile(process.env.GITHUB_ENV,
      `EO_RELEASE_TAG=${plan.tag}\nEO_RELEASE_VERSION=${plan.version}\n`);
  }
  console.log(`Release ${plan.tag}: ${plan.candidates.length} possible ${plan.targetArch} package(s), ` +
    `${plan.skippedOtherArchitecture.length} other-architecture package(s) skipped by filename hint.`);
  console.log('Package architecture, name and version will be verified from Debian control metadata after download.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {console.error('RELEASE RESOLUTION FAILED:', e.message); process.exitCode = 1;});
}
