# EuroOffice-first browser editor + WASM x2t (experimental)

**Status: the repository is complete and locally tested, but the full upstream WebAssembly build has NOT been executed successfully or demonstrated on a real EuroOffice release.** This is not a verified production editor. **Do not upload identifiable patient, employee, or other confidential documents.** This project is unofficial and is not affiliated with Euro-Office, CryptPad, or Ranuts.

This repository replaces the previous *Approach B* GitHub Actions experiment. It is a fresh implementation of the **EuroOffice-first source strategy**, not another iteration of the mass three-way merge.

## The essential difference

| Previous pipeline | This repository |
| --- | --- |
| Diff CryptPad's bundled modified ONLYOFFICE core against an old ONLYOFFICE tag | Start with the **actual EuroOffice core** pinned by the chosen official DocumentServer release |
| Stage ~8,000 source differences, fail on ~75 unrelated conflicts | No bulk core comparison or automatic upstream C++ transplant |
| Require a conflict-free generic merge before compilation | Attempt the compiler using EuroOffice's own source; diagnose genuine compiler errors |
| Implicit CryptPad C++ changes | Explicit and auditable compatibility inputs: three pinned doctrenderer stub files only, plus manually approved, SHA-256-pinned EuroOffice patches |
| Download big official Debian package before trying Emscripten | Compile the converter **first**, then obtain the matching official package |
| Optional diagnostic artifact could be absent | Capture a compiler-log tail, source SHA and source/recipe reports; show run-summary text |

**Important distinction:** CryptPad's original *Emscripten build tooling* is still used, pinned to commit `95f775fd3c42fae9e9af66ca072d3da3763e6c76`. Its complete modified `core/` source is **not checked out** by the sparse recipe checkout and any existing recipe `core/` is explicitly removed before staging EuroOffice's exact source. However, three **specifically allowlisted WASM doctrenderer compatibility files** are fetched as Git blobs from that pinned CryptPad commit, SHA-256 recorded, and copied into an isolated Docker doctrenderer build stage. This is a narrowly documented source adaptation, not a zero-modification EuroOffice compilation. This does not mean EuroOffice has an officially supported standalone x2t WASM build system. The legacy recipe may still need carefully ported compatibility fixes.

## Get started (GitHub website; no CLI needed)

1. Create a **new public or private GitHub repository** for this experiment; leave your existing functioning Nurse Memo project unchanged.
2. Upload the contents of the supplied ZIP to the new repository. Ensure the hidden `.github/workflows/eurooffice-first-wasm.yml` file is present. On Mac, Finder's **Command + Shift + .** shows hidden files.
3. Go to **Settings > Pages**, choose **GitHub Actions** as the build/deploy source.
4. Go to **Actions**, select **EuroOffice-first browser WASM build (experimental)**, then **Run workflow**. Leave `release_tag` blank for GitHub's latest stable EuroOffice release, or enter a specific valid tag such as `v9.3.5`.
5. Open that run's **Summary** and the `compile-and-publish` job. Read the actual failing step if compilation stops. After a failure, look for the `eurooffice-first-build-diagnostics` artifact **on the run summary page**, not inside the job log. GitHub only displays this section if an upload took place. The relevant errors should also be in the job's compiler log.
6. A successful workflow deploys an experimental browser editor at your GitHub Pages address. **Build success alone is not clinical-document validation**: exercise loading, editing and exporting fictional Word files, formatting, PDF, and the browser console before trusting any features.

A standard GitHub-hosted runner has limited disk and memory. The entire converter is a large C++ build. Even a correct recipe may need a larger runner; the `340`-minute job timeout does not guarantee sufficient resources.

## Actual build sequence

1. **Local tests:** shell/Python/JavaScript syntax, release/package selection, source-staging, compiled-pair integrity and Pages packaging tests.
2. **Resolve release:** GitHub's official `Euro-Office/DocumentServer` stable release API, with optional pinned tag; validate release asset URLs and published digests.
3. **Verify exact source:** checkout the release's **named tag**. Read the `core` Git submodule commit from `HEAD:core` and verify its checked-out SHA. No floating `main`, latest `core`, or guessed equivalent tag.
4. **Prepare build toolchain:** sparse-checkout only the pinned `cryptpad/onlyoffice-x2t-wasm` build scripts. Delete any pre-existing bundled `core` directory, then stage a *copy* of the official EuroOffice release source, leaving the original untouched. Only the three explicitly named compatibility blobs are subsequently fetched by `git show` (no full bundled core checkout).
5. **Apply only explicit source patches:** inspect `patches/manifest.json` for allowlisted paths and file hashes, tied to that exact core commit. The manifest starts with **no patches**. This is intentional, not a claim that zero changes will necessarily compile.
6. **Stage pinned WASM compatibility files:** `scripts/stage-wasm-compat.py` checks the pinned CryptPad Git tree for `doctrenderer_empty.cpp`, `docbuilder_empty.cpp` and `docbuilder_p_empty.cpp`, rejects non-regular/missing/oversized blobs and unexpected official source targets, then writes exactly three files to `wasm-compat/` *outside* the staged EuroOffice `core/`. It records each Git blob identity, byte count and SHA-256 in `.work/wasm-compat-report.json`. These stubs may fail to compile against newer EuroOffice interfaces.
7. **Generate and audit Docker adapter:** the recipe adapter replaces the three unusable `RUN cp ..._empty.cpp` lines with three explicit `COPY wasm-compat/...` instructions scoped to the Docker `doctrenderer` stage. It adds the missing Gumbo stage, and an export stage for `x2t.js` and `x2t.wasm`. Before Docker starts, it audits all local Docker `COPY` inputs and stops on missing paths. The generated Dockerfile digest and input count are in `.work/build-recipe-report.json`.
8. **Attempt real Emscripten compilation:** `docker buildx build` against the staged EuroOffice source, with the three explicitly documented temporary Docker-only stubs. No original CryptPad converter binary, RC1, or old release is accepted as a fallback. Failure is a real compilation/toolchain issue, not an automatic permission to replace EuroOffice files.
9. **Verify emitted converter pair:** compile manifest records core SHA, approved patches, the three compatibility source hashes and JS/WASM SHA-256 values; WebAssembly imports must match the browser loader ABI.
10. **Get official editor assets:** select and download the official AMD64 `.deb`, inspecting its internal Debian `Package`, `Version`, and `Architecture`. The filename is a *hint only*; future strange `.deb` filenames are handled. Extract only the needed editor assets.
11. **Assemble browser site:** reuse a pinned `Ranuts/document` browser-only UI integration and transfer the official EuroOffice editor assets. Generate a gzip WASM copy from the verified raw converter (GitHub Pages cannot set Brotli `Content-Encoding` on demand). Enforce final file and provenance checks before publication.

The browser proof of concept is Word-focused. The converter may support additional input formats, but XLSX/PPTX editors are not published in this version and no guarantee of their output quality is made.

## Source patches: how to add one safely

`patches/manifest.json` initially contains:

```json
{
  "schema": 1,
  "coreCommit": "",
  "patches": []
}
```

**Do not fill it with the old 75-conflict dump.** When a compiler error reveals a *specific necessary* adaptation, review the change against the exact official release. Put a standalone unified Git patch, e.g. `0001-wasm-compat.patch`, inside `patches/`. Set `coreCommit` to the source commit printed in GitHub Actions. Add an entry with the patch's SHA-256 and the **exact paths it may modify**:

```json
{
  "schema": 1,
  "coreCommit": "<40-character official commit SHA>",
  "patches": [
    {
      "file": "0001-wasm-compat.patch",
      "sha256": "<64-character actual SHA-256 of patch file>",
      "allowedPaths": ["X2tConverter/src/example.cpp"]
    }
  ]
}
```

These placeholders are examples, not patches to apply. `scripts/stage-official-core.py` verifies the source commit, tracked-file cleanliness, patch contents, digest and allowlist, checks each patch before applying it and modifies **only the staged copy**. It rejects unreviewed source changes, unapproved files, symlink edits and stale patches rather than guessing.

## Repository contents

- `.github/workflows/eurooffice-first-wasm.yml` — single manual Actions build/publish pipeline.
- `scripts/resolve-release.mjs`, `scripts/select-release-deb.mjs` — resolve stable release and identify real Debian package architecture.
- `scripts/prepare-release-core.sh`, `scripts/verify-git-tag-checkout.sh` — release tag and submodule identity.
- `scripts/stage-official-core.py`, `patches/manifest.json` — no bulk merge; explicitly approved source patches only.
- `scripts/stage-wasm-compat.py` — extracts precisely three version-pinned doctrenderer compatibility files; hash and provenance report.
- `scripts/prepare-recipe.py`, `scripts/build-matching-wasm.sh` — pinned compiler recipe, explicit Docker COPY inputs, and pre-build missing-source audit.
- `scripts/create-converter-manifest.mjs`, `scripts/check-converter-pair.mjs` — converter identity/integrity.
- `scripts/build-poc.sh`, `scripts/package-site.mjs`, `scripts/verify-site.mjs` — Debian/editor integration and final publication checks.
- `scripts/vendor/` — Ranuts browser adapter and editor-file transplant, retained from the previous experimental repository.
- `site/` — browser demonstration harness; `tests/` — automated fixtures.
- `docs/KNOWN_LIMITATIONS.md` — remaining engineering risks and expected next investigation.

## Testing and limitations

Run the local tests (Node.js 24, Git and Python 3):

```bash
bash -n scripts/*.sh
python3 -m py_compile scripts/*.py
for f in scripts/*.mjs site/poc.js; do node --check "$f"; done
node --test tests/*.test.mjs
```

Local tests cover Git-managed fixture repositories, sparse Git checkouts and pinned three-file extraction, valid/missing/conflicting patches, unmodified EuroOffice staging, Docker stage-adapter integrity, release/package architecture resolution, source-tag identity and HTML/WASM packaging. **They do not compile the many-gigabyte upstream EuroOffice tree**. Full real Emscripten build, browser document round trips and license verification remain necessary.

A failure in C++ compilation is **not** a test-suite failure and should be addressed by reading the exact compiler output. Source-level changes should be limited to evidence-backed adaptations; never silence errors by substituting a mismatched old WASM or wiping upstream changes.

## Licenses and security

Source/editor assets may be subject to AGPL-3.0 and component-specific third-party/font licenses; see `LICENSES/` and the actual upstream notices. Obtain legal review before using or distributing in a hospital. The prototype runs locally in the browser for document editing, but hosting it on GitHub Pages is **not** evidence of compliance with healthcare privacy, cybersecurity or licensing requirements.

Upstream references:

- https://github.com/Euro-Office/DocumentServer
- https://github.com/Euro-Office/core
- https://github.com/cryptpad/onlyoffice-x2t-wasm
- https://github.com/ranuts/document
