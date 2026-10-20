#!/usr/bin/env node
/**
 * Resolve the AMD64 .deb from the EXACT official Euro-Office release tag.
 * GitHub release asset filenames are not a stable API. Never predict them.
 * Fail closed on missing or ambiguous matches rather than downloading the
 * first file, switching to an older release, or silently building a different
 * architecture. Unit tests use synthetic release metadata, not the network.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const versions = JSON.parse(readFileSync(new URL('./versions.json', import.meta.url), 'utf8'));

export function selectDebAsset(release, editor = versions.editor) {
  if (!release || release.tag_name !== editor.releaseTag || release.draft || release.prerelease) {
    throw new Error(`Expected published, final release ${editor.releaseTag}; got ${release?.tag_name || 'none'} (draft=${release?.draft}, prerelease=${release?.prerelease})`);
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const candidates = assets.filter(a => {
    const n = String(a.name ?? '');
    return /^euro-office-documentserver[-_]/i.test(n) &&
      new RegExp(`[_-]${editor.architecture}\\.deb$`, 'i').test(n) &&
      !/(?:-dbg|-dbgsym|-debug)/i.test(n) &&
      Number(a.size) > 20 * 1024 * 1024;
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly ONE official ${editor.architecture} DocumentServer .deb for ${editor.releaseTag}; found ${candidates.length}. Assets: ${assets.map(a => a.name).join(', ') || '(none)'}`);
  }
  const asset = candidates[0];
  const url = new URL(asset.browser_download_url);
  const expectedPrefix = `/${editor.releaseRepository}/releases/download/${editor.releaseTag}/`;
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(expectedPrefix) || url.search || url.hash) {
    throw new Error(`Unexpected official release asset URL for ${asset.name}: ${url.href}`);
  }
  if (url.pathname.slice(expectedPrefix.length) !== encodeURIComponent(asset.name) &&
      decodeURIComponent(url.pathname.slice(expectedPrefix.length)) !== asset.name) {
    throw new Error('Release asset filename does not correspond to download URL');
  }
  const digest = asset.digest == null ? null : String(asset.digest);
  if (digest && !/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error(`Unexpected release checksum format: ${digest}`);
  }
  return { tag: editor.releaseTag, name: asset.name, url: url.href, size: asset.size, digest, releaseUrl: release.html_url || `https://github.com/${editor.releaseRepository}/releases/tag/${editor.releaseTag}` };
}

async function main() {
  const url = `https://api.github.com/repos/${versions.editor.releaseRepository}/releases/tags/${encodeURIComponent(versions.editor.releaseTag)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'eurooffice-browser-versioned-test',
  };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let result;
  try { result = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); }
  catch (err) { throw new Error(`GitHub release API unreachable: ${err.message}`); }
  if (!result.ok) {
    throw new Error(`GitHub release API HTTP ${result.status} for ${url}. Check the release and API availability.`);
  }
  const release = await result.json();
  const chosen = selectDebAsset(release);
  process.stdout.write(JSON.stringify(chosen, null, 2) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`RELEASE RESOLUTION FAILED: ${e.message}`); process.exitCode = 1; });
}
