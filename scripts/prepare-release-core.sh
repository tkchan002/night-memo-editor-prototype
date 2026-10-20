#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
: "${EO_RELEASE_TAG:?}"
SERVER="$ROOT/.work/official-source"
if [[ ! -d "$SERVER/.git" ]]; then
  git clone --filter=blob:none --depth 1 --branch "$EO_RELEASE_TAG" https://github.com/Euro-Office/DocumentServer.git "$SERVER"
fi
[[ "$(git -C "$SERVER" describe --tags --exact-match HEAD)" == "$EO_RELEASE_TAG" ]] || {
  echo 'DocumentServer source checkout does not match selected release tag.' >&2; exit 1;
}
GITLINK="$(git -C "$SERVER" rev-parse HEAD:core)"
[[ "$GITLINK" =~ ^[a-f0-9]{40}$ ]] || { echo 'Release does not pin a valid core gitlink'; exit 1; }
git -C "$SERVER" submodule update --init core
[[ "$(git -C "$SERVER/core" rev-parse HEAD)" == "$GITLINK" ]] || { echo 'Core checkout does not match release gitlink'; exit 1; }
mkdir -p "$ROOT/.work"
printf '%s\n' "$GITLINK" > "$ROOT/.work/official-core-commit.txt"
echo "Verified ${EO_RELEASE_TAG} core gitlink: ${GITLINK}"
