param(
  [string]$Root = '',
  [switch]$RemoveData,
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
$global:ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

function Remove-IfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Unregister-OnFrameUpdaterProtocol {
  $protocolRoot = 'HKCU:\Software\Classes\onframe-updater'
  $updaterRoot = Join-Path $env:LOCALAPPDATA 'OnFrame\Updater'

  try {
    if (Test-Path -LiteralPath $protocolRoot) {
      Remove-Item -LiteralPath $protocolRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $updaterRoot) {
      Remove-Item -LiteralPath $updaterRoot -Recurse -Force
    }
    Write-OnFrameSubStep 'Atualizador por um clique removido quando estava registrado.' 'ok'
    return $true
  } catch {
    Write-OnFrameSubStep "Nao foi possivel remover o protocolo local: $($_.Exception.Message)" 'warning'
    return $false
  }
}

try {
  $mode = if ($RemoveData) { 'Desinstalação total' } else { 'Desinstalação' }
  Start-OnFrameWorkflow -Mode $mode -Total 4 -RootPath $InstallRoot -NoPause:$NoPause
  Write-OnFrameHeader -Mode $mode -RootPath $InstallRoot

  Write-OnFrameSection 'LOCALIZANDO'
  Write-OnFrameStep 1 4 'Localizando componentes do OnFrame...'
  if (-not (Test-Path $InstallRoot)) {
    Write-OnFrameSubStep 'OnFrame não encontrado; nada para remover.' 'warning'
    Unregister-OnFrameUpdaterProtocol | Out-Null
    Write-OnFrameSuccess 'Nenhuma alteração foi necessária.' @(
      "Pasta verificada: $InstallRoot",
      'Gerenciador de extensoes:',
      'Chrome: chrome://extensions/',
      'Edge: edge://extensions/'
    )
    $global:LASTEXITCODE = 0
  } else {
    $resolvedRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
    if (Test-Path (Join-Path $resolvedRoot '.git')) {
      throw 'Esta pasta é um checkout de desenvolvimento. Remova manualmente se desejar.'
    }
    $InstallRoot = $resolvedRoot
    Write-OnFrameSubStep 'Identificando arquivos, serviços e registros locais.' 'ok'

    Write-OnFrameSection 'ENCERRANDO'
    Write-OnFrameStep 2 4 'Encerrando serviços em execução...'
    $stopResult = Stop-OnFrameServiceCore -Root $InstallRoot
    if ($stopResult.AlreadyStopped) {
      Write-OnFrameSubStep 'Serviço local já se encontrava inativo.' 'ok'
    } else {
      Write-OnFrameSubStep 'Finalizando processos em segundo plano com segurança.' 'ok'
    }

    Write-OnFrameSection 'REMOVENDO'
    Write-OnFrameStep 3 4 'Removendo arquivos do aplicativo...'
    Unregister-OnFrameUpdaterProtocol | Out-Null

    if ($RemoveData) {
      Remove-IfExists -Path $InstallRoot
      Write-OnFrameSubStep 'Pasta local e configurações removidas com sucesso.' 'ok'
    } else {
      foreach ($target in @('extension', 'service', 'scripts', 'docs')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $target)
      }
      foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md', '.env.example')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $file)
      }
      Write-OnFrameSubStep 'Limpando pastas e componentes do OnFrame.' 'ok'
    }

    Write-OnFrameSection 'FINALIZANDO'
    Write-OnFrameStep 4 4 'Concluindo desinstalação...'
    Write-OnFrameSubStep 'Liberando recursos e finalizando a remoção segura.' 'ok'

    Write-OnFrameSuccess 'Desinstalação Concluída' @(
      'Gerenciador de extensoes:',
      'Chrome: chrome://extensions/',
      'Edge: edge://extensions/',
      'Remova ou recarregue a extensao nessa pagina.'
    )
    $global:LASTEXITCODE = 0
  }
} catch {
  Write-OnFrameFailure $_.Exception.Message
  $global:LASTEXITCODE = 1
}
