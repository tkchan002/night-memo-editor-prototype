/**
 * Full-window EuroOffice Word editor, based on the validated v9.3.5 embed bridge.
 * Documents remain in the browser: opening reads a local File and Save/Export
 * downloads a generated File. Nurse Memo / Supabase persistence is NOT wired here.
 * The host deliberately relies on the editor's own ribbon for formatting.
 */
import { isDocxHeader, isPdfHeader, safeStem, downloadName, messageFromEditor } from './editor-core.mjs';

const $ = id => document.getElementById(id);
const frame = $('editor');
const editorUrl = new URL('./office/editor.html', location.href);
editorUrl.searchParams.set('embed', '1');
editorUrl.searchParams.set('embedOrigin', location.origin);
editorUrl.searchParams.set('locale', 'en');
const editorOrigin = editorUrl.origin;
let ready = false;
let hasDocument = false;
let dirty = false;
let pending = null;
let serial = 0;
let documentStem = 'Untitled document';
let converterCheckPromise = null;
let converterVerified = false;

function setStatus(message, kind = '') {
  const status = $('saveStatus');
  status.textContent = message;
  status.className = `documentSubtitle ${kind}`;
}
function setLoading(title, detail, failed = false) {
  $('loadingTitle').textContent = title;
  $('loadingDetail').textContent = detail;
  $('loading').hidden = false;
  $('retry').hidden = !failed;
}
function refresh() {
  const blocked = !ready || !!pending;
  $('new').disabled = blocked;
  $('open').disabled = blocked;
  $('docx').disabled = blocked || !hasDocument;
  $('pdf').disabled = blocked || !hasDocument;
  $('documentTitle').disabled = !hasDocument;
}
function send(type, payload = {}, waitFor = '') {
  if (!ready) return Promise.reject(new Error('Editor has not reported ready'));
  if (pending) return Promise.reject(new Error('Another document operation is in progress'));
  const id = `word-${++serial}`;
  if (!waitFor) {
    frame.contentWindow.postMessage({ id, type, payload }, editorOrigin);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending?.id !== id) return;
      pending = null;
      refresh();
      reject(new Error(`${type}: the editor did not respond within 200 seconds`));
    }, 200000);
    pending = { id, waitFor, resolve, reject, timer };
    refresh();
    frame.contentWindow.postMessage({ id, type, payload }, editorOrigin);
  });
}
async function digestSha256(buffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
async function verifyAsset(path, hash, decompress = false) {
  const url = new URL(`./office/sdkjs/common/wasm/x2t/${path}`, location.href);
  url.searchParams.set('v', hash.slice(0, 16));
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`The document converter could not load (${path}: HTTP ${response.status})`);
  let buffer;
  if (decompress) {
    if (typeof DecompressionStream !== 'function' || !response.body)
      throw new Error('This browser cannot verify the compressed document converter');
    buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  } else buffer = await response.arrayBuffer();
  if (await digestSha256(buffer) !== hash)
    throw new Error(`The deployed ${path} does not match the verified converter. Rebuild or clear the website cache.`);
}
async function verifyConverter() {
  if (converterVerified) return;
  if (converterCheckPromise) return converterCheckPromise;
  converterCheckPromise = (async () => {
    const url = new URL('./office/eurooffice-poc-build.json', location.href);
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error('The deployment metadata is unavailable');
    const meta = await res.json();
    if (!/^[a-f0-9]{64}$/.test(meta.converterJsSha256 || '') ||
        !/^[a-f0-9]{64}$/.test(meta.converterWasmSha256 || ''))
      throw new Error('The deployed converter integrity metadata is invalid');
    await verifyAsset('x2t.js', meta.converterJsSha256);
    // The existing raw WASM loader supports browsers without DecompressionStream.
    // Do not break that compatibility by requiring the gzip verification probe.
    if (typeof DecompressionStream === 'function')
      await verifyAsset('x2t.wasm.gz', meta.converterWasmSha256, true);
    else
      await verifyAsset('x2t.wasm', meta.converterWasmSha256);
    converterVerified = true;
  })();
  try { await converterCheckPromise; }
  finally { converterCheckPromise = null; }
}
function beginDownload(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}
function confirmReplace() {
  return !dirty || window.confirm('This document has unsaved changes. Opening a different document will discard them. Download a DOCX first if you want to keep your changes. Continue?');
}
function chooseName(stem) {
  documentStem = safeStem(stem);
  $('documentTitle').value = documentStem;
  document.title = `${documentStem} — EuroOffice`;
}
async function openBuffer(buffer, filename) {
  if (!isDocxHeader(buffer)) throw new Error('This file does not appear to be a valid DOCX document');
  await send('document:open-buffer', { buffer, fileName: filename, readonly: false }, 'document:opened');
  hasDocument = true;
  dirty = false;
  chooseName(filename);
  $('loading').hidden = true;
  setStatus('Ready to edit');
  refresh();
}
async function newDocument(skipConfirm = false) {
  if (!skipConfirm && !confirmReplace()) return;
  setStatus('Opening a blank document…');
  if (!hasDocument) setLoading('Opening document editor', 'Preparing a blank Word document…');
  try {
    await verifyConverter();
    const response = await fetch(new URL('./blank.docx', location.href));
    if (!response.ok) throw new Error(`Blank document template missing (HTTP ${response.status})`);
    const buffer = await response.arrayBuffer();
    await openBuffer(buffer, 'Untitled document.docx');
  } catch (error) { handleError('New document', error, !hasDocument); }
}
async function openFile(file) {
  if (!file) return;
  if (!/\.docx$/i.test(file.name)) { handleError('Open', new Error('Select a .docx Word file')); return; }
  if (!confirmReplace()) return;
  setStatus(`Opening ${file.name}…`);
  if (!hasDocument) setLoading('Opening your document', file.name);
  try {
    await verifyConverter();
    const buffer = await file.arrayBuffer();
    await openBuffer(buffer, file.name);
  } catch (error) { handleError('Open', error, !hasDocument); }
}
async function exportDocument(format) {
  const lower = format.toLowerCase();
  try {
    setStatus(`Preparing ${format}…`);
    const payload = await send('document:save', { targetExt: format }, 'document:saved');
    if (!(payload.file instanceof Blob)) throw new Error('The editor did not return a document file');
    const head = new Uint8Array(await payload.file.slice(0, 5).arrayBuffer());
    if (format === 'DOCX' && !isDocxHeader(head)) throw new Error('The exported DOCX has an invalid file signature');
    if (format === 'PDF' && !isPdfHeader(head)) throw new Error('The exported PDF has an invalid file signature');
    beginDownload(payload.file, downloadName($('documentTitle').value, lower));
    // The browser cannot confirm where the downloaded file was written.
    // Never claim the document has been saved in Nurse Memo or Supabase.
    setStatus(`${format} download started${dirty ? ' · Unsaved changes remain in the editor' : ''}`, dirty ? 'modified' : '');
  } catch (error) { handleError(`${format} download`, error); }
  finally { refresh(); }
}
function handleError(label, error, showRetry = false) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`EuroOffice: ${label}`, error);
  setStatus(`${label} failed: ${message}`, 'error');
  if (showRetry) setLoading('Could not open the document', message, true);
  refresh();
}
function run(task) { Promise.resolve().then(task).catch(e => handleError('Document operation', e)); }

window.addEventListener('message', event => {
  const data = messageFromEditor(event, editorOrigin, frame.contentWindow);
  if (!data) return;
  const { type, id, payload = {} } = data;
  if (type === 'document:ready') {
    if (ready) return;
    ready = true;
    refresh();
    run(() => newDocument(true));
    return;
  }
  if (type === 'document:modified' || type === 'document:dirty-changed') {
    if (hasDocument && (type === 'document:modified' || payload.dirty === true)) {
      dirty = true;
      setStatus('Unsaved changes', 'modified');
    }
    return;
  }
  // The embedded editor Save and Ctrl/Cmd+S use the existing upstream Save
  // event. They must download rather than silently dropping the returned file.
  if (type === 'document:saved' && payload.userInitiated && !id) {
    run(async () => {
      if (!(payload.file instanceof Blob)) throw new Error('No document was returned from the editor');
      // The native Office ribbon also supports Download As. Preserve its real
      // format rather than giving a PDF file an incorrect .docx extension.
      const head = new Uint8Array(await payload.file.slice(0, 5).arrayBuffer());
      const format = isDocxHeader(head) ? 'docx' : isPdfHeader(head) ? 'pdf' : null;
      if (!format) throw new Error('The editor returned an unrecognized DOCX/PDF file');
      beginDownload(payload.file, downloadName($('documentTitle').value, format));
      setStatus(`${format.toUpperCase()} download started`, dirty ? 'modified' : '');
    });
    return;
  }
  if (!pending || pending.id !== id) {
    if (type === 'document:error') console.error('EuroOffice editor:', payload.message);
    return;
  }
  const request = pending;
  if (type !== 'document:error' && type !== request.waitFor) return;
  clearTimeout(request.timer);
  pending = null;
  refresh();
  if (type === 'document:error') request.reject(new Error(payload.message || 'The editor reported an error'));
  else request.resolve(payload);
});

$('new').addEventListener('click', () => run(() => newDocument()));
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => {
  const file = event.target.files?.[0];
  event.target.value = ''; // Selecting the same DOCX again must still work.
  if (file) run(() => openFile(file));
});
$('docx').addEventListener('click', () => run(() => exportDocument('DOCX')));
$('pdf').addEventListener('click', () => run(() => exportDocument('PDF')));
$('retry').addEventListener('click', () => run(() => newDocument(true)));
$('documentTitle').addEventListener('change', () => chooseName($('documentTitle').value));
$('documentTitle').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); $('documentTitle').blur(); }
});
window.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  if (event.key.toLowerCase() === 'o' && ready && !pending) {
    event.preventDefault(); $('file').click();
  }
  // Ctrl+S/Cmd+S are handled by the embedded EuroOffice ribbon and its Save bridge.
});
// A lightweight safeguard, not a replacement for planned Nurse Memo autosave.
window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = true;
});

// Overlay file drop is handled at the top-level so files cannot accidentally
// navigate away from the app when dropped outside the embedded editor.
function draggedFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
window.addEventListener('dragover', event => {
  if (!draggedFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  $('dropOverlay').hidden = false;
});
window.addEventListener('dragleave', event => {
  if (!event.relatedTarget) $('dropOverlay').hidden = true;
});
window.addEventListener('drop', event => {
  if (!draggedFiles(event)) return;
  event.preventDefault();
  $('dropOverlay').hidden = true;
  if (event.dataTransfer.files?.length) run(() => openFile(event.dataTransfer.files[0]));
});
frame.addEventListener('load', () => {
  if (!ready) setStatus('Initializing editor…');
});
refresh();
frame.src = editorUrl.href;
