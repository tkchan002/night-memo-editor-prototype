/** Strict integrity check for x2t compiled from the exact release core. */
import { readFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function expectedConverter(){
  if(process.env.POC_TEST_FIXTURE==='1')return {wasm:null,js:null,importModule:'a'};
  const path=resolve('.work/converter-manifest.json');
  if(!existsSync(path))throw Error('No matching converter build manifest. Refusing fallback to old RC1 WASM.');
  const m=JSON.parse(readFileSync(path,'utf8'));
  if(m.releaseTag!==process.env.EO_RELEASE_TAG || !/^[a-f0-9]{40}$/.test(m.coreCommit))throw Error('Matching converter release/source mismatch');
  return {wasm:m.wasmSha256,js:m.jsSha256,importModule:m.importModule};
}
export function examineConverter(wasmBytes,jsText,expected){
  const errors=[];const wasmSha256=sha(wasmBytes);const jsSha256=sha(Buffer.from(jsText));
  if(expected.wasm&&wasmSha256!==expected.wasm)errors.push('WASM sha256 mismatch');
  if(expected.js&&jsSha256!==expected.js)errors.push('JS sha256 mismatch');
  let importedModules=[];
  try { importedModules=[...new Set(WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes)).map(x=>x.module))]; }
  catch(e){errors.push(`Invalid WASM: ${e.message}`);}
  if(importedModules.length!==1||importedModules[0]!==expected.importModule)errors.push(`WASM import namespace mismatch: ${JSON.stringify(importedModules)}`);
  if(!/var imports\s*=\s*\{["']a["']\s*:\s*wasmImports/.test(jsText))errors.push('JS glue lacks the expected wasmImports namespace');
  return {ok:errors.length===0,errors,wasmSha256,jsSha256,importedModules};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const dir=resolve(process.argv[2]||'dist/office/sdkjs/common/wasm/x2t');
    const r=examineConverter(readFileSync(join(dir,'x2t.wasm')),readFileSync(join(dir,'x2t.js'),'utf8'),expectedConverter());
    if(!r.ok)throw Error(r.errors.join('; '));
    console.log('PASS matching WASM/JS',r.wasmSha256,r.importedModules);
  }catch(e){console.error('CONVERTER CHECK FAILED:',e.message);process.exitCode=1;}
}
