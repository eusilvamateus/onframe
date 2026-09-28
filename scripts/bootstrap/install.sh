#!/bin/sh

set -eu

REPOSITORY="${ONFRAME_UPDATE_REPO:-eusilvamateus/onframe}"
INSTALL_ROOT="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}"

fail() {
  printf '\n[ERRO] %s\n' "$1" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || fail "Este instalador e exclusivo para macOS."
[ -n "$INSTALL_ROOT" ] && [ "$INSTALL_ROOT" != "/" ] || fail "Pasta de instalacao insegura."
case "$INSTALL_ROOT" in
  "$HOME/"*) ;;
  *) fail "A instalacao deve permanecer dentro do perfil do usuario." ;;
esac

github_get() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    /usr/bin/curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$1"
  elif [ -n "${GH_TOKEN:-}" ]; then
    /usr/bin/curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "$1"
  else
    /usr/bin/curl -fsSL -H "Accept: application/vnd.github+json" "$1"
  fi
}

temporary="$(mktemp -d "${TMPDIR:-/tmp}/onframe-install.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
release_json="$temporary/release.json"
archive="$temporary/release.zip"
extract="$temporary/extract"
mkdir -p "$extract"

printf '\nONFRAME\nInstalacao da extensao e do atualizador\n\n'
printf '[1/4] Consultando a release mais recente...\n'
github_get "https://api.github.com/repos/$REPOSITORY/releases/latest" > "$release_json"
tag="$(sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' "$release_json" | head -n 1)"
asset_url="$(sed -n 's/^[[:space:]]*"browser_download_url":[[:space:]]*"\([^"]*onframe-v[^"]*\.zip\)".*/\1/p' "$release_json" | head -n 1)"
[ -n "$tag" ] || fail "A API do GitHub nao retornou uma release valida."
[ -n "$asset_url" ] || fail "A release $tag nao possui o pacote ZIP do OnFrame."

printf '[2/4] Baixando pacote %s...\n' "$tag"
/usr/bin/curl -fsSL "$asset_url" -o "$archive"
/usr/bin/ditto -x -k "$archive" "$extract"
package_file="$(find "$extract" -type f -name package.json | head -n 1)"
[ -n "$package_file" ] || fail "Pacote vazio ou invalido."
source_root="$(dirname "$package_file")"
for required in package.json extension scripts/bootstrap; do
  [ -e "$source_root/$required" ] || fail "Pacote invalido: $required ausente."
done

printf '[3/4] Instalando extensao e atualizador...\n'
mkdir -p "$INSTALL_ROOT"
for entry in extension scripts; do
  rm -rf "${INSTALL_ROOT:?}/$entry"
  cp -R "$source_root/$entry" "$INSTALL_ROOT/$entry"
done
cp "$source_root/package.json" "$INSTALL_ROOT/package.json"
for legacy in service docs .env .env.example .onframe .runtime package-lock.json README.md CHANGELOG.md RELEASE.md; do
  rm -rf "${INSTALL_ROOT:?}/$legacy"
done
find "$INSTALL_ROOT/scripts/bootstrap" -type f -name '*.sh' -exec chmod 700 {} \;

printf '[4/4] Registrando atualizacao por um clique...\n'
ONFRAME_HOME="$INSTALL_ROOT" "$INSTALL_ROOT/scripts/bootstrap/register-updater-protocol.sh"

printf '\nInstalacao concluida.\n'
printf 'Extensao: %s/extension\n' "$INSTALL_ROOT"
printf 'Chrome: chrome://extensions/\n'
printf 'Edge: edge://extensions/\n'
