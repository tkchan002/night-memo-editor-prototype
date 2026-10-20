import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(process.argv[2]||'dist');
const office=join(root,'office');
function check(condition,message){if(!condition)throw new Error(message);}
for (const name of [
  '.nojekyll','index.html','poc.js','poc.css','office/editor.html',
  'office/assets','office/sdkjs/word/sdk-all-min.js',
  'office/sdkjs/common/wasm/x2t/x2t.wasm',
  'office/sdkjs/common/wasm/x2t/x2t.wasm.gz',
  'office/sdkjs/common/wasm/x2t/x2t_helper.js',
  'office/web-apps/apps/documenteditor/main/index.html',
  'office/web-apps/apps/documenteditor/main/app.js',
  'office/web-apps/apps/api/documents/api.js',
  'office/fonts', 'office/eurooffice-poc-build.json',
  'office/LICENSE', 'office/NOTICE', 'office/PROTOTYPE-NOTICES.txt',
  'office/LICENSES/euro-office-LICENSE.txt',
  'office/LICENSES/euro-office-3rd-Party.txt',
]) check(existsSync(join(root,name)),`Deployment missing: ${name}`);
const wasm=readFileSync(join(office,'sdkjs/common/wasm/x2t/x2t.wasm'));
check(wasm.subarray(0,4).toString('hex')==='0061736d','Invalid WASM binary');
// The old Ranuts .br converter has a different import ABI and must not be
// published: it caused successful builds to fail on document open.
check(!existsSync(join(office,'sdkjs/common/wasm/x2t/x2t.wasm.br')),
  'Stale x2t.wasm.br remains in deployed assets');
const loader=readFileSync(join(office,'sdkjs/common/wasm/x2t/x2t_helper.js'),'utf8');
check(loader.includes('DecompressionStream'), 'Gzip streaming loader patch missing');
check(loader.includes('this.WASM_RAW_PATH'), 'Cache-busted x2t raw fallback missing');
check(loader.includes('x2t.js?v='), 'Cache-busted x2t JS path missing');
check(!loader.includes('x2t.wasm.br'), 'Unsupported .br WASM reference remains in loader');
const sdk=readFileSync(join(office,'sdkjs/word/sdk-all-min.js'),'utf8');
check(sdk.includes('window.isOffline=!0'), 'SDK lost the offline compatibility layer');
const app=readFileSync(join(office,'web-apps/apps/documenteditor/main/app.js'),'utf8');
check(app.includes('documenteditor/main/app/controller/Offline'),'Missing browser-only Word controller');
check(!existsSync(join(office,'sdkjs/cell')),'Spreadsheet engine should not be published in Word-only PoC');
const fonts=join(office,'fonts');
const numbered=readdirSync(fonts).filter(x=>/^\d{3}$/.test(x) && statSync(join(fonts,x)).isFile());
check(numbered.length>=100,`Too few generated/browser-font resources: ${numbered.length}`);
const metadata=JSON.parse(readFileSync(join(office,'eurooffice-poc-build.json'),'utf8'));
check(metadata.officeBase.endsWith('/office/'),'Invalid editor base path');
check(/^v\d+\.\d+\.\d+/.test(metadata.upstreamReleaseTag || ''), 'Missing resolved Euro-Office release tag');
check(metadata.browserConverterVersion === metadata.upstreamReleaseVersion, 'Editor and converter versions differ');
check(metadata.mixedVersionExperiment === false, 'Unexpected mixed-version fallback');
if (process.env.EO_RELEASE_TAG) check(metadata.upstreamReleaseTag === process.env.EO_RELEASE_TAG,
  `Deployed editor version ${metadata.upstreamReleaseTag} does not match selected ${process.env.EO_RELEASE_TAG}`);
console.log(`PASS: PoC site structure, offline bridge, x2t WASM, gzip loader and ${numbered.length} numbered fonts. Browser compatibility not yet established.`);
