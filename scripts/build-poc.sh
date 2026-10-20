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
# All version identities come from the single checked-in manifest.
version_field() {
  node -e 'const v=require(process.argv[1]); const x=process.argv[2].split(".").reduce((a,k)=>a[k],v); if (typeof x!=="string") process.exit(2); process.stdout.write(x);' "$ROOT/scripts/versions.json" "$1"
}
RELEASE_TAG="$(version_field editor.releaseTag)"
EXPECTED_DEB_VERSION="$(version_field editor.debVersion)"
EXPECTED_ARCH="$(version_field editor.architecture)"
RANUTS_PIN="$(version_field ranuts.commit)"
CONVERTER_VERSION="$(version_field converter.version)"
CONVERTER_NAME="$(version_field converter.npmName)"
[[ "$(git -C "$RANUTS" rev-parse HEAD)" == "$RANUTS_PIN" ]] || {
  echo 'ERROR: Ranuts commit disagrees with versions.json; refusing to patch.' >&2; exit 1;
}

# Resolve asset metadata for the EXACT official release tag, not a guessed filename.
node "$ROOT/scripts/resolve-eurooffice-deb.mjs" > "$DOWNLOAD/release-asset.json"
read_release() {
  node -e 'const a=require(process.argv[1]); const x=a[process.argv[2]]; process.stdout.write(x == null ? "" : String(x));' "$DOWNLOAD/release-asset.json" "$1"
}
DEB_NAME="$(read_release name)"
DEB_URL="$(read_release url)"
DEB_DIGEST="$(read_release digest)"
DEB="$DOWNLOAD/$DEB_NAME"
echo "Official release ${RELEASE_TAG}; AMD64 asset ${DEB_NAME}"
if [[ ! -s "$DEB" ]]; then
  echo 'Downloading official final Euro-Office DocumentServer .deb (GitHub Actions only).'
  rm -f "${DEB}.partial"
  curl --fail --location --show-error --progress-bar --retry 4 --retry-all-errors \
    --retry-delay 5 --connect-timeout 30 --max-time 1800 --output "${DEB}.partial" "$DEB_URL"
  mv "${DEB}.partial" "$DEB"
fi
[[ -s "$DEB" ]] || { echo 'ERROR: release .deb is empty' >&2; exit 1; }
if [[ -n "$DEB_DIGEST" ]]; then
  echo "${DEB_DIGEST#sha256:}  ${DEB}" | sha256sum --check --status || {
    echo 'ERROR: GitHub-published asset digest mismatch.' >&2; exit 1;
  }
else
  echo 'NOTICE: Release API did not include a SHA256; recording the downloaded SHA256 only.'
fi
if [[ -n "${EUROOFFICE_DEB_SHA256:-}" ]]; then
  echo "${EUROOFFICE_DEB_SHA256}  ${DEB}" | sha256sum --check --status || {
    echo 'ERROR: operator-provided .deb SHA256 mismatch.' >&2; exit 1;
  }
fi
sha256sum "$DEB" | tee "$DOWNLOAD/eurooffice-deb-sha256.txt"
actual_arch="$(dpkg-deb -f "$DEB" Architecture)"
actual_version="$(dpkg-deb -f "$DEB" Version)"
actual_package="$(dpkg-deb -f "$DEB" Package)"
[[ "$actual_arch" == "$EXPECTED_ARCH" ]] || { echo "ERROR: Debian architecture ${actual_arch} != ${EXPECTED_ARCH}" >&2; exit 1; }
[[ "$actual_package" == 'euro-office-documentserver' ]] || {
  echo "ERROR: Unexpected Debian package name: $actual_package" >&2; exit 1;
}
case "$actual_version" in
  "$EXPECTED_DEB_VERSION"|"$EXPECTED_DEB_VERSION"-*|"$EXPECTED_DEB_VERSION"+*|"$EXPECTED_DEB_VERSION"~*) ;;
  *) echo "ERROR: Debian control version ${actual_version} is not final ${EXPECTED_DEB_VERSION}" >&2; exit 1 ;;
esac
export EUROOFFICE_DEB_ASSET="$DEB_NAME"
export EUROOFFICE_OBSERVED_DEB_SHA256="$(sha256sum "$DEB" | cut -d ' ' -f 1)"
echo "PASS: official package name=${actual_package}, version=${actual_version}, arch=${actual_arch}"

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

echo 'Retrieving verified RC x2t converter (NOT guaranteed compatible with final v9.3.5).'
PKG_NAME="${CONVERTER_NAME}@${CONVERTER_VERSION}"
PKG_ARCHIVE="$DOWNLOAD/eurooffice-sdkjs-common-${CONVERTER_VERSION}.tgz"
if [[ ! -s "$PKG_ARCHIVE" ]]; then
  if npm pack "$PKG_NAME" --pack-destination "$DOWNLOAD" --ignore-scripts --silent; then
    packed=$(find "$DOWNLOAD" -maxdepth 1 -name "*eurooffice-sdkjs-common*${CONVERTER_VERSION}*.tgz" -print -quit)
    [[ -n "$packed" ]] && mv "$packed" "$PKG_ARCHIVE"
  fi
fi
# If npm publication disappears, maintainers may upload the already owned archive
# as a GitHub Release asset (tag: editor-inputs) through the browser.
if [[ ! -s "$PKG_ARCHIVE" ]]; then
  echo 'npm pack unavailable. Checking repository Release editor-inputs for a mirror.'
  gh release download editor-inputs --repo "$GITHUB_REPOSITORY" \
    --pattern "eurooffice-sdkjs-common-${CONVERTER_VERSION}.tgz" \
    --dir "$DOWNLOAD" || true
fi
[[ -s "$PKG_ARCHIVE" ]] || { echo 'ERROR: matching x2t package unavailable; see README fallback (upload a Release asset via browser).' >&2; exit 1; }
mkdir -p "$WORK/sdk-common"
tar -xzf "$PKG_ARCHIVE" -C "$WORK/sdk-common" \
  package/sdkjs/common/wasm/x2t/x2t.wasm \
  package/sdkjs/common/wasm/x2t/x2t.js
X2T="$WORK/sdk-common/package/sdkjs/common/wasm/x2t"
echo "$(version_field converter.wasmSha256)  $X2T/x2t.wasm" | sha256sum --check --status || {
  echo 'ERROR: WASM digest does not match the verified RC converter manifest.' >&2; exit 1;
}
echo "$(version_field converter.jsSha256)  $X2T/x2t.js" | sha256sum --check --status || {
  echo 'ERROR: x2t.js does not match the verified RC converter manifest.' >&2; exit 1;
}

printf 'Checking author-provided Ranuts patch against pinned upstream\n'
git -C "$RANUTS" apply --check "$ROOT/scripts/vendor/ranuts-document.patch"
git -C "$RANUTS" apply "$ROOT/scripts/vendor/ranuts-document.patch"

printf 'Applying the author-provided browser-only engine transplant\n'
python3 "$ROOT/scripts/vendor/eurooffice-into-ranuts.py" "$EO_ROOT" "$RANUTS"
# The original Ranuts source carries x2t.wasm.br built against an unrelated
# WASI/`env` ABI.  The verified EuroOffice JS expects module `a`. Never leave
# that precompressed file where Vite can copy it into the compiled distribution.
CONVERTER_REL='sdkjs/common/wasm/x2t'
install -Dm644 "$X2T/x2t.wasm" "$RANUTS/public/$CONVERTER_REL/x2t.wasm"
install -Dm644 "$X2T/x2t.js" "$RANUTS/public/$CONVERTER_REL/x2t.js"
rm -f "$RANUTS/public/$CONVERTER_REL/x2t.wasm.br" \
      "$RANUTS/public/$CONVERTER_REL/x2t.wasm.gz"
node "$ROOT/scripts/check-converter-pair.mjs" "$RANUTS/public/$CONVERTER_REL"

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
# Vite sometimes re-copies public/ files. Remove both old compressed variants
# and reinstall the canonical pinned pair AFTER the build as well.
rm -f "$RANUTS/dist/$CONVERTER_REL/x2t.wasm.br" \
      "$RANUTS/dist/$CONVERTER_REL/x2t.wasm.gz"
install -Dm644 "$X2T/x2t.wasm" "$RANUTS/dist/$CONVERTER_REL/x2t.wasm"
install -Dm644 "$X2T/x2t.js" "$RANUTS/dist/$CONVERTER_REL/x2t.js"
node "$ROOT/scripts/check-converter-pair.mjs" "$RANUTS/dist/$CONVERTER_REL"

printf 'Packaging Word-only GitHub Pages build (no server)\n'
node "$ROOT/scripts/package-site.mjs" "$RANUTS/dist" "$ROOT/dist"
node "$ROOT/scripts/verify-site.mjs" "$ROOT/dist"
node "$ROOT/scripts/check-converter-pair.mjs" "$ROOT/dist/office/sdkjs/common/wasm/x2t"
echo 'PASS: static checks only for official v9.3.5 + pinned RC converter. Browser compatibility NOT established; real edit/save/export testing required.'
