#!/bin/sh

set -eu

temporary="$(mktemp -d "${TMPDIR:-/tmp}/onframe-update.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
installer="$temporary/install.sh"

/usr/bin/curl -fsSL "https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.sh" -o "$installer"
chmod 700 "$installer"
ONFRAME_HOME="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}" /bin/sh "$installer"
