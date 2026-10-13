/**
 * Small, editor-independent document model. Intentionally NO Supabase integration.
 * Canvas Editor v1 data uses IEditorData.main elements. Generated cells are
 * identified by externalId, not by HTML strings or their position in the table.
 */
export const FORMAT_VERSION = 1;
export const MOVEMENTS_ID = 'source-table:movements:v1';
export const INFECTION_ID = 'source-table:infection:v1';
const clone = value => structuredClone(value);
const key = (table, ward, field) => `source-cell:${table}:${ward}:${field}`;
const text = (value, options = {}) => ({ value: String(value), ...options });
const newline = () => text('\n');
const cell = (value, externalId = null, isHeader = false) => ({
  colspan: 1, rowspan: 1,
  ...(externalId ? { externalId } : {}),
  ...(isHeader ? { backgroundColor: '#e9edf2' } : {}),
  value: [text(value, isHeader ? { bold: true, size: 11 } : { size: 12 })]
});
function table(externalId, widths, rows) {
  return {
    type: 'table', value: '', externalId,
    borderType: 'all', borderColor: '#758496', borderWidth: 1,
    colgroup: widths.map(width => ({ width })),
    trList: rows.map((r, index) => ({
      height: index === 0 ? 38 : 36,
      pagingRepeat: index === 0,
      tdList: r
    }))
  };
}
export function validateSource(source) {
  if (!source || !Array.isArray(source.wards) || !source.wards.length) throw new Error('Invalid mock source');
  if (new Set(source.wards.map(w => w.id)).size !== source.wards.length) throw new Error('Duplicate ward IDs');
  for (const ward of source.wards) {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(ward.id)) throw new Error('Invalid ward ID');
    for (const f of ['pmAdmissions', 'nightAdmissions', 'pmDischarges', 'nightDischarges', 'census', 'capacity']) {
      if (!Number.isSafeInteger(ward[f]) || ward[f] < 0 || ward[f] > 9999) throw new Error(`Invalid ${f} for ${ward.id}`);
    }
  }
  return true;
}
export function generatedValues(source) {
  validateSource(source);
  const result = {};
  for (const ward of source.wards) {
    const combinedAdmission = ward.pmAdmissions + ward.nightAdmissions;
    const combinedDischarge = ward.pmDischarges + ward.nightDischarges;
    const fields = {
      pm: ward.pmAdmissions, night: ward.nightAdmissions,
      total: combinedAdmission, discharge: combinedDischarge,
      census: ward.census, empty: ward.capacity - ward.census
    };
    for (const [field, value] of Object.entries(fields)) result[key('movements', ward.id, field)] = String(value);
    result[key('infection', ward.id, 'note')] = ward.infection;
  }
  return result;
}
function movementsTable(source, generated) {
  const headers = ['Ward', 'PM Adm.', 'Night Adm.', 'Total Adm.', 'Disch.', '4 AM Pts', 'Empty Beds'];
  const rows = [headers.map(h => cell(h, null, true))];
  for (const w of source.wards) {
    const columns = ['pm', 'night', 'total', 'discharge', 'census', 'empty'];
    rows.push([cell(w.id), ...columns.map(f => cell(generated[key('movements', w.id, f)], key('movements', w.id, f)))]);
  }
  return table(MOVEMENTS_ID, [75, 85, 85, 85, 83, 85, 93], rows);
}
function infectionTable(source, generated) {
  const rows = [[cell('Ward', null, true), cell('Clinical / general information', null, true)]];
  for (const w of source.wards) {
    rows.push([cell(w.id), cell(generated[key('infection', w.id, 'note')], key('infection', w.id, 'note'))]);
  }
  return table(INFECTION_ID, [100, 490], rows);
}
export function buildInitialDocument(source) {
  const generated = generatedValues(source);
  return {
    generated,
    document: {
      main: [
        text('NIGHT MEMO', { bold: true, size: 22, rowFlex: 'center' }), newline(),
        text('DEMONSTRATION DOCUMENT — NO REAL PATIENT DATA', { size: 10, color: '#a33d32', rowFlex: 'center' }), newline(),
        text(`Reporting night: ${source.reportingNight}     From: Night Nursing Officer     To: AM Shift`, { size: 11 }), newline(),
        newline(),
        text('1. Patient movements', { bold: true, size: 15 }), newline(),
        movementsTable(source, generated), newline(),
        text('Type freely here: add operational notes about patient movements.', { size: 12, color: '#334155' }), newline(),
        newline(),
        text('2. Clinical / general information', { bold: true, size: 15 }), newline(),
        infectionTable(source, generated), newline(),
        text('Example handover: Staffing arrangements reviewed. 請於早更跟進。', { size: 12 }), newline(),
        newline(),
        text('Click after this paragraph, press Enter, and continue writing your own notes.'), newline()
      ],
      header: [], footer: []
    }
  };
}
const cellText = td => (Array.isArray(td?.value) ? td.value.map(part => part.value || '').join('') : '');
/** Index all generated cell references from a document, with duplicate detection. */
export function findGeneratedCells(document) {
  const found = new Map();
  for (const element of document?.main || []) {
    if (element?.type !== 'table') continue;
    for (const row of element.trList || []) {
      for (const td of row.tdList || []) {
        if (!td.externalId?.startsWith('source-cell:')) continue;
        if (found.has(td.externalId)) throw new Error(`Duplicate source-cell ID: ${td.externalId}`);
        found.set(td.externalId, td);
      }
    }
  }
  return found;
}
/**
 * No side effects; does not regenerate the entire document from a template.
 * Only cells with matching generated IDs and unedited previous values change.
 * User-modified numeric cells are treated as overrides and left untouched.
 * Missing source cells stop regeneration rather than silently corrupting the memo.
 */
export function reconcileGeneratedCells(currentDocument, lastGenerated, source) {
  const nextGenerated = generatedValues(source);
  const newDoc = clone(currentDocument);
  const found = findGeneratedCells(newDoc);
  const expected = Object.keys(nextGenerated);
  const absent = expected.filter(k => !found.has(k) || !(k in (lastGenerated || {})));
  if (absent.length) throw new Error(`Source-linked cells missing (${absent.length}); cannot safely regenerate. Reopen an intact demo document.`);
  let updated = 0;
  const preservedOverrides = [];
  for (const id of expected) {
    const td = found.get(id);
    const previous = String(lastGenerated[id]);
    const current = cellText(td);
    const incoming = String(nextGenerated[id]);
    if (current !== previous) {
      preservedOverrides.push(id);
      continue;
    }
    if (current !== incoming) {
      // Preserve cell geometry, identity and styling when updating contents.
      const style = td.value?.[0] || {};
      td.value = [{ ...style, value: incoming }];
      updated++;
    }
  }
  return { document: newDoc, generated: nextGenerated, updated, preservedOverrides };
}
export function manualContentFingerprint(document) {
  const snapshot = clone(document);
  for (const td of findGeneratedCells(snapshot).values()) td.value = [{ value: '__GENERATED__' }];
  return JSON.stringify(snapshot);
}
export function validateDraft(draft) {
  if (!draft || draft.kind !== 'night-memo-prototype' || draft.version !== FORMAT_VERSION) throw new Error('Not a compatible prototype document');
  validateSource(draft.source);
  if (!draft.document || !Array.isArray(draft.document.main) || draft.document.main.length > 40000) throw new Error('Invalid document');
  if (!draft.generated || typeof draft.generated !== 'object') throw new Error('Missing source tracking');
  const expected = generatedValues(draft.source);
  for (const id of Object.keys(expected)) if (!(id in draft.generated)) throw new Error(`Missing source reference: ${id}`);
  return true;
}
