#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_unregister_launcher
printf 'Protocolo onframe-updater:// removido para este usuario.\n'
