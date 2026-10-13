import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const file = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('new repo has complete entry points and Pages workflow', () => {
  for (const name of ['index.html','vite.config.js','src/main.js','src/document-model.js','src/styles.css','.github/workflows/deploy.yml','README.md']) assert.ok(existsSync(new URL(`../${name}`, import.meta.url)), name);
  assert.match(file('vite.config.js'),/base:\s*'\.\/'/);
  assert.match(file('.github/workflows/deploy.yml'),/npm run build/);
  assert.match(file('index.html'),/src\/main\.js/);
});
test('prototype does not connect to production databases or fake printing', () => {
  const main = file('src/main.js');
  assert.doesNotMatch(main, /supabase\.co|createClient\(|service_role/);
  assert.match(main, /command\.executePrint\(/);
  assert.match(main, /from '@hufe921\/canvas-editor'/);
});
test('editor and vite versions are pinned', () => {
  const p = JSON.parse(file('package.json'));
  assert.equal(p.dependencies['@hufe921/canvas-editor'], '1.0.5');
  assert.equal(p.devDependencies.vite, '7.1.3');
});
