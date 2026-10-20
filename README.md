# EuroOffice × Ranuts — Approach B: matched-source x2t auto-build

**Experimental and unverified end-to-end. Do not use for clinical/patient data.**

This repository is a **build experiment**, not a verified stable release. It attempts to build a browser-only Euro-Office Word editor using **the latest stable Euro-Office DocumentServer release AND the `core` source commit pinned by that same release**. It attempts to compile `x2t.js` and `x2t.wasm` from that matching core with an adapted CryptPad recipe. This project is unofficial and not affiliated with Euro-Office, Ranuts, or CryptPad.

## Your browser-only setup

1. **Keep your working RC1 editor repository untouched.** Create a separate GitHub repository (`night-memo-editor-approach-b-test`) at https://github.com/new.
2. Extract the ZIP, upload its *contents* to the new repository using GitHub's website. Make sure `.github/` is included (Mac Finder: Command+Shift+period reveals dotfolders).
3. Under repository **Settings → Pages**, select **GitHub Actions** as the source.
4. Under **Actions**, manually run **EuroOffice Approach B - Matched WASM Experimental Build**. Leave the version blank for the latest stable release or enter e.g. `v9.3.5` to pin it.
5. Inspect Actions logs. The job first selects the release, then verifies Debian package identity, resolves the exact `core` Git submodule SHA, attempts a strict WASM source port, compiles it using Docker, and builds/deploys the browser editor *only if all checks pass*.
6. If successful, open the experimental Pages site, click **Check deployed converter assets**, then test a **fictional** DOCX (opening, editing, read-only, DOCX round trip, PDF export, pagination and formatting).

**This build is resource intensive.** Building CryptPad's converter and its many C++ dependencies can exceed a standard hosted GitHub runner's disk capacity, memory or runtime. The workflow allows 340 minutes, but this does not guarantee sufficient runner resources. If it runs out of disk or RAM, a larger Linux runner may be needed. You do not need to install a local toolchain.

## Version/source guarantee

1. `scripts/resolve-release.mjs` retrieves GitHub's latest stable `Euro-Office/DocumentServer` release and verifies the **official URL and optional SHA-256 digest** of every candidate `.deb`. It writes `.work/release-candidates.json`. It does **not** assume that the release contains only one Debian asset.
2. Because this workflow runs on `ubuntu-24.04` (AMD64), it skips assets **clearly labeled ARM64**, while retaining unknown/renamed `.deb` packages for inspection. Filename architecture is only a download optimization, **never sufficient to accept the artifact**. A package renamed to `euro-office-new-very-very-new-real-new.deb` still works.
3. The next step, `scripts/select-release-deb.mjs`, downloads the eligible assets, verifies downloaded size and GitHub SHA-256 if published, then uses `dpkg-deb` to read their **actual Package, Version and Architecture** fields. Exactly one package must be `euro-office-documentserver`, version matching the tag, and `amd64`. More than one match, no match, corrupt downloads or wrong identity all stop the build safely. If several files have unrecognizable names, each must be downloaded to identify its architecture, which may use additional bandwidth and temporary disk space.
4. The selection is saved as `.work/release-selection.json`, and the verified `.deb` is reused in the next step. `scripts/build-poc.sh` checks the recorded SHA-256 again and does **not** download it again. Unneeded examined files are removed before compilation.
5. `scripts/prepare-release-core.sh` checks out the *same release tag* from the official DocumentServer repository and extracts its **exact `core` Git submodule commit**. It verifies the checked-out SHA.
6. `scripts/port-wasm-changes.py` stages the per-file CryptPad changes relative to ONLYOFFICE `v9.3.0.140` (the baseline documented by the pinned CryptPad recipe). It **does not concatenate a giant unified patch**, which could be malformed when source files lack a trailing newline.
7. `scripts/apply-wasm-port.py` performs a **three-way merge** per changed file: original ONLYOFFICE baseline + CryptPad modification + exact EuroOffice release core. It accepts already-present changes, automatically merges non-overlapping edits, and refuses overlapping edits or incompatible additions/deletions. **All source merges are calculated before any target file is modified.** No fuzzy patching, old converter fallback, or wholesale replacement of upstream source. On conflict, download the `eurooffice-wasm-port-diagnostics` artifact in the failed GitHub Actions run for JSON report and merge previews.
8. `scripts/build-matching-wasm.sh` builds the modified matched source with the pinned CryptPad Dockerfile/Emscripten recipe. It extracts `x2t.js` and `x2t.wasm` directly from the same build, verifies their ABI and generates SHA-256 provenance.
9. The pinned Ranuts browser integration and Euro-Office editor files are assembled. The converter binaries are installed AFTER the Ranuts build as well, preventing old `.wasm.br` from replacing the new converter. Packaging verifies the final hashes and deploys **only** verified static assets.

## What is NOT guaranteed

- CryptPad's WASM adaptations **may conflict with** the newer EuroOffice core. A three-way merge can handle independent updates and already-integrated edits but **cannot ensure semantic/API compatibility**. Resolve any reported conflicts with human source review. Even clean merges may fail to compile.
- Even if the native code compiles, browser loading and DOCX/PDF import/export must be tested. A matching source revision and correct `x2t.js`/`x2t.wasm` pair do **not** prove document-format compatibility or layout fidelity.
- Docker dependencies are substantial. This has **not** been compiled against the official 9.3.5 source in this environment; network downloads of upstream components are not available here.
- Future releases may alter the `.deb` structure, the `sdkjs` browser API, or WASM compiler requirements. No version is silently substituted.
- Publication on GitHub Pages is a technical prototype only, not a hospital deployment or licensing approval.

## Troubleshooting

| Failure | Meaning |
|---|---|
| `No large .deb assets` | The selected GitHub release has no sufficiently large `.deb` attachment. |
| `No possible amd64 Debian package` | All eligible `.deb` assets are explicitly labeled for a different CPU architecture. |
| `Expected exactly one verified ... amd64 .deb` | Debian control metadata does not identify exactly one matching AMD64 EuroOffice package. Inspected package identities are printed. |
| `Failed to download/inspect` | Download failed, declared file size or digest differs, or the `.deb` control section could not be read. |
| `Unexpected Debian package identity` | Downstream validation found an unexpected internal package identity. The earlier selection stage also checks these fields. |
| `Core checkout does not match release gitlink` | Cannot obtain the exact source used by official release. |
| `WASM source port: ... conflict(s)` | Check `eurooffice-wasm-port-diagnostics` in the failed Actions run. The source tree was not modified; review `.work/wasm-port-results.json` and per-file merge previews. Manual source-port work is required. No old binary is substituted. |
| Docker `No space left on device` / OOM | Standard GitHub runner insufficient for full C++ WASM compilation. Consider larger Linux runner. |
| `Unexpected WASM ABI imports` | Generated WASM/JS ABI differs from the browser bridge; requires adapting the loader, not bypassing checks. |
| DOCX opens but exports incorrectly | Source revisions match, but runtime integration or document format has changed. Compare against working RC1. |

## Licensing and provenance

The editor incorporates code from [Ranuts/document](https://github.com/ranuts/document), [Euro-Office](https://github.com/Euro-Office/DocumentServer), and [CryptPad's x2t WASM recipe](https://github.com/cryptpad/onlyoffice-x2t-wasm). The corresponding AGPL and third-party notices must be preserved, reviewed, and completed before publicly distributing compiled binaries. Font licensing is particularly important. The generated Pages site is a research demonstration only.

## Tests in this source ZIP

`node --test tests/*.test.mjs` checks dual-architecture release resolution, arbitrary filename fallback, Debian control-field matching, real small `.deb` inspection including file-size and digest rejection, source version pinning, three-way merge regression cases (including missing final newlines, already-applied edits, independent edits, conflicts, and deletions), error guards, and the absence of the old RC1 binary path. Syntax checks cover shell scripts, Node scripts and the source-port Python files. **These are not end-to-end build, browser or licensing tests.**
