#!/usr/bin/env bash
# Builds matching x2t (not the older RC1 WASM) via CryptPad's documented
# Emscripten Docker recipe after strict source patch porting.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
WORK="$ROOT/.work"
RECIPE="$WORK/cryptpad-wasm-recipe"
# Known recipe revision from the already verified @kreijstal publisher scripts.
# The preflight performs a non-mutating three-way merge against the exact
# official core and writes full diagnostics when incompatible.
bash "$ROOT/scripts/preflight-wasm-port.sh"
# Replace the recipe's bundled core with the exact release core PLUS the ported
# WebAssembly adjustments. Retain the recipe build tooling and Emscripten flags.
rm -rf "$RECIPE/core"
mkdir -p "$RECIPE/core"
cp -a "$WORK/official-source/core/." "$RECIPE/core/"
# Drop nested Git metadata to keep build context stable and much smaller.
rm -rf "$RECIPE/core/.git"
python3 "$ROOT/scripts/apply-wasm-port.py" "$RECIPE/core" "$WORK/wasm-port-report.json"
# BuildKit compiles the actual matching core. Isolated output stage copies ONLY
# the two browser converter artifacts, never native Document Server executables.
cp "$ROOT/scripts/converter-output.Dockerfile" "$RECIPE/EuroOffice-converter.Dockerfile"
# BuildKit reads extended Dockerfile, including COPY rules defined by CryptPad.
# Source is vetted by an explicit commit; Dockerfile is not fetched unpinned.
python3 "$ROOT/scripts/combine-dockerfile.py" "$RECIPE/Dockerfile" "$RECIPE/EuroOffice-converter.Dockerfile"
mkdir -p "$WORK/matching-converter"
docker buildx build --progress=plain --target eurooffice-converter-export \
  --output "type=local,dest=$WORK/matching-converter" \
  --file "$RECIPE/EuroOffice-converter.Dockerfile" "$RECIPE"
for f in x2t.js x2t.wasm; do
  [[ -s "$WORK/matching-converter/$f" ]] || { echo "Missing built converter: $f"; exit 1; }
done
node "$ROOT/scripts/create-converter-manifest.mjs" "$WORK/matching-converter"
