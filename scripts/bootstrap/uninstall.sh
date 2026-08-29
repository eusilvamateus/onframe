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

printf '\n  ONFRAME\n'
printf '  Onblide local toolkit\n'
printf '  ----------------------------------------------------------\n'
printf '  %-10s %s\n' "Modo" "$(if [ "$REMOVE_DATA" = "1" ]; then printf 'Desinstalacao total'; else printf 'Desinstalacao'; fi)"
printf '  %-10s %s\n' "Pasta" "$INSTALL_ROOT"
printf '  ----------------------------------------------------------\n'

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

printf '\n  [OK] Desinstalacao concluida.\n'
printf '       Remova a extensao manualmente do Chrome ou Edge.\n'
printf '       Chrome: chrome://extensions/\n'
printf '       Edge: edge://extensions/\n\n'
