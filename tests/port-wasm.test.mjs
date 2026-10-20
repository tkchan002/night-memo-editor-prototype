import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
function cmd(args){const r=spawnSync(args[0],args.slice(1),{encoding:'utf8',timeout:15000});if(r.status!==0)throw Error(`${args.join(' ')}\n${r.stderr||r.stdout}`);return r;}
function gitSetup(dir,content){mkdirSync(dir);cmd(['git','init','-q',dir]);cmd(['git','-C',dir,'config','user.email','test@example.com']);cmd(['git','-C',dir,'config','user.name','Test']);writeFileSync(join(dir,'x.cpp'),content);cmd(['git','-C',dir,'add','x.cpp']);cmd(['git','-C',dir,'commit','-qm','fixture']);}
test('port of WASM source modifications applies only where upstream context matches',()=>{
 const temp=mkdtempSync(join(tmpdir(),'eo-port-'));
 try{
  const a=join(temp,'base'),b=join(temp,'modified'),c=join(temp,'target'),r=join(temp,'report.json');
  gitSetup(a,'int x=1;\nint y=2;\nint z=3;\n');gitSetup(b,'int x=1;\nint y=200;\nint z=3;\n');
  mkdirSync(c);writeFileSync(join(c,'x.cpp'),'int x=1;\nint y=2;\nint z=3;\n');
  cmd(['python3','scripts/port-wasm-changes.py',a,b,c,r]);
  cmd(['python3','scripts/apply-wasm-port.py',c,r]);
  assert.match(readFileSync(join(c,'x.cpp'),'utf8'),/int y=200/);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
test('strict source patch refuses to overwrite changed upstream code',()=>{
 const temp=mkdtempSync(join(tmpdir(),'eo-conflict-'));
 try{
  const a=join(temp,'base'),b=join(temp,'modified'),c=join(temp,'target'),r=join(temp,'report.json');
  gitSetup(a,'int x=1;\nint y=2;\nint z=3;\n');gitSetup(b,'int x=1;\nint y=200;\nint z=3;\n');
  mkdirSync(c);writeFileSync(join(c,'x.cpp'),'int x=55;\nint y=99;\nint z=101;\n');
  cmd(['python3','scripts/port-wasm-changes.py',a,b,c,r]);
  const attempt=spawnSync('python3',['scripts/apply-wasm-port.py',c,r],{encoding:'utf8'});
  assert.notEqual(attempt.status,0);
  assert.match(readFileSync(join(c,'x.cpp'),'utf8'),/int y=99/);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
