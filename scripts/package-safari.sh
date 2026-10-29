#!/usr/bin/env bash
# Wrap the Safari build in a macOS app so the extension stays installed across
# Safari restarts (the "Add Temporary Extension…" route is removed on quit).
#
# Requires full Xcode (not just the command line tools):  xcode-select -p  should
# point inside Xcode.app. Then:
#   pnpm package:safari
#   open .output/safari-xcode/Read\ Aloud/Read\ Aloud.xcodeproj
#   → select the "Bak-Bak (macOS)" scheme, set your Team (a free Apple ID works
#     for running locally) under Signing & Capabilities, and Run.
#   → Safari → Settings → Extensions → enable "Bak-Bak".
# Without signing, enable Safari → Develop → Allow Unsigned Extensions (resets on quit).
set -euo pipefail

cd "$(dirname "$0")/.."
pnpm build:safari

OUT=.output/safari-xcode
APP_NAME="Bak-Bak"
BUNDLE_ID="${SAFARI_BUNDLE_ID:-local.readaloud.sarvam}"

# Xcode 26 ships `safari-web-extension-packager`; older Xcode has `safari-web-extension-converter`.
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  TOOL=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  TOOL=safari-web-extension-converter
else
  echo "Neither safari-web-extension-packager nor -converter found. Install Xcode and run:" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

xcrun "$TOOL" .output/safari-mv3 \
  --project-location "$OUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

echo "Xcode project written to $OUT. Open it, set a signing team, and Run."
