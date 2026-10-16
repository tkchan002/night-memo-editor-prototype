# Nurse Memo — ranuts/document Word processor evaluation

This is a **standalone test repository**, not a patch for Nurse Memo.

The page hosts an iframe of the [ranuts/document editor](https://github.com/ranuts/document) at `https://edit.chaxus.com/editor?embed=1` and uses its [documented embed API](https://edit.chaxus.com/help/embed-api). **It does not contain or self-host the ONLYOFFICE engine.** The editor service must remain available, and browser security/privacy settings must allow its iframe. This is intentionally a small, no-install, no-npm test. Your GitHub Pages repository hosts only the sample DOCX files and the control page.

All fixtures contain fictional patient-free data. **Never upload clinical, identifiable, confidential or protected records to this public test site.** The page has no Supabase connection and no account login.

## Install on your existing GitHub testing repository

1. Download and extract the ZIP on your MacBook.
2. On GitHub, open your *testing* repository, not `nursememo`.
3. In **Settings → Pages**, set **Source: GitHub Actions**.
4. Upload the **contents** of the extracted folder into the repository root (`index.html`, `assets/`, `fixtures/`, `.github/`, `tests/`). On macOS, `Command + Shift + .` shows hidden folders including `.github`.
5. Commit. Check **Actions → Deploy Nurse Memo Document Test**. Wait for green success.
6. Open `https://YOURNAME.github.io/YOUR-TEST-REPO/` (the exact URL appears under Settings → Pages).

### If upgrading from our Canvas Editor test

The included `.github/workflows/deploy-pages.yml` is deliberately the same workflow path as the previous project, so it replaces the old deployment workflow. **The previous Vite `src/`, `package.json`, `vite.config.js`, `public/` and old Canvas Editor tests can be deleted**; they are no longer used. The new workflow publishes **only** `index.html`, `assets/` and `fixtures/` into `_site`, so leftover Canvas files won't appear on the deployed website. You do not need to run commands on your Mac.

## Test workflow

1. When the external editor signals `document:ready`, the host automatically opens `night-memo-normal-10.docx`.
2. Confirm **landscape A4** paper, editable table cells, legible headers and consistent paginated sheets.
3. Change some text and add a row; observe page reflow.
4. Click **Save edited DOCX**. Reopen the downloaded file with **Open local DOCX** and check preservation of edits.
5. Click **Export PDF (API test)**. It requests `{ type:'document:save', payload:{targetExt:'PDF'}}`. If the deployed upstream editor does not support this conversion via embedding, the event log will show its error. **Alternative:** use its built-in File / Download / PDF or Export PDF functionality.
6. Click **Stress test · 72 + 38 rows**. Compare repeated table headings, rows at page breaks, and PDF page count against the live editor.
7. Verify PDF text selection in Chrome Preview, and upload the exported PDFs for comparison.

The parent page never considers a save successful until the editor sends a response with a real DOCX ZIP or `%PDF-` file signature. Errors are displayed in the event log. If the editor doesn't send a `document:ready` event within 35 seconds, the page displays a link to the standalone editor.

## Fallback if the iframe is blocked

1. Download the [normal DOCX](fixtures/night-memo-normal-10.docx) or [stress DOCX](fixtures/night-memo-stress-72-38.docx) from the test page.
2. Open <https://edit.chaxus.com/editor> in another tab.
3. Open the downloaded `.docx` using the editor's file picker.
4. Edit/export and send the PDF and screenshots back for assessment.

This fallback still tests the actual Word processing engine, but does **not** test the embedding protocol.

## Licence and deployment notes

* The external editor is by ranuts and incorporates ONLYOFFICE technology. See its [AGPL-3.0 licence and NOTICE](https://github.com/ranuts/document/blob/main/NOTICE). This test **does not** distribute the editor's source or compiled files.
* Do not strip licensing, attribution or branding from any future self-hosted editor deployment.
* No external credentials, tokens or API keys are used by the test host.
* GitHub Actions only validates and publishes static files. It does not download/build the editor.
* This test is dependent on upstream availability and behaviour, and has not been tested live in this build environment. The included structural checks do not prove editing, pagination, or PDF fidelity.

## Verification

GitHub Actions runs:

```sh
node --check assets/app.js
python3 tests/check_project.py
```

The two DOCX fixtures have been independently rendered and visually inspected in a document renderer; those checks validate the test data, **not** ranuts/document functionality. Results and known gaps are in `TEST_REPORT.md`.
