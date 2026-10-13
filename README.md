# Night Memo — free-form Manager document prototype

A **standalone, synthetic-data-only** prototype for testing the free, MIT-licensed [Hufe921 Canvas Editor](https://github.com/Hufe921/canvas-editor) as a Word-like Manager Memo editor. It does **not** clone, replace, authenticate with or connect to your Night Memo staging repository or Supabase project.

## Set up with the GitHub website (no command line required)

1. Create a **new, empty** repository named `night-memo-editor-prototype` at https://github.com/new. Use `main` as its branch. A public repo can be used **only because this project contains synthetic data**.
2. Download the prototype ZIP from ChatGPT and extract it. **Upload the files and folders inside the extracted repository folder**, not the `.zip` itself. Keep `src/`, `tests/`, and `.github/workflows/` directories intact. GitHub's web **Add file → Upload files** experience may not reliably preserve nested folder paths in every browser: verify the paths afterwards; for nested files, open the target folder or use **Add file → Create new file** with `folder/filename` if needed.
3. Commit all files to `main`.
4. In your new repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. (Do not choose 'Deploy from a branch'.)
5. Open **Actions** and check that **Verify and deploy prototype** has completed successfully. The workflow installs dependencies, runs the tests, builds with Vite and publishes `dist/` to GitHub Pages. The first deployment can take a few minutes.
6. Open `https://tkchan002.github.io/night-memo-editor-prototype/` if created under the expected `tkchan002` account. If using a different account or repo name, adjust the URL.

If GitHub Actions fails, check the **first failing step** and copy the complete failure log. Do not modify `night-memo-demo-staging` to fix this independent prototype.

### Run locally (optional)

Requires Node.js 24 or later and an internet connection to install the editor from npm.

```sh
npm install
npm run verify
npm run dev
```

Open the local URL printed by Vite. Dependencies are pinned to `@hufe921/canvas-editor@1.0.5` and `vite@7.1.3`. This starter does not include `node_modules` or a generated npm lockfile because package installation was not available in the creation environment. The Actions workflow uses `npm install`, **not** `npm ci`.

## Try it

1. Click in the white document and type ordinary paragraphs (English and Traditional Chinese).
2. Use the Home ribbon for bold, italic, font size, lists, paragraph alignment and undo/redo.
3. Place the cursor below or between automatically generated tables; insert text, or use **Insert → Insert 3 × 3 table**.
4. In the right-hand source simulator, change **Ward F10 PM admissions** from 3 to 6. Press **Update generated figures**. The admission total should change from **5 to 8**, and the N.O.'s separately typed text should remain.
5. Manually edit a generated figure inside the table. Change the source figure again and regenerate. The prototype will **preserve** the edited figure and tell you a manual override was detected.
6. Use **Save draft** and **Reopen**, and test **Export/Import JSON**. Use **Print** to evaluate the actual document output on your workstation/printer.

### Limitations to evaluate, not conceal

- Canvas Editor is an actual third-party editor bundled at build time, **not** a simulated Word screenshot. Its full runtime and GitHub Pages build have **not** been executed in the creation environment because npm registry access was unavailable. Pure data-model tests and JavaScript syntax have been checked. Please use GitHub Actions for the first full integration verification.
- The 'Word-like' interface has Home, Insert, Layout controls but is **not Microsoft Word**; DOCX import/export is not included.
- The document area is a canvas editor. Clicking blank page margins may place the caret at the nearest valid paragraph rather than at an arbitrary pixel coordinate. The test is whether novice users intuitively find where to type.
- Generated table cells are identified by stable `externalId` values. The prototype uses conservative per-cell reconciliation. If a linked source cell was deleted or an ID was lost, regeneration stops and reports an error instead of resetting the document.
- To preserve manually written paragraphs, regeneration currently loads a modified copy of the current document through `executeSetValue`. **This may reset cursor location and undo history**, and must be improved before any production integration.
- If the N.O. manually changes a generated cell, it is considered a manual override and is not overwritten on regeneration. The prototype reports how many cells were preserved but does not yet provide an audit trail or a formal resolve/revert UI.
- Printing uses Canvas Editor's built-in print function and may produce image-based pages. Check PDF text selectability, A4 page breaks, complex tables and both English/Traditional Chinese fonts on your actual computers and printers.
- Some narrow mobile screens require **horizontal scrolling** to view the 794-pixel A4 page; this prototype prioritizes desktop testing.
- No collaboration, multi-user editing, Supabase saving, authentication or permissions are implemented. There is no production data model migration.
- The sample report structure is representative, **not a pixel-for-pixel copy of the hospital's official Manager Memo**. If approved, integration must preserve the actual template and its fields.

## Data and privacy

**Never enter real patient information.** GitHub Pages is a publicly accessible static host when published from a public repository. This prototype uses fabricated names, ward labels and figures only.

- **Save draft** writes the demo document and mock source data to your browser's `localStorage`, under `night-memo-editor-prototype-v1`.
- **Export JSON** downloads a document snapshot to your computer.
- **Import JSON** reads a JSON snapshot into the browser, validates its version and basic data shape, and never transmits it to a server.
- **Reset demonstration** clears this prototype's saved draft from the browser and restores mock data.
- The application has **no configured Supabase endpoint, account login, analytics or third-party document cloud service**. The editor library itself is built into the GitHub Pages assets after installation.

## Architecture

- `src/mock-data.js`: fabricated separate PM and Night ward movement figures.
- `src/document-model.js`: pure functions to create source-linked tables, reconcile updated source figures, preserve manual edits and validate snapshots.
- `src/main.js`: initialization and browser UI actions; document save/reopen, PDF printing and source simulator.
- `src/styles.css`: familiar Word-style ribbon + centred white pages.
- `tests/`: Node built-in unit tests for the data model (no external test packages).
- `.github/workflows/deploy.yml`: install, verify, build and deploy to GitHub Pages.

## Upstream source and licensing

Canvas Editor is developed by Hufe921 and distributed under the MIT licence, see https://github.com/Hufe921/canvas-editor and https://hufe.club/canvas-editor-docs/en/guide/start.html . Licence notices for third-party code remain part of the installed npm package. The prototype's own code is MIT-licensed; see `LICENSE`.

This project is a test harness, not a clinical system. Review security, accessibility, data retention, provenance, print legibility, browser support and licensing before deciding whether to integrate it into Night Memo.
