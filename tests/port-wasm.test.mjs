import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, statSync, symlinkSync, readlinkSync} from 'node:fs';
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

// Real Git mode-120000 fixtures: the old tests covered only symlinks whose Git
// objects were unchanged. These exercise the production failure's changed-link
// branch, including safety, idempotence and conflicts.
function initRepoWithLinks(path, files, links={}) {
  initRepo(path, files);
  for (const [name, link] of Object.entries(links)) {
    mkdirSync(dirname(join(path, name)), {recursive: true});
    symlinkSync(link, join(path, name));
  }
  if (Object.keys(links).length) {
    invoke(['git','-C',path,'add','-A']);
    invoke(['git','-C',path,'commit','-qm','track symlinks']);
  }
}
function linkScenario({base={},mod={},official={},baseLinks={},modLinks={},officialLinks={}}, fn, portShouldSucceed=true) {
  const tmp=mkdtempSync(join(tmpdir(),'eo-link-'));
  try {
    const a=join(tmp,'base'),b=join(tmp,'modified'),c=join(tmp,'target'),r=join(tmp,'report.json');
    initRepoWithLinks(a, base, baseLinks);
    initRepoWithLinks(b, mod, modLinks);
    mkdirSync(c);
    for (const [file, content] of Object.entries(official)) {
      mkdirSync(dirname(join(c,file)), {recursive:true});
      writeFileSync(join(c,file),content);
    }
    for (const [name, link] of Object.entries(officialLinks)) {
      mkdirSync(dirname(join(c,name)), {recursive:true});
      symlinkSync(link,join(c,name));
    }
    const port=invoke(['python3','scripts/port-wasm-changes.py',a,b,c,r],false);
    if (portShouldSucceed) assert.equal(port.status,0,port.stderr+'\n'+port.stdout);
    return fn({tmp,a,b,c,r,port,apply:()=>invoke(['python3','scripts/apply-wasm-port.py',c,r],false)});
  } finally {rmSync(tmp,{recursive:true,force:true});}
}

const boostLink='Common/3dParty/boost/tools/1.72/arm64-linux-dynamic';
const boostFile='Common/3dParty/boost/tools/1.72/x64-linux-dynamic/Makefile';

test('REGRESSION: changed pinned CryptPad ARM64 boost symlink is staged and applied safely', () => {
  const base={'X2tConverter/main.cpp':'before\n',[boostFile]:'all:\n'};
  const mod={'X2tConverter/main.cpp':'wasm\n',[boostFile]:'all:\n'};
  linkScenario({base,mod,official:base,modLinks:{[boostLink]:'x64-linux-dynamic/'}},({c,r,apply})=>{
    const manifest=JSON.parse(readFileSync(r,'utf8'));
    assert.equal(manifest.format,3);
    assert.deepEqual(manifest.links,[boostLink]);
    assert.equal(manifest.linkTargets[boostLink].cryptpad,'x64-linux-dynamic/');
    assert.equal(apply().status,0);
    assert.equal(readlinkSync(join(c,boostLink)),'x64-linux-dynamic/');
    assert.equal(readFileSync(join(c,'X2tConverter/main.cpp'),'utf8'),'wasm\n');
    const result=JSON.parse(readFileSync(join(tmpdirPlaceholder(r),'wasm-port-results.json')));
    assert.equal(result.symlinkChangesPlanned,1);
  });
});
function tmpdirPlaceholder(reportPath){return dirname(reportPath);}

test('changed symlink can be already present in official source and rerun idempotently',()=>{
  linkScenario({base:{'wasm.cpp':'old\n'},mod:{'wasm.cpp':'new\n'},official:{'wasm.cpp':'new\n'},
    modLinks:{'src/link':'dest/'},officialLinks:{'src/link':'dest/'}},({c,r,apply})=>{
    assert.equal(apply().status,0);
    assert.equal(apply().status,0);
    assert.equal(readlinkSync(join(c,'src/link')),'dest/');
    assert.ok(JSON.parse(readFileSync(join(dirname(r),'wasm-port-results.json'))).alreadyPresent.includes('src/link'));
  });
});

test('safe relative symlink retarget is applied from exact original target',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    baseLinks:{'tools/link':'old/'},modLinks:{'tools/link':'new/'},officialLinks:{'tools/link':'old/'}},({c,apply})=>{
    assert.equal(apply().status,0);
    assert.equal(readlinkSync(join(c,'tools/link')),'new/');
  });
});

test('safe symlink deletion applies, and is idempotent',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    baseLinks:{'tools/link':'x/'},officialLinks:{'tools/link':'x/'}},({c,apply})=>{
    assert.equal(apply().status,0);
    assert.equal(existsSync(join(c,'tools/link')),false);
    assert.equal(apply().status,0);
  });
});

test('independently changed symlink conflicts without partially applying regular files',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    baseLinks:{'tools/link':'old/'},modLinks:{'tools/link':'new/'},officialLinks:{'tools/link':'fork/'}},({c,r,apply})=>{
    const p=apply();
    assert.notEqual(p.status,0);
    assert.match(p.stderr,/CONFLICT tools\/link/);
    assert.equal(readlinkSync(join(c,'tools/link')),'fork/');
    assert.equal(readFileSync(join(c,'f.cpp'),'utf8'),'a\n');
    assert.equal(JSON.parse(readFileSync(join(dirname(r),'wasm-port-results.json'))).status,'conflict');
  });
});

test('official regular file at a proposed link path conflicts; never overwritten',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n','tools/link':'official\n'},
    modLinks:{'tools/link':'x/'}},({c,apply})=>{
    assert.notEqual(apply().status,0);
    assert.equal(readFileSync(join(c,'tools/link'),'utf8'),'official\n');
    assert.equal(readFileSync(join(c,'f.cpp'),'utf8'),'a\n');
  });
});

test('changed regular file cannot overwrite an unexpected official symlink',()=>{
  linkScenario({base:{'f.cpp':'old\n'},mod:{'f.cpp':'new\n'},official:{},
    officialLinks:{'f.cpp':'other-file'}},({c,r,apply})=>{
    assert.notEqual(apply().status,0);
    assert.equal(readlinkSync(join(c,'f.cpp')),'other-file');
    assert.equal(JSON.parse(readFileSync(join(dirname(r),'wasm-port-results.json'))).status,'conflict');
  });
});

test('file-to-symlink Git type changes still require explicit human review',()=>{
  linkScenario({base:{'link':'old\n','f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'link':'old\n'},
    modLinks:{'link':'f.cpp'}},({port})=>{
    assert.notEqual(port.status,0);
    assert.match(port.stderr,/File\/symlink type change requires manual review/);
  },false);
});

test('symlink-to-file Git type changes still require explicit human review',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n','link':'replaced\n'},official:{'f.cpp':'a\n'},
    baseLinks:{'link':'f.cpp'}},({port})=>{
    assert.notEqual(port.status,0);
    assert.match(port.stderr,/File\/symlink type change requires manual review/);
  },false);
});

test('source symlink attempting to escape using relative traversal is refused at staging',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    modLinks:{'sub/link':'../../../etc/passwd'}},({port})=>{
    assert.notEqual(port.status,0);
    assert.match(port.stderr,/Symlink escapes source tree/);
  },false);
});

test('absolute source symlink is refused at staging',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    modLinks:{'sub/link':'/etc/passwd'}},({port})=>{
    assert.notEqual(port.status,0);
    assert.match(port.stderr,/Unsafe symlink target/);
  },false);
});

test('legitimate symlink using .. within source tree is allowed',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    modLinks:{'sub/link':'../f.cpp'}},({c,apply})=>{
    assert.equal(apply().status,0);
    assert.equal(readlinkSync(join(c,'sub/link')),'../f.cpp');
  });
});

test('preexisting parent directory symlink blocks modifications beneath it',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'eo-parent-'));
  try {
    const a=join(tmp,'base'),b=join(tmp,'modified'),c=join(tmp,'target'),r=join(tmp,'report.json');
    initRepo(a,{'dir/f.cpp':'a\n'});initRepo(b,{'dir/f.cpp':'b\n'});
    mkdirSync(c);mkdirSync(join(tmp,'external'));
    symlinkSync(join(tmp,'external'),join(c,'dir'));
    invoke(['python3','scripts/port-wasm-changes.py',a,b,c,r]);
    const res=invoke(['python3','scripts/apply-wasm-port.py',c,r],false);
    assert.notEqual(res.status,0);
    assert.match(res.stderr,/Unexpected symlink within core source/);
    assert.equal(existsSync(join(tmp,'external','f.cpp')),false);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('a relative source link resolving outside via intermediate symlink is refused',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'eo-chain-'));
  try {
    const a=join(tmp,'base'),b=join(tmp,'modified'),c=join(tmp,'target'),r=join(tmp,'report.json');
    initRepo(a,{'f.cpp':'a\n'});
    initRepoWithLinks(b,{'f.cpp':'b\n'},{'sub/link':'redirect/f.txt'});
    symlinkSync('/etc',join(b,'sub','redirect'));
    mkdirSync(c);
    const result=invoke(['python3','scripts/port-wasm-changes.py',a,b,c,r],false);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/resolves outside source tree/);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('missing official link conflicts if upstream baseline expected it to exist',()=>{
  linkScenario({base:{'f.cpp':'a\n'},mod:{'f.cpp':'b\n'},official:{'f.cpp':'a\n'},
    baseLinks:{'tools/link':'before'},modLinks:{'tools/link':'after'}},({c,apply})=>{
    assert.notEqual(apply().status,0);
    assert.equal(readFileSync(join(c,'f.cpp'),'utf8'),'a\n');
  });
});
