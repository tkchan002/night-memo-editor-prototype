import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const verifier = join(process.cwd(), 'scripts/verify-git-tag-checkout.sh');
const tag = 'v9.3.0.140';
function run(...args) {
  return spawnSync(args[0], args.slice(1), {encoding:'utf8', timeout:20000});
}
function git(...args) {
  const r = run('git', ...args);
  assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}
function fixture(callback) {
  const dir = mkdtempSync(join(tmpdir(),'eo-tags-'));
  try {
    const source = join(dir,'source'), checkout=join(dir,'checkout');
    mkdirSync(source);
    git('init','-q',source);
    git('-C',source,'config','user.email','test@example.com');
    git('-C',source,'config','user.name','Test');
    writeFileSync(join(source,'source.cpp'),'stable\n');
    git('-C',source,'add','.');
    git('-C',source,'commit','-qm','release');
    const pinned = git('-C',source,'rev-parse','HEAD');
    git('-C',source,'tag',tag);
    git('clone','-q','--depth','1','--branch',tag,`file://${source}`,checkout);
    return callback({source,checkout,pinned});
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
function verify(checkout, pinned, useTag=tag) {
  return run('bash',verifier,checkout,useTag,pinned);
}

test('accepts the exact shallow-cloned, lightweight release tag by commit SHA', () => {
  fixture(({checkout,pinned})=>{
    const result=verify(checkout,pinned);
    assert.equal(result.status,0, result.stdout+'\n'+result.stderr);
    assert.match(result.stdout,/Verified exact tag checkout/);
    assert.match(result.stdout,new RegExp(pinned));
  });
});

test('accepts the selected tag even if a different annotated tag names the same commit',()=>{
  fixture(({checkout,pinned})=>{
    git('-C',checkout,'config','user.email','test@example.com');
    git('-C',checkout,'config','user.name','Test');
    git('-C',checkout,'tag','-a','v-alias-tag','-m','alias');
    const result=verify(checkout,pinned);
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  });
});

test('accepts annotated selected tags via peeled commit, not the tag-object SHA',()=>{
  fixture(({checkout,pinned})=>{
    git('-C',checkout,'config','user.email','test@example.com');
    git('-C',checkout,'config','user.name','Test');
    git('-C',checkout,'tag','-d',tag);
    git('-C',checkout,'tag','-a',tag,'-m','same tagged commit');
    const result=verify(checkout,pinned);
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  });
});

test('rejects missing selected tag even when HEAD is the pinned commit',()=>{
  fixture(({checkout,pinned})=>{
    git('-C',checkout,'tag','-d',tag);
    const result=verify(checkout,pinned);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/tag refs\/tags\/v9\.3\.0\.140 is not present/);
  });
});

test('rejects an unexpected checkout HEAD despite the expected tag still being present',()=>{
  fixture(({checkout,pinned})=>{
    git('-C',checkout,'config','user.email','test@example.com');
    git('-C',checkout,'config','user.name','Test');
    writeFileSync(join(checkout,'source.cpp'),'new version\n');
    git('-C',checkout,'add','.');
    git('-C',checkout,'commit','-qm','different HEAD');
    const result=verify(checkout,pinned);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/HEAD does not match/);
  });
});

test('rejects a tag moved to a different commit even when checkout matches moved tag',()=>{
  fixture(({checkout,pinned})=>{
    git('-C',checkout,'config','user.email','test@example.com');
    git('-C',checkout,'config','user.name','Test');
    writeFileSync(join(checkout,'source.cpp'),'retagged\n');
    git('-C',checkout,'add','.');
    git('-C',checkout,'commit','-qm','new release');
    git('-C',checkout,'tag','-f',tag);
    const result=verify(checkout,pinned);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/independently verified pinned commit/);
  });
});

test('rejects modifications to tracked files after the correct checkout',()=>{
  fixture(({checkout,pinned})=>{
    appendFileSync(join(checkout,'source.cpp'),'uncommitted change\n');
    const result=verify(checkout,pinned);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/tracked source files were modified/);
  });
});

test('rejects a malformed tag name and an invalid expected SHA',()=>{
  fixture(({checkout,pinned})=>{
    let r=verify(checkout,pinned,'../../some-other-ref');
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/Invalid source tag name/);
    r=verify(checkout,'aabbcc');
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/full lowercase 40-character/);
  });
});
