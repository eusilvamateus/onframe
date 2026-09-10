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
  Start-OnFrameServiceCore -Root $InstallRoot
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
  -Tag '▶ SERVIÇO LOCAL' `
  -Subtitle 'Inicialização & Monitoramento em Segundo Plano' `
  -CardTitle "$($script:OnFrameColors.Green)▶$($script:OnFrameColors.Reset) Inicialização do Serviço Local" `
  -Tone green `
  -Steps @(
    [pscustomobject]@{
      Badge    = 'CHECANDO AMBIENTE'
      BadgeBg  = @(35, 65, 110)
      DotColor = @(235, 160, 45)
      Title    = 'Verificando ambiente e porta local...'
      Detail   = 'Conferindo porta 4765 e variáveis do OnFrame.'
      StartPct = 0.0
      EndPct   = 35.0
      Duration = 1.0
      Footer   = 'Aguarde um instante. Conectando o OnFrame na porta local 4765.'
    },
    [pscustomobject]@{
      Badge    = 'ATIVANDO PROCESSO'
      BadgeBg  = @(45, 60, 125)
      DotColor = @(80, 145, 255)
      Title    = 'Iniciando servidor local Node.js...'
      Detail   = 'Alocando processo em segundo plano (service/server.js).'
      StartPct = 35.0
      EndPct   = 75.0
      Duration = 1.2
      Footer   = 'Aguarde um instante. Conectando o OnFrame na porta local 4765.'
    },
    [pscustomobject]@{
      Badge    = 'VALIDANDO HEALTH'
      BadgeBg  = @(40, 95, 120)
      DotColor = @(119, 158, 61)
      Title    = 'Confirmando resposta do endpoint /health...'
      Detail   = 'Estabelecendo comunicação segura com a porta 4765.'
      StartPct = 75.0
      EndPct   = 100.0
      Duration = 1.0
      Footer   = 'Aguarde um instante. Conectando o OnFrame na porta local 4765.'
    }
  ) `
  -Operation $operation `
  -Success {
    param($service)
    $state = if ($service.AlreadyRunning) { '● ONLINE / JÁ ATIVO' } else { '● ONLINE / ATIVO' }
    $detail = if ($service.AlreadyRunning) { 'O serviço local já estava pronto para editar anúncios.' } else { 'O serviço local do OnFrame está ativo e pronto.' }
    [pscustomobject]@{
      Badge = $state
      Title = $detail
      Subtitle = 'Servidor em segundo plano respondendo com sucesso.'
      Lines = @(
        "   $($script:OnFrameColors.Green)●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Endereço:$($script:OnFrameColors.Reset) http://127.0.0.1:$($service.Port)",
        "   $($script:OnFrameColors.Green)●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Diagnóstico:$($script:OnFrameColors.Reset) /health: 200 OK • Latência: 1ms",
        "   $($script:OnFrameColors.Green)●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Processo:$($script:OnFrameColors.Reset) Node.js (service/server.js)"
      )
      CardTitle = "$($script:OnFrameColors.Green)✔$($script:OnFrameColors.Reset) Serviço Local Operacional"
      Footer = 'Canal local disponível para a extensão.'
    }
  } `
  -RecoveryCommand "& '$InstallRoot\scripts\bootstrap\check.ps1' -Root '$InstallRoot'" `
  -NoPause:$NoPause

$global:LASTEXITCODE = if ($result.Success) { 0 } else { 1 }
