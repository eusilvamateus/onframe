#!/bin/sh

set -eu

[ "$(uname -s)" = "Darwin" ] || {
  printf '[ERRO] Este teste exige um runner macOS.\n' >&2
  exit 1
}

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)"

find "$ROOT/scripts/bootstrap" -type f -name '*.sh' -exec /bin/sh -n {} \;

temporary="$(mktemp -d "${TMPDIR:-/tmp}/onframe-macos-test.XXXXXX")"
cleanup() {
  rm -rf "$temporary"
}
trap cleanup EXIT HUP INT TERM

fixture="$temporary/onframe-bootstrap-test"
archive="$temporary/onframe-bootstrap-test.zip"
test_home="$temporary/home"

mkdir -p "$fixture/extension" "$fixture/scripts" "$test_home"
cp "$ROOT/package.json" "$fixture/package.json"
cp "$ROOT/extension/manifest.json" "$fixture/extension/manifest.json"
cp -R "$ROOT/scripts/bootstrap" "$fixture/scripts/bootstrap"
/usr/bin/ditto -c -k --keepParent "$fixture" "$archive"

export HOME="$test_home"
export ONFRAME_HOME="$test_home/Library/Application Support/OnFrame"
export ONFRAME_RELEASE_ARCHIVE="$archive"
export ONFRAME_RELEASE_TAG="bootstrap-test"
export ONFRAME_INSTALLER_PATH="$ROOT/scripts/bootstrap/install.sh"

/bin/sh "$ROOT/scripts/bootstrap/install.sh"

test -f "$ONFRAME_HOME/extension/manifest.json"
test -f "$ONFRAME_HOME/package.json"
test -x "$ONFRAME_HOME/scripts/bootstrap/update.sh"

updater="$HOME/Applications/OnFrame Updater.app"
executable="$updater/Contents/MacOS/OnFrameUpdater"
test -x "$executable"
/usr/bin/plutil -lint "$updater/Contents/Info.plist"
/usr/bin/grep -q '<string>onframe-updater</string>' "$updater/Contents/Info.plist"

stale="$ONFRAME_HOME/extension/.bootstrap-stale"
: > "$stale"
"$executable" 'onframe-updater://update'
test ! -e "$stale"
test -f "$ONFRAME_HOME/extension/manifest.json"

uninstaller="$ONFRAME_HOME/scripts/bootstrap/uninstall.sh"
ONFRAME_REMOVE_DATA=1 "$uninstaller"
test ! -e "$ONFRAME_HOME"
test ! -e "$updater"

printf 'Bootstrap macOS validado em %s.\n' "$(uname -m)"
