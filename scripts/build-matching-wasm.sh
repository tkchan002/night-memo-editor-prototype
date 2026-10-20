#!/usr/bin/env bash
# Builds matching x2t (not the older RC1 WASM) via CryptPad's documented
# Emscripten Docker recipe after strict source patch porting.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
WORK="$ROOT/.work"
RECIPE="$WORK/cryptpad-wasm-recipe"
# Known recipe revision from the already verified @kreijstal publisher scripts.
RECIPE_COMMIT='95f775fd3c42fae9e9af66ca072d3da3763e6c76'
BASELINE="$WORK/onlyoffice-cryptpad-baseline"
if [[ ! -d "$RECIPE/.git" ]]; then
  git clone https://github.com/cryptpad/onlyoffice-x2t-wasm.git "$RECIPE"
fi
git -C "$RECIPE" checkout --detach "$RECIPE_COMMIT"
[[ "$(git -C "$RECIPE" rev-parse HEAD)" == "$RECIPE_COMMIT" ]] || exit 1
# CryptPad README identifies this exact baseline of the ONLYOFFICE core.
# The delta to its modified core is the WASM port that we try to apply to EO.
if [[ ! -d "$BASELINE/.git" ]]; then
  git clone --filter=blob:none --depth 1 --branch v9.3.0.140 https://github.com/ONLYOFFICE/core.git "$BASELINE"
fi
[[ -f "$BASELINE/X2tConverter/X2tConverter.pro" || -d "$BASELINE/X2tConverter" ]] || {
  echo 'Unexpected baseline core layout' >&2; exit 1;
}
python3 "$ROOT/scripts/port-wasm-changes.py" \
  "$BASELINE" "$RECIPE/core" "$WORK/official-source/core" \
  "$WORK/wasm-port-report.json"
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
