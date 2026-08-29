#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_assert_install_root
onframe_header "Reiniciar"
onframe_section "Aplicando"
onframe_step 1 2 "Encerrando servico local."
onframe_stop_service
onframe_ok "Servico encerrado."
onframe_step 2 2 "Iniciando e validando servico."
[ -f "$ONFRAME_AGENT_PATH" ] || onframe_write_agent
onframe_start_service
onframe_success "OnFrame reiniciado." "Servico ativo em http://127.0.0.1:$(onframe_port)."
