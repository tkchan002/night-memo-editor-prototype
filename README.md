# EuroOffice × Ranuts — latest-official-release browser experiment

**EXPERIMENTAL. Not for patient records or production use.** This repository tests whether the **latest official stable Euro-Office DocumentServer engine** can run inside the browser-only Ranuts/document integration. It is not affiliated with Euro-Office or Ranuts. Keep the existing successfully working 9.3.5-RC1 prototype in a **different GitHub repository** as your fallback.

## What automatically updates, and what does not

| Component | Selection |
|---|---|
| Official Euro-Office engine, web-apps, SDK | **Resolved from `Euro-Office/DocumentServer` GitHub `/releases/latest` on each workflow run**. Today this is v9.3.5. |
| Official AMD64 `.deb` | Exact asset from that release's GitHub metadata; never construct a guessed URL |
| Browser-only Ranuts/document base | Pinned commit `1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd` |
| Ranuts browser-only compatibility patch | Pinned from the third-party `@kreijstal/eurooffice@9.3.5-rc.1.build.1` package |
| `x2t.js` and `x2t.wasm` (DOCX/PDF converter) | **Still pinned to verified 9.3.5 RC1 pair. NOT upgraded** |

**A build using latest Euro-Office editor components with the RC1 converter is a mixed-version compatibility experiment, not a fully matched latest release.** The editing engine and x2t exchange internal document representations; imports and SHA256 checks prove file integrity, **not** internal format compatibility. Test DOCX import, edit, reopen and PDF thoroughly. A matching stable-version WASM build would be needed for a fully updated browser editor.

The workflow intentionally **stops** if the official asset is missing, a signature/patch no longer matches, the mixed converter is invalid, or the static output fails structural checks. It never silently falls back to RC1 editor components. A green GitHub Actions check also does not prove real-browser DOCX/PDF behavior.

## Browser-only setup — separate test repository

1. Go to <https://github.com/new>. Create a new repository, e.g. `night-memo-editor-latest-test` (prefer **Public** if you need GitHub Pages on your account). **Do not use or overwrite your working `night-memo-editor-prototype` repo.**
2. Extract this ZIP on your computer. On GitHub choose **Add file → Upload files** and upload the extracted **contents**, retaining folder structure including `.github/workflows/eurooffice-latest.yml`. Mac Finder shortcut **Command + Shift + .** reveals the `.github` folder. Do not upload the ZIP itself.
3. In the new repository open **Settings → Pages → Build and deployment** and choose **GitHub Actions**.
4. Open **Actions → EuroOffice Latest Stable - Browser-only Experiment → Run workflow**. Leave `release_tag` **blank** to resolve the newest stable release automatically. Or enter e.g. `v9.3.5` to test a specific official tag. Uploading the files to `main` also starts a run using latest stable.
5. The Ubuntu GitHub runner downloads the large official `.deb` directly. **You do not need to upload the 600 MB package, install anything locally, or connect GitHub to ChatGPT.**
6. When the workflow completes, check its **job summary** and `dist/office/eurooffice-poc-build.json` for the selected engine and pinned converter versions. Open the new repository's GitHub Pages URL.
7. Click **Check deployed converter assets**, then open a **fictional** `.docx`, edit its tables and text, export DOCX and PDF, reopen the exported DOCX, compare PDF pagination and formatting, and try read-only mode. The test page displays the two versions separately.

### Version selection semantics

`/releases/latest` returns the latest published **non-prerelease** GitHub Release. Each workflow run resolves it afresh; builds are reproducible at the *resolved version*, but not permanently pinned to a fixed version across separate runs. The selected tag/asset is printed in Actions and embedded in output metadata. Use `release_tag` when you want to repeat a particular version. **This workflow does not automatically run when Euro-Office publishes a release**; it looks up the latest when you run it or push files.

### Authenticity and checks

The release resolver checks the official `Euro-Office/DocumentServer` GitHub API, rejects unexpected asset hosts/paths, verifies the release tag and filename, and uses the asset SHA-256 `digest` from GitHub metadata **when available**. If GitHub exposes no digest, it prints a warning and records a downloaded SHA-256, but that checksum alone is not independent verification. You can set the repository variable `EUROOFFICE_DEB_SHA256` to an independently verified checksum. The RC1 converter's exact previously checked SHA256 digests are always required and both converter assets must use matching WASM imports.

### What happens when the release changes

If a newer version (e.g. v9.3.6 or v9.4.x) introduces different SDK structures or an incompatible internal document format, the transplant or browser runtime may fail. That is an expected and useful experimental outcome; do **not** disable the integrity tests or rewrite engine APIs blindly. The next engineering task would be adapting the browser-only controller and rebuilding `x2t` from the matching tagged Euro-Office core source.

### Missing converter package fallback

The build downloads the previously confirmed `@kreijstal/eurooffice-sdkjs-common@9.3.5-rc.1.build.1`. If it is no longer available from npm, use the original archive you already possess: in your **new test repository**, create a GitHub Release with tag `editor-inputs` and attach **`eurooffice-sdkjs-common-9.3.5-rc.1.build.1.tgz`**. The build has an exact-name fallback for that asset. Do not upload the `.tgz` into the Git source directory. Never upload clinical files or credentials.

## Troubleshooting

- **Resolve release fails:** Latest stable release missing or unexpected `.deb` asset. Check official <https://github.com/Euro-Office/DocumentServer/releases> and send the first error. Do not guess an asset URL.
- **Download or digest fails:** Official `.deb` inaccessible or different from its advertised SHA256. Stop and investigate.
- **Transplant fails:** The publisher's RC1 offline patch probably no longer matches the newer compiled editor. This requires a source-level compatibility update, not disabling the guard.
- **WASM/JS pair fails:** Keep the verified matching JS/WASM. The earlier Ranuts `env`/WASI build must never overwrite it.
- **DOCX opens but fails export or loses formatting:** This likely indicates a *different-version editor/converter compatibility problem*. Provide the test document only if fictional, and the diagnostic log.
- **Workflow succeeds but editor cannot open:** Inspect browser console and network errors, then compare exported files with the known-working RC1 test.

## Files and licensing

- `scripts/resolve-release.mjs`: official GitHub stable-release selection; supports optional manual tag.
- `scripts/build-poc.sh`: versions, official `.deb` extraction, compatibility patches, pinned RC1 converter and full Vite build.
- `scripts/vendor/`: pinned author-supplied Ranuts patch and Euro-Office transplant script.
- `scripts/package-site.mjs`: Word-only GitHub Pages packaging, license notices, safe static paths and converter integrity.
- `scripts/verify-site.mjs`: published site checks and version metadata.
- `site/`: standalone browser-only fictional DOCX test UI.
- `tests/`: deterministic release selection, security checks, converter ABI and publishing regression tests.
- `.github/workflows/eurooffice-latest.yml`: independent test build and deployment.

This hybrid redistributes or derives from AGPL-covered Ranuts and Euro-Office components. Preserve the relevant copyright notices, corresponding source, build modifications and required license materials if distributing compiled releases. Consult appropriate reviewers before any clinical use. This GitHub Pages prototype must use fictional documents only.

## Current verification status

The supplied source and tests were checked locally, and the packaging workflow has synthetic smoke tests. **The full newest-release download and browser DOCX/PDF round trip are not verified in the authoring environment.** They must run on your new GitHub Actions runner and browser. Your successful RC1 prototype is the reference baseline.
