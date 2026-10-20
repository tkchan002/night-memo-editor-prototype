import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url).pathname;
const script=join(root,'scripts/create-converter-manifest.mjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const pinned='95f775fd3c42fae9e9af66ca072d3da3763e6c76';
const core='5a33ce6c4a63387e8576c7e763b70cd971988b24';
const names=new Map([
 ['doctrenderer_empty.cpp','doctrenderer.cpp'],
 ['docbuilder_empty.cpp','docbuilder.cpp'],
 ['docbuilder_p_empty.cpp','docbuilder_p.cpp'],
]);
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'eo-manifest-'));
 const work=join(dir,'.work');
 const wasmDir=join(work,'matching-converter');mkdirSync(wasmDir,{recursive:true});
 // Minimal valid WASM with one imported function from module "a".
 const payload=Buffer.from([1,1,0x61,4,0x74,0x65,0x73,0x74,0,0]);
 const wasm=Buffer.concat([Buffer.from([0,97,115,109,1,0,0,0,1,4,1,0x60,0,0,2,payload.length]),payload]);
 assert.equal(WebAssembly.Module.imports(new WebAssembly.Module(wasm))[0].module,'a');
 writeFileSync(join(wasmDir,'x2t.wasm'),wasm);
 writeFileSync(join(wasmDir,'x2t.js'),'var imports={"a":wasmImports};\n');
 const report=(name,obj)=>writeFileSync(join(work,name),JSON.stringify(obj));
 report('official-core-staging.json',{schema:1,sourceMode:'official-eurooffice-first',cryptpadModifiedCoreImported:false,officialCoreCommit:core,patches:[]});
 report('build-recipe-report.json',{schema:1,modifiedCryptpadCoreImported:false,builderOnly:true,adaptedDockerfileSha256:'a'.repeat(64),dockerLocalCopyInputsAudited:3,adapterOperations:['Copy exactly three SHA-recorded pinned WASM doctrenderer stubs into Docker stage only']});
 writeFileSync(join(work,'official-core-commit.txt'),core+'\n');
 const stubs=[];
 for(const [name,target] of names){
  const filename='wasm-compat/'+name;
  const path=join(work,'cryptpad-wasm-recipe',filename);
  mkdirSync(join(work,'cryptpad-wasm-recipe','wasm-compat'),{recursive:true});
  const content=Buffer.from('// fixture wasm stub '+name+'\n');writeFileSync(path,content);
  stubs.push({cryptpadPath:'core/DesktopEditor/doctrenderer/'+name,
    dockerContextPath:filename,dockerTarget:'/core/DesktopEditor/doctrenderer/'+target,
    gitBlob:'b'.repeat(40),size:content.length,sha256:sha(content)});
 }
 report('wasm-compat-report.json',{schema:1,builderCommit:pinned,sourceMode:'pinned-cryptpad-wasm-compatibility-only',officialCoreUnmodified:true,fullCryptpadCoreImported:false,stubCount:3,stubs});
 const execute=()=>spawnSync('node',[script,wasmDir],{cwd:dir,env:{...process.env,EO_RELEASE_TAG:'v9.3.5'},encoding:'utf8',timeout:15000});
 return {dir,work,stubs,execute};
}
function withFixture(fn){const f=setup();try{fn(f);}finally{rmSync(f.dir,{recursive:true,force:true});}}
test('real converter-manifest tool records the exact three approved compatibility hashes',()=>withFixture(f=>{
 const p=f.execute();assert.equal(p.status,0,p.stderr);
 const data=JSON.parse(readFileSync(join(f.work,'converter-manifest.json')));
 assert.equal(data.sourceMode,'official-eurooffice-first');
 assert.equal(data.coreCommit,core);
 assert.equal(data.wasmCompatibilityStubs.length,3);
 assert.deepEqual(data.wasmCompatibilityStubs.map(x=>x.sha256),f.stubs.map(x=>x.sha256));
}));
test('converter-manifest tool rejects tampered compatibility source before publishing',()=>withFixture(f=>{
 writeFileSync(join(f.work,'cryptpad-wasm-recipe','wasm-compat','docbuilder_empty.cpp'),'changed');
 const p=f.execute();assert.notEqual(p.status,0);assert.match(p.stderr,/compatibility-file hash mismatch/);
}));
test('converter-manifest tool rejects provenance that claims bulk CryptPad core was imported',()=>withFixture(f=>{
 const path=join(f.work,'wasm-compat-report.json');
 const report=JSON.parse(readFileSync(path));report.fullCryptpadCoreImported=true;writeFileSync(path,JSON.stringify(report));
 const p=f.execute();assert.notEqual(p.status,0);assert.match(p.stderr,/Invalid WASM compatibility-file provenance/);
}));
