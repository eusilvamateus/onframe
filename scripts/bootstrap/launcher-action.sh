#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

action="${1:-}"
case "$action" in
  update)
    "$SCRIPT_DIR/update.sh"
    ;;
  start|stop|restart|check)
    "$SCRIPT_DIR/$action.sh"
    ;;
  open-log)
    mkdir -p "$ONFRAME_HOME/.onframe/logs"
    /usr/bin/open "$ONFRAME_HOME/.onframe/logs"
    ;;
  *)
    onframe_fail "Acao local nao suportada: $action"
    ;;
esac

if [ "$action" = "check" ]; then
  printf '\nPressione Enter para fechar: '
  read -r _unused
else
  sleep 2
fi
