import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url).pathname;
const script=join(root,'scripts/stage-wasm-compat.py');
const adapter=join(root,'scripts/prepare-recipe.py');
const stubNames=['doctrenderer_empty.cpp','docbuilder_empty.cpp','docbuilder_p_empty.cpp'];
const cppNames=['doctrenderer.cpp','docbuilder.cpp','docbuilder_p.cpp'];
const sub='DesktopEditor/doctrenderer';
const sha=x=>createHash('sha256').update(x).digest('hex');
function run(program,args,cwd){
 const p=spawnSync(program,args,{cwd,encoding:'utf8',timeout:15000});
 assert.notEqual(p.error?.code,'ETIMEDOUT',`Command timed out ${program} ${args.join(' ')}`);
 return p;
}
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'eo-compat-'));
 const recipe=join(dir,'recipe');mkdirSync(recipe);
 for(const args of [['init','-q'],['config','user.email','bot@example.org'],['config','user.name','Test Bot']])
  assert.equal(run('git',args,recipe).status,0);
 const bundled=join(recipe,'core',sub);mkdirSync(bundled,{recursive:true});
 const data=new Map();
 for(const name of stubNames){
  const content=`// pinned wasm-only stub ${name}\n`+'int only_test_symbol() { return 42; }\n'.repeat(5);
  writeFileSync(join(bundled,name),content);data.set(name,content);
 }
 assert.equal(run('git',['add','core'],recipe).status,0);
 assert.equal(run('git',['commit','-qm','pinned recipe'],recipe).status,0);
 const commit=run('git',['rev-parse','HEAD'],recipe).stdout.trim();
 // Model the real pipeline: the full bundled core is replaced with the official one.
 rmSync(join(recipe,'core'),{recursive:true,force:true});
 const official=join(recipe,'core');
 const target=join(official,sub);mkdirSync(target,{recursive:true});
 for(const name of cppNames)writeFileSync(join(target,name),`// official source ${name}\n`);
 const call=()=>run('python3',['-c',
   `import importlib.util,json;spec=importlib.util.spec_from_file_location('stub',${JSON.stringify(script)});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(json.dumps(m.extract_stubs(${JSON.stringify(recipe)},${JSON.stringify(official)},${JSON.stringify(commit)})))`
  ],root);
 return {dir,recipe,official,target,commit,data,call};
}
function withFixture(fn){const f=setup();try{fn(f);}finally{rmSync(f.dir,{recursive:true,force:true});}}

test('real Git-tree extraction stages only three byte-identical pinned files, preserves official source',()=>withFixture(f=>{
 const before=new Map(cppNames.map(name=>[name,readFileSync(join(f.target,name))]));
 const p=f.call();assert.equal(p.status,0,p.stderr);
 const report=JSON.parse(p.stdout);
 assert.equal(report.stubCount,3);
 assert.equal(report.fullCryptpadCoreImported,false);
 assert.equal(report.officialCoreUnmodified,true);
 assert.equal(report.builderCommit,f.commit);
 for(const item of report.stubs){
  const name=item.dockerContextPath.split('/').at(-1);
  assert.ok(stubNames.includes(name));
  const content=readFileSync(join(f.recipe,item.dockerContextPath));
  assert.equal(content.toString(),f.data.get(name));
  assert.equal(item.sha256,sha(content));
  assert.ok(/^[a-f0-9]{40}$/.test(item.gitBlob));
 }
 for(const [name,bytes] of before)assert.deepEqual(readFileSync(join(f.target,name)),bytes);
 assert.equal(report.stubs.length,3);
 assert.equal(readFileSync(join(f.recipe,'core',sub,'doctrenderer.cpp'),'utf8'),'// official source doctrenderer.cpp\n');
}));

test('Docker input audit detects missing stubs before compilation and passes once staged',()=>withFixture(f=>{
 const text=[
  'FROM test AS base',
  'FROM base AS doctrenderer',
  'COPY core/DesktopEditor/ /core/DesktopEditor/',
  ...stubNames.map((name,i)=>`COPY wasm-compat/${name} /core/${sub}/${cppNames[i]}`),
  'RUN true',
  'FROM base AS end',
  'COPY --from=doctrenderer /core/output /output',
  'COPY core /core',
 ].join('\n');
 const audit=()=>run('python3',['-c',
   `import importlib.util;spec=importlib.util.spec_from_file_location('a',${JSON.stringify(adapter)});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(m.audit_docker_inputs(${JSON.stringify(f.recipe)},${JSON.stringify(text)}))`
  ],root);
 let p=audit();assert.notEqual(p.status,0);assert.match(p.stderr,/Missing 3 Docker local COPY sources/);
 assert.equal(f.call().status,0);
 p=audit();assert.equal(p.status,0,p.stderr);assert.equal(Number(p.stdout.trim()),5);
}));

test('test fixture proves Docker replacement maps all three files and never overwrites official staged source',()=>withFixture(f=>{
 const p=f.call();assert.equal(p.status,0,p.stderr);
 const report=JSON.parse(p.stdout);
 // Simulate Docker COPY into a distinct, temporary stage (Docker daemon not available locally).
 const dockerStage=join(f.dir,'isolated-doctrenderer');mkdirSync(dockerStage);
 for(const name of cppNames)writeFileSync(join(dockerStage,name),readFileSync(join(f.target,name)));
 for(const item of report.stubs){
  const target=item.dockerTarget.split('/').at(-1);
  writeFileSync(join(dockerStage,target),readFileSync(join(f.recipe,item.dockerContextPath)));
 }
 for(let i=0;i<cppNames.length;i++){
  assert.equal(readFileSync(join(dockerStage,cppNames[i]),'utf8'),f.data.get(stubNames[i]));
  assert.equal(readFileSync(join(f.target,cppNames[i]),'utf8'),`// official source ${cppNames[i]}\n`);
 }
}));

test('wrong pinned Git commit fails before extracting anything',()=>withFixture(f=>{
 const p=run('python3',['-c',
  `import importlib.util;spec=importlib.util.spec_from_file_location('s',${JSON.stringify(script)});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.extract_stubs(${JSON.stringify(f.recipe)},${JSON.stringify(f.official)},${JSON.stringify('0'.repeat(40))})`
 ],root);
 assert.notEqual(p.status,0);assert.match(p.stderr,/Pinned CryptPad builder mismatch/);
 assert.ok(!existsSync(join(f.recipe,'wasm-compat')));
}));

test('missing official C++ target fails closed',()=>withFixture(f=>{
 rmSync(join(f.target,'docbuilder.cpp'));
 const p=f.call();assert.notEqual(p.status,0);
 assert.match(p.stderr,/Expected regular official EuroOffice source missing/);
 assert.ok(!existsSync(join(f.recipe,'wasm-compat')));
}));

test('output directory from prior run cannot be overwritten',()=>withFixture(f=>{
 assert.equal(f.call().status,0);
 const existing=join(f.recipe,'wasm-compat','doctrenderer_empty.cpp');
 const original=readFileSync(existing);
 const p=f.call();assert.notEqual(p.status,0);assert.match(p.stderr,/already exists/);
 assert.deepEqual(readFileSync(existing),original);
}));

test('pinned missing blobs fail without partial compatibility output',()=>withFixture(f=>{
 const altered=join(f.dir,'alternate');mkdirSync(altered);
 for(const args of [['init','-q'],['config','user.email','bot@example.org'],['config','user.name','Test Bot']])assert.equal(run('git',args,altered).status,0);
 const folder=join(altered,'core',sub);mkdirSync(folder,{recursive:true});
 for(const name of stubNames.slice(0,2))writeFileSync(join(folder,name),'//'.repeat(150));
 run('git',['add','.'],altered);run('git',['commit','-qm','missing one'],altered);
 const newCommit=run('git',['rev-parse','HEAD'],altered).stdout.trim();
 const core=join(altered,'official',sub);mkdirSync(core,{recursive:true});
 for(const name of cppNames)writeFileSync(join(core,name),'// official');
 const p=run('python3',['-c',
  `import importlib.util;spec=importlib.util.spec_from_file_location('s',${JSON.stringify(script)});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.extract_stubs(${JSON.stringify(altered)},${JSON.stringify(join(altered,'official'))},${JSON.stringify(newCommit)})`
 ],root);
 assert.notEqual(p.status,0);assert.match(p.stderr,/pinned regular-file WASM stub missing/);
 assert.ok(!existsSync(join(altered,'wasm-compat')));
}));

test('unsafe official symlink target is rejected without copying anything',()=>withFixture(f=>{
 rmSync(join(f.target,'doctrenderer.cpp'));
 symlinkSync('/tmp/not-the-official-source',join(f.target,'doctrenderer.cpp'));
 const p=f.call();assert.notEqual(p.status,0);
 assert.match(p.stderr,/source missing/);
 assert.ok(!existsSync(join(f.recipe,'wasm-compat')));
}));

test('sparse partial clone still retrieves three pinned stub blobs through git show',()=>withFixture(f=>{
 const clone=join(f.dir,'sparse');
 assert.equal(run('git',['-C',f.recipe,'config','uploadpack.allowFilter','true'],f.dir).status,0);
 const url='file://'+f.recipe;
 const cl=run('git',['clone','-q','--filter=blob:none','--no-checkout',url,clone],f.dir);
 assert.equal(cl.status,0,cl.stderr);
 assert.equal(run('git',['sparse-checkout','init','--no-cone'],clone).status,0);
 assert.equal(run('git',['sparse-checkout','set','--no-cone','/Dockerfile','/embuild.sh'],clone).status,0);
 assert.equal(run('git',['checkout','--detach',f.commit],clone).status,0);
 for(const name of stubNames){
  assert.ok(!existsSync(join(clone,'core',sub,name)));
  const p=run('git',['show',`${f.commit}:core/${sub}/${name}`],clone);
  assert.equal(p.status,0,p.stderr);
  assert.equal(p.stdout,f.data.get(name));
 }
}));
