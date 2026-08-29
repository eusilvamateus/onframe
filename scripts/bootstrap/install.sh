#!/bin/sh

set -eu

REPO="${ONFRAME_UPDATE_REPO:-eusilvamateus/onframe}"
INSTALL_ROOT="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}"
MODE="${ONFRAME_INSTALL_MODE:-install}"

fail() {
  printf '\n[ERRO] %s\n\n' "$1" >&2
  exit 1
}

github_get() {
  url="$1"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    /usr/bin/curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$url"
  elif [ -n "${GH_TOKEN:-}" ]; then
    /usr/bin/curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "$url"
  else
    /usr/bin/curl -fsSL -H "Accept: application/vnd.github+json" "$url"
  fi
}

[ "$(uname -s)" = "Darwin" ] || fail "Este instalador e exclusivo para macOS."
mac_major="$(/usr/bin/sw_vers -productVersion | cut -d. -f1)"
[ "$mac_major" -ge 13 ] || fail "O OnFrame requer macOS 13 Ventura ou superior."
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

printf '\n  ONFRAME\n'
printf '  Onblide local toolkit\n'
printf '  ----------------------------------------------------------\n'
printf '  %-10s %s\n' "Modo" "$(if [ "$MODE" = "update" ]; then printf 'Atualizacao'; else printf 'Instalacao'; fi)"
printf '  %-10s %s\n' "Pasta" "$INSTALL_ROOT"
printf '  %-10s %s\n' "Repo" "$REPO"
printf '  ----------------------------------------------------------\n'

printf '\n  [PREPARANDO]\n'
printf '  [>] 01/09 Validando destino.\n'
if [ -e "$INSTALL_ROOT" ] && [ ! -f "$INSTALL_ROOT/package.json" ]; then
  fail "A pasta existe, mas nao parece ser uma instalacao do OnFrame: $INSTALL_ROOT"
fi
if [ -d "$INSTALL_ROOT/.git" ]; then
  fail "Esta pasta e um checkout de desenvolvimento. Use outra pasta para instalar."
fi

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/onframe-install.XXXXXX")"
trap 'rm -rf "$temp_root"' EXIT HUP INT TERM
release_json="$temp_root/release.json"
archive_path="$temp_root/release.zip"
extract_path="$temp_root/extract"
mkdir -p "$extract_path"

printf '\n  [BAIXANDO]\n'
printf '  [>] 02/09 Consultando ultima release.\n'
github_get "https://api.github.com/repos/$REPO/releases/latest" > "$release_json"
tag="$(sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' "$release_json" | head -n 1)"
asset_url="$(sed -n 's/^[[:space:]]*"browser_download_url":[[:space:]]*"\([^"]*onframe-v[^"]*\.zip\)".*/\1/p' "$release_json" | head -n 1)"
[ -n "$tag" ] || fail "A API do GitHub nao retornou uma release valida."
[ -n "$asset_url" ] || fail "A release $tag nao possui o pacote ZIP do OnFrame."
printf '       + Release encontrada: %s\n' "$tag"

printf '  [>] 03/09 Baixando pacote.\n'
/usr/bin/curl -fsSL "$asset_url" -o "$archive_path"

printf '  [>] 04/09 Extraindo e validando pacote.\n'
/usr/bin/ditto -x -k "$archive_path" "$extract_path"
package_file="$(find "$extract_path" -type f -name package.json | head -n 1)"
[ -n "$package_file" ] || fail "Pacote vazio ou invalido."
source_root="$(dirname "$package_file")"
for required in package.json extension service scripts; do
  [ -e "$source_root/$required" ] || fail "Pacote invalido: $required ausente."
done
[ -f "$source_root/scripts/bootstrap/common.sh" ] || fail "Esta release ainda nao oferece suporte ao macOS."

printf '\n  [APLICANDO]\n'
printf '  [>] 05/09 Encerrando instalacao anterior.\n'
if [ -x "$INSTALL_ROOT/scripts/bootstrap/stop.sh" ]; then
  ONFRAME_HOME="$INSTALL_ROOT" "$INSTALL_ROOT/scripts/bootstrap/stop.sh" >/dev/null 2>&1 || true
fi

printf '  [>] 06/09 Copiando arquivos.\n'
mkdir -p "$INSTALL_ROOT"
for target in extension service scripts docs; do
  rm -rf "${INSTALL_ROOT:?}/$target"
  if [ -e "$source_root/$target" ]; then
    cp -R "$source_root/$target" "$INSTALL_ROOT/$target"
  fi
done
for file in package.json package-lock.json README.md CHANGELOG.md RELEASE.md .env.example; do
  if [ -f "$source_root/$file" ]; then
    cp "$source_root/$file" "$INSTALL_ROOT/$file"
  fi
done
find "$INSTALL_ROOT/scripts/bootstrap" -type f -name '*.sh' -exec chmod 700 {} \;

ONFRAME_HOME="$INSTALL_ROOT"
export ONFRAME_HOME
. "$INSTALL_ROOT/scripts/bootstrap/common.sh"
onframe_assert_install_root

printf '  [>] 07/09 Preparando configuracao e runtime privado.\n'
onframe_ensure_env
onframe_ensure_runtime
printf '       + Node.js %s instalado somente para o OnFrame.\n' "$("$(onframe_runtime_node)" -p 'process.versions.node')"

printf '\n  [FINALIZANDO]\n'
printf '  [>] 08/09 Registrando servico e controles locais.\n'
onframe_write_agent
onframe_register_launcher

printf '  [>] 09/09 Iniciando e validando servico.\n'
onframe_start_service

onframe_success "Instalacao concluida." \
  "Versao: $tag" \
  "Extensao: $INSTALL_ROOT/extension" \
  "Chrome: chrome://extensions/" \
  "Edge: edge://extensions/" \
  "Recarregue ou carregue a extensao nessa pagina."
