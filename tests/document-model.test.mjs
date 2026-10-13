import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshSource } from '../src/mock-data.js';
import { buildInitialDocument, findGeneratedCells, generatedValues, reconcileGeneratedCells, manualContentFingerprint, validateDraft } from '../src/document-model.js';
const setup = () => {
  const source = freshSource();
  const built = buildInitialDocument(source);
  return { source, ...built };
};
test('correct non-overlapping PM + Night movement totals and negative empty-bed count', () => {
  const { source } = setup(); const v = generatedValues(source);
  assert.equal(v['source-cell:movements:F10:total'], '5');
  assert.equal(v['source-cell:movements:F10:empty'], '-11');
  assert.equal(v['source-cell:movements:F10:discharge'], '3');
});
test('source IDs are unique and present in real table cells', () => {
  const { document, generated } = setup();
  const indexed = findGeneratedCells(document);
  assert.equal(indexed.size, Object.keys(generated).length);
  assert.equal(document.main.filter(e=>e.type === 'table').length, 2);
});
test('regeneration preserves manually written paragraphs exactly', () => {
  const { source, document, generated } = setup();
  document.main.push({ value: 'I added my own clinical handover note. 自由輸入。', bold: true });
  const before = manualContentFingerprint(document);
  source.wards[0].pmAdmissions = 8;
  const result = reconcileGeneratedCells(document, generated, source);
  assert.equal(manualContentFingerprint(result.document), before);
  assert.equal(findGeneratedCells(result.document).get('source-cell:movements:F10:total').value[0].value, '10');
  assert.equal(result.updated, 2);
});
test('edited generated cell is preserved rather than overwritten', () => {
  const { source, document, generated } = setup();
  const id = 'source-cell:movements:F10:total';
  findGeneratedCells(document).get(id).value = [{ value: 'N.O. corrected: 6' }];
  source.wards[0].pmAdmissions = 8;
  const result = reconcileGeneratedCells(document, generated, source);
  assert.ok(result.preservedOverrides.includes(id));
  assert.equal(findGeneratedCells(result.document).get(id).value[0].value, 'N.O. corrected: 6');
});
test('missing source marker prevents regeneration (no silent full-document rewrite)', () => {
  const { source, document, generated } = setup();
  delete findGeneratedCells(document).get('source-cell:movements:F10:total').externalId;
  source.wards[0].pmAdmissions = 4;
  assert.throws(()=>reconcileGeneratedCells(document, generated, source), /missing/i);
});
test('invalid or duplicated ward identities are rejected', () => {
  const source = freshSource(); source.wards.push({ ...source.wards[0] });
  assert.throws(()=>generatedValues(source),/Duplicate/);
});
test('draft validation enforces format and source references', () => {
  const { source, document, generated } = setup();
  const draft = { kind: 'night-memo-prototype', version: 1, source, document, generated };
  assert.equal(validateDraft(draft), true);
  assert.throws(()=>validateDraft({ ...draft, kind: 'unexpected' }),/compatible/);
});
