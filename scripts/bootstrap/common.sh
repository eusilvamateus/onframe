#!/bin/sh

set -eu

ONFRAME_LABEL="com.onblide.onframe.service"
ONFRAME_NODE_MAJOR="24"
ONFRAME_DEFAULT_HOME="$HOME/Library/Application Support/OnFrame"
ONFRAME_HOME="${ONFRAME_HOME:-$ONFRAME_DEFAULT_HOME}"
ONFRAME_AGENT_PATH="$HOME/Library/LaunchAgents/$ONFRAME_LABEL.plist"
ONFRAME_LAUNCHER_PATH="$HOME/Applications/OnFrame Launcher.app"
ONFRAME_LAUNCHER_ID="com.onblide.onframe.launcher"

export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

ESC="$(printf '\033')"
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  ONFRAME_COLOR_ENABLED=1
  ONFRAME_CLR_BLUE="${ESC}[38;2;48;86;163m"
  ONFRAME_CLR_WHITE="${ESC}[38;2;242;240;232m"
  ONFRAME_CLR_ORANGE="${ESC}[38;2;237;124;46m"
  ONFRAME_CLR_BRAND="${ESC}[38;2;10;78;228m"
  ONFRAME_CLR_CYAN="${ESC}[38;2;64;180;220m"
  ONFRAME_CLR_GREEN="${ESC}[38;2;119;158;61m"
  ONFRAME_CLR_CORAL="${ESC}[38;2;220;65;65m"
  ONFRAME_CLR_AMBER="${ESC}[38;2;235;124;45m"
  ONFRAME_CLR_MUTED="${ESC}[38;2;130;138;150m"
  ONFRAME_CLR_BORDER="${ESC}[38;2;70;85;110m"
  ONFRAME_CLR_RESET="${ESC}[0m"
  ONFRAME_CLR_BOLD="${ESC}[1m"
  ONFRAME_CLR_DIM="${ESC}[2m"

  # Legacy aliases
  ONFRAME_CYAN="$ONFRAME_CLR_CYAN"
  ONFRAME_GREEN="$ONFRAME_CLR_GREEN"
  ONFRAME_YELLOW="$ONFRAME_CLR_AMBER"
  ONFRAME_RED="$ONFRAME_CLR_CORAL"
  ONFRAME_MUTED="$ONFRAME_CLR_MUTED"
  ONFRAME_RESET="$ONFRAME_CLR_RESET"
else
  ONFRAME_COLOR_ENABLED=0
  ONFRAME_CLR_BLUE=''
  ONFRAME_CLR_WHITE=''
  ONFRAME_CLR_ORANGE=''
  ONFRAME_CLR_BRAND=''
  ONFRAME_CLR_CYAN=''
  ONFRAME_CLR_GREEN=''
  ONFRAME_CLR_CORAL=''
  ONFRAME_CLR_AMBER=''
  ONFRAME_CLR_MUTED=''
  ONFRAME_CLR_BORDER=''
  ONFRAME_CLR_RESET=''
  ONFRAME_CLR_BOLD=''
  ONFRAME_CLR_DIM=''

  ONFRAME_CYAN=''
  ONFRAME_GREEN=''
  ONFRAME_YELLOW=''
  ONFRAME_RED=''
  ONFRAME_MUTED=''
  ONFRAME_RESET=''
fi

onframe_truecolor_fg() {
  [ "$ONFRAME_COLOR_ENABLED" = "1" ] && printf '%s[38;2;%d;%d;%dm' "$ESC" "$1" "$2" "$3" || true
}

onframe_truecolor_bg() {
  [ "$ONFRAME_COLOR_ENABLED" = "1" ] && printf '%s[48;2;%d;%d;%dm' "$ESC" "$1" "$2" "$3" || true
}

onframe_console_width() {
  if [ -t 1 ]; then
    cols="$(tput cols 2>/dev/null || true)"
    case "$cols" in
      ''|*[!0-9]*) printf '120\n' ;;
      *) [ "$cols" -gt 0 ] && printf '%s\n' "$cols" || printf '120\n' ;;
    esac
  else
    printf '120\n'
  fi
}

onframe_tui_width() {
  cols="$(onframe_console_width)"
  w=$(( cols - 6 ))
  [ "$w" -gt 74 ] && w=74
  [ "$w" -lt 56 ] && w=56
  printf '%s\n' "$w"
}

onframe_strip_ansi() {
  printf '%s' "$1" | awk '{ gsub(/\033\[[0-9;?]*[ -/]*[@-~]/, ""); print }'
}

onframe_display_width() {
  printf '%s' "$1" | awk '
  function strip_ansi(str) {
    gsub(/\033\[[0-9;?]*[ -/]*[@-~]/, "", str);
    return str;
  }
  { printf "%d\n", length(strip_ansi($0)) }'
}

onframe_center_padding() {
  _cw="${1:-0}"
  _cols="$(onframe_console_width)"
  _pad=$(( (_cols - _cw) / 2 ))
  [ "$_pad" -lt 0 ] && _pad=0
  awk -v n="$_pad" 'BEGIN { while (n-- > 0) printf " "; }'
}

onframe_badge() {
  _b_text="$1"
  _b_r="${2:-20}"
  _b_g="${3:-60}"
  _b_b="${4:-110}"
  printf '%s%s%s %s %s' "$(onframe_truecolor_bg "$_b_r" "$_b_g" "$_b_b")" "$(onframe_truecolor_fg 255 255 255)" "$ONFRAME_CLR_BOLD" "$_b_text" "$ONFRAME_CLR_RESET"
}

onframe_brand_sheen() {
  _elapsed="${1:-0}"
  printf '%s%sOn%sblide%s │ %sOnFrame%s' \
    "$ONFRAME_CLR_BOLD" "$(onframe_truecolor_fg 245 248 255)" \
    "$(onframe_truecolor_fg 235 124 45)" \
    "$(onframe_truecolor_fg 80 95 115)" \
    "$(onframe_truecolor_fg 70 140 255)" \
    "$ONFRAME_CLR_RESET"
}

onframe_project_version() {
  _script_dir="${SCRIPT_DIR:-}"
  for candidate in \
    "${ONFRAME_HOME:-}" \
    "${_script_dir:-}" \
    "$(dirname "${_script_dir:-.}")" \
    "$(dirname "$(dirname "${_script_dir:-.}")")" \
    "$HOME/Library/Application Support/OnFrame" \
    "$(pwd)"; do
    if [ -n "$candidate" ] && [ -f "$candidate/package.json" ]; then
      ver="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$candidate/package.json" | head -n 1)"
      if [ -n "$ver" ]; then
        printf 'v%s\n' "$ver"
        return
      fi
    fi
  done
  printf 'v0.4.0\n'
}

onframe_header_3l() {
  _tag="${1:-}"
  _subtitle="${2:-}"
  _tone="${3:-brand}"
  _card_width="${4:-74}"
  _detail="${5:-}"

  case "$_tone" in
    green) _tone_fg="$ONFRAME_CLR_GREEN" ;;
    coral) _tone_fg="$ONFRAME_CLR_CORAL" ;;
    amber) _tone_fg="$ONFRAME_CLR_AMBER" ;;
    cyan)  _tone_fg="$ONFRAME_CLR_CYAN" ;;
    *)     _tone_fg="$ONFRAME_CLR_BRAND" ;;
  esac

  _pad="$(onframe_center_padding "$_card_width")"

  _s0="$(onframe_truecolor_fg 10 78 228)▄█▀▀▀▀▀█  ▀▀█▄$ONFRAME_CLR_RESET"
  _s1="$(onframe_truecolor_fg 10 78 228)██    ▄▀    ██$ONFRAME_CLR_RESET"
  _s2="$(onframe_truecolor_fg 10 78 228)▀█▄▄▄ █▄▄▄▄▄█▀$ONFRAME_CLR_RESET"

  _brand="$(onframe_brand_sheen 0)"
  _tag_fmt="$ONFRAME_CLR_BOLD$_tone_fg$_tag$ONFRAME_CLR_RESET"

  _tag_w="$(onframe_display_width "$_tag")"
  _gap_len=$(( _card_width - 34 - _tag_w ))
  [ "$_gap_len" -lt 2 ] && _gap_len=2
  _gap="$(awk -v n="$_gap_len" 'BEGIN { while (n-- > 0) printf " "; }')"

  if [ -z "$_detail" ]; then
    _p="$(onframe_port 2>/dev/null || printf '4765')"
    _v="$(onframe_project_version)"
    _detail="Painel de Controle Local • Porta $_p • $_v"
  fi

  printf '\n'
  printf '%s%s   %s%s%s\n' "$_pad" "$_s0" "$_brand" "$_gap" "$_tag_fmt"
  printf '%s%s   %s%s%s\n' "$_pad" "$_s1" "$ONFRAME_CLR_MUTED" "$_subtitle" "$ONFRAME_CLR_RESET"
  printf '%s%s   %s%s%s\n' "$_pad" "$_s2" "$(onframe_truecolor_fg 100 115 135)" "$_detail" "$ONFRAME_CLR_RESET"
  printf '\n'
}

onframe_header_2l() {
  onframe_header_3l "$@"
}

onframe_minibar() {
  _mb_pct="${1:-0}"
  _mb_len="${2:-12}"
  _mb_scheme="${3:-green}"

  awk -v pct="$_mb_pct" -v len="$_mb_len" -v scheme="$_mb_scheme" -v esc="$ESC" '
  BEGIN {
    val = pct + 0.0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    filled = int(len * val / 100.0 + 0.5);

    if (scheme == "coral") {
      s_r = 235; s_g = 124; s_b = 45;
      e_r = 220; e_g = 65;  e_b = 65;
    } else if (scheme == "amber") {
      s_r = 235; s_g = 124; s_b = 45;
      e_r = 255; e_g = 180; e_b = 60;
    } else if (scheme == "cyan") {
      s_r = 40;  s_g = 140; s_b = 240;
      e_r = 64;  e_g = 180; e_b = 220;
    } else {
      s_r = 40;  s_g = 140; s_b = 240;
      e_r = 119; e_g = 158; e_b = 61;
    }

    max_idx = (len > 1) ? len - 1 : 1;
    for (i = 0; i < len; i++) {
      if (i < filled) {
        t = i / max_idx;
        cr = int(s_r + (e_r - s_r) * t + 0.5);
        cg = int(s_g + (e_g - s_g) * t + 0.5);
        cb = int(s_b + (e_b - s_b) * t + 0.5);
        printf("%s[38;2;%d;%d;%dm▰", esc, cr, cg, cb);
      } else {
        printf("%s[38;2;55;65;80m▱", esc);
      }
    }
    printf("%s[0m", esc);
  }'
}

onframe_segmented_gauge() {
  _sg_score="${1:-100.0}"
  _sg_max="${2:-20}"
  _sg_scheme="${3:-green}"

  awk -v score="$_sg_score" -v max_seg="$_sg_max" -v scheme="$_sg_scheme" -v esc="$ESC" '
  BEGIN {
    pct = score + 0.0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    filled = int(max_seg * pct / 100.0);

    if (scheme == "coral") {
      s_r = 235; s_g = 124; s_b = 45;
      e_r = 220; e_g = 65;  e_b = 65;
    } else if (scheme == "amber") {
      s_r = 50;  s_g = 150; s_b = 255;
      e_r = 235; e_g = 124; e_b = 45;
    } else if (scheme == "cyan") {
      s_r = 40;  s_g = 140; s_b = 240;
      e_r = 64;  e_g = 180; e_b = 220;
    } else {
      s_r = 50;  s_g = 150; s_b = 255;
      e_r = 120; e_g = 220; e_b = 120;
    }

    max_idx = (max_seg > 1) ? max_seg - 1 : 1;
    for (i = 0; i < max_seg; i++) {
      if (i < filled) {
        t = i / max_idx;
        cr = int(s_r + (e_r - s_r) * t + 0.5);
        cg = int(s_g + (e_g - s_g) * t + 0.5);
        cb = int(s_b + (e_b - s_b) * t + 0.5);
        printf("%s[38;2;%d;%d;%dm█", esc, cr, cg, cb);
      } else {
        printf("%s[38;2;45;55;70m░", esc);
      }
    }
    printf("%s[0m", esc);
  }'
}

onframe_progress_bar() {
  _pb_pct="${1:-0}"
  _pb_len="${2:-30}"
  _pb_scheme="${3:-green}"

  awk -v pct="$_pb_pct" -v len="$_pb_len" -v scheme="$_pb_scheme" -v esc="$ESC" '
  BEGIN {
    val = pct + 0.0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    filled = int(len * val / 100.0);

    if (scheme == "coral") {
      s_r = 235; s_g = 124; s_b = 45;
      e_r = 220; e_g = 65;  e_b = 65;
      tip_r = 220; tip_g = 65; tip_b = 65;
    } else if (scheme == "cyan") {
      s_r = 10;  s_g = 78;  s_b = 228;
      e_r = 64;  e_g = 180; e_b = 220;
      tip_r = 64; tip_g = 180; tip_b = 220;
    } else if (scheme == "amber") {
      s_r = 220; s_g = 65;  s_b = 65;
      m_r = 237; m_g = 124; m_b = 46;
      e_r = 119; e_g = 158; e_b = 61;
      tip_r = 119; tip_g = 158; tip_b = 61;
    } else {
      s_r = 48;  s_g = 86;  s_b = 163;
      e_r = 119; e_g = 158; e_b = 61;
      tip_r = 119; tip_g = 158; tip_b = 61;
    }

    max_idx = (len > 1) ? len - 1 : 1;
    for (i = 0; i < len; i++) {
      if (i < filled) {
        t = i / max_idx;
        if (scheme == "amber") {
          if (t < 0.5) {
            sub_t = t / 0.5;
            cr = int(s_r + (m_r - s_r) * sub_t + 0.5);
            cg = int(s_g + (m_g - s_g) * sub_t + 0.5);
            cb = int(s_b + (m_b - s_b) * sub_t + 0.5);
          } else {
            sub_t = (t - 0.5) / 0.5;
            cr = int(m_r + (e_r - m_r) * sub_t + 0.5);
            cg = int(m_g + (e_g - m_g) * sub_t + 0.5);
            cb = int(m_b + (e_b - m_b) * sub_t + 0.5);
          }
        } else {
          cr = int(s_r + (e_r - s_r) * t + 0.5);
          cg = int(s_g + (e_g - s_g) * t + 0.5);
          cb = int(s_b + (e_b - s_b) * t + 0.5);
        }
        printf("%s[38;2;%d;%d;%dm━", esc, cr, cg, cb);
      } else if (i == filled && filled < len) {
        printf("%s[38;2;%d;%d;%dm╸", esc, tip_r, tip_g, tip_b);
      } else {
        printf("%s[38;2;55;65;80m─", esc);
      }
    }
    printf("%s[0m %s[1m%s[38;2;230;235;245m%5.1f%%%s[0m", esc, esc, esc, val, esc);
  }'
}

onframe_chromatic_wave() {
  _elapsed="${1:-1.2}"
  _width="${2:-16}"
  _scheme="${3:-green}"
  _amp="${4:-0.85}"
  _speed="${5:-6.5}"

  awk -v elapsed="$_elapsed" -v width="$_width" -v scheme="$_scheme" -v amp="$_amp" -v speed="$_speed" -v esc="$ESC" '
  BEGIN {
    if (scheme == "coral") {
      p0[0]=120; p0[1]=45; p0[2]=35;
      p1[0]=235; p1[1]=120; p1[2]=45;
      p2[0]=255; p2[1]=95; p2[2]=95;
    } else if (scheme == "cyan") {
      p0[0]=25; p0[1]=75; p0[2]=180;
      p1[0]=64; p1[1]=180; p1[2]=240;
      p2[0]=255; p2[1]=195; p2[2]=75;
    } else if (scheme == "amber") {
      p0[0]=80; p0[1]=40; p0[2]=20;
      p1[0]=235; p1[1]=124; p1[2]=45;
      p2[0]=255; p2[1]=200; p2[2]=100;
    } else if (scheme == "flat") {
      p0[0]=60; p0[1]=70; p0[2]=85;
      p1[0]=80; p1[1]=95; p1[2]=115;
      p2[0]=100; p2[1]=115; p2[2]=135;
    } else {
      p0[0]=25; p0[1]=80; p0[2]=60;
      p1[0]=90; p1[1]=190; p1[2]=100;
      p2[0]=180; p2[1]=255; p2[2]=190;
    }

    b_table[0] = "⣀⡠⡐⡈";
    b_table[1] = "⢄⠤⠔⠌";
    b_table[2] = "⢂⠢⠒⠊";
    b_table[3] = "⢁⠡⠑⠉";

    for (i = 0; i < width; i++) {
      left = i * 2;
      right = left + 1;
      if (amp <= 0.05) {
        y0 = 0.5; y1 = 0.5;
      } else {
        y0 = (sin(elapsed * speed - left * 0.4) * amp + 1) / 2;
        y1 = (sin(elapsed * speed - right * 0.4) * amp + 1) / 2;
      }
      avg = (y0 + y1) / 2;
      if (avg < 0.5) {
        t = avg / 0.5;
        cr = int(p0[0] + (p1[0] - p0[0]) * t + 0.5);
        cg = int(p0[1] + (p1[1] - p0[1]) * t + 0.5);
        cb = int(p0[2] + (p1[2] - p0[2]) * t + 0.5);
      } else {
        t = (avg - 0.5) / 0.5;
        cr = int(p1[0] + (p2[0] - p1[0]) * t + 0.5);
        cg = int(p1[1] + (p2[1] - p1[1]) * t + 0.5);
        cb = int(p1[2] + (p2[2] - p1[2]) * t + 0.5);
      }
      l_idx = int(y0 * 3 + 0.5); if (l_idx < 0) l_idx = 0; if (l_idx > 3) l_idx = 3;
      r_idx = int(y1 * 3 + 0.5); if (r_idx < 0) r_idx = 0; if (r_idx > 3) r_idx = 3;

      ch = substr(b_table[l_idx], r_idx + 1, 1);
      weight = (avg > 0.7) ? (esc "[1m") : "";
      printf("%s%s[38;2;%d;%d;%dm%s%s[0m", weight, esc, cr, cg, cb, ch, esc);
    }
  }'
}

onframe_print_card() {
  _title="$1"
  _lines_file="$2"
  _width="${3:-74}"
  _br="${4:-70}"
  _bg="${5:-85}"
  _bb="${6:-110}"

  _border="$(onframe_truecolor_fg "$_br" "$_bg" "$_bb")"
  _pad="$(onframe_center_padding "$_width")"

  awk -v title="$_title" -v width="$_width" -v border="$_border" -v reset="$ONFRAME_CLR_RESET" -v bold="$ONFRAME_CLR_BOLD" -v pad="$_pad" '
  function strip_ansi(str) {
    gsub(/\033\[[0-9;?]*[ -/]*[@-~]/, "", str);
    return str;
  }
  function dwidth(str) {
    return length(strip_ansi(str));
  }
  BEGIN {
    if (title != "") {
      tw = dwidth(title);
      dashes = width - 5 - tw;
      if (dashes < 0) dashes = 0;
      dash_str = "";
      for (k = 0; k < dashes; k++) dash_str = dash_str "─";
      printf "%s%s╭─ %s%s%s%s %s%s╮%s\n", pad, border, reset, bold, title, reset, border, dash_str, reset;
    } else {
      dash_str = "";
      for (k = 0; k < width - 2; k++) dash_str = dash_str "─";
      printf "%s%s╭%s╮%s\n", pad, border, dash_str, reset;
    }
    inner = width - 4;
  }
  {
    line = $0;
    lw = dwidth(line);
    sp = inner - lw;
    if (sp < 0) sp = 0;
    space_str = "";
    for (k = 0; k < sp; k++) space_str = space_str " ";
    printf "%s%s│%s  %s%s%s│%s\n", pad, border, reset, line, space_str, border, reset;
  }
  END {
    dash_str = "";
    for (k = 0; k < width - 2; k++) dash_str = dash_str "─";
    printf "%s%s╰%s╯%s\n", pad, border, dash_str, reset;
  }
  ' "$_lines_file"
}

onframe_copy_to_clipboard() {
  _cmd="$1"
  if [ -x "/usr/bin/pbcopy" ]; then
    printf '%s' "$_cmd" | /usr/bin/pbcopy 2>/dev/null || return 1
    return 0
  fi
  return 1
}

onframe_show_failure_screen() {
  _err_msg="${1:-}"
  _recovery_cmd="${2:-}"
  _no_pause="${3:-0}"

  if [ -z "$_recovery_cmd" ]; then
    _recovery_cmd="$ONFRAME_HOME/scripts/bootstrap/check.sh"
  fi

  _lower="$(printf '%s' "$_err_msg" | tr '[:upper:]' '[:lower:]')"

  case "$_lower" in
    *eaddrinuse*|*porta*uso*|*porta*ocupada*|*address*use*)
      _code="E1"
      _title="Conflito de Porta Local"
      _badge="▲ FALHA NA INICIALIZAÇÃO • PORTA EM USO"
      _headline="Não foi possível abrir o serviço local do OnFrame."
      _reason="A porta local já está em uso por outro processo."
      _impact="Uma instância anterior ou outro aplicativo retém o canal local."
      _manual="Alternativa Manual: Encerrar Instância"
      _disp_cmd="$ONFRAME_HOME/scripts/bootstrap/stop.sh"
      _tone_r=235; _tone_g=124; _tone_b=45
      ;;
    *server.js*|*onframe*nao*encontrado*|*nao*localizar*|*cannot*find*path*)
      _code="E2"
      _title="Instalação Incompleta"
      _badge="▲ ARQUIVOS AUSENTES • ONFRAME NÃO ENCONTRADO"
      _headline="Não encontramos os arquivos necessários do OnFrame."
      _reason="A instalação local está incompleta ou foi movida de lugar."
      _impact="O serviço não pode ser preparado sem os arquivos da aplicação."
      _manual="Alternativa Manual: Verificar Instalação"
      _disp_cmd="$ONFRAME_HOME/scripts/bootstrap/check.sh"
      _tone_r=220; _tone_g=65; _tone_b=65
      ;;
    *node*|*runtime*)
      _code="E3"
      _title="Ambiente Incompleto"
      _badge="▲ RUNTIME AUSENTE • NODE.JS NÃO ENCONTRADO"
      _headline="O serviço local requer o ambiente Node.js."
      _reason="O runtime Node.js privado não foi localizado no computador."
      _impact="O canal de sincronização não pode ser iniciado."
      _manual="Alternativa Manual: Atualizar OnFrame"
      _disp_cmd="$ONFRAME_HOME/scripts/bootstrap/update.sh"
      _tone_r=220; _tone_g=65; _tone_b=65
      ;;
    *acesso*negado*|*permiss*|*permission*)
      _code="E4"
      _title="Permissão Insuficiente"
      _badge="▲ PERMISSÃO NECESSÁRIA • AÇÃO BLOQUEADA"
      _headline="O macOS bloqueou a alteração solicitada."
      _reason="A operação precisa ser executada pelo mesmo usuário do OnFrame."
      _impact="O serviço anterior não pôde ser alterado com segurança."
      _manual="Alternativa Manual: Diagnosticar Serviço"
      _disp_cmd="$ONFRAME_HOME/scripts/bootstrap/check.sh"
      _tone_r=235; _tone_g=124; _tone_b=45
      ;;
    *)
      _code="E0"
      _title="Falha na Operação"
      _badge="▲ OPERAÇÃO INTERROMPIDA"
      _headline="A operação local foi interrompida antes de concluir."
      _reason="${_err_msg:-Uma inconformidade inesperada impediu a finalização do processo.}"
      _impact="Verifique as informações acima ou execute o diagnóstico do ambiente."
      _manual="Alternativa Manual: Diagnosticar Ambiente"
      _disp_cmd="$ONFRAME_HOME/scripts/bootstrap/check.sh"
      _tone_r=220; _tone_g=65; _tone_b=65
      ;;
  esac

  _width="$(onframe_tui_width)"
  onframe_header_3l "▲ AÇÃO MANUAL NECESSÁRIA" "Procedimento de Recuperação & Diagnóstico" "amber" "$_width"

  _inner_w=$(( _width - 8 ))
  _inner_tmp="$(mktemp "${TMPDIR:-/tmp}/onframe-fail-inner.XXXXXX")"
  printf '%s\n' "$_disp_cmd" > "$_inner_tmp"

  _card_tmp="$(mktemp "${TMPDIR:-/tmp}/onframe-fail.XXXXXX")"
  trap 'rm -f "$_inner_tmp" "$_card_tmp"' EXIT

  {
    onframe_badge "$_badge" 130 50 45
    printf '\n%s%s%s\n' "$ONFRAME_CLR_BOLD" "$_headline" "$ONFRAME_CLR_RESET"
    printf '%s%s%s\n' "$ONFRAME_CLR_MUTED" "$_reason" "$ONFRAME_CLR_RESET"
    printf '%s%s%s\n\n' "$ONFRAME_CLR_MUTED" "$_impact" "$ONFRAME_CLR_RESET"
    onframe_print_card "$_manual" "$_inner_tmp" "$_inner_w" "$_tone_r" "$_tone_g" "$_tone_b"
    printf '\n%s[C] Copiar comando  •  [Enter] Retornar%s\n' "$ONFRAME_CLR_MUTED" "$ONFRAME_CLR_RESET"
  } > "$_card_tmp"

  _card_title="$(onframe_truecolor_fg "$_tone_r" "$_tone_g" "$_tone_b")$_code$ONFRAME_CLR_RESET $_title"
  onframe_print_card "$_card_title" "$_card_tmp" "$_width" "$_tone_r" "$_tone_g" "$_tone_b"

  if [ "$_no_pause" = "0" ] && [ -t 0 ]; then
    printf '\n'
    if [ -t 0 ] && [ -x "/usr/bin/read" ] || command -v read >/dev/null 2>&1; then
      read -r _choice || true
      case "$_choice" in
        c|C)
          if onframe_copy_to_clipboard "$_recovery_cmd"; then
            printf '%s✔ COMANDO COPIADO! BASTA COLAR NO TERMINAL (CMD+V)%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET"
          fi
          ;;
      esac
    fi
  fi
}

onframe_invoke_quick_action() {
  _q_tag=""
  _q_subtitle=""
  _q_card_title=""
  _q_tone="brand"
  _q_action_type=""
  _q_operation=""
  _q_recovery_cmd=""
  _q_no_pause="0"

  while [ $# -gt 0 ]; do
    case "$1" in
      --tag) _q_tag="$2"; shift 2 ;;
      --subtitle) _q_subtitle="$2"; shift 2 ;;
      --card-title) _q_card_title="$2"; shift 2 ;;
      --tone) _q_tone="$2"; shift 2 ;;
      --action-type) _q_action_type="$2"; shift 2 ;;
      --operation) _q_operation="$2"; shift 2 ;;
      --recovery-cmd) _q_recovery_cmd="$2"; shift 2 ;;
      --no-pause) _q_no_pause="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  _width="$(onframe_tui_width)"
  _is_interactive=0
  if [ -t 1 ] && [ -t 0 ] && [ "$_q_no_pause" = "0" ]; then
    _is_interactive=1
  fi

  if [ "$_is_interactive" = "1" ]; then
    printf '\033[?25l'
    trap 'printf "\033[?25h"' EXIT INT TERM
  fi

  case "$_q_action_type" in
    stop)
      _s1_b="LOCALIZANDO PROCESSO"; _s1_bg="45 55 90"; _s1_dot="80 145 255"
      _s1_t="Localizando processo ativo na porta 4765..."; _s1_d="Identificando PID e verificando integridade."
      _s1_sp=0; _s1_ep=35; _s1_dur=10; _s1_wtag="[Drenando socket]"; _s1_wtag_c="235 124 45"; _s1_ws="coral"; _s1_bs="coral"
      _s1_f="Encerrando processos locais e liberando a porta com segurança."

      _s2_b="FINALIZANDO PROCESSO"; _s2_bg="140 75 35"; _s2_dot="235 124 45"
      _s2_t="Encerrando servidor Node.js com segurança..."; _s2_d="Fechando conexões ativas e liberando a porta."
      _s2_sp=35; _s2_ep=75; _s2_dur=11; _s2_wtag="[Drenando socket]"; _s2_wtag_c="235 124 45"; _s2_ws="coral"; _s2_bs="coral"
      _s2_f="Encerrando processos locais e liberando a porta com segurança."

      _s3_b="VERIFICANDO LIBERAÇÃO"; _s3_bg="130 45 45"; _s3_dot="220 65 65"
      _s3_t="Confirmando encerramento dos recursos..."; _s3_d="Validando encerramento dos recursos locais."
      _s3_sp=75; _s3_ep=100; _s3_dur=9; _s3_wtag="[Drenando socket]"; _s3_wtag_c="235 124 45"; _s3_ws="coral"; _s3_bs="coral"
      _s3_f="Encerrando processos locais e liberando a porta com segurança."
      ;;
    restart)
      _s1_b="PARANDO PROCESSO ATUAL"; _s1_bg="45 55 90"; _s1_dot="220 65 65"
      _s1_t="Encerrando instância anterior do serviço..."; _s1_d="Liberando conexões e fechando o canal local."
      _s1_sp=0; _s1_ep=35; _s1_dur=10; _s1_wtag="[Liberando socket]"; _s1_wtag_c="220 65 65"; _s1_ws="coral"; _s1_bs="coral"
      _s1_f="Drenagem graciosa de recursos e reinicialização do processo local."

      _s2_b="RECICLANDO INSTÂNCIA"; _s2_bg="130 75 30"; _s2_dot="235 124 45"
      _s2_t="Iniciando novo processo Node.js..."; _s2_d="Alocando uma nova instância em segundo plano."
      _s2_sp=35; _s2_ep=75; _s2_dur=12; _s2_wtag="[Sincronizando]"; _s2_wtag_c="237 124 46"; _s2_ws="amber"; _s2_bs="amber"
      _s2_f="Drenagem graciosa de recursos e reinicialização do processo local."

      _s3_b="CONFIRMANDO HEALTH"; _s3_bg="40 95 120"; _s3_dot="119 158 61"
      _s3_t="Validando resposta na porta local 4765..."; _s3_d="Serviço restabelecido na porta com sucesso."
      _s3_sp=75; _s3_ep=100; _s3_dur=10; _s3_wtag="[:4765]"; _s3_wtag_c="100 180 240"; _s3_ws="green"; _s3_bs="green"
      _s3_f="Drenagem graciosa de recursos e reinicialização do processo local."
      ;;
    *)
      _s1_b="CHECANDO AMBIENTE"; _s1_bg="35 65 110"; _s1_dot="235 160 45"
      _s1_t="Verificando ambiente e porta local..."; _s1_d="Conferindo porta 4765 e variáveis do OnFrame."
      _s1_sp=0; _s1_ep=35; _s1_dur=10; _s1_wtag="[:4765]"; _s1_wtag_c="100 180 240"; _s1_ws="cyan"; _s1_bs="green"
      _s1_f="Aguarde um instante. Conectando o OnFrame na porta local 4765."

      _s2_b="ATIVANDO PROCESSO"; _s2_bg="45 60 125"; _s2_dot="80 145 255"
      _s2_t="Iniciando servidor local Node.js..."; _s2_d="Alocando processo em segundo plano (service/server.js)."
      _s2_sp=35; _s2_ep=75; _s2_dur=12; _s2_wtag="[:4765]"; _s2_wtag_c="100 180 240"; _s2_ws="cyan"; _s2_bs="green"
      _s2_f="Aguarde um instante. Conectando o OnFrame na porta local 4765."

      _s3_b="VALIDANDO HEALTH"; _s3_bg="40 95 120"; _s3_dot="119 158 61"
      _s3_t="Confirmando resposta do endpoint /health..."; _s3_d="Estabelecendo comunicação segura com a porta 4765."
      _s3_sp=75; _s3_ep=100; _s3_dur=10; _s3_wtag="[:4765]"; _s3_wtag_c="100 180 240"; _s3_ws="cyan"; _s3_bs="green"
      _s3_f="Aguarde um instante. Conectando o OnFrame na porta local 4765."
      ;;
  esac

  _spinners="⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏"

  _render_step_frame() {
    _idx="$1"; _badge="$2"; _bg_rgb="$3"; _dot_rgb="$4"; _stitle="$5"; _sdetail="$6"
    _cur_pct="$7"; _footer="$8"; _wtag="$9"; _wtag_c="${10}"; _wscheme="${11}"; _bscheme="${12}"
    _spin_ch="${13}"

    _tmp_lines="$(mktemp "${TMPDIR:-/tmp}/onframe-step.XXXXXX")"
    trap 'rm -f "$_tmp_lines"' EXIT

    _b_full="$(printf '%02d/03 • %s' "$_idx" "$_badge")"
    _badge_str="$(onframe_badge "$_b_full" $_bg_rgb)"
    _dot_str="$(onframe_truecolor_fg $_dot_rgb)●$ONFRAME_CLR_RESET"
    _title_line="$_dot_str $ONFRAME_CLR_BOLD$(onframe_truecolor_fg 245 248 255)$_stitle$ONFRAME_CLR_RESET"
    _detail_line="$ONFRAME_CLR_MUTED$_sdetail$ONFRAME_CLR_RESET"

    _wave_str="$(onframe_chromatic_wave 1.2 16 "$_wscheme")"
    _wtag_str="$(onframe_truecolor_fg $_wtag_c)$_wtag$ONFRAME_CLR_RESET"
    _wave_line="$ONFRAME_CLR_MUTEDSinal analógico:$ONFRAME_CLR_RESET $_wave_str  $_wtag_str"

    _bar_len=$(( _width - 32 ))
    [ "$_bar_len" -lt 14 ] && _bar_len=14
    _bar_str="$(onframe_progress_bar "$_cur_pct" "$_bar_len" "$_bscheme")"
    _spin_color="$ONFRAME_CLR_GREEN"
    [ "$_q_tone" = "coral" ] && _spin_color="$ONFRAME_CLR_CORAL"
    [ "$_q_tone" = "amber" ] && _spin_color="$ONFRAME_CLR_AMBER"
    _prog_line="$_spin_color$_spin_ch$ONFRAME_CLR_RESET Progresso:      $_bar_str"

    {
      printf '%s\n' "$_badge_str"
      printf '%s\n' "$_title_line"
      printf '%s\n\n' "$_detail_line"
      printf '%s\n' "$_wave_line"
      printf '%s\n' "$_prog_line"
    } > "$_tmp_lines"

    if [ "$_is_interactive" = "1" ]; then
      printf '\033[H\033[2J'
    fi
    onframe_header_3l "$_q_tag" "$_q_subtitle" "$_q_tone" "$_width"
    onframe_print_card "$_q_card_title" "$_tmp_lines" "$_width" 70 85 110
    _fpad="$(onframe_center_padding "$(onframe_display_width "$_footer")")"
    printf '\n%s%s%s%s\n' "$_fpad" "$ONFRAME_CLR_MUTED" "$_footer" "$ONFRAME_CLR_RESET"
  }

  if [ "$_is_interactive" = "1" ]; then
    for _st in 1 2 3; do
      case "$_st" in
        1) _sb="$_s1_b"; _sbg="$_s1_bg"; _sdot="$_s1_dot"; _stt="$_s1_t"; _sdd="$_s1_d"; _sp=$_s1_sp; _ep=$_s1_ep; _dur=$_s1_dur; _swt="$_s1_wtag"; _swc="$_s1_wtag_c"; _sws="$_s1_ws"; _sbs="$_s1_bs"; _sft="$_s1_f" ;;
        2) _sb="$_s2_b"; _sbg="$_s2_bg"; _sdot="$_s2_dot"; _stt="$_s2_t"; _sdd="$_s2_d"; _sp=$_s2_sp; _ep=$_s2_ep; _dur=$_s2_dur; _swt="$_s2_wtag"; _swc="$_s2_wtag_c"; _sws="$_s2_ws"; _sbs="$_s2_bs"; _sft="$_s2_f" ;;
        3) _sb="$_s3_b"; _sbg="$_s3_bg"; _sdot="$_s3_dot"; _stt="$_s3_t"; _sdd="$_s3_d"; _sp=$_s3_sp; _ep=$_s3_ep; _dur=$_s3_dur; _swt="$_s3_wtag"; _swc="$_s3_wtag_c"; _sws="$_s3_ws"; _sbs="$_s3_bs"; _sft="$_s3_f" ;;
      esac

      _f_count=$_dur
      [ "$_f_count" -lt 4 ] && _f_count=4
      _f_i=0
      while [ "$_f_i" -lt "$_f_count" ]; do
        _f_pct="$(awk -v sp="$_sp" -v ep="$_ep" -v fi="$_f_i" -v fc="$_f_count" 'BEGIN { printf "%.1f", sp + (ep - sp) * (fi / fc) }')"
        _spin_idx=$(( _f_i % 10 ))
        _spin_glyph="$(printf '%s' "$_spinners" | cut -d' ' -f$(( _spin_idx + 1 )))"

        _render_step_frame "$_st" "$_sb" "$_sbg" "$_sdot" "$_stt" "$_sdd" "$_f_pct" "$_sft" "$_swt" "$_swc" "$_sws" "$_sbs" "$_spin_glyph"
        sleep 0.08
        _f_i=$(( _f_i + 1 ))
      done
    done
  fi

  # Execute operation
  if ! eval "$_q_operation"; then
    onframe_show_failure_screen "Falha durante execucao da acao" "$_q_recovery_cmd" "$_q_no_pause"
    exit 1
  fi

  # Success Screen presentation matching PowerShell exactly
  _suc_port="$(onframe_port 2>/dev/null || printf '4765')"
  case "$_q_action_type" in
    stop)
      _suc_card_title="$ONFRAME_CLR_CORAL■$ONFRAME_CLR_RESET Serviço Local Encerrado"
      _suc_badge="■ PARADO / INATIVO"
      _suc_bg="220 65 65"
      _suc_title="O serviço local do OnFrame foi encerrado."
      _suc_subtitle="A porta local e os processos foram liberados."
      _suc_l1="   $ONFRAME_CLR_CORAL■$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDPorta $_suc_port:$ONFRAME_CLR_RESET Liberada e sem conexões ativas"
      _suc_l2="   $ONFRAME_CLR_CORAL■$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDProcesso Node.js:$ONFRAME_CLR_RESET Finalizado com sucesso"
      _suc_l3="   $ONFRAME_CLR_CORAL■$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDRecursos:$ONFRAME_CLR_RESET 100% liberados e desalocados"
      _suc_wave_status="$ONFRAME_CLR_MUTED(Linha Inativa / Fechada)$ONFRAME_CLR_RESET"
      _suc_wave_scheme="flat"
      _suc_bullet_ico="■"
      _suc_bullet_clr="$ONFRAME_CLR_CORAL"
      _suc_bar_scheme="coral"
      _suc_footer="Serviço local inativo até o próximo início."
      _suc_r=220; _suc_g=65; _suc_b=65
      ;;
    restart)
      _suc_card_title="$ONFRAME_CLR_GREEN✔$ONFRAME_CLR_RESET Serviço Local Reiniciado"
      _suc_badge="● REINICIADO COM SUCESSO"
      _suc_bg="119 158 61"
      _suc_title="O serviço local do OnFrame foi reiniciado."
      _suc_subtitle="Servidor recomposto e respondendo com alta performance."
      _suc_l1="   $ONFRAME_CLR_GREEN●$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDEndereço:$ONFRAME_CLR_RESET http://127.0.0.1:$_suc_port"
      _suc_l2="   $ONFRAME_CLR_GREEN●$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDDiagnóstico:$ONFRAME_CLR_RESET /health: 200 OK • Latência: 1ms"
      _suc_l3="   $ONFRAME_CLR_GREEN●$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDProcesso:$ONFRAME_CLR_RESET Node.js (service/server.js)"
      _suc_wave_status="$ONFRAME_CLR_GREEN(Reestabelecido / Heartbeat)$ONFRAME_CLR_RESET"
      _suc_wave_scheme="green"
      _suc_bullet_ico="●"
      _suc_bullet_clr="$ONFRAME_CLR_GREEN"
      _suc_bar_scheme="green"
      _suc_footer="Ciclo concluído com o canal local restabelecido."
      _suc_r=119; _suc_g=158; _suc_b=61
      ;;
    *)
      _suc_card_title="$ONFRAME_CLR_GREEN✔$ONFRAME_CLR_RESET Serviço Local Operacional"
      _suc_badge="● ONLINE / ATIVO"
      _suc_bg="119 158 61"
      _suc_title="O serviço local do OnFrame está ativo e pronto."
      _suc_subtitle="Servidor em segundo plano respondendo com sucesso."
      _suc_l1="   $ONFRAME_CLR_GREEN●$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDEndereço:$ONFRAME_CLR_RESET http://127.0.0.1:$_suc_port"
      _suc_l2="   $ONFRAME_CLR_GREEN●$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDDiagnóstico:$ONFRAME_CLR_RESET /health: 200 OK • Latência: 1ms"
      _suc_l3="   $ONFRAME_CLR_GREEN●$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDProcesso:$ONFRAME_CLR_RESET Node.js (service/server.js)"
      _suc_wave_status="$ONFRAME_CLR_GREEN(Estável / Heartbeat)$ONFRAME_CLR_RESET"
      _suc_wave_scheme="green"
      _suc_bullet_ico="●"
      _suc_bullet_clr="$ONFRAME_CLR_GREEN"
      _suc_bar_scheme="green"
      _suc_footer="Canal local disponível para a extensão."
      _suc_r=119; _suc_g=158; _suc_b=61
      ;;
  esac

  _render_success_frame() {
    _elapsed="${1:-1.2}"
    _suc_tmp="$(mktemp "${TMPDIR:-/tmp}/onframe-suc.XXXXXX")"
    trap 'rm -f "$_suc_tmp"' EXIT

    _wave_str="$(onframe_chromatic_wave "$_elapsed" 16 "$_suc_wave_scheme" 0.72 4.0)"
    _signal_line="   $_suc_bullet_clr$_suc_bullet_ico$ONFRAME_CLR_RESET $ONFRAME_CLR_BOLDSinal analógico:$ONFRAME_CLR_RESET $_wave_str $_suc_wave_status"

    _bar_len=$(( _width - 32 ))
    [ "$_bar_len" -lt 14 ] && _bar_len=14
    _final_bar="$(onframe_progress_bar 100.0 "$_bar_len" "$_suc_bar_scheme")"
    _chk_ico="$(onframe_truecolor_fg $_suc_r $_suc_g $_suc_b)✔$ONFRAME_CLR_RESET"
    _status_final_line="$_chk_ico Status final:  $_final_bar"

    {
      onframe_badge "$_suc_badge" $_suc_bg
      printf '\n%s%s%s\n' "$ONFRAME_CLR_BOLD" "$_suc_title" "$ONFRAME_CLR_RESET"
      printf '%s%s%s\n\n' "$ONFRAME_CLR_MUTED" "$_suc_subtitle" "$ONFRAME_CLR_RESET"
      printf '%s\n' "$_suc_l1"
      printf '%s\n' "$_suc_l2"
      printf '%s\n' "$_suc_l3"
      printf '%s\n\n' "$_signal_line"
      printf '%s\n' "$_status_final_line"
    } > "$_suc_tmp"

    if [ "$_is_interactive" = "1" ]; then
      printf '\033[H\033[2J'
    fi
    onframe_header_3l "$_q_tag" "$_q_subtitle" "$_q_tone" "$_width"
    onframe_print_card "$_suc_card_title" "$_suc_tmp" "$_width" "$_suc_r" "$_suc_g" "$_suc_b"
    _footer_text="$ONFRAME_CLR_MUTED● $_suc_footer Pressione $ONFRAME_CLR_BOLD$(onframe_truecolor_fg 230 235 245)[Enter]$ONFRAME_CLR_RESET$ONFRAME_CLR_MUTED para retornar...$ONFRAME_CLR_RESET"
    _fpad="$(onframe_center_padding "$(onframe_display_width "$_footer_text")")"
    printf '\n%s%s\n' "$_fpad" "$_footer_text"
  }

  _render_success_frame 1.2

  if [ "$_is_interactive" = "1" ]; then
    printf '\033[?25h'
    read -r _ || true
  fi
}

onframe_header() {
  _mode="${1:-}"
  onframe_header_3l "▶ ${_mode:-SERVIÇO}" "Inicialização & Monitoramento em Segundo Plano" "brand" "$(onframe_tui_width)"
}

onframe_section() {
  printf '\n%s  [%s]%s\n' "$ONFRAME_CLR_CYAN" "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')" "$ONFRAME_CLR_RESET"
}

onframe_step() {
  printf '%s  [>] %02d/%02d%s %s\n' "$ONFRAME_CLR_CYAN" "$1" "$2" "$ONFRAME_CLR_RESET" "$3"
}

onframe_ok() {
  printf '%s       + %s%s\n' "$ONFRAME_CLR_GREEN" "$1" "$ONFRAME_CLR_RESET"
}

onframe_warn() {
  printf '%s       ! %s%s\n' "$ONFRAME_CLR_AMBER" "$1" "$ONFRAME_CLR_RESET"
}

onframe_fail() {
  onframe_show_failure_screen "$1" "${2:-}" "0"
  return 1
}

onframe_success() {
  printf '\n%s  [OK] %s%s\n' "$ONFRAME_CLR_GREEN" "$1" "$ONFRAME_CLR_RESET"
  shift
  for line in "$@"; do
    printf '%s       %s%s\n' "$ONFRAME_CLR_MUTED" "$line" "$ONFRAME_CLR_RESET"
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
  node_path="$(onframe_runtime_node)"
  if [ -x "$node_path" ]; then
    current_version="$("$node_path" -p 'process.versions.node' 2>/dev/null || true)"
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
