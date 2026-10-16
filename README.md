# Nurse Memo — Canvas Editor print comparison (test repository v2)

This is a **standalone experiment**, not the live Nurse Memo application. It uses fictional Night Memo data; it never contacts Supabase and never accesses patient records.

## Purpose

The first Canvas Editor evaluation produced a **10-page image-based PDF**, although the editor itself numbered **7 pages**. This repository compares the old native print function against two alternative exports. The test is intentionally repeatable with the same 10-ward and 72-row fixtures.

| Route | Button | How the document is exported | Expected result / limitation |
|---|---|---|---|
| A | Native print (old) | Canvas Editor `executePrint()` | Baseline. May double-paginate. Record the physical page count manually. Image-based output likely. |
| B | Page-locked image PDF | Canvas Editor `getImage()` + jsPDF; exactly one image per A4 landscape page | Page count is **forced** to equal the editor page count. Text **cannot be selected**, because each PDF page is a raster image. |
| C | Vector text PDF | `canvas-editor-pdf` 0.7.0 `DrawPdf` renders editor's structured document as PDF instructions | Designed to preserve selectable text. **Neither page count nor line/table positioning is guaranteed** until inspected. |

This does **not** implement the final Night Memo editor. It validates a printing decision before integration.

## Install on GitHub Pages (no installation on your Mac)

1. Download and extract the test ZIP in Finder.
2. Open your **separate testing repository** in GitHub. Remove or replace any old files in that test repository that conflict with this project. Do not upload to the working Nurse Memo repository.
3. Upload **the contents** of the extracted folder to the testing repository's root. Ensure `.github/workflows/deploy-pages.yml` is included. Finder can show hidden items via **Command + Shift + .**
4. Open GitHub **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Open **Actions**, wait for **Deploy Canvas Editor Test to GitHub Pages** to pass, then open the GitHub Pages URL.
6. If the workflow fails, open the failing job and provide the log. The build installs Canvas Editor, `canvas-editor-pdf`, jsPDF and Vite on GitHub's machine, **not your Mac**.

## Test steps — do these without modifying the document between exports

1. Click **Stress test (72 rows)**. Click **Count editor pages** and record the number in the first card.
2. Click **Native print (old)**. In Chrome choose **Save as PDF**. Record the actual physical PDF page count in the **Enter PDF count** field.
3. Click **Page-locked image PDF**. A download named `night-memo-page-locked-images.pdf` should appear. Its page count should match the editor. This is a control, not a final solution.
4. Click **Vector text PDF**. A download named `night-memo-vector-text.pdf` should appear. Record the count shown in the Vector card.
5. Open the vector PDF in Chrome. Try selecting a ward name or searching for **Infectious Case** using Command + F. A searchable, selectable PDF would be preferable.
6. Compare page boundaries. Check whether the admission and infection table headers repeat on continued pages, whether any row is cut in half, and whether any column content is clipped or oddly wrapped.
7. Repeat steps 1–6 for **Normal 10 wards**. Test selecting a table cell, adding a row and counting pages again. Save JSON and Reload JSON to verify editing round-trip.

**Important:** Different printers, browser print scaling, or paper settings can introduce additional page changes. Use Chrome A4 landscape, 100% scale and no additional margins for the native print baseline. The two direct PDF downloads bypass Chrome's print dialog.

### Optional embedded-font test

The **Load embedded fonts** checkbox affects **only the vector PDF**. The exporter may fetch font files from a public CDN, which can be slow or blocked on some networks. The default vector export leaves this unchecked to permit a simpler offline-font-path evaluation. Its appearance may differ from Canvas Editor's Arial rendering. If the page count or text looks wrong, repeat with the checkbox and compare both outputs.

## What to send back

- Screenshot showing the four page-count cards after you complete the stress test.
- Both downloaded PDFs: **page-locked image PDF** and **vector text PDF**.
- Whether text in the vector PDF can be selected / searched.
- A note about any mismatch in rows, repeated headings or document margins.

Do **not** send any real patient data. The sample report uses invented ward statistics.

## Dependencies / licences

- `@hufe921/canvas-editor` 1.0.5 — MIT.
- `canvas-editor-pdf` 0.7.0 — MIT; independent community project, not an official Canvas Editor extension.
- `jspdf` 4.2.1 — MIT.
- Vite 7.x — MIT.

Package code comes from npm during the GitHub Actions build. This ZIP contains no vendor source, bundled proprietary UI assets or font files.

## Verification status

The static fixture, page geometry, page-count comparison and script syntax checks pass locally. **A complete npm build and actual Canvas Editor / PDF exporter browser interaction have not been performed in this environment** because external npm registry access is unavailable. The GitHub Actions build is the first integration check; your exported PDFs are the conclusive fidelity check.
