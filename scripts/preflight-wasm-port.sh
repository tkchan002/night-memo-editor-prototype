#!/usr/bin/env bash
# Source-compatibility check: no Debian download, Docker build or source mutation.
# This intentionally cannot resolve genuine upstream C++ conflicts automatically.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.work"
RECIPE="$WORK/cryptpad-wasm-recipe"
BASELINE="$WORK/onlyoffice-cryptpad-baseline"
RECIPE_COMMIT='95f775fd3c42fae9e9af66ca072d3da3763e6c76'
OFFICIAL="$WORK/official-source/core"
[[ -d "$OFFICIAL" ]] || { echo 'Resolve the matching official core before WASM preflight' >&2; exit 1; }
[[ -f "$WORK/official-core-commit.txt" ]] || { echo 'Missing verified official core SHA' >&2; exit 1; }
[[ "$(git -C "$OFFICIAL" rev-parse HEAD)" == "$(cat "$WORK/official-core-commit.txt")" ]] || {
  echo 'Official core differs from pinned DocumentServer gitlink' >&2; exit 1;
}
if [[ ! -d "$RECIPE/.git" ]]; then
  git clone https://github.com/cryptpad/onlyoffice-x2t-wasm.git "$RECIPE"
fi
git -C "$RECIPE" checkout --detach "$RECIPE_COMMIT"
[[ "$(git -C "$RECIPE" rev-parse HEAD)" == "$RECIPE_COMMIT" ]] || exit 1
if [[ ! -d "$BASELINE/.git" ]]; then
  git clone --filter=blob:none --depth 1 --branch v9.3.0.140 https://github.com/ONLYOFFICE/core.git "$BASELINE"
fi
# Verify by the requested tag ref and an independently checked upstream SHA.
# git describe may select a different tag pointing at the same commit.
bash "$ROOT/scripts/verify-git-tag-checkout.sh" "$BASELINE" \
  'v9.3.0.140' '269dd9b8bc9e869fc250f26cefbb908344a533c5'
[[ -d "$RECIPE/core" ]] || { echo 'Pinned CryptPad recipe lacks its modified core' >&2; exit 1; }
python3 "$ROOT/scripts/port-wasm-changes.py" \
  "$BASELINE" "$RECIPE/core" "$OFFICIAL" "$WORK/wasm-port-report.json"
# --check NEVER writes to the official source tree, even on a clean merge.
python3 "$ROOT/scripts/apply-wasm-port.py" "$OFFICIAL" "$WORK/wasm-port-report.json" --check
echo 'WASM source compatibility check passed. This does NOT certify Emscripten compilation.'
