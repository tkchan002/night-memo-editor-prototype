#!/usr/bin/env bash
# EuroOffice-first: exact release core + individually approved local patches.
# CryptPad is a PINNED COMPILER RECIPE ONLY, never the source of core files.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WORK="$ROOT/.work"
OFFICIAL="$WORK/official-source/core"
RECIPE="$WORK/cryptpad-wasm-recipe"
EXPECTED="$(cat "$WORK/official-core-commit.txt")"
RECIPE_SHA='95f775fd3c42fae9e9af66ca072d3da3763e6c76'
[[ "$(git -C "$OFFICIAL" rev-parse HEAD)" == "$EXPECTED" ]] || {
  echo 'Official EuroOffice core checkout changed' >&2; exit 1;
}
if [[ ! -d "$RECIPE/.git" ]]; then
  # Sparse partial clone fetches build tools, not the giant bundled modified
  # CryptPad /core source tree. Source always comes from EuroOffice gitlink.
  git clone --filter=blob:none --no-checkout \
    https://github.com/cryptpad/onlyoffice-x2t-wasm.git "$RECIPE"
  git -C "$RECIPE" sparse-checkout init --no-cone
  git -C "$RECIPE" sparse-checkout set --no-cone \
    '/Dockerfile' '/embuild.sh' '/pre-js.js' '/wrap-main.cpp' '/test.js'
fi
git -C "$RECIPE" checkout --detach "$RECIPE_SHA"
for file in Dockerfile embuild.sh pre-js.js wrap-main.cpp test.js; do
  [[ -s "$RECIPE/$file" ]] || { echo "Pinned CryptPad compiler recipe missing $file" >&2; exit 1; }
done
[[ "$(git -C "$RECIPE" rev-parse HEAD)" == "$RECIPE_SHA" ]] || exit 1
# The bundled modified core must be REMOVED and not copied into the build.
rm -rf "$RECIPE/core"
python3 scripts/stage-official-core.py \
  --source "$OFFICIAL" --output "$RECIPE/core" \
  --core-sha "$EXPECTED" \
  --manifest "$ROOT/patches/manifest.json" --patches-dir "$ROOT/patches" \
  --report "$WORK/official-core-staging.json"
python3 scripts/prepare-recipe.py \
  --recipe "$RECIPE" \
  --out "$RECIPE/EuroOffice-converter.Dockerfile" \
  --report "$WORK/build-recipe-report.json"
mkdir -p "$WORK/matching-converter" "$WORK/diagnostics"
record_failure() {
  status=$?
  if [[ -f "$WORK/docker-build.log" ]]; then
    tail -n 1500 "$WORK/docker-build.log" > "$WORK/diagnostics/docker-build-tail.log" || true
  fi
  printf 'EuroOffice source build failed with status %s.
Release: %s
Core: %s
' \
    "$status" "${EO_RELEASE_TAG:-unknown}" "$EXPECTED" > "$WORK/diagnostics/failure.txt"
}
trap record_failure ERR
# The pinned compiler is expensive; a failed Emscripten run is still an honest
# compatibility result, not permission to silently import older C++ files.
docker buildx build --progress=plain \
  --target eurooffice-converter-export \
  --output "type=local,dest=$WORK/matching-converter" \
  --file "$RECIPE/EuroOffice-converter.Dockerfile" "$RECIPE" 2>&1 | tee "$WORK/docker-build.log"
for name in x2t.js x2t.wasm; do
  [[ -s "$WORK/matching-converter/$name" ]] || {
    echo "Compiled converter missing $name" >&2; exit 1;
  }
done
node scripts/create-converter-manifest.mjs "$WORK/matching-converter"
