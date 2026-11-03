#!/bin/sh

set -eu

temporary="$(mktemp -d "${TMPDIR:-/tmp}/onframe-update.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
installer="$temporary/install.sh"

if [ -n "${ONFRAME_INSTALLER_PATH:-}" ]; then
  [ -f "$ONFRAME_INSTALLER_PATH" ] || {
    printf '[ERRO] Instalador local nao encontrado: %s\n' "$ONFRAME_INSTALLER_PATH" >&2
    exit 1
  }
  cp "$ONFRAME_INSTALLER_PATH" "$installer"
else
  installer_url="${ONFRAME_INSTALLER_URL:-https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.sh}"
  /usr/bin/curl -fsSL "$installer_url" -o "$installer"
fi
chmod 700 "$installer"
ONFRAME_HOME="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}" /bin/sh "$installer"
