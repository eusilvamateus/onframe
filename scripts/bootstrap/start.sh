#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

QUIET=0
NO_PAUSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --quiet|-Quiet|-q) QUIET=1; shift ;;
    --no-pause|-NoPause) NO_PAUSE=1; shift ;;
    --root=*|-Root=*) ONFRAME_HOME="${1#*=}"; shift ;;
    --root|-Root|-root) ONFRAME_HOME="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

onframe_require_macos
onframe_assert_install_root

onframe_start_core() {
  [ -f "$ONFRAME_HOME/service/server.js" ] || onframe_fail "OnFrame nao encontrado em $ONFRAME_HOME."
  [ -x "$(onframe_runtime_node)" ] || onframe_fail "Runtime privado ausente. Execute a atualizacao do OnFrame."
  onframe_ensure_env
  onframe_write_agent
  onframe_start_service
}

if [ "$QUIET" = "1" ]; then
  onframe_start_core
  exit 0
fi

onframe_invoke_quick_action \
  --tag "▶ SERVIÇO LOCAL" \
  --subtitle "Inicialização & Monitoramento em Segundo Plano" \
  --card-title "${ONFRAME_CLR_GREEN}▶${ONFRAME_CLR_RESET} Inicialização do Serviço Local" \
  --tone "green" \
  --action-type "start" \
  --operation "onframe_start_core" \
  --recovery-cmd "$ONFRAME_HOME/scripts/bootstrap/check.sh" \
  --no-pause "$NO_PAUSE"
