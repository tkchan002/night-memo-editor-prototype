# Night Memo — Word-style Manager Document Prototype (v2)

Free, open-source, standalone document editor evaluation for the hospital Night Memo concept. Built with [Canvas Editor](https://github.com/Hufe921/canvas-editor) under the MIT licence, with Vite and **synthetic data only**. No Supabase connection or production patient data.

## Current UI

- **Familiar document workspace:** blue title bar, File / Home / Insert / Layout / View ribbon, centred A4 document, bottom page/zoom information.
- **Free-form document editing:** click the white A4 page, type normal paragraphs before, between, or after the mock ward report tables.
- **Home:** choose font and size; bold, italic, underline, strikethrough, text colour, lists and alignment; undo/redo.
- **Insert:** add a 3 × 3 table, page break, row/column to the current table or merge selected cells.
- **Layout:** reset A4 size and margins, print to the browser's printer/PDF facility.
- **View:** open the Ward Data panel, zoom in/out, reset zoom.
- **File:** reopen a locally saved draft, import/export demo JSON, print. Save is also in the top-right and Cmd/Ctrl+S saves the local draft.
- **Ward Data:** collapsible simulator for mock PM/Night figures and a prototype evaluation checklist. It is hidden during normal typing.

The editor core and document model are unchanged from v1. It continues to use the same local browser draft key, `night-memo-editor-prototype-v1`, to retain compatibility with saved demo drafts.

## GitHub installation

If you already have the prototype deployed, use the **replacement ZIP** and follow `WORD_STYLE_V2_INSTALL.md`. Keep your existing `.github/workflows/deploy.yml`, Vite and pinned packages.

For a fresh clone with dependencies available:

```sh
npm install
npm run verify
npm run dev
```

The existing GitHub Actions workflow runs tests, builds with Vite, and deploys `dist/` to GitHub Pages. In Settings → Pages, Source must be **GitHub Actions** rather than Deploy from a branch.

## What to test

1. Click into the white paper and type English and Traditional Chinese text.
2. Move the cursor between auto-generated table sections and write a free narrative.
3. Use Home formatting (font, lists, align, undo/redo).
4. Insert or modify a table; print an A4 page.
5. Open **Ward Data**, change Ward F10 PM admissions from 3 to 6, and choose **Update generated figures**. The combined admission count should change from 5 to 8. Your hand-written text should remain unchanged.
6. Manually edit a generated figure and regenerate again. The prototype should preserve that override and report it.
7. Save and reopen, then export JSON and import it again. Test the page on hospital computers and printers.

## Architecture

- `src/main.js` — document initialization, Word-style ribbon actions, Ward Data panel, print, local draft and file controls.
- `src/document-model.js` — source-linked table data, validation, conservative regeneration and manual-override preservation.
- `src/mock-data.js` — synthetic PM/Night numbers.
- `src/styles.css` — title bar, ribbon, editor workspace, panel and responsive styles.
- `tests/` — Node-native data-model and interface-contract tests.

## Limitations and safety

This is a prototype, not a clinical information system. It intentionally has no authentication, multi-user collaboration, audit database, secure patient record storage or real Ward submissions. Do not enter real patient information into this public GitHub Pages prototype. The only persistence is local browser storage and downloaded JSON.

Canvas Editor is not Microsoft Word. DOCX import/export is not bundled. The Word-inspired controls are grounded in Canvas Editor's actual APIs, but this prototype does not implement every Word feature.

Regeneration uses the original conservative `executeSetValue` approach. It protects manual text and edited source-linked cells, but can reset the cursor and undo stack. Table editing, multilingual typing, printing and selectable PDF text need real-workstation evaluation before production use.

**Verification:** the tests validate application and UI structure. A live Vite build and a browser visual check must still be completed through GitHub Actions and the deployed prototype because the current build environment has no npm registry access and browser navigation was blocked.

For installation, see `WORD_STYLE_V2_INSTALL.md`.
