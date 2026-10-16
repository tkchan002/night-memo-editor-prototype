# Word processor evaluation — test status

## Scope

Evaluate `ranuts/document` (ONLYOFFICE / WASM) for Nurse Memo. Do **not** deploy to your production application yet.

### Verified while preparing this test package

- Two genuine DOCX files were generated using the same headings, 13-column admission/discharge table, 9-column infection table and narrative sections as the Nurse Memo test data.
- The normal document contains 10 admissions data rows and 10 infection rows; the stress document contains 72 and 38 respectively.
- Page setup in both files is **A4 landscape** (297 × 210 mm), 12–13 mm margins.
- Both tables use carefully proportioned columns, repeated header rows, and row-splitting prevention.
- Independently rendered sample DOCX files were reviewed for legible tables and continuation page headings.
- Static protocol wiring uses `document:ready`, `document:open-buffer`, `document:saved`, `document:dirty-changed`, `document:error`, strict `origin` and source checks.
- Syntax and fixture structure tests execute without npm.

### Not yet verified (requires published site with external editor)

- Whether `https://edit.chaxus.com/editor?embed=1` is permitted inside a GitHub Pages iframe.
- Whether its browser edition correctly imports the two DOCX documents and preserves landscape orientation.
- Whether inserting and deleting table rows updates page boundaries in real time.
- Whether DOCX saving and reopening preserves wide tables, merged headers, margins, fonts and text.
- Whether embedded `document:save` accepts target extension `PDF` in the current release; editor-side PDF export may be needed.
- Whether the produced PDFs have correct A4 orientation, page counts, accessible/selectable text and repeated table headers.

### Acceptance conditions

- Edited page boundaries reflect the exported PDF page count and where tables break.
- Tables do not lose data, truncate headers, cut rows in half or shift widths during round-trip.
- PDF is landscape with selectable text and readable cells.
- Both 10-ward and 72/38 stress cases pass.
- Host can import/export the document via iframe without giving the editor application credentials.

### Known limitation

This is an **integration test wrapper**, not a self-hosted ranuts/document build. If the remote editor changes, is offline, or disallows framing, use the documented standalone editor fallback. Passing static source checks does not certify integration.
