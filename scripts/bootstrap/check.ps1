param(
  [string]$Root = '',
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
$global:ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

function Test-OnFrameUpdaterProtocol {
  $protocolRoot = 'HKCU:\Software\Classes\onframe-updater\shell\open\command'
  try {
    $command = (Get-Item -LiteralPath $protocolRoot -ErrorAction Stop).GetValue('')
    return -not [string]::IsNullOrWhiteSpace([string]$command)
  } catch {
    return $false
  }
}

function Get-PillarBar {
  param(
    [double]$Percent,
    [int]$Length = 12,
    [string]$Scheme = 'green'
  )
  return Get-OnFrameMiniBar -Percent $Percent -Length $Length -Scheme $Scheme
}

$InstallRoot = Resolve-OnFrameInstallRoot -Root $Root
$resolved = if (Test-Path -LiteralPath $InstallRoot) { (Resolve-Path -LiteralPath $InstallRoot).Path } else { $InstallRoot }
$port = Get-OnFrameServicePort -Root $resolved

Start-OnFrameTuiSurface | Out-Null
$width = Get-OnFrameTuiWidth
$blockPad = Get-OnFrameBlockPadding -CardWidth $width

try {
  $tag = '◉ DIAGNÓSTICO LOCAL'
  $subtitle = 'Varredura de Integridade & Saúde do Sistema'
  $cardTitle = "$($script:OnFrameColors.Cyan)◉$($script:OnFrameColors.Reset) Diagnóstico & Saúde do Sistema"
  $cardRgb = @(64, 180, 220)

  # Audit components
  $filesReady = (Test-Path -LiteralPath (Join-Path $resolved 'service/server.js')) -and (Test-Path -LiteralPath (Join-Path $resolved 'extension'))
  $serviceReady = Test-OnFrameServiceHealth -Port $port
  $engineReady = [bool](Get-OnFrameNodePath)
  $browserReady = (Test-Path -LiteralPath (Join-Path $resolved 'extension/manifest.json')) -and (Test-OnFrameUpdaterProtocol)

  $pillars = @(
    @{ Name = 'Arquivos do Aplicativo'; Ready = $filesReady; ReadyStatus = 'Estrutura intacta'; FailStatus = 'Arquivos pendentes'; StepName = 'ARQUIVOS DO APLICATIVO'; Detail = 'Conferindo a integridade dos arquivos essenciais.' },
    @{ Name = 'Conexão Local (Porta)';  Ready = $serviceReady; ReadyStatus = "Ativo na porta $port"; FailStatus = 'Serviço offline';   StepName = 'CANAL DE REDE'; Detail = "Verificando o canal local na porta $port." },
    @{ Name = 'Motor de Inicialização'; Ready = $engineReady; ReadyStatus = 'Pronto para execução'; FailStatus = 'Node.js ausente';   StepName = 'MOTOR DE EXECUÇÃO'; Detail = 'Auditando ambiente Node.js 20+ no sistema.' },
    @{ Name = 'Integração no Navegador'; Ready = $browserReady; ReadyStatus = 'Sincronizado'; FailStatus = 'Revisar integração';     StepName = 'INTEGRAÇÃO NAVEGADOR'; Detail = 'Validando o protocolo e manifesto do navegador.' }
  )

  $started = [DateTime]::UtcNow
  $stepDuration = if ($NoPause -or -not (Test-OnFrameInteractiveConsole)) { 0.0 } else { 0.85 }

  if (-not $NoPause) {
    for ($pIdx = 0; $pIdx -lt 4; $pIdx++) {
      $currentPillar = $pillars[$pIdx]
      $stageStarted = [DateTime]::UtcNow

      do {
        $elapsed = ([DateTime]::UtcNow - $started).TotalSeconds
        $stageElapsed = ([DateTime]::UtcNow - $stageStarted).TotalSeconds
        $subPct = if ($stepDuration -gt 0) { [Math]::Min(1.0, $stageElapsed / $stepDuration) } else { 1.0 }

        $radar = Get-OnFrameChromaticWave -Elapsed $elapsed -Width 16 -Scheme cyan -Amplitude 0.9 -Speed 8.0
        $badge = Get-OnFrameBadge -Text ('{0:00}/04 • {1}' -f ($pIdx + 1), $currentPillar.StepName) -BackgroundRgb @(20, 60, 110)

        $pillarLines = @()
        for ($i = 0; $i -lt 4; $i++) {
          $p = $pillars[$i]
          if ($i -lt $pIdx) {
            $tone = if ($p.Ready) { $script:OnFrameColors.Green } else { $script:OnFrameColors.Amber }
            $ico = if ($p.Ready) { '✔' } else { '●' }
            $scheme = if ($p.Ready) { 'green' } else { 'amber' }
            $bar = Get-OnFrameMiniBar -Percent 100.0 -Length 12 -Scheme $scheme
            $st = if ($p.Ready) { $p.ReadyStatus } else { $p.FailStatus }
            $pillarLines += "  $tone$ico$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)$($p.Name.PadRight(24))$($script:OnFrameColors.Reset) $bar  $tone$st$($script:OnFrameColors.Reset)"
          } elseif ($i -eq $pIdx) {
            $barPct = $subPct * 100.0
            $spinIdx = [int][Math]::Floor($elapsed * 10) % $script:OnFrameSpinnerFrames.Length
            $spin = $script:OnFrameSpinnerFrames[$spinIdx]
            $bar = Get-OnFrameMiniBar -Percent $barPct -Length 12 -Scheme 'green'
            $pillarLines += "  $($script:OnFrameColors.Cyan)$spin$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)$($p.Name.PadRight(24))$($script:OnFrameColors.Reset) $bar  $($script:OnFrameColors.Cyan)Analisando... ($([int]$barPct)%)$($script:OnFrameColors.Reset)"
          } else {
            $bar = Get-OnFrameMiniBar -Percent 0.0 -Length 12
            $pillarLines += "  $($script:OnFrameColors.Muted)─ $($p.Name.PadRight(24)) $bar  Aguardando verificação...$($script:OnFrameColors.Reset)"
          }
        }

        $overallPct = (($pIdx + $subPct) / 4.0) * 100.0
        $healthGauge = Get-OnFrameSegmentedGauge -Score $overallPct -MaxSegments 20 -Scheme 'green'

        $content = @(
          $badge,
          "$($script:OnFrameColors.Bold)Varredura de Integridade em Tempo Real$($script:OnFrameColors.Reset)",
          "$($script:OnFrameColors.Muted)$($currentPillar.Detail)$($script:OnFrameColors.Reset)",
          '',
          "$($script:OnFrameColors.Muted)Sinal de atividade:$($script:OnFrameColors.Reset) $radar",
          '',
          "$($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 210 225 250)Pilares de Funcionamento:$($script:OnFrameColors.Reset)"
        ) + $pillarLines + @(
          '',
          "  $($script:OnFrameColors.Bold)Saúde Global:$($script:OnFrameColors.Reset)  $healthGauge  $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 240 255 255)$('{0,5:N1}' -f $overallPct)%$($script:OnFrameColors.Reset)"
        )

        $output = [System.Collections.Generic.List[string]]::new()
        $output.AddRange([string[]](Get-OnFrameHeader2L -Tag $tag -Subtitle $subtitle -TagTone 'cyan' -Elapsed $elapsed -BlockPad $blockPad -CardWidth $width))
        foreach ($line in (Format-OnFrameCard -Title $cardTitle -Lines $content -Width $width -BorderRgb $cardRgb)) {
          $output.Add("$blockPad$line")
        }
        $output.Add('')
        $footerText = "$($script:OnFrameColors.Muted)Auditoria em tempo real: arquivos, rede, motor e extensão.$($script:OnFrameColors.Reset)"
        $footerPad = Get-OnFrameCenterPadding -ContentWidth (Get-OnFrameDisplayWidth -Text $footerText)
        $output.Add("$footerPad$footerText")

        Write-OnFrameTuiFrame -Lines $output.ToArray()
        Start-Sleep -Milliseconds 33
      } while (([DateTime]::UtcNow - $stageStarted).TotalSeconds -lt $stepDuration)
    }
  }

  # Final Results Screen
  $readyCount = 0
  foreach ($flag in @($filesReady, $serviceReady, $engineReady, $browserReady)) {
    if ($flag) { $readyCount++ }
  }
  $score = $readyCount * 25
  $allOk = ($score -eq 100)
  $finalTone = if ($allOk) { 'green' } elseif ($score -ge 75) { 'amber' } else { 'coral' }
  $finalRgb = if ($allOk) { @(119, 158, 61) } elseif ($score -ge 75) { @(235, 124, 45) } else { @(220, 65, 65) }
  $statusText = if ($allOk) { 'Excelente' } elseif ($score -ge 75) { 'Atenção leve' } else { 'Revisão recomendada' }

  $finalPillarLines = @()
  foreach ($p in $pillars) {
    $tone = if ($p.Ready) { $script:OnFrameColors.Green } else { $script:OnFrameColors.Amber }
    $ico = if ($p.Ready) { '✔' } else { '●' }
    $barScheme = if ($p.Ready) { 'green' } else { 'amber' }
    $bar = Get-OnFrameMiniBar -Percent 100.0 -Length 12 -Scheme $barScheme
    $st = if ($p.Ready) { $p.ReadyStatus } else { $p.FailStatus }
    $finalPillarLines += "  $tone$ico$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)$($p.Name.PadRight(24))$($script:OnFrameColors.Reset) $bar  $tone$st$($script:OnFrameColors.Reset)"
  }

  $render = {
    param($elapsed, $notice)
    $badgeText = if ($allOk) { '● SISTEMA 100% OPERACIONAL' } else { '▲ REQUER ATENÇÃO' }
    $headline = if ($allOk) { 'Diagnóstico finalizado: seu OnFrame está excelente.' } else { 'Diagnóstico finalizado: alguns itens precisam de atenção.' }
    $statusSubtitle = if ($allOk) { 'Todos os componentes responderam com sucesso.' } else { 'Verifique os componentes apontados para restaurar o serviço.' }
    $finalScheme = if ($allOk) { 'green' } elseif ($score -ge 75) { 'amber' } else { 'coral' }
    $finalGauge = Get-OnFrameSegmentedGauge -Score $score -MaxSegments 20 -Scheme $finalScheme
    $scoreLabel = if ($allOk) {
      "$($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 240 255 245)100% Excelente$($script:OnFrameColors.Reset)"
    } else {
      "$($script:OnFrameColors.Bold)$('{0,5:N1}' -f [double]$score)%  $statusText$($script:OnFrameColors.Reset)"
    }
    $telemetry = Get-OnFrameChromaticWave -Elapsed $elapsed -Width 16 -Scheme $finalScheme -Amplitude 0.75 -Speed 4.0
    $telemetryStatus = if ($allOk) {
      "$($script:OnFrameColors.Green)● Estabilidade Perfeita (1ms)$($script:OnFrameColors.Reset)"
    } else {
      "$($script:OnFrameColors.Amber)● Verificação Concluída$($script:OnFrameColors.Reset)"
    }

    $content = @(
      (Get-OnFrameBadge -Text $badgeText -BackgroundRgb $finalRgb),
      "$($script:OnFrameColors.Bold)$headline$($script:OnFrameColors.Reset)",
      "$($script:OnFrameColors.Muted)$statusSubtitle$($script:OnFrameColors.Reset)",
      '',
      "$($script:OnFrameColors.Bold)Sinal de atividade:$($script:OnFrameColors.Reset) $telemetry  $telemetryStatus",
      '',
      "$($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 210 225 250)Pilares de Funcionamento:$($script:OnFrameColors.Reset)"
    ) + $finalPillarLines + @(
      '',
      "  $($script:OnFrameColors.Bold)Saúde Geral:$($script:OnFrameColors.Reset)  $finalGauge  $scoreLabel"
    )
    if ($notice) {
      $content += @('', "$($script:OnFrameColors.Green)$notice$($script:OnFrameColors.Reset)")
    }

    $output = [System.Collections.Generic.List[string]]::new()
    $output.AddRange([string[]](Get-OnFrameHeader2L -Tag $tag -Subtitle $subtitle -TagTone $finalTone -Elapsed $elapsed -BlockPad $blockPad -CardWidth $width))
    foreach ($line in (Format-OnFrameCard -Title $cardTitle -Lines $content -Width $width -BorderRgb $finalRgb)) {
      $output.Add("$blockPad$line")
    }
    $output.Add('')
    $footerText = "$($script:OnFrameColors.Muted)● Diagnóstico finalizado. Pressione $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 230 235 245)[Enter]$($script:OnFrameColors.Reset)$($script:OnFrameColors.Muted) para retornar...$($script:OnFrameColors.Reset)"
    $footerPad = Get-OnFrameCenterPadding -ContentWidth (Get-OnFrameDisplayWidth -Text $footerText)
    $output.Add("$footerPad$footerText")
    return $output.ToArray()
  }

  Start-OnFrameLiveLoop -RenderCallback $render -NoPause:$NoPause
  $global:LASTEXITCODE = 0
} catch {
  Show-OnFrameFailureScreen -Message $_.Exception.Message -RecoveryCommand "& '$InstallRoot\scripts\bootstrap\restart.ps1' -Root '$InstallRoot'" -NoPause:$NoPause
  $global:LASTEXITCODE = 1
} finally {
  Stop-OnFrameTuiSurface
}
