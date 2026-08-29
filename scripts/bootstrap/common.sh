#!/bin/sh

set -eu

ONFRAME_LABEL="com.onblide.onframe.service"
ONFRAME_NODE_MAJOR="24"
ONFRAME_DEFAULT_HOME="$HOME/Library/Application Support/OnFrame"
ONFRAME_HOME="${ONFRAME_HOME:-$ONFRAME_DEFAULT_HOME}"
ONFRAME_AGENT_PATH="$HOME/Library/LaunchAgents/$ONFRAME_LABEL.plist"
ONFRAME_LAUNCHER_PATH="$HOME/Applications/OnFrame Launcher.app"
ONFRAME_LAUNCHER_ID="com.onblide.onframe.launcher"

if [ -t 1 ]; then
  ONFRAME_CYAN='\033[36m'
  ONFRAME_GREEN='\033[32m'
  ONFRAME_YELLOW='\033[33m'
  ONFRAME_RED='\033[31m'
  ONFRAME_MUTED='\033[90m'
  ONFRAME_RESET='\033[0m'
else
  ONFRAME_CYAN=''
  ONFRAME_GREEN=''
  ONFRAME_YELLOW=''
  ONFRAME_RED=''
  ONFRAME_MUTED=''
  ONFRAME_RESET=''
fi

onframe_header() {
  printf '\n%b  ONFRAME%b\n' "$ONFRAME_CYAN" "$ONFRAME_RESET"
  printf '%b  Onblide local toolkit%b\n' "$ONFRAME_MUTED" "$ONFRAME_RESET"
  printf '%b  ----------------------------------------------------------%b\n' "$ONFRAME_MUTED" "$ONFRAME_RESET"
  printf '  %-10s %s\n' "Modo" "$1"
  printf '  %-10s %s\n' "Pasta" "$ONFRAME_HOME"
  printf '%b  ----------------------------------------------------------%b\n' "$ONFRAME_MUTED" "$ONFRAME_RESET"
}

onframe_section() {
  printf '\n%b  [%s]%b\n' "$ONFRAME_CYAN" "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')" "$ONFRAME_RESET"
}

onframe_step() {
  printf '%b  [>] %02d/%02d%b %s\n' "$ONFRAME_CYAN" "$1" "$2" "$ONFRAME_RESET" "$3"
}

onframe_ok() {
  printf '%b       + %s%b\n' "$ONFRAME_GREEN" "$1" "$ONFRAME_RESET"
}

onframe_warn() {
  printf '%b       ! %s%b\n' "$ONFRAME_YELLOW" "$1" "$ONFRAME_RESET"
}

onframe_fail() {
  printf '\n%b  [ERRO] O processo nao foi concluido.%b\n' "$ONFRAME_RED" "$ONFRAME_RESET" >&2
  printf '%b         %s%b\n\n' "$ONFRAME_RED" "$1" "$ONFRAME_RESET" >&2
  return 1
}

onframe_success() {
  printf '\n%b  [OK] %s%b\n' "$ONFRAME_GREEN" "$1" "$ONFRAME_RESET"
  shift
  for line in "$@"; do
    printf '%b       %s%b\n' "$ONFRAME_MUTED" "$line" "$ONFRAME_RESET"
  done
  printf '\n'
}

onframe_require_macos() {
  [ "$(uname -s)" = "Darwin" ] || onframe_fail "Este script e exclusivo para macOS."
  major="$(/usr/bin/sw_vers -productVersion | cut -d. -f1)"
  [ "$major" -ge 13 ] || onframe_fail "O OnFrame requer macOS 13 Ventura ou superior."
}

onframe_assert_install_root() {
  [ -n "$ONFRAME_HOME" ] || onframe_fail "Pasta de instalacao vazia."
  [ "$ONFRAME_HOME" != "/" ] || onframe_fail "A raiz do sistema nao pode ser usada."
  case "$ONFRAME_HOME" in
    "$HOME"|"$HOME/"|"$HOME/Library"|"$HOME/Library/") onframe_fail "Pasta de instalacao insegura: $ONFRAME_HOME" ;;
    "$HOME/"*) ;;
    *) onframe_fail "A instalacao deve permanecer dentro do perfil do usuario." ;;
  esac
  case "/$ONFRAME_HOME/" in
    */../*|*/./*) onframe_fail "A pasta de instalacao nao pode conter atalhos de caminho." ;;
  esac
  if [ -e "$ONFRAME_HOME" ]; then
    resolved_root="$(CDPATH='' cd -- "$ONFRAME_HOME" 2>/dev/null && pwd -P)" || onframe_fail "Nao foi possivel validar a pasta de instalacao."
    case "$resolved_root" in
      "$HOME/"*) ;;
      *) onframe_fail "A pasta de instalacao aponta para fora do perfil do usuario." ;;
    esac
  fi
}

onframe_port() {
  env_path="$ONFRAME_HOME/.env"
  if [ -f "$env_path" ]; then
    value="$(sed -n 's/^[[:space:]]*ML_SERVICE_PORT[[:space:]]*=[[:space:]]*//p' "$env_path" | head -n 1 | tr -d '\"\047[:space:]')"
    case "$value" in
      ''|*[!0-9]*) ;;
      *) printf '%s\n' "$value"; return ;;
    esac
  fi
  printf '4765\n'
}

onframe_health() {
  /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:$(onframe_port)/health" >/dev/null 2>&1
}

onframe_runtime_node() {
  printf '%s/.runtime/node/bin/node\n' "$ONFRAME_HOME"
}

onframe_ensure_directories() {
  umask 077
  mkdir -p "$ONFRAME_HOME/.onframe/logs" "$ONFRAME_HOME/.runtime"
  chmod 700 "$ONFRAME_HOME/.onframe" "$ONFRAME_HOME/.runtime"
}

onframe_random_secret() {
  /usr/bin/openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\r\n'
}

onframe_ensure_env() {
  onframe_ensure_directories
  env_path="$ONFRAME_HOME/.env"
  if [ ! -f "$env_path" ]; then
    if [ -f "$ONFRAME_HOME/.env.example" ]; then
      cp "$ONFRAME_HOME/.env.example" "$env_path"
    else
      printf 'ML_SERVICE_PORT=4765\nONBLIDE_CONNECT_BASE_URL=https://connect.onblide.com\nONBLIDE_TOKEN_SECRET=\n' > "$env_path"
    fi
  fi

  if ! grep -q '^[[:space:]]*ML_TOKEN_STORE_PATH[[:space:]]*=' "$env_path"; then
    printf 'ML_TOKEN_STORE_PATH="%s/.onframe/tokens.json"\n' "$ONFRAME_HOME" >> "$env_path"
  fi

  current_secret="$(sed -n 's/^[[:space:]]*ONBLIDE_TOKEN_SECRET[[:space:]]*=[[:space:]]*//p' "$env_path" | head -n 1 | tr -d '\"\047[:space:]')"
  if [ -z "$current_secret" ]; then
    secret="$(onframe_random_secret)"
    temp_env="$(mktemp "${TMPDIR:-/tmp}/onframe-env.XXXXXX")"
    awk -v secret="$secret" '
      BEGIN { found = 0 }
      /^[[:space:]]*ONBLIDE_TOKEN_SECRET[[:space:]]*=/ {
        if (!found) print "ONBLIDE_TOKEN_SECRET=" secret
        found = 1
        next
      }
      { print }
      END { if (!found) print "ONBLIDE_TOKEN_SECRET=" secret }
    ' "$env_path" > "$temp_env"
    mv "$temp_env" "$env_path"
  fi
  chmod 600 "$env_path"
}

onframe_arch() {
  case "$(uname -m)" in
    arm64) printf 'arm64\n' ;;
    x86_64) printf 'x64\n' ;;
    *) onframe_fail "Arquitetura de Mac nao suportada: $(uname -m)" ;;
  esac
}

onframe_ensure_runtime() {
  onframe_ensure_directories
  arch="$(onframe_arch)"
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/onframe-node.XXXXXX")"
  trap 'rm -rf "$temp_root"' EXIT HUP INT TERM
  sums="$temp_root/SHASUMS256.txt"
  /usr/bin/curl -fsSL "https://nodejs.org/dist/latest-v$ONFRAME_NODE_MAJOR.x/SHASUMS256.txt" -o "$sums"
  archive="$(awk -v arch="$arch" '$2 ~ ("^node-v" "[0-9.]+-darwin-" arch "\\.tar\\.gz$") { print $2; exit }' "$sums")"
  [ -n "$archive" ] || onframe_fail "Nao encontrei o runtime oficial do Node.js para esta arquitetura."
  version="$(printf '%s' "$archive" | sed -E 's/^node-v([0-9.]+)-darwin-.*$/\1/')"
  current_version=''
  if [ -x "$(onframe_runtime_node)" ]; then
    current_version="$("$(onframe_runtime_node)" -p 'process.versions.node' 2>/dev/null || true)"
  fi
  if [ "$current_version" = "$version" ]; then
    rm -rf "$temp_root"
    trap - EXIT HUP INT TERM
    return
  fi

  expected="$(awk -v file="$archive" '$2 == file { print $1; exit }' "$sums")"
  archive_path="$temp_root/$archive"
  /usr/bin/curl -fsSL "https://nodejs.org/dist/v$version/$archive" -o "$archive_path"
  actual="$(/usr/bin/shasum -a 256 "$archive_path" | awk '{ print $1 }')"
  [ "$actual" = "$expected" ] || onframe_fail "O checksum do runtime Node.js nao confere."

  tar -xzf "$archive_path" -C "$temp_root"
  extracted="$temp_root/${archive%.tar.gz}"
  [ -x "$extracted/bin/node" ] || onframe_fail "Runtime Node.js extraido de forma invalida."
  rm -rf "$ONFRAME_HOME/.runtime/node"
  mv "$extracted" "$ONFRAME_HOME/.runtime/node"
  printf '%s\n' "$version" > "$ONFRAME_HOME/.runtime/version"
  chmod -R u+rwX,go-rwx "$ONFRAME_HOME/.runtime"
  rm -rf "$temp_root"
  trap - EXIT HUP INT TERM
}

onframe_xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

onframe_write_agent() {
  onframe_ensure_directories
  node_path="$(onframe_runtime_node)"
  [ -x "$node_path" ] || onframe_fail "Runtime privado do Node.js nao encontrado."
  mkdir -p "$(dirname "$ONFRAME_AGENT_PATH")"
  temp_plist="$(mktemp "${TMPDIR:-/tmp}/onframe-agent.XXXXXX")"
  label_xml="$(onframe_xml_escape "$ONFRAME_LABEL")"
  node_xml="$(onframe_xml_escape "$node_path")"
  server_xml="$(onframe_xml_escape "$ONFRAME_HOME/service/server.js")"
  root_xml="$(onframe_xml_escape "$ONFRAME_HOME")"
  out_xml="$(onframe_xml_escape "$ONFRAME_HOME/.onframe/logs/service.out.log")"
  err_xml="$(onframe_xml_escape "$ONFRAME_HOME/.onframe/logs/service.err.log")"
  cat > "$temp_plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label_xml</string>
  <key>ProgramArguments</key>
  <array><string>$node_xml</string><string>$server_xml</string></array>
  <key>WorkingDirectory</key><string>$root_xml</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>$out_xml</string>
  <key>StandardErrorPath</key><string>$err_xml</string>
</dict>
</plist>
EOF
  /usr/bin/plutil -lint "$temp_plist" >/dev/null
  chmod 600 "$temp_plist"
  mv "$temp_plist" "$ONFRAME_AGENT_PATH"
}

onframe_service_target() {
  printf 'gui/%s/%s\n' "$(id -u)" "$ONFRAME_LABEL"
}

onframe_service_loaded() {
  /bin/launchctl print "$(onframe_service_target)" >/dev/null 2>&1
}

onframe_start_service() {
  if onframe_health; then
    return
  fi
  domain="gui/$(id -u)"
  if onframe_service_loaded; then
    /bin/launchctl kickstart -k "$(onframe_service_target)"
  else
    /bin/launchctl bootstrap "$domain" "$ONFRAME_AGENT_PATH"
  fi
  attempts=0
  while [ "$attempts" -lt 20 ]; do
    if onframe_health; then
      return
    fi
    attempts=$((attempts + 1))
    sleep 0.25
  done
  onframe_fail "Nao consegui confirmar que o servico iniciou. Consulte .onframe/logs."
}

onframe_stop_service() {
  if onframe_service_loaded; then
    /bin/launchctl bootout "$(onframe_service_target)" >/dev/null 2>&1 || onframe_fail "O macOS recusou encerrar o servico local."
  fi
  attempts=0
  while onframe_health && [ "$attempts" -lt 12 ]; do
    attempts=$((attempts + 1))
    sleep 0.25
  done
  ! onframe_health || onframe_fail "O servico ainda responde na porta $(onframe_port)."
}

onframe_shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

onframe_launcher_commands() {
  command_root="$ONFRAME_HOME/.onframe/commands"
  mkdir -p "$command_root"
  chmod 700 "$command_root"
  launcher_script="$(onframe_shell_quote "$ONFRAME_HOME/scripts/bootstrap/launcher-action.sh")"
  for action in update start stop restart check open-log; do
    wrapper="$command_root/$action.command"
    printf '#!/bin/sh\nexec /usr/bin/env ONFRAME_HOME=%s %s %s\n' \
      "$(onframe_shell_quote "$ONFRAME_HOME")" "$launcher_script" "$(onframe_shell_quote "$action")" > "$wrapper"
    chmod 700 "$wrapper"
  done
}

onframe_register_launcher() {
  onframe_launcher_commands
  mkdir -p "$HOME/Applications"
  source_file="$(mktemp "${TMPDIR:-/tmp}/onframe-launcher.XXXXXX.applescript")"
  command_root="$ONFRAME_HOME/.onframe/commands"
  escaped_root="$(printf '%s' "$command_root" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  cat > "$source_file" <<EOF
on open location rawUrl
  set actionName to my actionFromUrl(rawUrl)
  if actionName is "" then
    display alert "Acao do OnFrame nao suportada."
    return
  end if
  set commandPath to "$escaped_root/" & actionName & ".command"
  do shell script "/usr/bin/open " & quoted form of commandPath
end open location

on actionFromUrl(rawUrl)
  set allowedActions to {"update", "start", "stop", "restart", "check", "open-log"}
  repeat with actionName in allowedActions
    if rawUrl is "onframe-updater://" & actionName or rawUrl is "onframe-updater://" & actionName & "/" then
      return actionName as text
    end if
  end repeat
  return ""
end actionFromUrl
EOF
  rm -rf "$ONFRAME_LAUNCHER_PATH"
  /usr/bin/osacompile -o "$ONFRAME_LAUNCHER_PATH" "$source_file"
  rm -f "$source_file"
  info_plist="$ONFRAME_LAUNCHER_PATH/Contents/Info.plist"
  /usr/bin/plutil -replace CFBundleIdentifier -string "$ONFRAME_LAUNCHER_ID" "$info_plist"
  /usr/bin/plutil -insert LSUIElement -bool true "$info_plist"
  /usr/bin/plutil -insert CFBundleURLTypes -xml '<array><dict><key>CFBundleURLName</key><string>OnFrame local controls</string><key>CFBundleURLSchemes</key><array><string>onframe-updater</string></array></dict></array>' "$info_plist"
  launch_services="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  if [ -x "$launch_services" ]; then
    "$launch_services" -f "$ONFRAME_LAUNCHER_PATH" >/dev/null 2>&1 || true
  fi
}

onframe_unregister_launcher() {
  launch_services="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  if [ -d "$ONFRAME_LAUNCHER_PATH" ] && [ -x "$launch_services" ]; then
    "$launch_services" -u "$ONFRAME_LAUNCHER_PATH" >/dev/null 2>&1 || true
  fi
  rm -rf "$ONFRAME_LAUNCHER_PATH"
}
