import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const script = resolve('scripts/configure-embedded-theme.py');
// Reconstructed verbatim from the pinned-commit source (minus optional blank lines).
// The GitHub workflow ALSO checks against the actual pinned checkout before downloads.
const original = `import { installEditorThemeFollow, resolveEditorUiTheme } from '../editor-theme';
/**
 * Default interface theme for the editor. The v9 loader picks \`theme-white\`
 * (flat white chrome) as the light default; we prefer the classic Office look
 * (\`theme-classic-light\`, per-app coloured toolbar header). The value goes
 * through \`customization.uiTheme\`, which api.js turns into the \`uitheme=\`
 * frame parameter -- and that parameter wins over the editor's own stored
 * choice at boot. So respect a theme the user has already picked in the
 * editor (same-origin \`ui-theme-id\`) and only fall back to classic when
 * there is none, otherwise every open would reset their preference.
 */
export const DEFAULT_UI_THEME = 'theme-classic-light';
export const UI_THEME_STORAGE_KEY = 'ui-theme-id';
export function resolveUiTheme(): string {
  // Follows the site's ranui theme (dark site -> theme-dark) unless the user
  // picked a theme inside the editor; see lib/editor-theme.ts.
  return resolveEditorUiTheme(DEFAULT_UI_THEME);
}
// Keep a mounted editor in step with the site theme (top-bar switch, OS
// switch in system mode) for the page's lifetime; idempotent per module.
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  installEditorThemeFollow(DEFAULT_UI_THEME);
}
`;
const python = (flag, file) => spawnSync('python3',[script,flag,file],{encoding:'utf8'});
function fixture(callback) {
  const dir = mkdtempSync(join(tmpdir(),'euro-modern-theme-'));
  const file = join(dir,'ui-theme.ts');
  try { return callback(file); } finally {rmSync(dir,{recursive:true,force:true});}
}
test('realistic upstream theme file passes preflight and is left unchanged',()=>fixture(file=>{
 writeFileSync(file,original);
 const r=python('--check',file);
 assert.equal(r.status,0,r.stderr);
 assert.equal(readFileSync(file,'utf8'),original);
}));
test('theme change applies only to embedded editor and is idempotent',()=>fixture(file=>{
 writeFileSync(file,original);
 const r=python('--apply',file);
 assert.equal(r.status,0,r.stderr);
 const content=readFileSync(file,'utf8');
 assert.match(content,/if \(isEmbeddedEditor\(\)\) return EMBED_UI_THEME/);
 assert.match(content,/EMBED_UI_THEME = 'theme-white'/);
 assert.match(content,/if \(typeof document[^\n]+!isEmbeddedEditor\(\)\) \{/);
 assert.match(content,/return resolveEditorUiTheme\(DEFAULT_UI_THEME\)/);
 assert.equal(python('--apply',file).status,0);
 assert.equal(readFileSync(file,'utf8'),content);
}));
test('unknown upstream theme implementation fails early and does not mutate',()=>fixture(file=>{
 const changed=original.replace('return resolveEditorUiTheme(DEFAULT_UI_THEME);','return differentThemeSelector();');
 writeFileSync(file,changed);
 const r=python('--check',file);
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Expected one theme return anchor/);
 assert.equal(readFileSync(file,'utf8'),changed);
}));
test('partial theme modifications are refused without corrupting source',()=>fixture(file=>{
 const changed=original.replace("export const DEFAULT_UI_THEME = 'theme-classic-light';", "const EMBED_UI_THEME = 'theme-white';\nexport const DEFAULT_UI_THEME = 'theme-classic-light';");
 writeFileSync(file,changed);
 const r=python('--apply',file);
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Partial or unexpected theme changes/);
 assert.equal(readFileSync(file,'utf8'),changed);
}));
