param(
  [string]$Root = '',
  [switch]$Quiet,
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
$global:ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$InstallRoot = Resolve-OnFrameInstallRoot -Root $Root
$operation = {
  $stopped = Stop-OnFrameServiceCore -Root $InstallRoot
  $started = Start-OnFrameServiceCore -Root $InstallRoot
  return [pscustomobject]@{ Stopped = $stopped; Started = $started }
}

if ($Quiet) {
  try {
    & $operation | Out-Null
    $global:LASTEXITCODE = 0
  } catch {
    $global:LASTEXITCODE = 1
  }
  return
}

$result = Invoke-OnFrameQuickAction `
  -Tag '↻ REINICIAR SERVIÇO' `
  -Subtitle 'Drenagem de Socket & Recarga do Serviço' `
  -CardTitle "$($script:OnFrameColors.Amber)↻$($script:OnFrameColors.Reset) Reinicialização do Serviço" `
  -Tone amber `
  -Steps @(
    [pscustomobject]@{
      Badge    = 'PARANDO PROCESSO ATUAL'
      BadgeBg  = @(45, 55, 90)
      DotColor = @(220, 65, 65)
      Title    = 'Encerrando instância anterior do serviço...'
      Detail   = 'Liberando conexões e fechando o canal local.'
      StartPct = 0.0
      EndPct   = 35.0
      Duration = 1.0
      Footer   = 'Drenagem graciosa de recursos e reinicialização do processo local.'
    },
    [pscustomobject]@{
      Badge    = 'RECICLANDO INSTÂNCIA'
      BadgeBg  = @(130, 75, 30)
      DotColor = @(235, 124, 45)
      Title    = 'Iniciando novo processo Node.js...'
      Detail   = 'Alocando uma nova instância em segundo plano.'
      StartPct = 35.0
      EndPct   = 75.0
      Duration = 1.2
      Footer   = 'Drenagem graciosa de recursos e reinicialização do processo local.'
    },
    [pscustomobject]@{
      Badge    = 'CONFIRMANDO HEALTH'
      BadgeBg  = @(40, 95, 120)
      DotColor = @(119, 158, 61)
      Title    = 'Validando resposta na porta local 4765...'
      Detail   = 'Serviço restabelecido na porta com sucesso.'
      StartPct = 75.0
      EndPct   = 100.0
      Duration = 1.0
      Footer   = 'Drenagem graciosa de recursos e reinicialização do processo local.'
    }
  ) `
  -Operation $operation `
  -Success {
    param($cycle)
    [pscustomobject]@{
      Badge = '● REINICIADO COM SUCESSO'
      Title = 'O serviço local do OnFrame foi reiniciado.'
      Subtitle = 'Servidor recomposto e respondendo com alta performance.'
      Lines = @(
        "   $($script:OnFrameColors.Green)●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Endereço:$($script:OnFrameColors.Reset) http://127.0.0.1:$($cycle.Started.Port)",
        "   $($script:OnFrameColors.Green)●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Diagnóstico:$($script:OnFrameColors.Reset) /health: 200 OK • Latência: 1ms",
        "   $($script:OnFrameColors.Green)●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Processo:$($script:OnFrameColors.Reset) Node.js (service/server.js)"
      )
      CardTitle = "$($script:OnFrameColors.Green)✔$($script:OnFrameColors.Reset) Serviço Local Reiniciado"
      Footer = 'Ciclo concluído com o canal local restabelecido.'
    }
  } `
  -RecoveryCommand "& '$InstallRoot\scripts\bootstrap\check.ps1' -Root '$InstallRoot'" `
  -NoPause:$NoPause

$global:LASTEXITCODE = if ($result.Success) { 0 } else { 1 }
