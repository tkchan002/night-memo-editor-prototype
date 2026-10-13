import Editor, { EDITOR_COMPONENT, EditorComponent } from '@hufe921/canvas-editor';
import './styles.css';
import { freshSource } from './mock-data.js';
import {
  FORMAT_VERSION, buildInitialDocument, reconcileGeneratedCells,
  validateDraft, findGeneratedCells, manualContentFingerprint
} from './document-model.js';

const STORAGE_KEY = 'night-memo-editor-prototype-v1';
const el = id => document.getElementById(id);
const initialSource = freshSource();
const initial = buildInitialDocument(initialSource);
let source = initialSource;
let lastGenerated = initial.generated;
let revision = 0;
let dirty = false;
let suppressChange = false;
let editor;

function status(message, kind = 'normal') {
  el('document-status').textContent = message;
  el('document-status').dataset.kind = kind;
}
function setDirty(value) {
  dirty = value;
  el('save-status').textContent = dirty ? 'Unsaved changes' : 'Saved locally';
  el('save-status').dataset.dirty = String(dirty);
}
function currentDocument() {
  const value = editor.command.getValue();
  if (!value?.data || !Array.isArray(value.data.main)) throw new Error('Could not read document from Canvas Editor.');
  return value.data;
}
function withEditor(fn) {
  try { fn(); } catch (error) { console.error(error); status(error.message || 'Operation failed', 'error'); }
}
function snapshotDraft() {
  return {
    kind: 'night-memo-prototype', version: FORMAT_VERSION,
    revision, savedAt: new Date().toISOString(),
    source: structuredClone(source), generated: structuredClone(lastGenerated),
    document: currentDocument()
  };
}
function persist() {
  const draft = snapshotDraft();
  validateDraft(draft);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setDirty(false);
    status('Draft saved in this browser (demo data only)', 'success');
  } catch (error) {
    status('Local save failed. Use Export JSON instead. ' + error.message, 'error');
  }
}
function showSource() {
  const ward = source.wards.find(w => w.id === 'F10');
  el('pm-input').value = String(ward.pmAdmissions);
  el('night-input').value = String(ward.nightAdmissions);
  el('combined-total').textContent = String(ward.pmAdmissions + ward.nightAdmissions);
}
function applyDraft(draft) {
  validateDraft(draft);
  suppressChange = true;
  try {
    editor.command.executeSetValue(draft.document);
    source = structuredClone(draft.source);
    lastGenerated = structuredClone(draft.generated);
    revision = draft.revision || 0;
    showSource();
    setDirty(false);
  } finally { suppressChange = false; }
}
function saveFile(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function readValidCount(field) {
  const n = Number(el(field).value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 9999 || el(field).value.trim() === '') throw new Error('PM/Night figures must be whole numbers from 0 to 9999.');
  return n;
}
function reconcile() {
  const nextSource = structuredClone(source);
  const ward = nextSource.wards.find(w => w.id === 'F10');
  ward.pmAdmissions = readValidCount('pm-input');
  ward.nightAdmissions = readValidCount('night-input');
  const current = currentDocument();
  const before = manualContentFingerprint(current);
  const outcome = reconcileGeneratedCells(current, lastGenerated, nextSource);
  if (manualContentFingerprint(outcome.document) !== before) throw new Error('Manual-content integrity check failed; update cancelled.');
  // Replacing editor data can reset selection/undo history. This is a known
  // prototype limitation, documented in README; do not claim cursor preservation.
  suppressChange = true;
  try { editor.command.executeSetValue(outcome.document); }
  finally { suppressChange = false; }
  source = nextSource;
  lastGenerated = outcome.generated;
  revision += 1;
  showSource();
  setDirty(true);
  const count = outcome.preservedOverrides.length;
  el('regen-result').textContent = `Updated ${outcome.updated} linked cell(s). ${count} manually changed cell(s) preserved. Your narrative was not replaced. Save draft when ready.`;
  status(count ? 'Manual corrections preserved — review generated figures' : 'Generated cells refreshed; manual paragraphs preserved', 'success');
}
function runCommand(name) {
  const c = editor.command;
  const commands = {
    bold: () => c.executeBold(), italic: () => c.executeItalic(), underline: () => c.executeUnderline(),
    clear: () => c.executeFormat(),
    left: () => c.executeRowFlex('left'), center: () => c.executeRowFlex('center'), right: () => c.executeRowFlex('right'),
    bullets: () => c.executeList('ul'), numbers: () => c.executeList('ol'),
    undo: () => c.executeUndo(), redo: () => c.executeRedo(),
    table: () => c.executeInsertTable(3, 3), pageBreak: () => c.executePageBreak(),
    a4: () => { c.executePaperSize(794, 1123); c.executeSetPaperMargin([72, 68, 72, 68]); },
    print: () => c.executePrint()
  };
  if (!commands[name]) throw new Error('Unsupported toolbar action');
  commands[name]();
}
function initialize() {
  document.querySelector('#ribbon').setAttribute(EDITOR_COMPONENT, EditorComponent.MENU);
  // Vite bundles a real Canvas Editor installation; there is no fake fallback.
  editor = new Editor(el('editor'), initial.document, {
    locale: 'en', defaultFont: 'Arial', defaultSize: 12,
    width: 794, height: 1123, margins: [72, 68, 72, 68],
    pageGap: 20, printPixelRatio: 2, pageMode: 'pagination'
  });
  editor.listener.contentChange = () => { if (!suppressChange) setDirty(true); };
  editor.listener.pageSizeChange = number => { el('document-status').textContent = `${number} page(s) • A4`; };
  for (const btn of document.querySelectorAll('[data-cmd]')) {
    btn.addEventListener('click', () => withEditor(() => runCommand(btn.dataset.cmd)));
  }
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const item of document.querySelectorAll('[data-tab]')) {
        const selected = item === tab;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-selected', String(selected));
      }
      for (const panel of document.querySelectorAll('[data-panel]')) panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.tab);
    });
  }
  el('font').addEventListener('change', ev => withEditor(() => editor.command.executeFont(ev.target.value)));
  el('font-size').addEventListener('change', ev => withEditor(() => editor.command.executeSize(Number(ev.target.value))));
  el('save').addEventListener('click', () => withEditor(persist));
  el('reopen').addEventListener('click', () => withEditor(() => {
    if (dirty && !confirm('Discard unsaved changes and reopen the last locally saved draft?')) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('No saved draft found. Save first.');
    applyDraft(JSON.parse(raw)); status('Last saved draft reopened', 'success');
  }));
  el('download').addEventListener('click', () => withEditor(() => { saveFile('night-memo-prototype.json', snapshotDraft()); status('JSON downloaded to this computer'); }));
  el('upload').addEventListener('click', () => el('upload-file').click());
  el('upload-file').addEventListener('change', async ev => {
    const file = ev.target.files?.[0]; ev.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('JSON file exceeds 2 MB safety limit.');
      const draft = JSON.parse(await file.text()); validateDraft(draft);
      if (dirty && !confirm('Replace your unsaved document with the imported demo JSON?')) return;
      applyDraft(draft); status('Demo JSON imported; not yet saved locally', 'success');
      setDirty(true);
    } catch (error) { status('Import refused: ' + error.message, 'error'); }
  });
  el('print').addEventListener('click', () => withEditor(() => editor.command.executePrint()));
  el('regenerate').addEventListener('click', () => withEditor(reconcile));
  el('pm-input').addEventListener('input', () => { status('Source figures edited; press Update generated figures'); });
  el('night-input').addEventListener('input', () => { status('Source figures edited; press Update generated figures'); });
  el('reset').addEventListener('click', () => withEditor(() => {
    if (!confirm('Erase the saved demo draft in this browser and reset all example text?')) return;
    localStorage.removeItem(STORAGE_KEY);
    source = freshSource();
    const fresh = buildInitialDocument(source);
    lastGenerated = fresh.generated;
    editor.command.executeSetValue(fresh.document);
    revision = 0; showSource(); dirty = true;
    setDirty(true); status('Demonstration reset; nothing saved', 'success');
  }));
  window.addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  showSource();
  setDirty(true);
  // Clear non-critical statuses only via explicit next action; no timer needed.
  status('Ready — click inside the white page to type', 'success');
}

try { initialize(); } catch (error) {
  console.error(error);
  status(`Editor initialization failed: ${error.message}`, 'error');
  el('paper-viewport').insertAdjacentHTML('afterbegin', '<p class="fatal">The editor could not start. Check GitHub Actions build logs and your browser console.</p>');
}
