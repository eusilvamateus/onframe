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
  Stop-OnFrameServiceCore -Root $InstallRoot
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
  -Tag '■ ENCERRAR SERVIÇO' `
  -Subtitle 'Drenagem de Socket & Liberação de Recursos' `
  -CardTitle "$($script:OnFrameColors.Coral)■$($script:OnFrameColors.Reset) Encerramento do Serviço Local" `
  -Tone coral `
  -Steps @(
    [pscustomobject]@{
      Badge    = 'LOCALIZANDO PROCESSO'
      BadgeBg  = @(45, 55, 90)
      DotColor = @(80, 145, 255)
      Title    = 'Localizando processo ativo na porta 4765...'
      Detail   = 'Identificando PID e verificando integridade.'
      StartPct = 0.0
      EndPct   = 35.0
      Duration = 1.0
      Footer   = 'Encerrando processos locais e liberando a porta com segurança.'
    },
    [pscustomobject]@{
      Badge    = 'FINALIZANDO PROCESSO'
      BadgeBg  = @(140, 75, 35)
      DotColor = @(235, 124, 45)
      Title    = 'Encerrando servidor Node.js com segurança...'
      Detail   = 'Fechando conexões ativas e liberando a porta.'
      StartPct = 35.0
      EndPct   = 75.0
      Duration = 1.1
      Footer   = 'Encerrando processos locais e liberando a porta com segurança.'
    },
    [pscustomobject]@{
      Badge    = 'VERIFICANDO LIBERAÇÃO'
      BadgeBg  = @(130, 45, 45)
      DotColor = @(220, 65, 65)
      Title    = 'Confirmando encerramento dos recursos...'
      Detail   = 'Validando encerramento dos recursos locais.'
      StartPct = 75.0
      EndPct   = 100.0
      Duration = 0.9
      Footer   = 'Encerrando processos locais e liberando a porta com segurança.'
    }
  ) `
  -Operation $operation `
  -Success {
    param($service)
    $title = if ($service.AlreadyStopped) { 'O serviço local já estava encerrado.' } else { 'O serviço local do OnFrame foi encerrado.' }
    [pscustomobject]@{
      Badge = '■ PARADO / INATIVO'
      Title = $title
      Subtitle = 'A porta local e os processos foram liberados.'
      Lines = @(
        "   $($script:OnFrameColors.Coral)■$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Porta $($service.Port):$($script:OnFrameColors.Reset) Liberada e sem conexões ativas",
        "   $($script:OnFrameColors.Coral)■$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Processo Node.js:$($script:OnFrameColors.Reset) Finalizado com sucesso",
        "   $($script:OnFrameColors.Coral)■$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Recursos:$($script:OnFrameColors.Reset) 100% liberados e desalocados"
      )
      CardTitle = "$($script:OnFrameColors.Coral)■$($script:OnFrameColors.Reset) Serviço Local Encerrado"
      Footer = 'Serviço local inativo até o próximo início.'
    }
  } `
  -RecoveryCommand "& '$InstallRoot\scripts\bootstrap\check.ps1' -Root '$InstallRoot'" `
  -NoPause:$NoPause

$global:LASTEXITCODE = if ($result.Success) { 0 } else { 1 }
