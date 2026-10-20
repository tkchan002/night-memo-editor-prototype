# EuroOffice Browser — full-page Word editor

This repository builds a **full-page, browser-only DOCX editor**, using the **official EuroOffice DocumentServer v9.3.5** editor engine and the working Ranuts/document browser adapter. The application fills the available browser window. It uses **EuroOffice's original Word ribbon**, rather than reproducing Microsoft Word's controls in a custom UI.

## What the site does

- Immediately opens a real blank Word document, with A4 paper and 2.5 cm margins.
- Shows the full EuroOffice editor and its native document-editing ribbon, starting in **Modern Light** (`theme-white`).
- **New:** start a blank DOCX without leaving the page.
- **Open:** select a local `.docx` document; Ctrl+O / Cmd+O opens the chooser. Drag/drop works onto the application shell.
- **Save DOCX:** converts the edited document and triggers a DOCX download with its current document name.
- **PDF:** converts and triggers a PDF download.
- The embedded editor's own Save toolbar action and Ctrl+S / Cmd+S still trigger DOCX download through the `document:user-save` bridge.
- Documents are opened locally and passed directly to the embedded editor using an origin-checked `postMessage` API. **No external document-storage server is implemented.**

Do not confuse a browser download with a Supabase save. The version here is a *standalone document editor*; integration with Nurse Memo authentication and Supabase persistence is a separate task. There is a basic browser warning on refresh after an edit, but **no autosave or crash recovery**. Do not use real patient data or claim hospital-production approval without additional security, legal, functional and integration review.

## Installation on GitHub Pages

1. Create a fresh GitHub repository. Extract this ZIP at the repository root, retaining the hidden `.github/` directory. Upload/commit all files, including `site/blank.docx` and `site/editor-core.mjs`.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Under **Actions**, run **EuroOffice Full-page Word Editor**, or push to `main`.
4. The workflow checks out the pinned Ranuts source, **validates the vendor patch and Modern Light theme anchors immediately**, then locates the official EuroOffice v9.3.5 AMD64 Debian asset, downloads the pinned converter package, transplants the engine, builds the editor, validates the final distribution, and publishes it to GitHub Pages. If a patch is incompatible, the job fails before the large download.
5. Open the GitHub Pages URL. The editor should display a new blank document without requiring any diagnostic buttons. Test Open, editing, Save DOCX, and PDF before using the generated site further.

**Requirements:** GitHub Actions with Ubuntu 24.04, Node.js 24, pnpm 11.4.0, GitHub Pages deployment enabled. Builds download large binary inputs and take substantially longer than ordinary static sites. The compiler and runtime are built in CI, **not** in the user's browser. End users only load a static site.

## Versioned inputs

| Component | Version / origin | Role |
|---|---|---|
| EuroOffice DocumentServer | Official `v9.3.5` AMD64 `.deb` | Word editor and supporting UI assets |
| Ranuts/document | Pinned commit in `scripts/versions.json` | Standalone browser editor, embed bridge, build framework |
| `@kreijstal/eurooffice-sdkjs-common` | `9.3.5-rc.1.build.1` | Matched `x2t.js` and `x2t.wasm` converter pair; experimental with final editor |
| Our custom patch | `scripts/vendor/ranuts-document.patch` | Offline file Save notifications and path-aware converter loader; excludes the fragile theme hunk |
| Modern Light configuration | `scripts/configure-embedded-theme.py` | Checked exact-once source anchors; applies `theme-white` only to embedded editors |
| Browser shell | `site/` | Full-window app, DOCX open/new/download, PDF export, minimal status |

The **EuroOffice editor version** is final 9.3.5; the **converter package is still an RC**. User tests of the preceding test bench reported DOCX opening, editing, DOCX and PDF export, fidelity, and multi-document round trips passing. This new full-page shell has source, unit, and packaging tests but must also be validated in an actual deployed browser.

## Repository layout

- `.github/workflows/eurooffice-poc.yml` — CI download/build/verify/deploy workflow.
- `site/index.html`, `site/app.css`, `site/app.js` — full-page Word shell.
- `site/editor-core.mjs` — pure DOCX/PDF signature, filename, and iframe message validation helpers.
- `site/blank.docx` — valid initial A4 Word document (not a synthetic editor placeholder).
- `scripts/versions.json` — exact upstream and converter version pins and checksums.
- `scripts/build-poc.sh` — source assembly and packaging pipeline.
- `scripts/resolve-eurooffice-deb.mjs` — release asset metadata resolver; avoids filename assumptions.
- `scripts/vendor/` — upstream integration patch and engine transplant.
- `scripts/configure-embedded-theme.py` — independent theme edit with read-only preflight, fail-closed checks, and idempotent apply.
- `scripts/package-site.mjs`, `scripts/verify-site.mjs` — GitHub Pages asset rewriting and deployment verification.
- `tests/` — source invariants, file helpers, archive, converter and package regression tests.
- `LICENSES/` — preserved source and third-party license information.

## Local validation

On a computer with Node.js installed, run:

```sh
node --test tests/*.test.mjs
bash -n scripts/build-poc.sh
node --check site/app.js
node --check site/editor-core.mjs
```

These checks validate source, protocol guards, templates and packaging; they do not execute the several-hundred-megabyte upstream build. The Actions workflow runs a **real `git apply --check` on its pinned Ranuts checkout**, and checks the theme source, BEFORE downloading any large input. To run this preflight locally after obtaining the exact pinned checkout at `.work/ranuts`, use:

```sh
git -C .work/ranuts apply --check "$PWD/scripts/vendor/ranuts-document.patch"
python3 scripts/configure-embedded-theme.py --check .work/ranuts/lib/onlyoffice/ui-theme.ts
```

Running `bash scripts/build-poc.sh` requires Debian tooling, pnpm and remote access to download the `.deb` and converter.

## Security and limitations

The top-level document shell enforces source and origin matching for editor messages. Only validated DOCX/PDF output is downloaded. The runtime uses an `iframe` but **does not sandbox the same-origin editor**; that is necessary for the inherited ONLYOFFICE/Ranuts integration. Review this threat model before any hospital deployment. Do not assume a browser-only deployment guarantees data privacy: third-party fonts, extensions, future code changes and upstream dependencies require verification. No server-side access control, document audit history, Supabase persistence, collaborative editing or document-sharing workflow is supplied.

Opening a new document after changing the current document asks for confirmation. Browser close/refresh warnings are best-effort, not data recovery. Name changes affect downloaded filenames only; they do not rename any server record.

The complete release preserves third-party legal notices. Review AGPL and other license obligations before hosting or redistributing edited components.

## Fix for the earlier `ui-theme.ts: patch does not apply` failure

The previous full-page ZIP included a unified-diff hunk for
`lib/onlyoffice/ui-theme.ts`. Even though the unit tests passed, the pinned
checkout rejected that hunk. **Do not try `git apply --3way` or silently ignore
the error**: either could hide differences in the upstream editor.

This release removes just the `ui-theme.ts` hunk from
`scripts/vendor/ranuts-document.patch`, keeps the other proven patch hunks,
and configures Modern Light using a separate, narrowly scoped Python source
transformation. It preserves upstream theme behavior for standalone Ranuts
pages. The script is idempotent and refuses unexpected partial/changed source.
The workflow verifies both the remaining patch and the theme transformation
against its actual pinned checkout before fetching the large official `.deb`.

### Replacing an earlier installation

Upload **all files** from the complete replacement ZIP, overwriting existing
files. If you are already on the full-page ZIP and prefer a smaller update,
overwrite the files in the matching Changed Files ZIP; it includes this
README, the patch, new theme script, build script, workflow, and tests.
No changes to `site/`, the EuroOffice release, or the converter are needed.
