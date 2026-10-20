/**
 * Download plausible official Debian assets and identify the single expected
 * package by its internal control fields. No dependency on the asset basename.
 */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {appendFile, mkdir, readFile, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const exec = promisify(execFile);
const EXPECTED_NAME = 'euro-office-documentserver';

export function packageMatches(meta, version, arch) {
  return meta?.name === EXPECTED_NAME && meta?.arch === arch &&
    (meta?.version === version || meta?.version?.startsWith(`${version}-`));
}

/** Probe every plausible asset: two matching Debian packages must fail closed. */
export async function chooseVerifiedDeb(plan, probe) {
  if (!plan || !/^v\d+\.\d+\.\d+/.test(plan.tag) || !Array.isArray(plan.candidates) ||
      !plan.candidates.length || !['amd64', 'arm64'].includes(plan.targetArch)) {
    throw Error('Invalid or empty release plan');
  }
  const matching = [];
  const checked = [];
  for (const asset of plan.candidates) {
    const meta = await probe(asset);
    checked.push(`${asset.name}: ${meta.name || '(no package name)'} ${meta.version || '(no version)'} ${meta.arch || '(no architecture)'}`);
    if (packageMatches(meta, plan.version, plan.targetArch)) {
      matching.push({...asset, packageName: meta.name, packageVersion: meta.version,
        arch: meta.arch, downloadedSha256: meta.downloadedSha256});
    }
  }
  if (matching.length !== 1) {
    throw Error(`Expected exactly one verified ${EXPECTED_NAME} ${plan.version} ${plan.targetArch} .deb; ` +
      `found ${matching.length}. Inspected: ${checked.join('; ')}`);
  }
  return {...matching[0], tag: plan.tag, version: plan.version,
    publishedAt: plan.publishedAt, converterPolicy: plan.converterPolicy};
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function inspectControl(file, field) {
  const {stdout} = await exec('dpkg-deb', ['-f', file, field]);
  return stdout.trim();
}

async function defaultDownloader(url, temp) {
  await exec('curl', ['--fail', '--location', '--retry', '3', '--connect-timeout', '30',
    '--max-time', '2400', '--output', temp, url]);
}

export async function downloadAndInspect(asset, {directory = resolve('.work/downloads'), downloader = defaultDownloader} = {}) {
  const file = resolve(directory, asset.name);
  const temp = file + '.part';
  await mkdir(directory, {recursive: true});
  await unlink(temp).catch(e => {if (e.code !== 'ENOENT') throw e;});
  try {
    await downloader(asset.url, temp);
    const info = await stat(temp);
    if (info.size !== asset.size) throw Error(`Downloaded size differs from GitHub asset metadata: ${asset.name}`);
    const downloadedSha256 = await sha256File(temp);
    if (asset.sha256 && downloadedSha256 !== asset.sha256) {
      throw Error(`GitHub SHA-256 digest mismatch for ${asset.name}`);
    }
    const meta = {
      name: await inspectControl(temp, 'Package'),
      version: await inspectControl(temp, 'Version'),
      arch: await inspectControl(temp, 'Architecture'),
      downloadedSha256
    };
    await rename(temp, file);
    console.log(`Inspected ${asset.name}: ${meta.name}, ${meta.version}, ${meta.arch}`);
    return meta;
  } catch (err) {
    await unlink(temp).catch(() => {});
    throw Error(`Failed to download/inspect ${asset.name}: ${err.message}`);
  }
}

async function main() {
  const plan = JSON.parse(await readFile('.work/release-candidates.json', 'utf8'));
  const selected = await chooseVerifiedDeb(plan, downloadAndInspect);
  await writeFile('.work/release-selection.json', JSON.stringify(selected, null, 2) + '\n');
  // Large packages from unknown-named non-target architectures must not occupy
  // disk during the subsequent compiler build.
  for (const asset of plan.candidates) {
    if (asset.name !== selected.name) {
      await unlink(resolve('.work/downloads', asset.name));
    }
  }
  if (process.env.GITHUB_ENV) {
    const vars = {
      EO_DEB_NAME: selected.name, EO_DEB_URL: selected.url,
      EO_RELEASE_ASSET_SHA256: selected.sha256,
      EO_DEB_DOWNLOADED_SHA256: selected.downloadedSha256
    };
    await appendFile(process.env.GITHUB_ENV,
      Object.entries(vars).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  }
  console.log(`Selected ${selected.tag} => ${selected.name} (${selected.arch}); ` +
    'verified against the official release, Debian control metadata and SHA-256.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {console.error('DEBIAN PACKAGE SELECTION FAILED:', e.message); process.exitCode = 1;});
}
