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
const stage=JSON.parse(readFileSync('.work/official-core-staging.json','utf8'));
const recipe=JSON.parse(readFileSync('.work/build-recipe-report.json','utf8'));
const compat=JSON.parse(readFileSync('.work/wasm-compat-report.json','utf8'));
const compatibleFiles=new Map([
  ['doctrenderer_empty.cpp','doctrenderer.cpp'],
  ['docbuilder_empty.cpp','docbuilder.cpp'],
  ['docbuilder_p_empty.cpp','docbuilder_p.cpp'],
]);
const pinnedRecipe='95f775fd3c42fae9e9af66ca072d3da3763e6c76';
if(compat.schema!==1 || compat.builderCommit!==pinnedRecipe ||
  compat.sourceMode!=='pinned-cryptpad-wasm-compatibility-only' ||
  !compat.officialCoreUnmodified || compat.fullCryptpadCoreImported ||
  compat.stubCount!==3 || !Array.isArray(compat.stubs) || compat.stubs.length!==3)
  throw Error('Invalid WASM compatibility-file provenance');
const seen=new Set();
for(const entry of compat.stubs) {
  const filename=entry.dockerContextPath?.split('/').at(-1);
  if(!compatibleFiles.has(filename) || seen.has(filename) ||
     entry.dockerContextPath!==`wasm-compat/${filename}` ||
     entry.cryptpadPath!==`core/DesktopEditor/doctrenderer/${filename}` ||
     entry.dockerTarget!==`/core/DesktopEditor/doctrenderer/${compatibleFiles.get(filename)}` ||
     !/^[a-f0-9]{64}$/.test(entry.sha256))
    throw Error('Unapproved WASM compatibility-file identity');
  const bytes=readFileSync(`.work/cryptpad-wasm-recipe/${entry.dockerContextPath}`);
  if(bytes.length!==entry.size || sha(bytes)!==entry.sha256)
    throw Error(`WASM compatibility-file hash mismatch: ${filename}`);
  seen.add(filename);
}
if(recipe.dockerLocalCopyInputsAudited<=0 ||
   !recipe.adapterOperations.some(x=>x.includes('doctrenderer stubs')))
  throw Error('WASM Docker adapter has not validated compatibility inputs');
if(stage.sourceMode!=='official-eurooffice-first' || stage.cryptpadModifiedCoreImported ||
   recipe.modifiedCryptpadCoreImported || !recipe.builderOnly)throw Error('Invalid EuroOffice-first source provenance');
const manifest={sourceMode:'official-eurooffice-first', patches:stage.patches,
  wasmCompatibilityStubs:compat.stubs,
  buildRecipeDockerSha256:recipe.adaptedDockerfileSha256, releaseTag:process.env.EO_RELEASE_TAG||'',coreCommit:readFileSync('.work/official-core-commit.txt','utf8').trim(),
  wasmSha256:sha(wasm),jsSha256:sha(js),importModule:'a',buildRecipe:'cryptpad/onlyoffice-x2t-wasm@95f775fd3c42fae9e9af66ca072d3da3763e6c76'};
if(stage.officialCoreCommit!==manifest.coreCommit || !/^v\d/.test(manifest.releaseTag)||!/^[a-f0-9]{40}$/.test(manifest.coreCommit))throw Error('Release source metadata absent');
writeFileSync('.work/converter-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Matching converter built from core',manifest.coreCommit,'WASM sha256',manifest.wasmSha256);
