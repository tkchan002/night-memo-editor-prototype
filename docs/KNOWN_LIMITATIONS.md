# Engineering limitations and risk register

## Proven vs not proven

The JavaScript/Python/shell tooling, Git source identity rules, fixture-stage patch safety, and WASM/Pages packaging rules have automated tests. The full Emscripten build of EuroOffice v9.3.5 has **not** been completed in this environment. There are no official compiled EuroOffice-based `x2t.js`/`x2t.wasm` artifacts inside this repository.

The new strategy removes the 75 merge conflicts but does **not** imply that CryptPad's current Emscripten recipe will compile untouched EuroOffice. The converter main program and its dependencies may require explicit adaptation.

## Anticipated breakpoints

1. **Pinned recipe age and toolchain**: CryptPad recipe selects emsdk 4.0.11 and has its own Qt/qmake and library build steps. EuroOffice's current C++ libraries and system dependencies may have changed.
2. **Gumbo parser**: The upstream recipe references an undefined `gumbo` stage. This repository's auditable adapter builds Gumbo from the recipe's existing HTML stage; compilation must still be confirmed in Docker.
3. **CMake/Qt**: The legacy recipe uses `embuild.sh` and qmake `.pro` targets; official EuroOffice C++ changes may require newer flags or include paths.
4. **C++ differences**: Old TLS and OpenSSL source, V8, PDF libraries and other unrelated CryptPad-specific modifications are NOT automatically imported. If genuinely required for WASM, port only the exact necessary changes after reviewing security implications.
5. **Browser ABI**: Pair integrity checks require the generated Emscripten JS and WASM to use compatible imports for the pinned Ranuts loader; ABI drift stops publication.
6. **Debian download**: Only after the converter compiles does the workflow acquire the official AMD64 Debian package and match exact package metadata. This can fail for changes to upstream package structure.
7. **Font and license distribution**: A compiler success does not establish a legally distributable set of fonts or compliance with AGPL requirements.
8. **Functionality**: Browser UI can load while document conversion fails. Real functional tests on fictional input/output are still required.

## Diagnostics

On failure, read the `Compile release-matched x2t with EuroOffice-first source` log in the failed Actions job first. The workflow uploads source/recipe provenance, release metadata and the last 1500 lines of Docker output if produced, as `eurooffice-first-build-diagnostics` (the artifact appears only if GitHub successfully uploads it). The job run summary prints the expected official core SHA. A failed workflow does not deploy the site.

## Scope boundaries

No automatic patching based on whole-repository diff. No dynamic fallback to a previously published converter. No production clinical data. No guarantee of PDFs or XLSX/PPTX conversion. A green unit-test run is not evidence of a successful full WASM build.
