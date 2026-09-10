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

onframe_stop_core() {
  onframe_stop_service
}

if [ "$QUIET" = "1" ]; then
  onframe_stop_core
  exit 0
fi

onframe_invoke_quick_action \
  --tag "■ ENCERRAR SERVIÇO" \
  --subtitle "Drenagem de Socket & Liberação de Recursos" \
  --card-title "${ONFRAME_CLR_CORAL}■${ONFRAME_CLR_RESET} Encerramento do Serviço Local" \
  --tone "coral" \
  --action-type "stop" \
  --operation "onframe_stop_core" \
  --recovery-cmd "$ONFRAME_HOME/scripts/bootstrap/check.sh" \
  --no-pause "$NO_PAUSE"
