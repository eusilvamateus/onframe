#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)"
if [ -f "$SCRIPT_DIR/common.sh" ]; then
  # shellcheck source=scripts/bootstrap/common.sh
  . "$SCRIPT_DIR/common.sh"
fi

repo="${ONFRAME_UPDATE_REPO:-eusilvamateus/onframe}"
branch="${ONFRAME_UPDATE_BRANCH:-main}"
temp_script="$(mktemp "${TMPDIR:-/tmp}/onframe-update.XXXXXX")"
trap 'rm -f "$temp_script"' EXIT HUP INT TERM

if command -v onframe_header_3l >/dev/null 2>&1; then
  width="$(onframe_tui_width)"
  onframe_header_3l "↻ ATUALIZAÇÃO LOCAL" "Download Seguro & Renovação do Serviço" "amber" "$width" "Atualizador Oficial do Aplicativo • macOS"
  printf '\n  %s[PREPARANDO]%s\n' "$ONFRAME_CLR_MUTED" "$ONFRAME_CLR_RESET"
  printf '  %s[>]%s Conectando ao repositório para obter o instalador mais recente...\n\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
else
  printf 'Buscando atualizador mais recente (%s)...\n' "$repo"
fi

/usr/bin/curl -fsSL "https://raw.githubusercontent.com/$repo/$branch/scripts/bootstrap/install.sh" -o "$temp_script"
ONFRAME_INSTALL_MODE=update exec /bin/sh "$temp_script" "$@"
