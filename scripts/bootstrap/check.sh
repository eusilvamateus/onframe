#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

onframe_require_macos
onframe_assert_install_root

printf 'OnFrame - verificacao\n'
printf '%-18s %s\n' "Pasta" "$ONFRAME_HOME"
printf '%-18s %s\n' "Extensao" "$(if [ -d "$ONFRAME_HOME/extension" ]; then printf 'encontrada'; else printf 'nao encontrada'; fi)"
printf '%-18s %s\n' ".env" "$(if [ -f "$ONFRAME_HOME/.env" ]; then printf 'encontrado'; else printf 'nao encontrado'; fi)"
printf '%-18s %s\n' "LaunchAgent" "$(if [ -f "$ONFRAME_AGENT_PATH" ]; then printf 'registrado'; else printf 'nao encontrado'; fi)"
printf '%-18s %s\n' "Controle local" "$(if [ -d "$ONFRAME_LAUNCHER_PATH" ]; then printf 'registrado'; else printf 'nao encontrado'; fi)"
printf '%-18s %s\n' "Porta" "$(onframe_port)"

node_path="$(onframe_runtime_node)"
if [ -x "$node_path" ]; then
  printf '%-18s v%s (%s)\n' "Node privado" "$("$node_path" -p 'process.versions.node')" "$(uname -m)"
else
  printf '%-18s %s\n' "Node privado" "nao encontrado"
fi

if onframe_health; then
  printf '\nServico ativo em http://127.0.0.1:%s.\n' "$(onframe_port)"
  diagnostics="$(/usr/bin/curl -fsS --max-time 3 "http://127.0.0.1:$(onframe_port)/diagnostics" 2>/dev/null || true)"
  version="$(printf '%s' "$diagnostics" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  [ -z "$version" ] || printf '%-18s %s\n' "Versao" "$version"
else
  printf '\nServico local nao respondeu. Use o comando de iniciar.\n'
fi
