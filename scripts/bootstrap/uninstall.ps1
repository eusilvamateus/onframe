param(
  [string]$Root = '',
  [switch]$RemoveData
)

Set-StrictMode -Version Latest
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
  $mode = if ($RemoveData) { 'Desinstalacao total' } else { 'Desinstalacao' }
  Write-OnFrameHeader -Mode $mode -RootPath $InstallRoot

  Write-OnFrameSection 'Preparando'
  Write-OnFrameStep 1 5 'Localizando instalacao.'
  if (-not (Test-Path $InstallRoot)) {
    Write-OnFrameSubStep 'OnFrame nao encontrado; nada para remover.' 'warning'
    Unregister-OnFrameUpdaterProtocol | Out-Null
    Write-OnFrameSuccess 'Nenhuma alteracao foi necessaria.' @(
      "Pasta verificada: $InstallRoot"
    )
    $global:LASTEXITCODE = 0
  } else {
    $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
    if (Test-Path (Join-Path $InstallRoot '.git')) {
      throw 'Esta pasta e um checkout de desenvolvimento. Remova manualmente se desejar.'
    }
    Write-OnFrameSubStep 'Instalacao encontrada.' 'ok'

    Write-OnFrameSection 'Parando'
    Write-OnFrameStep 2 5 'Parando servico local.'
    $global:LASTEXITCODE = 0
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'scripts/bootstrap/stop.ps1') -Root $InstallRoot -Quiet
    if ($global:LASTEXITCODE -ne 0) {
      throw 'Nao foi possivel executar o script de parada do servico.'
    }
    Write-OnFrameSubStep 'Servico parado quando estava ativo.' 'ok'

    Write-OnFrameSection 'Removendo'
    Write-OnFrameStep 3 5 'Removendo atualizador local.'
    Unregister-OnFrameUpdaterProtocol | Out-Null

    if ($RemoveData) {
      Write-OnFrameStep 4 5 'Removendo instalacao e dados locais.'
      Remove-IfExists -Path $InstallRoot
      Write-OnFrameSubStep 'Pasta local removida.' 'ok'
    } else {
      Write-OnFrameStep 4 5 'Removendo aplicativo e preservando dados locais.'
      foreach ($target in @('extension', 'service', 'scripts', 'docs')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $target)
      }
      foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md', '.env.example')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $file)
      }
      Write-OnFrameSubStep 'Dados preservados: .env e .onframe.' 'warning'
    }

    Write-OnFrameSection 'Finalizando'
    Write-OnFrameStep 5 5 'Concluindo desinstalacao.'
    Write-OnFrameSubStep 'Remova a extensao manualmente do navegador.' 'info'
    Write-OnFrameSuccess 'Desinstalacao concluida.' @(
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
