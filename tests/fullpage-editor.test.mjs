import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isDocxHeader, isPdfHeader, safeStem, downloadName, messageFromEditor } from '../site/editor-core.mjs';

const base = new URL('../', import.meta.url);
const text = file => readFileSync(new URL(file, base), 'utf8');

test('full-page editor is viewport-contained, not a sidebar prototype', () => {
  const html = text('site/index.html');
  const css = text('site/app.css');
  assert.match(html, /<main class="workspace"/);
  assert.match(html, /<iframe id="editor"/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.workspace\s*\{[^}]*flex:\s*1/s);
  assert.doesNotMatch(html, /(?:Diagnostic events|Check deployed converter assets|Test permissions|test controls)/i);
});

test('Word-like file operations are real bridge calls, not simulated toolbar buttons', () => {
  const js = text('site/app.js');
  for (const value of [
    'document:open-buffer', 'document:save', 'document:opened', 'document:saved',
    "'DOCX'", "'PDF'", "newDocument(true)", "./blank.docx",
    "./office/editor.html", "embedOrigin", "verifyConverter()", "messageFromEditor(event",
  ]) assert.ok(js.includes(value),`Missing: ${value}`);
  assert.doesNotMatch(js, /method:\s*['"](?:POST|PUT|PATCH)['"]/i);
  assert.doesNotMatch(js, /supabase\.co|indexedDB|localStorage\.setItem/);
});

test('blank document is a real, well-formed OOXML DOCX file', () => {
  const file = new URL('../site/blank.docx', import.meta.url);
  assert.ok(statSync(file).size > 1000);
  assert.ok(isDocxHeader(readFileSync(file)));
  const result = spawnSync('python3', ['-c',
    'from zipfile import ZipFile; import sys; z=ZipFile(sys.argv[1]); names=set(z.namelist()); assert {"word/document.xml","[Content_Types].xml","_rels/.rels"}<=names; assert b"<w:body>" in z.read("word/document.xml")',
    file.pathname], {encoding:'utf8', timeout: 10000});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('safe file names preserve legitimate titles and reject invalid filesystem punctuation', () => {
  assert.equal(safeStem('Nursing memo.docx'), 'Nursing memo');
  assert.equal(downloadName('October report', 'docx'), 'October report.docx');
  assert.equal(downloadName('繁體中文 / TEST?.docx', 'pdf'), '繁體中文  TEST.pdf');
  assert.equal(downloadName('  .. ', 'docx'), 'Untitled document.docx');
  assert.throws(() => downloadName('demo', 'exe'), /Unsupported/);
});

test('file signatures reject disguised or incomplete documents', () => {
  assert.ok(isDocxHeader(new Uint8Array([0x50, 0x4b, 3, 4])));
  assert.ok(!isDocxHeader(new Uint8Array([0x50, 0x44, 0x46, 0x2d])));
  assert.ok(!isDocxHeader(new Uint8Array([0x50, 0x4b])));
  assert.ok(isPdfHeader(new TextEncoder().encode('%PDF-1.7')));
  assert.ok(!isPdfHeader(new TextEncoder().encode('PK\x03\x04')));
});

test('iframe messages are origin- and source-checked before reading response payloads', () => {
  const child = {};
  const msg = { origin:'https://host.test', source:child, data:{type:'document:opened'} };
  assert.deepEqual(messageFromEditor(msg,'https://host.test', child),msg.data);
  assert.equal(messageFromEditor({...msg,origin:'https://other.test'},'https://host.test',child),null);
  assert.equal(messageFromEditor({...msg,source:{}},'https://host.test',child),null);
  assert.equal(messageFromEditor({...msg,data:{type:'not-a-document'}},'https://host.test',child),null);
});
