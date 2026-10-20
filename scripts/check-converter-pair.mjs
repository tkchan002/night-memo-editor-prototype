/**
 * Verify that the browser converter's JS glue and WASM were built as a pair.
 * This is NOT a generic WASM magic-byte test: a valid but wrong converter is
 * exactly what produces `Import #0 "env": module is not an object` in Chrome.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { readFileSync as readConfiguration } from 'node:fs';
const buildVersions = JSON.parse(readConfiguration(new URL('./versions.json', import.meta.url), 'utf8'));

export const PINNED = Object.freeze({
  wasm: buildVersions.converter.wasmSha256,
  js: buildVersions.converter.jsSha256,
  importModule: buildVersions.converter.importModule,
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function examineConverter(wasmBytes, jsText, expected = PINNED) {
  const errors = [];
  const wasmSha256 = sha256(wasmBytes);
  const jsSha256 = sha256(Buffer.from(jsText));
  if (expected.wasm && wasmSha256 !== expected.wasm)
    errors.push(`x2t.wasm SHA-256 mismatch: ${wasmSha256} (expected ${expected.wasm})`);
  if (expected.js && jsSha256 !== expected.js)
    errors.push(`x2t.js SHA-256 mismatch: ${jsSha256} (expected ${expected.js})`);
  let importedModules = [];
  try {
    const compiled = new WebAssembly.Module(wasmBytes);
    importedModules = [...new Set(WebAssembly.Module.imports(compiled).map(x => x.module))];
    if (importedModules.length === 0) errors.push('x2t.wasm unexpectedly has no imports');
    if (importedModules.length !== 1 || importedModules[0] !== expected.importModule)
      errors.push(`x2t.wasm imports modules ${JSON.stringify(importedModules)} rather than ${JSON.stringify(expected.importModule)}`);
  } catch (error) { errors.push(`x2t.wasm compilation failed: ${error.message}`); }
  // Emscripten's generated x2t.js includes this literal module map.
  // If it is absent, the WASM may be correct but the glue is not its companion.
  const escaped = expected.importModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!(new RegExp(`var imports\\s*=\\s*\\{["']${escaped}["']\\s*:\\s*wasmImports`)).test(jsText))
    errors.push(`x2t.js does not supply the expected WebAssembly ${expected.importModule} import namespace`);
  return {ok: errors.length === 0, errors, wasmSha256, jsSha256, importedModules};
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const path = resolve(process.argv[2] || 'dist/office/sdkjs/common/wasm/x2t');
  const result = examineConverter(readFileSync(join(path, 'x2t.wasm')), readFileSync(join(path, 'x2t.js'), 'utf8'));
  if (!result.ok) { console.error('FAIL: incompatible x2t converter assets:\n' + result.errors.join('\n')); process.exitCode = 1; }
  else console.log(`PASS: x2t.js + x2t.wasm matching pinned 9.3.5-rc.1 converter package (final editor compatibility NOT guaranteed); WASM imports ${result.importedModules.join(', ')}; SHA256 ${result.wasmSha256}`);
}
