param(
  [string]$Root = '',
  [switch]$RemoveData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

function Write-Step {
  param([string]$Message)
  Write-Host "[OnFrame] $Message" -ForegroundColor Cyan
}

function Remove-IfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

try {
  if (-not (Test-Path $InstallRoot)) {
    Write-Host 'OnFrame nao encontrado.' -ForegroundColor Green
    $global:LASTEXITCODE = 0
  } else {
    $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
    if (Test-Path (Join-Path $InstallRoot '.git')) {
      throw 'Esta pasta e um checkout de desenvolvimento. Remova manualmente se desejar.'
    }

    Write-Host 'OnFrame - desinstalacao' -ForegroundColor Cyan
    Write-Host "Pasta: $InstallRoot"
    Write-Host ''

    Write-Step 'Parando servico.'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'scripts/bootstrap/stop.ps1') -Root $InstallRoot

    if ($RemoveData) {
      Write-Step 'Removendo instalacao e dados locais.'
      Remove-IfExists -Path $InstallRoot
    } else {
      Write-Step 'Removendo arquivos do aplicativo e preservando dados locais.'
      foreach ($target in @('extension', 'service', 'scripts')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $target)
      }
      foreach ($file in @('package.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md', '.env.example')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $file)
      }
      Write-Host 'Dados preservados: .env e .onframe.' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'Desinstalacao concluida. Remova a extensao manualmente do navegador.' -ForegroundColor Green
    $global:LASTEXITCODE = 0
  }
} catch {
  Write-Host "[OnFrame] $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1
}
