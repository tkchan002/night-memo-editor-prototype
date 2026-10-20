#!/usr/bin/env bash
# APPROACH B: build the browser converter from the SAME Euro-Office core commit
# as the DocumentServer release. No fallback to old x2t binaries.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"; WORK="$ROOT/.work"; RANUTS="$WORK/ranuts"; EO="$WORK/eurooffice"
mkdir -p "$WORK/downloads" "$EO"
: "${EO_RELEASE_TAG:?Resolve release first}"
: "${EO_RELEASE_VERSION:?Missing version}"
: "${EO_DEB_NAME:?Missing .deb name}"
: "${EO_DEB_URL:?Missing .deb url}"
: "${EO_DEB_DOWNLOADED_SHA256:?Run scripts/select-release-deb.mjs first}"
[[ "$EO_DEB_NAME" =~ ^[A-Za-z0-9_.+~-]+\.deb$ ]] || { echo 'Unsafe .deb filename'; exit 1; }
[[ "$(git -C "$RANUTS" rev-parse HEAD)" == '1301bb8bdac9092c4eb88a6f2f4ff5080cec68bd' ]] || { echo 'Wrong Ranuts commit'; exit 1; }
node --input-type=module <<'NODE'
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('.work/release-selection.json'));
for(const [env,key] of [['EO_RELEASE_TAG','tag'],['EO_DEB_NAME','name'],['EO_DEB_URL','url'],['EO_RELEASE_VERSION','version'],['EO_DEB_DOWNLOADED_SHA256','downloadedSha256']]){
  if(m[key]!==process.env[env])throw Error(`Release metadata changed at ${env}`);
}
if(m.packageName!=='euro-office-documentserver'||m.arch!=='amd64')throw Error('Selected Debian package metadata is not AMD64 EuroOffice');
NODE
DEB="$WORK/downloads/$EO_DEB_NAME"
# The verified file was downloaded and checked in the selection step. Do not
# re-download a different package after release resolution.
[[ -f "$DEB" ]] || { echo 'Missing preverified Debian package'; exit 1; }
echo "${EO_DEB_DOWNLOADED_SHA256}  ${DEB}" | sha256sum -c -
[[ -s "$DEB" ]] || { echo 'Empty package'; exit 1; }
if [[ -n "${EO_RELEASE_ASSET_SHA256:-}" ]]; then
  echo "${EO_RELEASE_ASSET_SHA256}  ${DEB}" | sha256sum -c -
fi
sha256sum "$DEB" | tee "$WORK/downloads/official-deb.sha256"
PACKAGE_NAME="$(dpkg-deb -f "$DEB" Package)"
PACKAGE_VERSION="$(dpkg-deb -f "$DEB" Version)"
PACKAGE_ARCH="$(dpkg-deb -f "$DEB" Architecture)"
echo "Official package metadata: name=${PACKAGE_NAME}, version=${PACKAGE_VERSION}, arch=${PACKAGE_ARCH}"
[[ "$PACKAGE_NAME" == 'euro-office-documentserver' ]] || { echo 'Unexpected Debian package identity'; exit 1; }
[[ "$PACKAGE_ARCH" == 'amd64' ]] || { echo 'Not an AMD64 package'; exit 1; }
[[ "$PACKAGE_VERSION" == "$EO_RELEASE_VERSION" || "$PACKAGE_VERSION" == "$EO_RELEASE_VERSION"-* ]] || { echo 'Debian package version differs from release'; exit 1; }
EO_ROOT="$EO/var/www/euro-office/documentserver"
mkdir -p "$EO"
dpkg-deb --fsys-tarfile "$DEB" | tar -x -C "$EO" \
  ./var/www/euro-office/documentserver/sdkjs \
  ./var/www/euro-office/documentserver/web-apps \
  ./var/www/euro-office/documentserver/dictionaries
for p in "$EO_ROOT/sdkjs/word/sdk-all-min.js" "$EO_ROOT/web-apps/apps/documenteditor/main/app.js"; do
  [[ -s "$p" ]] || { echo "Missing from official release: $p"; exit 1; }
done
# Discover EXACT core gitlink from the tagged DocumentServer source.
# Do not use core/main, core/latest, an estimated matching version, or ONLYOFFICE upstream.
bash "$ROOT/scripts/prepare-release-core.sh"
# CryptPad's Emscripten adaptation is ported to that source in a strict patching step.
# It may fail for future releases. This is correct; never substitute RC1 converter.
bash "$ROOT/scripts/build-matching-wasm.sh"
X2T="$WORK/matching-converter"
node "$ROOT/scripts/check-converter-pair.mjs" "$X2T"
# Preserve the tested Ranuts browser integration while upgrading the engine.
git -C "$RANUTS" apply --check "$ROOT/scripts/vendor/ranuts-document.patch"
git -C "$RANUTS" apply "$ROOT/scripts/vendor/ranuts-document.patch"
python3 "$ROOT/scripts/vendor/eurooffice-into-ranuts.py" "$EO_ROOT" "$RANUTS"
CONVERTER_REL='sdkjs/common/wasm/x2t'
install -Dm644 "$X2T/x2t.wasm" "$RANUTS/public/$CONVERTER_REL/x2t.wasm"
install -Dm644 "$X2T/x2t.js" "$RANUTS/public/$CONVERTER_REL/x2t.js"
rm -f "$RANUTS/public/$CONVERTER_REL/x2t.wasm.br" "$RANUTS/public/$CONVERTER_REL/x2t.wasm.gz"
node "$ROOT/scripts/check-converter-pair.mjs" "$RANUTS/public/$CONVERTER_REL"
node "$ROOT/scripts/check-transplant.mjs" "$RANUTS/public"
pnpm --dir "$RANUTS" install --frozen-lockfile
(cd "$RANUTS/packages/shared" && npx tsc -p tsconfig.json)
pnpm --dir "$RANUTS" run build
rm -f "$RANUTS/dist/$CONVERTER_REL/x2t.wasm.br" "$RANUTS/dist/$CONVERTER_REL/x2t.wasm.gz"
install -Dm644 "$X2T/x2t.wasm" "$RANUTS/dist/$CONVERTER_REL/x2t.wasm"
install -Dm644 "$X2T/x2t.js" "$RANUTS/dist/$CONVERTER_REL/x2t.js"
node "$ROOT/scripts/check-converter-pair.mjs" "$RANUTS/dist/$CONVERTER_REL"
node "$ROOT/scripts/package-site.mjs" "$RANUTS/dist" "$ROOT/dist"
node "$ROOT/scripts/verify-site.mjs" "$ROOT/dist"
node "$ROOT/scripts/check-converter-pair.mjs" "$ROOT/dist/office/$CONVERTER_REL"
echo 'SUCCESS: built matched x2t and editor assets. Browser DOCX/PDF validation is still required.'
