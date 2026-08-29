#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_assert_install_root
onframe_header "Parar"
onframe_section "Aplicando"
onframe_step 1 1 "Encerrando servico local."
onframe_stop_service
onframe_success "OnFrame parado." "O servico local foi encerrado."
