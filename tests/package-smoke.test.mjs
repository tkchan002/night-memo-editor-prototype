import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const repo=resolve(new URL('../',import.meta.url).pathname);
function write(root,path,data) {
 const file=join(root,path); mkdirSync(resolve(file,'..'),{recursive:true});writeFileSync(file,data);
}
test('standalone Pages packaging uses project base, never rewrites nested index filename and produces gzip fallback',()=>{
 const temp=mkdtempSync(join(tmpdir(),'eurooffice-poc-'));
 try {
   const input=join(temp,'input'),output=join(temp,'output');
   for(const f of ['index.html','editor.html','history.html','LICENSE','NOTICE'])
     write(input,f,`<a href="/editor">Editor</a><script src="/assets/ui.js"></script>`);
   write(input,'assets/ui.js','const doc="/web-apps/apps/documenteditor/main/index.html";');
   write(input,'sdkjs/word/sdk-all-min.js','(function(){window.isOffline=!0;})();');
   write(input,'sdkjs/common/wasm/x2t/x2t.wasm',Buffer.from([0,97,115,109,1,0,0,0]));
   write(input,'sdkjs/common/wasm/x2t/x2t_helper.js',[
     "this.WASM_PATH = '../../../../sdkjs/common/wasm/x2t/x2t.wasm.br';",
     'var wasmPath = this.WASM_PATH;',
     'if (response.ok) return response;'
   ].join('\n'));
   write(input,'web-apps/apps/documenteditor/main/index.html','<html>Word</html>');
   write(input,'web-apps/apps/documenteditor/main/app.js','/*documenteditor/main/app/controller/Offline*/');
   write(input,'web-apps/apps/api/documents/api.js','const suffix="/index.html";');
   write(input,'sdkjs/cell/do-not-publish.txt','unused spreadsheet engine');
   for(let n=100;n<210;n++)write(input,`fonts/${n}`.padEnd(9,'0').replace('fonts/0','fonts/'),'numbered');
   const env={...process.env,GITHUB_REPOSITORY:'example/nurse-memo-eurooffice-poc'};
   const run=(script)=>spawnSync(process.execPath,[script,input,output],{cwd:repo,env,encoding:'utf8',timeout:25000});
   const p=run('scripts/package-site.mjs');
   assert.equal(p.status,0,p.stderr||p.stdout);
   const h=readFileSync(join(output,'office/editor.html'),'utf8');
   assert.match(h,/\/nurse-memo-eurooffice-poc\/office\/assets\/ui\.js/);
   assert.match(readFileSync(join(output,'office/web-apps/apps/api/documents/api.js'),'utf8'),/"\/index\.html"/);
   assert.ok(existsSync(join(output,'office/sdkjs/common/wasm/x2t/x2t.wasm.gz')));
   assert.ok(!existsSync(join(output,'office/sdkjs/cell')));
   const v=spawnSync(process.execPath,['scripts/verify-site.mjs',output],{cwd:repo,env,encoding:'utf8',timeout:25000});
   assert.equal(v.status,0,v.stderr||v.stdout);
 } finally { rmSync(temp,{recursive:true,force:true}); }
});
