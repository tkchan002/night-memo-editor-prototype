#!/usr/bin/env bash
# Browser-only Euro-Office/Ranuts proof-of-concept. Execute on GitHub Actions Ubuntu.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"
WORK="$ROOT/.work"
RANUTS="$WORK/ranuts"
EO="$WORK/eurooffice"
DOWNLOAD="$WORK/downloads"
mkdir -p "$EO" "$DOWNLOAD"

if [[ ! -f "$RANUTS/package.json" ]]; then
  echo 'ERROR: Ranuts checkout missing. GitHub Actions must check out the pinned revision into .work/ranuts.' >&2
  exit 1
fi
if [[ "$(git -C "$RANUTS" rev-parse HEAD)" != '1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd' ]]; then
  echo 'ERROR: Unexpected Ranuts commit; refusing to apply version-specific offline patches.' >&2
  exit 1
fi

DEB="$DOWNLOAD/euro-office-documentserver_9.3.5-rc.1_amd64.deb"
URL='https://github.com/Euro-Office/DocumentServer/releases/download/v9.3.5-rc.1/euro-office-documentserver_9.3.5-rc.1_amd64.deb'
if [[ ! -s "$DEB" ]]; then
  echo 'Downloading the official Euro-Office DocumentServer .deb (large; GitHub runner only).'
  curl --fail --location --retry 3 --retry-delay 5 --connect-timeout 30 --max-time 1800 --output "$DEB" "$URL"
fi
[[ -s "$DEB" ]] || { echo 'ERROR: .deb download is empty' >&2; exit 1; }
# Optional additional release checksum supplied by the user/IT. Do not invent a digest.
if [[ -n "${EUROOFFICE_DEB_SHA256:-}" ]]; then
  echo "${EUROOFFICE_DEB_SHA256}  ${DEB}" | sha256sum --check --status || { echo 'ERROR: .deb SHA256 mismatch.' >&2; exit 1; }
fi
sha256sum "$DEB" | tee "$DOWNLOAD/eurooffice-deb-sha256.txt"

EO_ROOT="$EO/var/www/euro-office/documentserver"
if [[ ! -d "$EO_ROOT/web-apps" ]]; then
  echo 'Extracting required components only (no installation of the Debian package).'
  # Keep all linked shared assets; the publisher's replacement script handles them.
  dpkg-deb --fsys-tarfile "$DEB" | tar -x -C "$EO" \
    ./var/www/euro-office/documentserver/sdkjs \
    ./var/www/euro-office/documentserver/web-apps \
    ./var/www/euro-office/documentserver/dictionaries
fi
for required in "$EO_ROOT/sdkjs/word/sdk-all-min.js" "$EO_ROOT/web-apps/apps/documenteditor/main/app.js"; do
  [[ -f "$required" ]] || { echo "ERROR: Missing from official Debian package: $required" >&2; exit 1; }
done

echo 'Retrieving the matching x2t WebAssembly package (exact pinned version).'
PKG_NAME='@kreijstal/eurooffice-sdkjs-common@9.3.5-rc.1.build.1'
PKG_ARCHIVE="$DOWNLOAD/eurooffice-sdkjs-common-9.3.5-rc.1.build.1.tgz"
if [[ ! -s "$PKG_ARCHIVE" ]]; then
  if npm pack "$PKG_NAME" --pack-destination "$DOWNLOAD" --ignore-scripts --silent; then
    packed=$(find "$DOWNLOAD" -maxdepth 1 -name '*eurooffice-sdkjs-common*9.3.5-rc.1.build.1*.tgz' -print -quit)
    [[ -n "$packed" ]] && mv "$packed" "$PKG_ARCHIVE"
  fi
fi
# If npm publication disappears, maintainers may upload the already owned archive
# as a GitHub Release asset (tag: editor-inputs) through the browser.
if [[ ! -s "$PKG_ARCHIVE" ]]; then
  echo 'npm pack unavailable. Checking repository Release editor-inputs for a mirror.'
  gh release download editor-inputs --repo "$GITHUB_REPOSITORY" \
    --pattern 'eurooffice-sdkjs-common-9.3.5-rc.1.build.1.tgz' \
    --dir "$DOWNLOAD" || true
fi
[[ -s "$PKG_ARCHIVE" ]] || { echo 'ERROR: matching x2t package unavailable; see README fallback (upload a Release asset via browser).' >&2; exit 1; }
mkdir -p "$WORK/sdk-common"
tar -xzf "$PKG_ARCHIVE" -C "$WORK/sdk-common" \
  package/sdkjs/common/wasm/x2t/x2t.wasm \
  package/sdkjs/common/wasm/x2t/x2t.js
X2T="$WORK/sdk-common/package/sdkjs/common/wasm/x2t"
echo '841ff9b648f0a03a6e610e6f1d0e822a526dd3142eb43a64101653963f4fc35e  '"$X2T/x2t.wasm" | sha256sum --check --status || {
  echo 'ERROR: WASM digest does not match the uploaded and inspected 9.3.5-rc.1.build.1 package.' >&2; exit 1;
}
echo '66c2fe0e6de280d81643ffc7ba31cd9a5205c004b72227c08e78a0821ba0e520  '"$X2T/x2t.js" | sha256sum --check --status || {
  echo 'ERROR: x2t.js digest does not match the matching WASM package.' >&2; exit 1;
}

printf 'Checking author-provided Ranuts patch against pinned upstream\n'
git -C "$RANUTS" apply --check "$ROOT/scripts/vendor/ranuts-document.patch"
git -C "$RANUTS" apply "$ROOT/scripts/vendor/ranuts-document.patch"

printf 'Applying the author-provided browser-only engine transplant\n'
python3 "$ROOT/scripts/vendor/eurooffice-into-ranuts.py" "$EO_ROOT" "$RANUTS"
install -Dm644 "$X2T/x2t.wasm" "$RANUTS/public/sdkjs/common/wasm/x2t/x2t.wasm"
install -Dm644 "$X2T/x2t.js" "$RANUTS/public/sdkjs/common/wasm/x2t/x2t.js"

node "$ROOT/scripts/check-transplant.mjs" "$RANUTS/public"

printf 'Installing and building the exact pinned Ranuts application\n'
pnpm --dir "$RANUTS" install --frozen-lockfile
# Required for the original publisher's BASE_PATH patch.
(cd "$RANUTS/packages/shared" && npx tsc -p tsconfig.json)
pnpm --dir "$RANUTS" run build

# `public/` and Vite's compiled `dist/` are distinct trees. Verify the exact
# x2t pair at each boundary; copying before Vite alone did not prevent a
# mismatched converter from appearing in the deployed runtime.
node "$ROOT/scripts/check-converter-pair.mjs" "$X2T"
install -Dm644 "$X2T/x2t.wasm" "$RANUTS/dist/sdkjs/common/wasm/x2t/x2t.wasm"
install -Dm644 "$X2T/x2t.js" "$RANUTS/dist/sdkjs/common/wasm/x2t/x2t.js"
node "$ROOT/scripts/check-converter-pair.mjs" "$RANUTS/dist/sdkjs/common/wasm/x2t"

printf 'Packaging Word-only GitHub Pages build (no server)\n'
node "$ROOT/scripts/package-site.mjs" "$RANUTS/dist" "$ROOT/dist"
node "$ROOT/scripts/verify-site.mjs" "$ROOT/dist"
node "$ROOT/scripts/check-converter-pair.mjs" "$ROOT/dist/office/sdkjs/common/wasm/x2t"
echo 'PASS: static structure and integrity checks. Real browser edit/save/export tests still required.'
