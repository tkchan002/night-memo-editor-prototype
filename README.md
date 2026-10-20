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

1. `scripts/resolve-release.mjs` retrieves GitHub's latest stable `Euro-Office/DocumentServer` release. Any unique, large `.deb` asset may be considered, irrespective of arbitrary filename. It refuses multiple candidates.
2. `scripts/build-poc.sh` downloads the selected asset and uses `dpkg-deb` to verify the **internal package name, version and architecture**. Filename alone is not trusted. GitHub `sha256` digest is checked when provided.
3. `scripts/prepare-release-core.sh` checks out the *same release tag* from the official DocumentServer repository and extracts its **exact `core` Git submodule commit**. It verifies the checked-out SHA.
4. `scripts/port-wasm-changes.py` derives CryptPad's WASM source modifications by comparing its pinned `core` against the ONLYOFFICE `v9.3.0.140` baseline cited in CryptPad's documentation.
5. `scripts/apply-wasm-port.py` attempts to port only these changes onto an isolated copy of the release-matched Euro-Office core, with **no fuzzy patching**. If source differences cannot be reconciled safely, the build **fails** rather than copying an old converter.
6. `scripts/build-matching-wasm.sh` builds the modified matched source with the pinned CryptPad Dockerfile/Emscripten recipe. It extracts `x2t.js` and `x2t.wasm` directly from the same build, verifies their ABI and generates SHA-256 provenance.
7. The pinned Ranuts browser integration and Euro-Office editor files are assembled. The converter binaries are installed AFTER the Ranuts build as well, preventing old `.wasm.br` from replacing the new converter. Packaging verifies the final hashes and deploys **only** verified static assets.

## What is NOT guaranteed

- CryptPad's original WASM source modifications **may not apply** to the newer official Euro-Office core. This is the largest unresolved risk. Porting changes across versions requires human source review when conflicts occur.
- Even if the native code compiles, browser loading and DOCX/PDF import/export must be tested. A matching source revision and correct `x2t.js`/`x2t.wasm` pair do **not** prove document-format compatibility or layout fidelity.
- Docker dependencies are substantial. This has **not** been compiled against the official 9.3.5 source in this environment; network downloads of upstream components are not available here.
- Future releases may alter the `.deb` structure, the `sdkjs` browser API, or WASM compiler requirements. No version is silently substituted.
- Publication on GitHub Pages is a technical prototype only, not a hospital deployment or licensing approval.

## Troubleshooting

| Failure | Meaning |
|---|---|
| `Expected exactly one large .deb` | GitHub release has no usable/unique Debian artifact. Listed filenames show what is available. |
| `Unexpected Debian package identity` | The asset has the wrong internal package name, version or architecture. |
| `Core checkout does not match release gitlink` | Cannot obtain the exact source used by official release. |
| `WASM port does not apply cleanly` | The older Emscripten changes cannot safely be applied to the new core. A source-level port is necessary. No RC1 binary is used. |
| Docker `No space left on device` / OOM | Standard GitHub runner insufficient for full C++ WASM compilation. Consider larger Linux runner. |
| `Unexpected WASM ABI imports` | Generated WASM/JS ABI differs from the browser bridge; requires adapting the loader, not bypassing checks. |
| DOCX opens but exports incorrectly | Source revisions match, but runtime integration or document format has changed. Compare against working RC1. |

## Licensing and provenance

The editor incorporates code from [Ranuts/document](https://github.com/ranuts/document), [Euro-Office](https://github.com/Euro-Office/DocumentServer), and [CryptPad's x2t WASM recipe](https://github.com/cryptpad/onlyoffice-x2t-wasm). The corresponding AGPL and third-party notices must be preserved, reviewed, and completed before publicly distributing compiled binaries. Font licensing is particularly important. The generated Pages site is a research demonstration only.

## Tests in this source ZIP

`node --test tests/*.test.mjs` checks release resolution, renamed `.deb` behavior, source version pinning, error guards, and the absence of the old RC1 binary path. Syntax checks cover shell scripts, Node scripts and the source-port Python files. **These are not end-to-end build, browser or licensing tests.**
