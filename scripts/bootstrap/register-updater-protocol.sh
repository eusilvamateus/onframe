#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_assert_install_root
onframe_register_launcher
printf 'Protocolo onframe-updater:// registrado para este usuario.\n'
