#!/usr/bin/env bash
# Verify the checkout by the *named tag's peeled commit*, not by git describe.
# Usage: verify-git-tag-checkout.sh <repo> <tag> [expected immutable commit SHA]
set -Eeuo pipefail
if (( $# < 2 || $# > 3 )); then
  echo 'Usage: verify-git-tag-checkout.sh <repo> <tag> [expected-40-hex-sha]' >&2
  exit 2
fi
REPO="$1"
TAG="$2"
EXPECTED="${3:-}"
if [[ -z "$TAG" || "$TAG" == -* || "$TAG" == *'..'* || "$TAG" == *'@{'* || "$TAG" == *'~'* || "$TAG" == *'^'* || "$TAG" == *':'* || "$TAG" == *'\\'* || "$TAG" == *' '* ]]; then
  echo "Invalid source tag name: $TAG" >&2
  exit 2
fi
if [[ -n "$EXPECTED" && ! "$EXPECTED" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Expected commit must be a full lowercase 40-character SHA-1' >&2
  exit 2
fi
if ! git -C "$REPO" rev-parse --is-inside-work-tree 2>/dev/null | grep -qx true; then
  echo "Not a Git worktree: $REPO" >&2
  exit 1
fi
HEAD_SHA="$(git -C "$REPO" rev-parse --verify HEAD^{commit})"
TAG_SHA="$(git -C "$REPO" rev-parse --verify --quiet "refs/tags/$TAG^{commit}" || true)"
echo "Checked-out commit: $HEAD_SHA"
echo "Requested upstream tag: $TAG"
echo "Tag's commit: ${TAG_SHA:-MISSING}"
if [[ -n "$EXPECTED" ]]; then
  echo "Pinned expected commit: $EXPECTED"
fi
if [[ -z "$TAG_SHA" ]]; then
  echo "Source verification failed: the exact tag refs/tags/$TAG is not present in $REPO" >&2
  exit 1
fi
if [[ "$HEAD_SHA" != "$TAG_SHA" ]]; then
  echo "Source verification failed: checkout HEAD does not match the commit tagged $TAG" >&2
  exit 1
fi
if [[ -n "$EXPECTED" && "$TAG_SHA" != "$EXPECTED" ]]; then
  echo "Source verification failed: tag $TAG does not point to its independently verified pinned commit" >&2
  exit 1
fi
if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]; then
  echo 'Source verification failed: tracked source files were modified after checkout' >&2
  exit 1
fi
echo "Verified exact tag checkout: $TAG -> $HEAD_SHA"
