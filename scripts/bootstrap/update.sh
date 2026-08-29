#!/bin/sh

set -eu

repo="${ONFRAME_UPDATE_REPO:-eusilvamateus/onframe}"
branch="${ONFRAME_UPDATE_BRANCH:-main}"
temp_script="$(mktemp "${TMPDIR:-/tmp}/onframe-update.XXXXXX")"
trap 'rm -f "$temp_script"' EXIT HUP INT TERM

/usr/bin/curl -fsSL "https://raw.githubusercontent.com/$repo/$branch/scripts/bootstrap/install.sh" -o "$temp_script"
ONFRAME_INSTALL_MODE=update /bin/sh "$temp_script"
