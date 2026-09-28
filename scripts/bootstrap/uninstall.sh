#!/bin/sh

set -eu

INSTALL_ROOT="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}"
REMOVE_DATA="${ONFRAME_REMOVE_DATA:-0}"
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

if [ -x "$SCRIPT_DIR/unregister-updater-protocol.sh" ]; then
  "$SCRIPT_DIR/unregister-updater-protocol.sh" || true
fi

if [ "$REMOVE_DATA" = "1" ]; then
  rm -rf "$INSTALL_ROOT"
elif [ -d "$INSTALL_ROOT" ]; then
  for entry in extension scripts service docs .env .env.example .onframe .runtime package.json package-lock.json README.md CHANGELOG.md RELEASE.md; do
    rm -rf "${INSTALL_ROOT:?}/$entry"
  done
fi

printf 'Desinstalacao concluida.\n'
printf 'Remova a extensao em chrome://extensions/ ou edge://extensions/.\n'
