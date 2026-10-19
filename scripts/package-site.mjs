/**
 * Publish the pinned EuroOffice/Ranuts hybrid as a standalone browser test.
 * Editor assets live at <siteBase>/office/. The test harness lives at <siteBase>/.
 *
 * Important ONLYOFFICE invariant: a string literal "/index.html" in the SDK
 * can be a filename appended to a constructed directory. NEVER globally rebase
 * that filename. Doing so produced .../documenteditor/main/nursememo/index.html
 * and a 404 when opening a DOCX. The fixed standalone editor demonstrated this.
 *
 * GitHub Pages cannot set Content-Encoding: br, so preserve a raw WASM fallback
 * and supply a gzip-streaming loader that reduces cold converter transfer size.
 */
import { existsSync, promises as fs } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || '.work/ranuts/dist');
const ranutsCheckout = resolve(process.env.RANUTS_SOURCE_ROOT || dirname(source));
const destination = resolve(process.argv[3] || 'dist', 'office');
const repository = (process.env.GITHUB_REPOSITORY || '').split('/')[1] || '';
const explicitBase = process.env.PAGES_BASE_PATH?.trim();
const siteBase = explicitBase === '/' ? '/' : explicitBase
  ? `/${explicitBase.replace(/^\/+|\/+$/g, '')}/`
  : repository ? `/${repository}/` : '/';
if (!/^\/(?:[A-Za-z0-9_.~-]+\/)*$/.test(siteBase) || siteBase.split('/').some(s => s === '.' || s === '..')) {
  throw new Error(`Unsafe Pages base path: ${siteBase}`);
}
const officeBase = `${siteBase}office/`;
if (source === destination || destination.startsWith(`${source}/`)) {
  throw new Error('Upstream distribution and deployment destination must not overlap.');
}
for (const item of ['index.html','editor.html','history.html','sdkjs','web-apps','assets']) {
  if (!existsSync(join(source, item))) throw new Error(`Upstream build lacks ${item}: ${source}`);
}

await fs.rm(destination, { recursive: true, force: true });
await fs.cp(source, destination, { recursive: true });
// Vite normally omits LICENSE and NOTICE from dist/. These are source-tree
// documents, not generated frontend assets. Preserve them in the published
// editor; do NOT fabricate an empty NOTICE merely to satisfy a file check.
const legalDirectory = join(repoRoot, 'LICENSES');
async function publishLegalDocument(name, candidates) {
  const original = candidates.find(file => existsSync(file));
  if (!original) {
    throw new Error(`Required ${name} not found. Looked in: ${candidates.join(', ')}. ` +
      `Cannot publish an editor without its legal notices.`);
  }
  await fs.copyFile(original, join(destination, name));
  console.log(`Preserved ${name} from ${original}`);
}
await publishLegalDocument('LICENSE', [
  join(ranutsCheckout, 'LICENSE'),
  join(source, 'LICENSE'),
  join(legalDirectory, 'ranuts-document-LICENSE'),
]);
await publishLegalDocument('NOTICE', [
  join(ranutsCheckout, 'NOTICE'),
  join(source, 'NOTICE'),
]);
// Retain the third-party notices included with the proof-of-concept source.
// The original Ranuts NOTICE describes its pre-transplant engine version;
// the supplementary notice explains the Euro-Office replacement.
if (!existsSync(join(legalDirectory, 'euro-office-LICENSE.txt')) ||
    !existsSync(join(legalDirectory, 'euro-office-3rd-Party.txt'))) {
  throw new Error(`Proof-of-concept third-party license materials missing: ${legalDirectory}`);
}
await fs.cp(legalDirectory, join(destination, 'LICENSES'), { recursive: true });
await fs.writeFile(join(destination, 'PROTOTYPE-NOTICES.txt'),
  `This experimental browser editor is based on Ranuts/document commit ` +
  `1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd and incorporates editor ` +
  `components from Euro-Office DocumentServer v9.3.5-rc.1, with the ` +
  `@kreijstal/eurooffice 9.3.5-rc.1.build.1 browser integration.\n` +
  `The preserved Ranuts NOTICE records the original Ranuts distribution and ` +
  `does not alone describe the Euro-Office engine transplant.\n` +
  `See LICENSE, NOTICE, and LICENSES/ for upstream and third-party license ` +
  `information. This is not a production-approved distribution.\n`);
// Word-only prototype: avoid uploading unrelated editor engines to Pages.
// Keep the shared API, converters, font assets, and all Word resources intact.
for (const rel of [
  'sdkjs/cell', 'sdkjs/slide', 'sdkjs/visio',
  'web-apps/apps/spreadsheeteditor', 'web-apps/apps/presentationeditor',
  'web-apps/apps/visioeditor', 'web-apps/apps/pdfeditor',
]) await fs.rm(join(destination, rel), { recursive: true, force: true });
// Release source maps are not required at runtime; some are extremely large.
// Remove them before textual path rewriting and before Pages file-size checks.
await walk(destination, async (file) => {
  if (file.endsWith('.map')) await fs.rm(file);
});

// Only known static site-root assets/routes may be prefixed with the office
// base. Notice that 'index.html' MUST NOT be in this list: the ONLYOFFICE SDK
// appends '/index.html' to its own nested frame URL.
const assetRoots = [
  'sdkjs','web-apps','fonts','ran-fonts','ranui-iife','assets',
  'img','images','icons','models','wasm','content','packages','plugins',
  'favicon.ico','favicon.svg','sw.js','manifest.json',
  'home.css','landing.css','lang-switch.js','sw-register.js','open-local.js',
  'landing-prefetch.js','theme-presentation.js','onlyoffice-v7-iframe-patch.js',
  'ran-tokens.css','editor.html','history.html','embed-demo.html',
  'help','changelog',
];
const escapedRoots = assetRoots.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const absoluteMatcher = new RegExp(`(["'\x60(=\\s])\\/(${escapedRoots})(?=\\/|["'\x60?#\\s)]|$)`, 'g');
const cssMatcher = new RegExp(`(url\\(\\s*['"]?)\\/(${escapedRoots})(?=\\/|['"?)]|$)`, 'g');
const routeMatcher = /(["'`(=\s])\/(editor|history)(?=["'`?#\s)]|$)/g;
const textExtensions = new Set(['.js','.mjs','.html','.css','.json','.xml','.svg','.txt','.webmanifest','.map','.ts']);
let scanned = 0, changed = 0;
async function walk(dir, visit) {
  for (const item of await fs.readdir(dir, { withFileTypes:true })) {
    const path = join(dir,item.name);
    if (item.isDirectory()) await walk(path,visit);
    else if (item.isFile()) await visit(path,item.name);
  }
}
await walk(destination, async (path, name) => {
  if (!textExtensions.has(extname(name)) || name === 'LICENSE' || name === 'NOTICE') return;
  const original = await fs.readFile(path, 'utf8');
  let body = original
    .replace(absoluteMatcher, (_match, before, root) => `${before}${officeBase}${root}`)
    .replace(cssMatcher, (_match, before, root) => `${before}${officeBase}${root}`)
    .replace(routeMatcher, (_match, before, route) => `${before}${officeBase}${route}.html`)
    .replace(/(["'`(=\s])\/ran-tokens\.([a-f0-9]+)\.css/g,
      (_match, before, hash) => `${before}${officeBase}ran-tokens.${hash}.css`)
    .replaceAll('x2t.wasm.br', 'x2t.wasm');
  // Landing-page links to the *site root* are special-cased ONLY in top-level
  // HTML entry points, never in the nested ONLYOFFICE JS and HTML resources.
  if (dirname(path) === destination && extname(name) === '.html') {
    body = body.replace(/(["'`(=\s])\/index\.html(?=["'`?#\s)]|$)/g,
      (_match, before) => `${before}${officeBase}index.html`);
  }
  if (body !== original) { await fs.writeFile(path,body); changed++; }
  scanned++;
});

const packed = join(destination, 'sdkjs/common/wasm/x2t/x2t.wasm.br');
const raw = join(destination, 'sdkjs/common/wasm/x2t/x2t.wasm');
if (existsSync(packed)) {
  const wasm = brotliDecompressSync(await fs.readFile(packed));
  if (wasm.subarray(0,4).toString('hex') !== '0061736d') throw new Error('Decompressed converter is not WebAssembly.');
  await fs.writeFile(raw, wasm);
  await fs.rm(packed);
}
if (!existsSync(raw) || (await fs.readFile(raw)).subarray(0,4).toString('hex') !== '0061736d') {
  throw new Error('Missing or invalid raw x2t.wasm converter.');
}

// GitHub Pages cannot supply Content-Encoding for a precompressed .br asset.
// Send a much smaller gzip download instead, and decompress via the browser's
// native streaming DecompressionStream('gzip') before WASM instantiation.
// Retain the raw .wasm path for browsers without DecompressionStream.
const wasmBytes = await fs.readFile(raw);
const gzipPath = `${raw}.gz`;
const gzipped = gzipSync(wasmBytes, { level: 9 });
if (!gunzipSync(gzipped).equals(wasmBytes)) throw new Error('Gzip converter round-trip failed.');
await fs.writeFile(gzipPath, gzipped);

const helperPath = join(destination, 'sdkjs/common/wasm/x2t/x2t_helper.js');
const helper = await fs.readFile(helperPath, 'utf8');
const wasmDeclaration = /(this\.WASM_PATH\s*=\s*['"][^'"\n]*x2t\.wasm['"]\s*;?)/g;
const fetchDeclaration = /(var wasmPath = this\.WASM_PATH;)/g;
const validResponse = /(if \(response\.ok\) return response;)/g;
if ([...helper.matchAll(wasmDeclaration)].length !== 1 ||
    [...helper.matchAll(fetchDeclaration)].length !== 1 ||
    [...helper.matchAll(validResponse)].length !== 1) {
  throw new Error('Pinned ONLYOFFICE x2t loader changed; refuse an unverified gzip patch.');
}
const patchedHelper = helper
  .replace(wasmDeclaration, `$1\n        this.WASM_GZIP_PATH = this.WASM_PATH + '.gz';`)
  .replace(fetchDeclaration, `var wasmPath = typeof DecompressionStream === 'function' ? this.WASM_GZIP_PATH : this.WASM_PATH;\n        var gzipResponse = wasmPath === this.WASM_GZIP_PATH;`)
  .replace(validResponse, `if (response.ok) {\n                        if (!gzipResponse) return response;\n                        if (!response.body) throw new Error('x2t gzip response has no stream');\n                        return new Response(response.body.pipeThrough(new DecompressionStream('gzip')),\n                            { headers: { 'Content-Type': 'application/wasm' } });\n                    }`);
await fs.writeFile(helperPath, patchedHelper);

// GitHub Pages lacks an SPA fallback. Supply real static /office/editor/ and
// /office/history/ routes while preserving query parameters.
for (const route of ['editor','history']) {
  await fs.mkdir(join(destination,route), {recursive:true});
  const target = `../${route}.html`;
  await fs.writeFile(join(destination,route,'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Opening document editor</title>`+
    `<script>location.replace(new URL(${JSON.stringify(target)}+location.search+location.hash,location.href).href);</script>`+
    `</head><body><a href="${target}">Continue to document editor</a></body></html>\n`);
}

// This is the nested file that was incorrectly requested with an extra
// /nursememo/ path in the original self-hosted deployment.
const mainFrame = 'web-apps/apps/documenteditor/main/index.html';
if (!existsSync(join(destination, mainFrame))) {
  throw new Error(`ONLYOFFICE document frame missing from published assets: ${mainFrame}`);
}
const sdkApiPath = join(destination,'web-apps/apps/api/documents/api.js');
if (existsSync(sdkApiPath)) {
  const sdkApi = await fs.readFile(sdkApiPath,'utf8');
  const erroneousSuffix = `${officeBase}index.html`;
  // ONLYOFFICE's filename suffix must be just '/index.html'. Inspect the SDK
  // directly as an additional release guard when that bundle exists.
  if (sdkApi.includes(`"${erroneousSuffix}"`) || sdkApi.includes(`'${erroneousSuffix}'`)) {
    throw new Error(`ONLYOFFICE SDK nested index path corrupted: ${erroneousSuffix}`);
  }
}

for (const item of ['editor.html','LICENSE','NOTICE','sdkjs/common/wasm/x2t/x2t.wasm','sdkjs/common/wasm/x2t/x2t.wasm.gz']) {
  if (!existsSync(join(destination,item))) throw new Error(`Self-hosted editor missing ${item}`);
}
// Without this, GitHub Pages/Jekyll can drop important _prefixed SDK assets.
await fs.writeFile(join(destination,'../.nojekyll'),'');
const meta = {
  siteBase, officeBase,
  sourceRevision: '1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd',
  sourceUrl: 'https://github.com/ranuts/document', licence: 'AGPL-3.0',
  packagingFix: 'onlyoffice-nested-index-path-v2',
  converterDelivery: 'gzip-streaming-with-raw-fallback',
  description: 'Experimental Word-only EuroOffice 9.3.5-rc.1 + pinned Ranuts/document, standalone GitHub Pages prototype. Not for patient data.',
};
await fs.writeFile(join(destination,'eurooffice-poc-build.json'),JSON.stringify(meta,null,2)+'\n');
let bytes = 0, files = 0;
await walk(destination, async path => {
  const n=(await fs.stat(path)).size;
  if (n > 100*1024*1024) throw new Error(`GitHub Pages cannot host single asset over 100 MiB: ${relative(destination,path)}`);
  bytes += n; files++;
});
if (bytes > 900*1024*1024) {
  throw new Error(`Word-only editor too large for GitHub Pages: ${Math.ceil(bytes/1024/1024)} MiB`);
}
// Copy the separately authored test harness into the project Pages root.
const harness = resolve('site');
for (const file of ['index.html','poc.js','poc.css']) {
  if (!existsSync(join(harness,file))) throw new Error(`Missing test harness: ${file}`);
  await fs.copyFile(join(harness,file),join(destination,'..',file));
}
console.log(`Prepared ${relative(process.cwd(),destination)} at ${officeBase}; ${changed}/${scanned} rewritten; ${files} editor files; ${(bytes/1024/1024).toFixed(1)} MiB.`);
