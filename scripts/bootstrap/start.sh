#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_assert_install_root
onframe_header "Iniciar"
onframe_section "Preparando"
onframe_step 1 3 "Validando instalacao."
[ -f "$ONFRAME_HOME/service/server.js" ] || onframe_fail "OnFrame nao encontrado em $ONFRAME_HOME."
[ -x "$(onframe_runtime_node)" ] || onframe_fail "Runtime privado ausente. Execute a atualizacao do OnFrame."
onframe_ensure_env
onframe_ok "Instalacao valida."

onframe_section "Aplicando"
onframe_step 2 3 "Registrando servico local."
onframe_write_agent
onframe_ok "LaunchAgent preparado."

onframe_section "Finalizando"
onframe_step 3 3 "Iniciando e validando servico."
onframe_start_service
onframe_success "OnFrame iniciado." "Servico ativo em http://127.0.0.1:$(onframe_port)."
