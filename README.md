# EuroOffice + Ranuts — browser-only proof of concept

**Experimental build; not an approved replacement for Nurse Memo. Do not upload or test real patient information.**

This repo contains **only scripts and a local-document test page**, not the 591 MB Euro-Office Debian package or the compiled Office applications. A GitHub Actions Ubuntu runner downloads the official pinned release, checks out the Ranuts source at the exact commit used by the third-party package publisher, and builds an independent, browser-only Word editor. It does **not** deploy any Supabase data, API keys, or Nurse Memo application code.

## Steps — entirely through the GitHub website

1. Extract `NurseMemo_EuroOffice_POC_GitHub_Ready.zip` on your computer. Do **not** upload the ZIP as a single file to the repository; GitHub does not automatically expand it.
2. Visit <https://github.com/new> and create a repository named `nurse-memo-eurooffice-poc` with a `main` default branch. For an experimental public Pages site, use **fictional documents only**. If you choose private, Pages availability depends on your GitHub plan.
3. In an empty new repository, click **uploading an existing file** (or **Add file → Upload files** if the repository is already initialized), and upload the **contents** of the extracted folder. Include the hidden `.github/workflows/eurooffice-poc.yml` directory; on macOS Finder, press **Command + Shift + .** to show hidden folders. If your browser will not upload a folder, use GitHub's **Add file → Create new file** and type its relative path to create each missing nested file.
4. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the deployment source.
5. Open **Actions → EuroOffice Browser-only Proof of Concept → Run workflow**. A push to `main` may also trigger a run automatically. The Actions run may consume significant time and temporary disk space because the source package is large. Watch the build logs.
6. If the build **and** Pages deployment succeed, open the URL displayed for the `github-pages` environment (normally `https://YOUR-ACCOUNT.github.io/nurse-memo-eurooffice-poc/`).
7. Select an entirely fictional `.docx` document and test Open, edit, Export DOCX, Export PDF, read-only and state. The harness logs protocol events without sending document contents to a backend. A successful load is **not** sufficient; verify the downloaded files and compare layout/pagination to Ranuts.

### What GitHub Actions does

- Checks out `Ranuts/document` at `1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd`.
- Downloads the official Euro-Office `v9.3.5-rc.1` AMD64 Debian release directly into the runner (it is not installed as a server). The download URL is inside `scripts/build-poc.sh`. Optionally, set the repository Actions variable `EUROOFFICE_DEB_SHA256` to an independently verified release checksum. The runner always logs the downloaded SHA-256.
- Extracts only `sdkjs`, `web-apps`, and `dictionaries`; uses the documented publisher transplant script and patches supplied with the uploaded `@kreijstal/eurooffice` package.
- Gets the pinned converter package `@kreijstal/eurooffice-sdkjs-common@9.3.5-rc.1.build.1`. The two converter files have **hardcoded SHA-256 integrity checks** from your supplied npm archive. It does not use placeholder WASM files.
- Builds Ranuts with a frozen pnpm lockfile; retains its browser-only Offline controller and iframe bridge.
- Copies the pinned Ranuts source-tree `LICENSE` and `NOTICE` into the static editor (Vite does not place these in `dist`), alongside the Euro-Office and font third-party notices.
- Packages the Word-only output under `/nurse-memo-eurooffice-poc/office/`, with static path corrections, a raw `.wasm` fallback and a compressed gzip streaming loader (GitHub Pages cannot set `Content-Encoding: br` for `.wasm.br`). Removes unrelated spreadsheet and presentation engines.
- Verifies existence of the browser bridge, DOCX engine, WASM, font files and the static site before deploying with GitHub Pages.

## If the converter's npm package becomes unavailable

Use the **browser-only fallback**. In your new GitHub repo, open **Releases → Draft a new release** and create the tag `editor-inputs` (name it *Editor build inputs*). Attach the original **`eurooffice-sdkjs-common-9.3.5-rc.1.build.1.tgz`** already uploaded to ChatGPT, then publish the release. (The archive is approximately 45 MB; a release asset is more appropriate than a normal Git commit.) Rerun Actions. The workflow tries this exact release asset when `npm pack` fails. No font packages are required for this path.

**Do not upload the 600 MB `.deb`**. The runner downloads it. Do not add any credentials or patient files to the repository.

## If Actions fails

Report the **first failed step** and its actual error, not only the last `Process completed with exit code 1` line. Known possible failures include:

| Error / step | Interpretation |
| --- | --- |
| Checkout exact Ranuts source | The pinned commit could not be fetched or the repo was moved. The script does not silently substitute another revision. |
| Download official release | GitHub's release download failed or exceeded the runner's capacity. Check the URL, runner quota and network. |
| `npm pack` and missing converter | The third-party package is unpublished; use the release-asset fallback above. |
| SHA256 mismatch | The downloaded converter is different from the inspected archive. Do **not** disable the check. |
| `git apply --check` | The pinned upstream source no longer matches the publisher's patch. |
| `eurooffice-into-ranuts.py` | The source of the Offline controller or a target engine asset changed. No generic text replacement is attempted. |
| `Required NOTICE not found` | The pinned Ranuts checkout unexpectedly has no `NOTICE`; packaging deliberately stops rather than deploy without the attribution text. |
| `Upstream build lacks LICENSE` | Indicates an older version of `scripts/package-site.mjs`; replace it with the corrected file. `LICENSE` is not a required Vite build output. |
| `x2t` loader patch | Browser WASM loader did not match the known structure, so packaging refused to produce a broken editor. |
| Site over 900 MiB | The Word-only static output exceeded the conservative Pages size guard. No incomplete site is deployed. |
| Editor loads but export fails | A **runtime incompatibility**, requiring browser debugging and potentially a newer or corrected offline bridge. A green Actions tick alone is not proof of compatibility. |

## Acceptance criteria

1. Open a **fictional** Nurse Memo-style DOCX with headers, tables and several formatting styles.
2. Edit text; export and reopen DOCX without corruption or missing text.
3. Export PDF; confirm `%PDF-` signature and verify page size/pagination visually.
4. Toggle genuine read-only mode, then editable mode.
5. Test toolbar Save and the host-side export buttons, which have different event paths.
6. Compare output font substitution and layout to the existing pinned Ranuts editor.
7. Test repeated loads, long documents and memory consumption on the same browsers used by the hospital.

If any criterion fails, keep the current Nurse Memo editor. No files in this PoC automatically modify Nurse Memo.

## Source / licensing

The editor merges pinned [Ranuts/document](https://github.com/Ranuts/document) sources with the official [Euro-Office DocumentServer](https://github.com/Euro-Office/DocumentServer/releases/tag/v9.3.5-rc.1) binaries. The transplant script and `.patch` are unmodified copies of `build/eurooffice-into-ranuts.py` and `build/ranuts-document.patch` from `@kreijstal/eurooffice@9.3.5-rc.1.build.1`, supplied by the user. These are source-level integration materials derived from AGPL-licensed components. Their inclusion here does not replace upstream notices, licenses, or source availability duties; review AGPL and third-party font license compliance before any institutional use.

The official `.deb` release is a community test release. The third-party npm converter is not a separately verified official Euro-Office distribution. It is pinned for this prototype, not approved for production.

## Environment limitations and verification status

The ZIP has been syntax-checked and its workflow/scripts reviewed against the uploaded source archives. **A full build and browser-level DOCX/PDF edit/export have not yet been successfully run in this environment**, since outbound access to the official large release is blocked here. The first GitHub Actions run is therefore a real integration test, not a guaranteed deployment. See the first failed step if it does not complete.


## Converter import error (`Import #0 "env"`)

In the first deployed proof of concept, the Word interface loaded, but DOCX
opening failed with `X2T module failed to instantiate: ... Import #0 "env"`.
The pinned npm converter's verified WASM instead imports namespace `a` and
its matching JavaScript glue supplies `a`. This error is consistent with
wrong or stale bytes being used at runtime; it is not evidence that the DOCX
file is corrupt. The precise cause of the remote mismatch has **not yet**
been confirmed.

This version copies the verified converter pair into the final Vite output
*after* the build, verifies its SHA-256 and WebAssembly import namespace
before packaging and after packaging, and cache-busts the JavaScript/WASM
paths. The test page also includes a **Check deployed converter assets** button
that checks the exact bytes served by GitHub Pages. Run this button first.

If the integrity preflight succeeds but the editor still fails with `env`,
the loader may be fetching a *different* resource at runtime (or a service
worker may have cached one). Copy the diagnostic events and share the browser
Console's failing WebAssembly URL. Do not attempt to modify the document file.
The demo's `document:opened` acknowledgment alone is not proof that the
converter successfully rendered or saved the DOCX.

Only update the standalone prototype, never clinical Nurse Memo, until a
real DOCX is opened and exported to both DOCX and PDF successfully.

### Updating from the previously deployed GitHub Pages prototype

Download the small v3 replacement archive, extract it, and update only the
listed files in the same relative paths in your GitHub repository. The
workflow file does not need to change. GitHub Actions should automatically
start on the `main` branch. Do not upload any `.tgz`, `.deb`, patient data, or
large editor binaries to the Git repository.

Once the new Pages deployment completes, open the prototype page and choose
**Check deployed converter assets** before choosing a fictional DOCX. A
successful integrity check proves only that GitHub Pages served the expected
converter bytes; it does not prove that the editor fully supports the DOCX or
PDF workflow.

If the check fails, copy the diagnostic log. If it passes but DOCX opening
still displays `Import #0 "env"`, share the browser Console error and Network
request URL for the WASM asset. We must then trace the actual loader path.
