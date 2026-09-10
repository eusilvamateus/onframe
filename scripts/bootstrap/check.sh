#!/bin/sh

set -eu
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=scripts/bootstrap/common.sh
. "$SCRIPT_DIR/common.sh"

NO_PAUSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-pause|-NoPause) NO_PAUSE=1; shift ;;
    --root=*|-Root=*) ONFRAME_HOME="${1#*=}"; shift ;;
    --root|-Root|-root) ONFRAME_HOME="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

onframe_require_macos
onframe_assert_install_root

_width="$(onframe_tui_width)"
_port="$(onframe_port)"

_is_interactive=0
if [ -t 1 ] && [ -t 0 ] && [ "$NO_PAUSE" = "0" ]; then
  _is_interactive=1
fi

if [ "$_is_interactive" = "1" ]; then
  printf '\033[?25l'
  trap 'printf "\033[?25h"' EXIT INT TERM
fi

# Audit components
p1_ready=0; [ -f "$ONFRAME_HOME/service/server.js" ] && [ -d "$ONFRAME_HOME/extension" ] && p1_ready=1
p2_ready=0; onframe_health && p2_ready=1
p3_ready=0; [ -x "$(onframe_runtime_node)" ] && p3_ready=1
if [ "$p3_ready" = "0" ] && command -v node >/dev/null 2>&1; then
  node_major="$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')"
  case "$node_major" in
    ''|*[!0-9]*) ;;
    *) [ "$node_major" -ge 20 ] && p3_ready=1 ;;
  esac
fi
p4_ready=0; [ -f "$ONFRAME_HOME/extension/manifest.json" ] && [ -d "$ONFRAME_LAUNCHER_PATH" ] && p4_ready=1

# Interactive Walkthrough Animation
if [ "$_is_interactive" = "1" ]; then
  _spinners="⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏"

  for _pIdx in 0 1 2 3; do
    case "$_pIdx" in
      0) _p_badge="ARQUIVOS DO APLICATIVO"; _p_detail="Conferindo a integridade dos arquivos essenciais." ;;
      1) _p_badge="CANAL DE REDE"; _p_detail="Verificando o canal local na porta $_port." ;;
      2) _p_badge="MOTOR DE EXECUÇÃO"; _p_detail="Auditando ambiente Node.js 20+ no sistema." ;;
      3) _p_badge="INTEGRAÇÃO NAVEGADOR"; _p_detail="Validando o protocolo e manifesto do navegador." ;;
    esac

    _step_frames=8
    _sf_i=0
    while [ "$_sf_i" -lt "$_step_frames" ]; do
      _sub_pct="$(awk -v i="$_sf_i" -v tot="$_step_frames" 'BEGIN { printf "%.1f", (i / tot) * 100.0 }')"
      _overall_pct="$(awk -v pidx="$_pIdx" -v sub="$_sub_pct" 'BEGIN { printf "%.1f", ((pidx + sub / 100.0) / 4.0) * 100.0 }')"
      _spin_idx=$(( _sf_i % 10 ))
      _spin_glyph="$(printf '%s' "$_spinners" | cut -d' ' -f$(( _spin_idx + 1 )))"

      _tmp_card="$(mktemp "${TMPDIR:-/tmp}/onframe-check-walk.XXXXXX")"
      trap 'rm -f "$_tmp_card"' EXIT

      _b_text="$(printf '%02d/04 • %s' "$(( _pIdx + 1 ))" "$_p_badge")"
      _badge_str="$(onframe_badge "$_b_text" 20 60 110)"
      _wave_str="$(onframe_chromatic_wave 1.2 16 cyan 0.9 8.0)"
      _gauge_str="$(onframe_segmented_gauge "$_overall_pct" 20 green)"

      {
        printf '%s\n' "$_badge_str"
        printf '%sVarredura de Integridade em Tempo Real%s\n' "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET"
        printf '%s%s%s\n\n' "$ONFRAME_CLR_MUTED" "$_p_detail" "$ONFRAME_CLR_RESET"
        printf '%sSinal de atividade:%s %s\n\n' "$ONFRAME_CLR_MUTED" "$ONFRAME_CLR_RESET" "$_wave_str"
        printf '%s%sPilares de Funcionamento:%s\n' "$ONFRAME_CLR_BOLD" "$(onframe_truecolor_fg 210 225 250)" "$ONFRAME_CLR_RESET"

        # Pillar 0
        if [ "$_pIdx" -gt 0 ]; then
          if [ "$p1_ready" = "1" ]; then
            printf '  %s✔%s %s%-24s%s %s  %sEstrutura intacta%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Arquivos do Aplicativo" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET"
          else
            printf '  %s●%s %s%-24s%s %s  %sArquivos pendentes%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Arquivos do Aplicativo" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
          fi
        elif [ "$_pIdx" -eq 0 ]; then
          printf '  %s%s%s %s%-24s%s %s  %sAnalisando... (%d%%)%s\n' "$ONFRAME_CLR_CYAN" "$_spin_glyph" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Arquivos do Aplicativo" "$ONFRAME_CLR_RESET" "$(onframe_minibar "$_sub_pct" 12 green)" "$ONFRAME_CLR_CYAN" "$(( _sf_i * 100 / _step_frames ))" "$ONFRAME_CLR_RESET"
        else
          printf '  %s─ %-24s %s  Aguardando verificação...%s\n' "$ONFRAME_CLR_MUTED" "Arquivos do Aplicativo" "$(onframe_minibar 0.0 12)" "$ONFRAME_CLR_RESET"
        fi

        # Pillar 1
        if [ "$_pIdx" -gt 1 ]; then
          if [ "$p2_ready" = "1" ]; then
            printf '  %s✔%s %s%-24s%s %s  %sAtivo na porta %s%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Conexão Local (Porta)" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$_port" "$ONFRAME_CLR_RESET"
          else
            printf '  %s●%s %s%-24s%s %s  %sServiço offline%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Conexão Local (Porta)" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
          fi
        elif [ "$_pIdx" -eq 1 ]; then
          printf '  %s%s%s %s%-24s%s %s  %sAnalisando... (%d%%)%s\n' "$ONFRAME_CLR_CYAN" "$_spin_glyph" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Conexão Local (Porta)" "$ONFRAME_CLR_RESET" "$(onframe_minibar "$_sub_pct" 12 green)" "$ONFRAME_CLR_CYAN" "$(( _sf_i * 100 / _step_frames ))" "$ONFRAME_CLR_RESET"
        else
          printf '  %s─ %-24s %s  Aguardando verificação...%s\n' "$ONFRAME_CLR_MUTED" "Conexão Local (Porta)" "$(onframe_minibar 0.0 12)" "$ONFRAME_CLR_RESET"
        fi

        # Pillar 2
        if [ "$_pIdx" -gt 2 ]; then
          if [ "$p3_ready" = "1" ]; then
            printf '  %s✔%s %s%-24s%s %s  %sPronto para execução%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Motor de Inicialização" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET"
          else
            printf '  %s●%s %s%-24s%s %s  %sNode.js ausente%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Motor de Inicialização" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
          fi
        elif [ "$_pIdx" -eq 2 ]; then
          printf '  %s%s%s %s%-24s%s %s  %sAnalisando... (%d%%)%s\n' "$ONFRAME_CLR_CYAN" "$_spin_glyph" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Motor de Inicialização" "$ONFRAME_CLR_RESET" "$(onframe_minibar "$_sub_pct" 12 green)" "$ONFRAME_CLR_CYAN" "$(( _sf_i * 100 / _step_frames ))" "$ONFRAME_CLR_RESET"
        else
          printf '  %s─ %-24s %s  Aguardando verificação...%s\n' "$ONFRAME_CLR_MUTED" "Motor de Inicialização" "$(onframe_minibar 0.0 12)" "$ONFRAME_CLR_RESET"
        fi

        # Pillar 3
        if [ "$_pIdx" -eq 3 ]; then
          printf '  %s%s%s %s%-24s%s %s  %sAnalisando... (%d%%)%s\n' "$ONFRAME_CLR_CYAN" "$_spin_glyph" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Integração no Navegador" "$ONFRAME_CLR_RESET" "$(onframe_minibar "$_sub_pct" 12 green)" "$ONFRAME_CLR_CYAN" "$(( _sf_i * 100 / _step_frames ))" "$ONFRAME_CLR_RESET"
        else
          printf '  %s─ %-24s %s  Aguardando verificação...%s\n' "$ONFRAME_CLR_MUTED" "Integração no Navegador" "$(onframe_minibar 0.0 12)" "$ONFRAME_CLR_RESET"
        fi

        printf '\n  %sSaúde Global:%s  %s  %s%s%5.1f%%%s\n' "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET" "$_gauge_str" "$ONFRAME_CLR_BOLD" "$(onframe_truecolor_fg 240 255 255)" "$_overall_pct" "$ONFRAME_CLR_RESET"
      } > "$_tmp_card"

      printf '\033[H\033[2J'
      onframe_header_3l "◉ DIAGNÓSTICO LOCAL" "Varredura de Integridade & Saúde do Sistema" "cyan" "$_width"
      onframe_print_card "${ONFRAME_CLR_CYAN}◉${ONFRAME_CLR_RESET} Diagnóstico & Saúde do Sistema" "$_tmp_card" "$_width" 64 180 220
      _foot="Auditoria em tempo real: arquivos, rede, motor e extensão."
      _fpad="$(onframe_center_padding "$(onframe_display_width "$_foot")")"
      printf '\n%s%s%s%s\n' "$_fpad" "$ONFRAME_CLR_MUTED" "$_foot" "$ONFRAME_CLR_RESET"

      sleep 0.08
      _sf_i=$(( _sf_i + 1 ))
    done
  done
fi

# Final Screen
_ready_count=$(( p1_ready + p2_ready + p3_ready + p4_ready ))
_score=$(( _ready_count * 25 ))

if [ "$_score" -eq 100 ]; then
  _f_tone="green"
  _f_r=119; _f_g=158; _f_b=61
  _f_badge="● SISTEMA 100% OPERACIONAL"
  _f_headline="Diagnóstico finalizado: seu OnFrame está excelente."
  _f_subtitle="Todos os componentes responderam com sucesso."
  _f_score_lbl="${ONFRAME_CLR_BOLD}$(onframe_truecolor_fg 240 255 245)100% Excelente${ONFRAME_CLR_RESET}"
  _f_telemetry_status="${ONFRAME_CLR_GREEN}● Estabilidade Perfeita (1ms)${ONFRAME_CLR_RESET}"
elif [ "$_score" -ge 75 ]; then
  _f_tone="amber"
  _f_r=235; _f_g=124; _f_b=45
  _f_badge="▲ REQUER ATENÇÃO"
  _f_headline="Diagnóstico finalizado: alguns itens precisam de atenção."
  _f_subtitle="Verifique os componentes apontados para restaurar o serviço."
  _f_score_lbl="${ONFRAME_CLR_BOLD}$(printf '%5.1f%%  Atenção leve' "$_score")${ONFRAME_CLR_RESET}"
  _f_telemetry_status="${ONFRAME_CLR_AMBER}● Verificação Concluída${ONFRAME_CLR_RESET}"
else
  _f_tone="coral"
  _f_r=220; _f_g=65; _f_b=65
  _f_badge="▲ REQUER ATENÇÃO"
  _f_headline="Diagnóstico finalizado: alguns itens precisam de atenção."
  _f_subtitle="Verifique os componentes apontados para restaurar o serviço."
  _f_score_lbl="${ONFRAME_CLR_BOLD}$(printf '%5.1f%%  Revisão recomendada' "$_score")${ONFRAME_CLR_RESET}"
  _f_telemetry_status="${ONFRAME_CLR_CORAL}● Verificação Concluída${ONFRAME_CLR_RESET}"
fi

_tmp_final="$(mktemp "${TMPDIR:-/tmp}/onframe-check-final.XXXXXX")"
trap 'rm -f "$_tmp_final"' EXIT

_badge_str="$(onframe_badge "$_f_badge" $_f_r $_f_g $_f_b)"
_wave_str="$(onframe_chromatic_wave 1.2 16 "$_f_tone" 0.75 4.0)"
_gauge_str="$(onframe_segmented_gauge "$_score" 20 "$_f_tone")"

{
  printf '%s\n' "$_badge_str"
  printf '%s%s%s\n' "$ONFRAME_CLR_BOLD" "$_f_headline" "$ONFRAME_CLR_RESET"
  printf '%s%s%s\n\n' "$ONFRAME_CLR_MUTED" "$_f_subtitle" "$ONFRAME_CLR_RESET"
  printf '%sSinal de atividade:%s %s  %s\n\n' "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET" "$_wave_str" "$_f_telemetry_status"
  printf '%s%sPilares de Funcionamento:%s\n' "$ONFRAME_CLR_BOLD" "$(onframe_truecolor_fg 210 225 250)" "$ONFRAME_CLR_RESET"

  if [ "$p1_ready" = "1" ]; then
    printf '  %s✔%s %s%-24s%s %s  %sEstrutura intacta%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Arquivos do Aplicativo" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET"
  else
    printf '  %s●%s %s%-24s%s %s  %sArquivos pendentes%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Arquivos do Aplicativo" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
  fi

  if [ "$p2_ready" = "1" ]; then
    printf '  %s✔%s %s%-24s%s %s  %sAtivo na porta %s%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Conexão Local (Porta)" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$_port" "$ONFRAME_CLR_RESET"
  else
    printf '  %s●%s %s%-24s%s %s  %sServiço offline%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Conexão Local (Porta)" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
  fi

  if [ "$p3_ready" = "1" ]; then
    printf '  %s✔%s %s%-24s%s %s  %sPronto para execução%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Motor de Inicialização" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET"
  else
    printf '  %s●%s %s%-24s%s %s  %sNode.js ausente%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Motor de Inicialização" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
  fi

  if [ "$p4_ready" = "1" ]; then
    printf '  %s✔%s %s%-24s%s %s  %sSincronizado%s\n' "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Integração no Navegador" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 green)" "$ONFRAME_CLR_GREEN" "$ONFRAME_CLR_RESET"
  else
    printf '  %s●%s %s%-24s%s %s  %sRevisar integração%s\n' "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET" "$ONFRAME_CLR_BOLD" "Integração no Navegador" "$ONFRAME_CLR_RESET" "$(onframe_minibar 100.0 12 amber)" "$ONFRAME_CLR_AMBER" "$ONFRAME_CLR_RESET"
  fi

  printf '\n  %sSaúde Geral:%s  %s  %s\n' "$ONFRAME_CLR_BOLD" "$ONFRAME_CLR_RESET" "$_gauge_str" "$_f_score_lbl"
} > "$_tmp_final"

if [ "$_is_interactive" = "1" ]; then
  printf '\033[H\033[2J'
fi
onframe_header_3l "◉ DIAGNÓSTICO LOCAL" "Varredura de Integridade & Saúde do Sistema" "$_f_tone" "$_width"
onframe_print_card "${ONFRAME_CLR_CYAN}◉${ONFRAME_CLR_RESET} Diagnóstico & Saúde do Sistema" "$_tmp_final" "$_width" $_f_r $_f_g $_f_b

_footer_text="$ONFRAME_CLR_MUTED● Diagnóstico finalizado. Pressione $ONFRAME_CLR_BOLD$(onframe_truecolor_fg 230 235 245)[Enter]$ONFRAME_CLR_RESET$ONFRAME_CLR_MUTED para retornar...$ONFRAME_CLR_RESET"
_fpad="$(onframe_center_padding "$(onframe_display_width "$_footer_text")")"
printf '\n%s%s\n' "$_fpad" "$_footer_text"

if [ "$_is_interactive" = "1" ]; then
  printf '\033[?25h'
  read -r _ || true
fi
