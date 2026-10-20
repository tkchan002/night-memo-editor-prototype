import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
const dir=resolve(process.argv[2]||'.work/matching-converter');
const sha=x=>createHash('sha256').update(x).digest('hex');
const wasm=readFileSync(join(dir,'x2t.wasm'));
const js=readFileSync(join(dir,'x2t.js'),'utf8');
if(wasm.subarray(0,4).toString('hex')!=='0061736d')throw Error('Invalid WASM magic');
const imports=[...new Set(WebAssembly.Module.imports(new WebAssembly.Module(wasm)).map(x=>x.module))];
if(imports.length!==1 || imports[0]!=='a')throw Error(`Unexpected WASM ABI imports ${JSON.stringify(imports)}; loader patch needed`);
if(!/var imports\s*=\s*\{["']a["']\s*:\s*wasmImports/.test(js))throw Error('Generated JS does not provide the expected a import namespace');
const manifest={releaseTag:process.env.EO_RELEASE_TAG||'',coreCommit:readFileSync('.work/official-core-commit.txt','utf8').trim(),
  wasmSha256:sha(wasm),jsSha256:sha(js),importModule:'a',buildRecipe:'cryptpad/onlyoffice-x2t-wasm@95f775fd3c42fae9e9af66ca072d3da3763e6c76'};
if(!/^v\d/.test(manifest.releaseTag)||!/^[a-f0-9]{40}$/.test(manifest.coreCommit))throw Error('Release source metadata absent');
writeFileSync('.work/converter-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Matching converter built from core',manifest.coreCommit,'WASM sha256',manifest.wasmSha256);
