# Nurse Memo — Canvas Editor document-engine evaluation

This is an **isolated experiment**, not a replacement Nurse Memo repository. It does not touch Supabase or authenticate against any user account. The Night Memo structure follows the repository's main admission and infection tables, CT figures, free-text sections and signature. All rows are generated fictitious examples.

## Installation on your Mac (internet required)

1. Extract the ZIP.
2. Open Terminal in the extracted folder.
3. Run `npm install` (requires Node.js and internet access).
4. Run `npm run dev`.
5. Open the local URL printed by Vite, generally `http://127.0.0.1:5173/`.

For fixture tests, run `npm run check`. For a production bundle, run `npm run build`.

If you have Python and Playwright installed, launch the site and run `python3 tests/browser-check.py`. It will create `qa-results/stress-desktop.png` and `qa-results/browser-results.json` and checks multi-page output, JSON save/reload, page counts and JavaScript errors. You can also do these tests entirely through the page controls.

## Real-engine acceptance checks

- Start with **3+ page stress test** and choose **Count rendered pages**. Expect three or more pages, not a single continuous sheet. Exact count depends on fonts, version and browser.
- Click a table cell. Use **Add table row** (or the Canvas Editor table context menu). Check that table continues correctly onto the next page. Header rows are marked `pagingRepeat` in the fixture; verify they visibly repeat after each page break.
- Select some text, apply Bold/Italic/Underline and Undo/Redo. Recheck pagination.
- Use **Append test paragraph**, then check the page count again. Editing a paragraph near the start of a document is an additional manual test for moving later content.
- Use **Save JSON** then **Reload saved JSON**, and verify edits are intact.
- Click **Print / PDF**, choose Save as PDF, and compare the number of paper pages, row boundaries, column widths and headers with the editor. **This is the critical acceptance test: do not adopt the engine if they do not agree.**
- Optionally open at 390px width: the paper should scroll horizontally inside the workspace without resizing clinical table columns.

## Notes

- Uses the actual `@hufe921/canvas-editor` package (pinned to `1.0.5`) and native document model. Does not simulate page rendering with CSS cards.
- A4 landscape is approximately 1123 x 794 CSS pixels at 96dpi. The page options and margins are configurable in `src/main.js`.
- The normal fixture has 10 wards; the stress fixture has 72 fictional admission-table rows and 38 fictional infection-table rows.
- The output is JSON, not the existing Jodit HTML document. Adoption would require replacing the Manager memo generation, saving and printing layers.
- The test deliberately contains no proprietary eHR code or hospital assets.
- Canvas Editor's print is invoked through its native `executePrint` command; the existing Nurse Memo `print.html` should **not** be used to render this JSON as plain HTML because that would reintroduce page-break differences.
- Open-source core is MIT licensed. If adopted, keep the license attribution.

## Test status in this environment

The fixture tests and JS syntax checks run offline. The actual npm editor and Vite build **could not** be run here because the container cannot reach npm/GitHub/CDN hosts. Do not treat native pagination, table repetition, printing or editor interactions as verified until the browser checks above are completed. See `TEST_REPORT.md`.

Official documentation: https://hufe.club/canvas-editor-docs/en/guide/start.html

## GitHub Pages alternative (no Mac installation)

This package also includes `.github/workflows/deploy-pages.yml` and `vite.config.js`. Upload all files to your **separate test repository** and select **GitHub Actions** under Settings > Pages. GitHub performs the npm install and static build; you only need a browser on your Mac. See `UPLOAD_TO_GITHUB_PAGES.md` for complete steps.
