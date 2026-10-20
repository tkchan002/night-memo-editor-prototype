# EuroOffice Browser — official v9.3.5 upgrade test

**Experimental, browser-only, Word-only proof of concept. Not for patient or production use.**

This repository is a complete GitHub Actions / GitHub Pages test-build recipe, derived from the user's v4 proof of concept. The editor engine comes from the **official Euro-Office DocumentServer v9.3.5 release** (not the release candidate). The standalone browser framework is a pinned `Ranuts/document` checkout. The browser-only adapter and the document converter are still from the earlier independently published RC integration.

## Read this first: important converter compatibility limitation

**The official final 9.3.5 editor is combined with a converter from `9.3.5-rc.1.build.1`.** A verified matching *final* v9.3.5 browser converter was not available for inspection when this ZIP was prepared. This is a deliberately **mixed-version compatibility experiment**, not a known-good final-release editor. The JS/WASM pair itself has pinned SHA-256 checks, but these checks DO NOT demonstrate compatibility with the newer EuroOffice editor. A successful Actions build DOES NOT demonstrate that DOCX opening, editing or exporting works.

If the new engine changed an internal adapter anchor, the build stops instead of pretending compatibility. If the engine builds but has a runtime incompatibility, you must test it in a real browser with fictional files. If it fails, revert to the previously working v4 build.

## How to deploy with the GitHub website (no CLI)

1. **Prefer a separate public test repository**, so the new GitHub Pages deployment does not replace the user's existing v4 website. Create a GitHub repository, e.g. `eurooffice-935-test`.
2. Extract this ZIP **locally**. Upload its **contents**, including hidden `.github/workflows/eurooffice-poc.yml`, to the **root** of the new repository. Do not upload the ZIP as a single GitHub source file. The `scripts/`, `tests/`, `site/`, `.github/`, `LICENSES/` and `README.md` must be in the repository root.
3. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. Workflow permission defaults can remain read-only; the deployment job requests `pages: write` and `id-token: write`.
4. Commit the upload on `main`. The workflow starts on push; you can also open **Actions → EuroOffice Browser-only Proof of Concept → Run workflow**.
5. The workflow downloads the large official Debian release and the small source/dependency inputs itself. Neither the `.deb` nor the npm package is included in the ZIP. A large official `.deb` download may take time.
6. Once the workflow reports a successful deployment, open the site link listed in the `github-pages` environment. First click **Check deployed converter assets**, then open a fictional DOCX and exercise open/edit/save, DOCX export and PDF export.

**Do not upload real patient details or modify the current Nurse Memo production/demo repository for this experiment.**

## Where each input comes from

| Input | Source | Version / integrity handling |
|---|---|---|
| Official EuroOffice editor (sdkjs/web-apps/dictionaries) | `Euro-Office/DocumentServer` GitHub Release | **v9.3.5 final**, AMD64 Debian `.deb` discovered via the exact-tag GitHub release API; Debian control fields checked |
| Offline browser host and fonts | `Ranuts/document` | Exact commit `1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd`, verified before applying local patch |
| Standalone browser adapter | Included `scripts/vendor` integration script and patch from the earlier v4 integration | Kept largely unchanged; version-sensitive anchors fail closed |
| Document converter | `@kreijstal/eurooffice-sdkjs-common` npm package | **9.3.5-rc.1.build.1**, both WASM and JS file digests checked; **compatibility with final editor unproven** |
| Build dependencies | Ranuts lockfile / pnpm registry | `pnpm install --frozen-lockfile` with pnpm 11.4.0 and Node 24 |

This recipe is **not self-contained**. The downloaded GitHub and npm inputs are required at build time, as requested for this temporary test. The published site has no document-processing backend.

## Version control and release discovery

The file `scripts/versions.json` is the single configuration for release tag, Debian package version, Ranuts revision, and converter version and SHA-256 pins. For this test, **do not change the converter version or hashes without independently inspecting the new package**.

`scripts/resolve-eurooffice-deb.mjs` uses GitHub's release metadata for the exact tag `v9.3.5`, selecting exactly one official AMD64 `.deb`. It does not assume that the upstream package is named `euro-office-documentserver_9.3.5_amd64.deb`; upstream has changed build suffixes in the past. The script rejects ambiguity or untrusted asset URLs. After the download, `dpkg-deb -f` verifies the package name, final `9.3.5` version (allowing a Debian revision suffix), and AMD64 architecture. If the GitHub API supplies an asset SHA-256 digest, it is verified; the observed SHA-256 is always logged. Optionally set the Actions repository variable `EUROOFFICE_DEB_SHA256` to a known, trusted 64-character SHA-256 for an additional check.

The converter is also checked **before** building Vite, **after** Vite, and **after** static packaging. Old Ranuts `.br` files are removed and cannot overwrite the canonical converter, preserving the v4 fix for the `Import #0 "env"` error. This safeguards converter consistency, *not* editor/converter cross-version compatibility.

## Expected failure modes

| First failing step or message | Interpretation / next action |
|---|---|
| `RELEASE RESOLUTION FAILED` | GitHub API unavailable, no matching official AMD64 `.deb`, or multiple candidates. Check the release; do not bypass the fail-closed check. |
| Debian control version mismatch | Release asset may be mislabeled or built from a different version. Retain the log and investigate before using it. |
| `npm pack` fails | Converter package unavailable. See manual mirror fallback below. |
| `git apply --check` | The pinned Ranuts checkout does not match the existing patch. |
| `INCOMPATIBLE Euro-Office web-apps bundle` | Official v9.3.5 changed an internal webpack/minified symbol expected by the old offline adapter. Adapter source work is required. |
| Transplant references missing files | EuroOffice's final package layout differs from the RC. Inspect the genuine release package rather than adding placeholder files. |
| `Incompatible x2t WASM/JS pair` / SHA mismatch | Downloaded converter is different from the known RC pair; do not disable verification. |
| Failed DOCX/PDF workflow despite green build | Runtime editor/adapter/converter incompatibility, which CI static tests cannot prove away. Preserve the current v4 site. |

### Manual fallback if the converter npm archive disappears

In the **test repository**, create a GitHub Release with tag `editor-inputs`. Upload the **actual original archive** named `eurooffice-sdkjs-common-9.3.5-rc.1.build.1.tgz` to that release, then rerun Actions. The workflow tries this exact filename if `npm pack` fails. Do not fabricate a converter archive, remove digests or use the unrelated Ranuts `x2t.wasm.br` file.

## Testing checklist

After the GitHub Actions build and deployment succeed:

1. Use **Check deployed converter assets** and copy the diagnostic result.
2. Open a **fictional** DOCX with headings, paragraphs, lists and a table. Confirm pages actually render; an "open acknowledged" event alone is not enough.
3. Edit text, invoke Save, export DOCX and reopen the export to inspect the actual text and layout.
4. Export PDF, open it in a PDF viewer and verify layout, not merely the `%PDF-` header.
5. Test read-only/editable toggles and repeated document opens.
6. Watch browser Console/Network for incorrect SDK paths, converter `.wasm` imports and uncaught exceptions.

A green build means the static package was assembled and structural checks passed. **It does not certify that official v9.3.5 works with the third-party RC converter.**

## License and attribution

Preserve `LICENSES/`, the upstream Ranuts `LICENSE` and `NOTICE` copied into the distribution, and the generated `PROTOTYPE-NOTICES.txt`. The third-party browser integration and the official editors are based on AGPL-licensed software. This experimental distribution is not approved for clinical deployment. Review corresponding-source and attribution requirements before wider redistribution.

## Local checks performed on this ZIP

The source-level tests (`node --test tests/*.test.mjs`), syntax checks (`bash -n scripts/build-poc.sh`, `python3 -m py_compile ...`) and simulated Pages packaging tests can run without downloads. The entire 500+ MB Debian build and browser-level DOCX/PDF operations **could not be run in this environment due to unavailable outbound network access**. The first GitHub Actions run remains the actual compatibility test.
