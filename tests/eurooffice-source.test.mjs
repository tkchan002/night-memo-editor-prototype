import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url).pathname;
const script = join(root,'scripts/stage-official-core.py');
const digest = data => createHash('sha256').update(data).digest('hex');
function run(cmd,args,cwd) {
 const p=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout:12000});
 assert.notEqual(p.error?.code,'ETIMEDOUT',`Timed out: ${cmd} ${args.join(' ')}`);
 return p;
}
function setup(){
 const base=mkdtempSync(join(tmpdir(),'eo-source-'));
 const source=join(base,'source'); mkdirSync(source);
 for(const args of [['init','-q'],['config','user.email','bot@example.org'],['config','user.name','Test Bot']]) {
   const p=run('git',args,source); assert.equal(p.status,0,p.stderr);
 }
 writeFileSync(join(source,'Main.cpp'),'old\n');
 assert.equal(run('git',['add','.'],source).status,0);
 assert.equal(run('git',['commit','-qm','test'],source).status,0);
 const sha=run('git',['rev-parse','HEAD'],source).stdout.trim();
 const patches=join(base,'patches'); mkdirSync(patches);
 const manifest=join(patches,'manifest.json');
 writeFileSync(manifest,JSON.stringify({schema:1,coreCommit:'',patches:[]}));
 const output=join(base,'staged'), report=join(base,'report.json');
 const call=()=>run('python3',[script,'--source',source,'--output',output,'--manifest',manifest,
   '--patches-dir',patches,'--core-sha',sha,'--report',report],root);
 return {base,source,patches,manifest,output,report,sha,call};
}
function withFixture(fn){const f=setup(); try{fn(f);}finally{rmSync(f.base,{recursive:true,force:true});}}

test('official-only source staging does not copy modified CryptPad source or rewrite original',()=>withFixture(f=>{
 const p=f.call(); assert.equal(p.status,0,p.stderr);
 assert.equal(readFileSync(join(f.source,'Main.cpp'),'utf8'),'old\n');
 assert.equal(readFileSync(join(f.output,'Main.cpp'),'utf8'),'old\n');
 assert.ok(!existsSync(join(f.output,'.git')));
 const report=JSON.parse(readFileSync(f.report));
 assert.equal(report.sourceMode,'official-eurooffice-first');
 assert.equal(report.cryptpadModifiedCoreImported,false);
 assert.equal(report.patchCount,0);
}));

test('source mismatch stops before staging',()=>withFixture(f=>{
 writeFileSync(f.manifest,'{"schema":1,"coreCommit":"","patches":[]}');
 const other='0'.repeat(40);
 const p=run('python3',[script,'--source',f.source,'--output',f.output,'--manifest',f.manifest,
  '--patches-dir',f.patches,'--core-sha',other,'--report',f.report],root);
 assert.notEqual(p.status,0);assert.match(p.stderr,/source SHA mismatch/);
 assert.ok(!existsSync(f.output));
}));

test('dirty official checkout is blocked before copy',()=>withFixture(f=>{
 writeFileSync(join(f.source,'Main.cpp'),'modified\n');
 const p=f.call();assert.notEqual(p.status,0); assert.match(p.stderr,/modified tracked files/);
 assert.ok(!existsSync(f.output));
}));

test('explicitly SHA-pinned patch changes staged copy only',()=>withFixture(f=>{
 writeFileSync(join(f.source,'Main.cpp'),'new\n');
 const patch=run('git',['diff','--','Main.cpp'],f.source).stdout;
 assert.match(patch,/diff --git/);
 assert.equal(run('git',['restore','Main.cpp'],f.source).status,0);
 writeFileSync(join(f.patches,'fix.patch'),patch);
 writeFileSync(f.manifest,JSON.stringify({schema:1,coreCommit:f.sha,
   patches:[{file:'fix.patch',sha256:digest(patch),allowedPaths:['Main.cpp']}]}));
 const p=f.call();assert.equal(p.status,0,p.stderr);
 assert.equal(readFileSync(join(f.source,'Main.cpp'),'utf8'),'old\n');
 assert.equal(readFileSync(join(f.output,'Main.cpp'),'utf8'),'new\n');
 assert.equal(JSON.parse(readFileSync(f.report)).patchCount,1);
}));

test('unapproved patch paths fail closed',()=>withFixture(f=>{
 writeFileSync(join(f.source,'Main.cpp'),'new\n');
 const patch=run('git',['diff','--','Main.cpp'],f.source).stdout;
 run('git',['restore','Main.cpp'],f.source);
 writeFileSync(join(f.patches,'fix.patch'),patch);
 writeFileSync(f.manifest,JSON.stringify({schema:1,coreCommit:f.sha,
   patches:[{file:'fix.patch',sha256:digest(patch),allowedPaths:['Unrelated.cpp']}]}));
 const p=f.call();assert.notEqual(p.status,0);assert.match(p.stderr,/not approved/);
 assert.ok(!existsSync(f.output));
}));

test('tampered patch rejected by digest before staging',()=>withFixture(f=>{
 writeFileSync(join(f.patches,'fix.patch'),'random');
 writeFileSync(f.manifest,JSON.stringify({schema:1,coreCommit:f.sha,
   patches:[{file:'fix.patch',sha256:'a'.repeat(64),allowedPaths:['Main.cpp']}]}));
 const p=f.call();assert.notEqual(p.status,0);assert.match(p.stderr,/integrity SHA-256 mismatch/);
 assert.ok(!existsSync(f.output));
}));

test('patch pinned to different core cannot apply',()=>withFixture(f=>{
 writeFileSync(join(f.patches,'fix.patch'),'data');
 writeFileSync(f.manifest,JSON.stringify({schema:1,coreCommit:'1'.repeat(40),
   patches:[{file:'fix.patch',sha256:digest('data'),allowedPaths:['Main.cpp']}]}));
 const p=f.call();assert.notEqual(p.status,0);assert.match(p.stderr,/not approved for this exact/);
 assert.ok(!existsSync(f.output));
}));

test('existing stage path not overwritten',()=>withFixture(f=>{
 mkdirSync(f.output);writeFileSync(join(f.output,'keep.txt'),'existing');
 const p=f.call();assert.notEqual(p.status,0);assert.match(p.stderr,/already exists/);
 assert.equal(readFileSync(join(f.output,'keep.txt'),'utf8'),'existing');
}));
