import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';

function invoke(args, ok = true) {
  const r = spawnSync(args[0], args.slice(1), {encoding: 'utf8', timeout: 30000});
  if (ok) assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}\n${r.stdout}`);
  return r;
}
function initRepo(path, files) {
  mkdirSync(path);
  invoke(['git', 'init', '-q', path]);
  invoke(['git', '-C', path, 'config', 'user.email', 'test@example.com']);
  invoke(['git', '-C', path, 'config', 'user.name', 'Test']);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(path, file)), {recursive:true});
    writeFileSync(join(path, file), content);
  }
  invoke(['git', '-C', path, 'add', '-A']);
  invoke(['git', '-C', path, 'commit', '-qm', 'fixture']);
}
function scenario(base, modified, official, fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'eo-3way-'));
  try {
    const a = join(tmp, 'base'), b = join(tmp, 'modified');
    const c = join(tmp, 'target'), r = join(tmp, 'report.json');
    initRepo(a, base); initRepo(b, modified);
    mkdirSync(c);
    for (const [file, content] of Object.entries(official)) {
      mkdirSync(dirname(join(c, file)), {recursive:true});
      writeFileSync(join(c, file), content);
    }
    invoke(['python3', 'scripts/port-wasm-changes.py', a, b, c, r]);
    return fn({tmp,a,b,c,r, apply:()=>invoke(['python3','scripts/apply-wasm-port.py',c,r],false)});
  } finally {
    rmSync(tmp, {recursive:true, force:true});
  }
}

test('clean port applies a changed source file', () => {
  scenario({'x.cpp':'int a=1;\nint b=2;\n'}, {'x.cpp':'int a=1;\nint b=200;\n'},
    {'x.cpp':'int a=1;\nint b=2;\n'}, ({c,apply})=>{
      assert.equal(apply().status, 0);
      assert.equal(readFileSync(join(c,'x.cpp'),'utf8'),'int a=1;\nint b=200;\n');
    });
});

test('already applied port is idempotent, including repeated apply', () => {
  scenario({'x.cpp':'start\nold\nend\n'}, {'x.cpp':'start\nupdated\nend\n'},
    {'x.cpp':'start\nupdated\nend\n'}, ({c,r,apply})=>{
      assert.equal(apply().status,0);
      assert.equal(apply().status,0);
      assert.equal(JSON.parse(readFileSync(join(r,'../wasm-port-results.json'))).alreadyPresent.length,1);
      assert.equal(readFileSync(join(c,'x.cpp'),'utf8'),'start\nupdated\nend\n');
    });
});

test('independent official core updates merge with CryptPad adaptations', () => {
  const baseline = 'first\nsecond\nthird\nfourth\nfifth\nsixth\nseventh\neighth\n';
  const changed = baseline.replace('second\n','SECOND_CRYPTPAD\n');
  const target = baseline.replace('seventh\n','SEVENTH_EUROOFFICE\n');
  scenario({'x.cpp':baseline},{'x.cpp':changed},{'x.cpp':target},({c,apply})=>{
    assert.equal(apply().status,0);
    const result=readFileSync(join(c,'x.cpp'),'utf8');
    assert.match(result,/SECOND_CRYPTPAD/);
    assert.match(result,/SEVENTH_EUROOFFICE/);
  });
});

test('multiple no-final-newline files no longer create malformed unified patches', () => {
  const before = {}, after = {}, target = {};
  for (let n=0;n<15;n++){
    const file=`source${String(n).padStart(3,'0')}.cpp`;
    before[file]=`first line ${n}\nlast line`;
    after[file]=`first line ${n}\nchanged last line`;
    target[file]=before[file];
  }
  scenario(before,after,target,({c,r,apply})=>{
    assert.equal(apply().status,0);
    for (const file of Object.keys(before)){
      assert.equal(readFileSync(join(c,file),'utf8'),after[file]);
    }
    assert.equal(existsSync(join(dirname(r),'wasm-port/core-changes.patch')),false);
  });
});

test('overlapping edits fail closed and preserve the entire target source tree', () => {
  scenario({'a.cpp':'one\ntwo\nthree\n','z.cpp':'x\ny\nz\n'},
    {'a.cpp':'one\ncryptpad\nthree\n','z.cpp':'x\ncryptpad\nz\n'},
    {'a.cpp':'one\ntwo\nthree\n','z.cpp':'x\neurooffice\nz\n'},
    ({c,r,apply})=>{
      const result=apply();
      assert.notEqual(result.status,0);
      assert.match(result.stderr,/CONFLICT z.cpp/);
      assert.equal(readFileSync(join(c,'a.cpp'),'utf8'),'one\ntwo\nthree\n');
      assert.equal(readFileSync(join(c,'z.cpp'),'utf8'),'x\neurooffice\nz\n');
      const diagnostics=JSON.parse(readFileSync(join(dirname(r),'wasm-port-results.json')));
      assert.equal(diagnostics.status,'conflict');
      assert.equal(diagnostics.conflicts.length,1);
      assert.ok(existsSync(join(dirname(r),'wasm-port/conflicts/z.cpp.merge')));
    });
});

test('new files are copied, identical preexisting new files are permitted', () => {
  scenario({'x.cpp':'abc\n'}, {'x.cpp':'def\n','dir/new.hpp':'header\n'},
    {'x.cpp':'abc\n','dir/new.hpp':'header\n'}, ({c,apply})=>{
      assert.equal(apply().status,0);
      assert.equal(readFileSync(join(c,'dir/new.hpp'),'utf8'),'header\n');
      assert.equal(readFileSync(join(c,'x.cpp'),'utf8'),'def\n');
    });
});

test('different existing additions conflict, never overwrite target', () => {
  scenario({'x.cpp':'abc\n'}, {'x.cpp':'def\n','dir/new.hpp':'cryptpad\n'},
    {'x.cpp':'abc\n','dir/new.hpp':'eurooffice\n'}, ({c,apply})=>{
      assert.notEqual(apply().status,0);
      assert.equal(readFileSync(join(c,'dir/new.hpp'),'utf8'),'eurooffice\n');
      assert.equal(readFileSync(join(c,'x.cpp'),'utf8'),'abc\n');
    });
});

test('safe deletion works; independently modified deletion fails', () => {
  const base={'x.cpp':'a\n','obsolete.txt':'old\n'};
  const modified={'x.cpp':'b\n'};
  scenario(base,modified,base,({c,apply})=>{
    assert.equal(apply().status,0);
    assert.equal(existsSync(join(c,'obsolete.txt')),false);
  });
  scenario(base,modified,{'x.cpp':'a\n','obsolete.txt':'forked\n'},({c,apply})=>{
    assert.notEqual(apply().status,0);
    assert.equal(readFileSync(join(c,'obsolete.txt'),'utf8'),'forked\n');
    assert.equal(readFileSync(join(c,'x.cpp'),'utf8'),'a\n');
  });
});

test('binary modifications accept identical base, but refuse independent binary edits', () => {
  const base={'file.dat':Buffer.from([0,1,2]),'x.cpp':'same\n'};
  const changed={'file.dat':Buffer.from([0,1,9]),'x.cpp':'same\n'};
  scenario(base,changed,base,({c,apply})=>{
    assert.equal(apply().status,0);
    assert.deepEqual(readFileSync(join(c,'file.dat')),changed['file.dat']);
  });
  scenario(base,changed,{'file.dat':Buffer.from([0,1,5]),'x.cpp':'same\n'},({c,apply})=>{
    assert.notEqual(apply().status,0);
    assert.deepEqual(readFileSync(join(c,'file.dat')),Buffer.from([0,1,5]));
  });
});

test('existing executable permission is preserved for content-only source changes', () => {
  scenario({'build.sh':'echo old\n'}, {'build.sh':'echo cryptpad\n'},
    {'build.sh':'echo old\n'}, ({c,apply})=>{
      // Independent executable mode in EuroOffice should not be reset.
      chmodSync(join(c,'build.sh'),0o755);
      assert.equal(apply().status,0);
      assert.equal(readFileSync(join(c,'build.sh'),'utf8'),'echo cryptpad\n');
      assert.equal(statSync(join(c,'build.sh')).mode & 0o777,0o755);
    });
});


test('more than one conflict within one file is reported, never treated as a tool crash', () => {
  const lines = Array.from({length: 28}, (_,i)=>`line ${i}\n`);
  const baseline = lines.join('');
  const fork = lines.map((x,i)=>i===2||i===21 ? `cryptpad ${i}\n` : x).join('');
  const official = lines.map((x,i)=>i===2||i===21 ? `eurooffice ${i}\n` : x).join('');
  scenario({'multi.cpp':baseline},{'multi.cpp':fork},{'multi.cpp':official},({c,r,apply})=>{
    const response = apply();
    assert.notEqual(response.status,0);
    assert.match(response.stderr,/CONFLICT multi.cpp/);
    assert.equal(readFileSync(join(c,'multi.cpp'),'utf8'), official);
    const diagnostic = JSON.parse(readFileSync(join(dirname(r),'wasm-port-results.json')));
    assert.equal(diagnostic.conflicts.length,1);
    assert.equal(diagnostic.status,'conflict');
  });
});

test('unchanged Git symlinks are not mistaken for source merge conflicts', () => {
  const tmp=mkdtempSync(join(tmpdir(),'eo-symlink-'));
  try {
    const a=join(tmp,'base'),b=join(tmp,'modified'),c=join(tmp,'target'),r=join(tmp,'report.json');
    initRepo(a,{'x.cpp':'base\n'});
    initRepo(b,{'x.cpp':'cryptpad\n'});
    for (const root of [a,b]) {
      const sym = spawnSync('ln',['-s','x.cpp',join(root,'alias.cpp')],{encoding:'utf8'});
      assert.equal(sym.status,0,sym.stderr);
      invoke(['git','-C',root,'add','alias.cpp']);
      invoke(['git','-C',root,'commit','-qm','add unchanged symlink']);
    }
    mkdirSync(c);writeFileSync(join(c,'x.cpp'),'base\n');
    invoke(['python3','scripts/port-wasm-changes.py',a,b,c,r]);
    invoke(['python3','scripts/apply-wasm-port.py',c,r]);
    assert.equal(readFileSync(join(c,'x.cpp'),'utf8'),'cryptpad\n');
  }finally{rmSync(tmp,{recursive:true,force:true})}
});
