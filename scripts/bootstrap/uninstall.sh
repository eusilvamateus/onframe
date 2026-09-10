#!/bin/sh

set -eu

INSTALL_ROOT="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}"
LABEL="com.onblide.onframe.service"
AGENT_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LAUNCHER_PATH="$HOME/Applications/OnFrame Launcher.app"
REMOVE_DATA="${ONFRAME_REMOVE_DATA:-0}"

fail() {
  printf '\n[ERRO] %s\n\n' "$1" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || fail "Este desinstalador e exclusivo para macOS."
[ -n "$INSTALL_ROOT" ] && [ "$INSTALL_ROOT" != "/" ] || fail "Pasta de instalacao insegura."
case "$INSTALL_ROOT" in
  "$HOME"|"$HOME/"|"$HOME/Library"|"$HOME/Library/") fail "Pasta de instalacao insegura: $INSTALL_ROOT" ;;
  "$HOME/"*) ;;
  *) fail "A instalacao deve permanecer dentro do perfil do usuario." ;;
esac
case "/$INSTALL_ROOT/" in
  */../*|*/./*) fail "A pasta de instalacao nao pode conter atalhos de caminho." ;;
esac
if [ -e "$INSTALL_ROOT" ]; then
  resolved_root="$(CDPATH='' cd -- "$INSTALL_ROOT" 2>/dev/null && pwd -P)" || fail "Nao foi possivel validar a pasta de instalacao."
  case "$resolved_root" in
    "$HOME/"*) ;;
    *) fail "A pasta de instalacao aponta para fora do perfil do usuario." ;;
  esac
fi
[ ! -d "$INSTALL_ROOT/.git" ] || fail "Esta pasta e um checkout de desenvolvimento. Remova manualmente se desejar."

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)"
if [ -f "$SCRIPT_DIR/common.sh" ]; then
  # shellcheck source=scripts/bootstrap/common.sh
  . "$SCRIPT_DIR/common.sh"
fi

_width=74
if command -v onframe_tui_width >/dev/null 2>&1; then
  _width="$(onframe_tui_width)"
fi

if command -v onframe_header_3l >/dev/null 2>&1; then
  onframe_header_3l "■ DESINSTALAÇÃO LOCAL" "Remoção Segura & Preservação de Dados" "coral" "$_width" "Desinstalador Oficial do Aplicativo • macOS"
else
  printf '\n  ONFRAME\n'
  printf '  Onblide local toolkit\n'
  printf '  ----------------------------------------------------------\n'
  printf '  %-10s %s\n' "Modo" "$(if [ "$REMOVE_DATA" = "1" ]; then printf 'Desinstalacao total'; else printf 'Desinstalacao'; fi)"
  printf '  %-10s %s\n' "Pasta" "$INSTALL_ROOT"
  printf '  ----------------------------------------------------------\n'
fi

printf '\n  [PREPARANDO]\n'
printf '  [>] 01/04 Localizando instalacao.\n'
if [ ! -e "$INSTALL_ROOT" ]; then
  printf '       ! OnFrame nao encontrado; removendo apenas registros locais.\n'
fi

printf '\n  [PARANDO]\n'
printf '  [>] 02/04 Encerrando servico local.\n'
target="gui/$(id -u)/$LABEL"
if /bin/launchctl print "$target" >/dev/null 2>&1; then
  /bin/launchctl bootout "$target" >/dev/null 2>&1 || fail "O macOS recusou encerrar o servico local."
fi
rm -f "$AGENT_PATH"

printf '\n  [REMOVENDO]\n'
printf '  [>] 03/04 Removendo controles locais.\n'
launch_services="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -d "$LAUNCHER_PATH" ] && [ -x "$launch_services" ]; then
  "$launch_services" -u "$LAUNCHER_PATH" >/dev/null 2>&1 || true
fi
rm -rf "$LAUNCHER_PATH"

printf '  [>] 04/04 Removendo arquivos.\n'
if [ "$REMOVE_DATA" = "1" ]; then
  rm -rf "$INSTALL_ROOT"
  printf '       + Aplicativo, configuracao e credenciais removidos.\n'
else
  for target_name in extension service scripts docs .runtime; do
    rm -rf "${INSTALL_ROOT:?}/$target_name"
  done
  for file_name in package.json package-lock.json README.md CHANGELOG.md RELEASE.md .env.example; do
    rm -f "$INSTALL_ROOT/$file_name"
  done
  printf '       ! Dados preservados: .env e .onframe.\n'
fi

if command -v onframe_print_card >/dev/null 2>&1; then
  _suc_tmp="$(mktemp "${TMPDIR:-/tmp}/onframe-uninst-suc.XXXXXX")"
  trap 'rm -f "$_suc_tmp"' EXIT

  _bar_len=$(( _width - 32 ))
  [ "$_bar_len" -lt 14 ] && _bar_len=14
  _final_bar="$(onframe_progress_bar 100.0 "$_bar_len" coral)"

  {
    onframe_badge "■ DESINSTALADO COM SUCESSO" 220 65 65
    printf '\n%sDesinstalação do OnFrame concluída.%s\n' "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET"
    printf '%sO serviço e os componentes locais foram removidos.%s\n\n' "$ONFRAME_CLR_MUTED" "$ONFRAME_CLR_RESET"
    printf '   %s■%s Remova a extensão manualmente do Chrome ou Edge:\n' "$ONFRAME_CLR_CORAL" "$ONFRAME_CLR_RESET"
    printf '   %s■%s %sChrome:%s chrome://extensions/\n' "$ONFRAME_CLR_CORAL" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET"
    printf '   %s■%s %sEdge:%s edge://extensions/\n\n' "$ONFRAME_CLR_CORAL" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET"
    printf '%s✔%s Status final:  %s\n' "$ONFRAME_CLR_CORAL" "$ONFRAME_CLR_RESET" "$_final_bar"
  } > "$_suc_tmp"

  printf '\033[H\033[2J' 2>/dev/null || true
  onframe_header_3l "■ DESINSTALAÇÃO LOCAL" "Remoção Segura & Preservação de Dados" "coral" "$_width" "Desinstalador Oficial do Aplicativo • macOS"
  onframe_print_card "${ONFRAME_CLR_CORAL}■${ONFRAME_CLR_RESET} Desinstalação Concluída" "$_suc_tmp" "$_width" 220 65 65

  _footer_text="$ONFRAME_CLR_MUTED● Desinstalação concluída. Pressione $ONFRAME_CLR_BOLD$(onframe_truecolor_fg 230 235 245)[Enter]$ONFRAME_CLR_RESET$ONFRAME_CLR_MUTED para retornar...$ONFRAME_CLR_RESET"
  _fpad="$(onframe_center_padding "$(onframe_display_width "$_footer_text")")"
  printf '\n%s%s\n' "$_fpad" "$_footer_text"

  if [ -t 0 ] && [ "${NO_PAUSE:-0}" = "0" ]; then
    read -r _ || true
  fi
else
  printf '\n  [OK] Desinstalacao concluida.\n'
  printf '       Remova a extensao manualmente do Chrome ou Edge.\n'
  printf '       Chrome: chrome://extensions/\n'
  printf '       Edge: edge://extensions/\n\n'
fi
