import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const script=join(root,'scripts/prepare-recipe.py');
function evaluate(text) {
 return spawnSync('python3',['-c',
  `import importlib.util; s=importlib.util.spec_from_file_location('adapter',${JSON.stringify(script)}); x=importlib.util.module_from_spec(s); s.loader.exec_module(x); print(x.build_recipe(${JSON.stringify(text)}))`],
  {cwd:root,encoding:'utf8',timeout:10000});
}
const fixture='FROM ubuntu:22.04 AS base\nFROM base AS html\nFROM base AS fb2file\nCOPY --from=gumbo /gumbo-parser /gumbo-parser\nFROM base AS build\nCOPY core /core\n';
test('recipe adapter adds only an explicitly documented dependency and artifact export',()=>{
 const p=evaluate(fixture);assert.equal(p.status,0,p.stderr);
 assert.match(p.stdout,/FROM html AS gumbo/);
 assert.match(p.stdout,/emconfigure \.\/configure --disable-shared/);
 assert.match(p.stdout,/FROM scratch AS eurooffice-converter-export/);
 assert.match(p.stdout,/COPY --from=build \/core\/build\/bin\/linux_64\/x2t\.wasm/);
 assert.doesNotMatch(p.stdout,/COPY --from=cryptpad/);
});
test('recipe change fails closed rather than silently rewriting unrelated Dockerfile',()=>{
 const p=evaluate('FROM ubuntu AS base\nFROM base AS build\nCOPY core /core\n');
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/Gumbo dependency changed/);
});
test('original source port/merge pipeline is absent from build and workflow',()=>{
 const builder=readFileSync(join(root,'scripts/build-matching-wasm.sh'),'utf8');
 const workflow=readFileSync(join(root,'.github/workflows/eurooffice-first-wasm.yml'),'utf8');
 for (const content of [builder,workflow]) {
   assert.doesNotMatch(content,/apply-wasm-port|port-wasm-changes|preflight-wasm-port/);
 }
 assert.match(builder,/stage-official-core\.py/);
 assert.match(builder,/rm -rf "\$RECIPE\/core"/);
 assert.match(builder,/official-core-commit\.txt/);
 assert.match(workflow,/Prepare|Compile release-matched x2t/);
 assert.ok(workflow.indexOf('Compile release-matched x2t')<workflow.indexOf('Identify official AMD64 Debian package'));
 assert.match(workflow,/eurooffice-first-build-diagnostics/);
});

test('compiled binary manifest refuses source provenance not from EuroOffice',()=>{
 const m=readFileSync(join(root,'scripts/create-converter-manifest.mjs'),'utf8');
 assert.match(m,/official-eurooffice-first/);
 assert.match(m,/sourceMode/);
 assert.match(m,/buildRecipeDockerSha256/);
});
