#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_unregister_launcher
printf '  %s●%s %sProtocolo onframe-updater:// removido para este usuario.%s\n' "$ONFRAME_CLR_CORAL" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET"
