import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(process.argv[2] || '.work/ranuts/public');
const read = p => readFileSync(join(root,p),'utf8');
const assert = (test, why) => { if (!test) throw new Error(why); };
const sdk = 'sdkjs/word/sdk-all-min.js';
const wordApp = 'web-apps/apps/documenteditor/main/app.js';
for (const f of [sdk,wordApp,'web-apps/apps/api/documents/api.js','sdkjs/common/wasm/x2t/x2t.wasm','sdkjs/common/wasm/x2t/x2t.js','sdkjs/common/wasm/x2t/x2t_helper.js','sdkjs/common/AllFonts.js']) {
 assert(existsSync(join(root,f)),`Missing editor dependency: ${f}`);
}
assert(read(sdk).includes('window.isOffline=!0'), 'Missing Ranuts browser-only SDK glue');
assert(read(wordApp).includes('documenteditor/main/app/controller/Offline'), 'Missing Offline controller in Word app');
const wasm = readFileSync(join(root,'sdkjs/common/wasm/x2t/x2t.wasm'));
assert(wasm.subarray(0,4).toString('hex') === '0061736d','x2t.wasm does not contain WebAssembly magic bytes');
console.log('PASS: Word editor engine, Offline controller, API, WASM and catalog present.');
