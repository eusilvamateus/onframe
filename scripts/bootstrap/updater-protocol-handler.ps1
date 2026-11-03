param(
  [string]$Uri = 'onframe-updater://update'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProtocolName = 'onframe-updater'
$UpdaterRoot = Join-Path $env:LOCALAPPDATA 'OnFrame\Updater'
$StatePath = Join-Path $UpdaterRoot 'updater-state.json'
$LogPath = Join-Path $UpdaterRoot 'updater.log'
$UpdateScriptUrl = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1'

function Write-UpdaterLog {
  param([string]$Message)
  New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Get-InstallRoot {
  if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
    try {
      $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
      if (-not [string]::IsNullOrWhiteSpace([string]$state.installRoot)) { return [string]$state.installRoot }
    } catch {
      Write-UpdaterLog 'Estado do atualizador inválido; usando a pasta padrão.'
    }
  }
  if ($env:ONFRAME_HOME) { return $env:ONFRAME_HOME }
  return Join-Path $env:LOCALAPPDATA 'OnFrame'
}

try {
  $parsed = [Uri]$Uri
  if ($parsed.Scheme -ne $ProtocolName) { throw 'Protocolo de atualização não suportado.' }
  $action = if ($parsed.Host) { $parsed.Host } else { $parsed.AbsolutePath.Trim('/') }
  if ($action -and $action.ToLowerInvariant() -ne 'update') { throw 'Ação de atualização não suportada.' }

  $installRoot = Get-InstallRoot
  Write-UpdaterLog "Iniciando atualização em $installRoot"
  $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-updater-" + [guid]::NewGuid().ToString('N'))
  try {
    New-Item -ItemType Directory -Force -Path $temporary | Out-Null
    $script = Join-Path $temporary 'update.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri $UpdateScriptUrl -OutFile $script -TimeoutSec 60
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Root $installRoot -NoPause
    if ($LASTEXITCODE -ne 0) { throw "Atualizador terminou com código $LASTEXITCODE." }
    Write-UpdaterLog 'Atualização concluída.'
  } finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
  }
} catch {
  Write-UpdaterLog ('Falha: ' + $_.Exception.Message)
  Write-Error $_.Exception.Message
  exit 1
}
