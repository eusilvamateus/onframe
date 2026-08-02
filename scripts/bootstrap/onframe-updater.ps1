param(
  [string]$Uri = 'onframe-updater://update'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProtocolName = 'onframe-updater'
$DefaultUpdateScriptUrl = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1'
$UpdaterRoot = Join-Path $env:LOCALAPPDATA 'OnFrame\Updater'
$StatePath = Join-Path $UpdaterRoot 'updater-state.json'
$LogPath = Join-Path $UpdaterRoot 'updater.log'

function Write-OnFrameUpdaterLog {
  param([string]$Message)

  New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  Write-Host $Message
}

function Get-OnFrameUpdaterAction {
  param([string]$RawUri)

  if ([string]::IsNullOrWhiteSpace($RawUri)) {
    return 'update'
  }

  try {
    $parsed = [Uri]$RawUri
  } catch {
    throw 'URI do atualizador invalida.'
  }

  if ($parsed.Scheme -ne $ProtocolName) {
    throw 'Protocolo de atualizacao nao suportado.'
  }

  $action = $parsed.Host
  if ([string]::IsNullOrWhiteSpace($action)) {
    $action = $parsed.AbsolutePath.Trim('/')
  }
  if ([string]::IsNullOrWhiteSpace($action)) {
    return 'update'
  }

  switch ($action.ToLowerInvariant()) {
    'update' { return 'update' }
    'open-log' { return 'open-log' }
    default { throw "Acao de atualizacao nao suportada: $action" }
  }
}

function Get-OnFrameInstallRoot {
  if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
    try {
      $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
      $root = [string]($state.installRoot)
      if (-not [string]::IsNullOrWhiteSpace($root)) {
        return $root
      }
    } catch {
      Write-OnFrameUpdaterLog 'Estado local do atualizador ilegivel; usando pasta padrao.'
    }
  }

  if ($env:ONFRAME_HOME) {
    return $env:ONFRAME_HOME
  }
  return Join-Path $env:LOCALAPPDATA 'OnFrame'
}

function Invoke-OnFrameOfficialUpdate {
  $installRoot = Get-OnFrameInstallRoot
  Write-OnFrameUpdaterLog "Iniciando atualizacao do OnFrame em: $installRoot"

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-updater-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $scriptPath = Join-Path $tempRoot 'update.ps1'

  try {
    Write-OnFrameUpdaterLog 'Baixando atualizador oficial.'
    Invoke-WebRequest -UseBasicParsing -Uri $DefaultUpdateScriptUrl -OutFile $scriptPath -TimeoutSec 60

    Write-OnFrameUpdaterLog 'Executando atualizador oficial.'
    $previousHome = $env:ONFRAME_HOME
    $env:ONFRAME_HOME = $installRoot
    $command = ". '$($scriptPath.Replace("'", "''"))'; exit `$global:LASTEXITCODE"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $command
    $exitCode = $LASTEXITCODE
    if ($null -ne $previousHome) {
      $env:ONFRAME_HOME = $previousHome
    } else {
      Remove-Item Env:\ONFRAME_HOME -ErrorAction SilentlyContinue
    }
    if ($exitCode -ne 0) {
      throw "Atualizador terminou com codigo $exitCode."
    }

    Write-OnFrameUpdaterLog 'Atualizacao do OnFrame concluida.'
    Start-Sleep -Seconds 2
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

try {
  $action = Get-OnFrameUpdaterAction -RawUri $Uri
  switch ($action) {
    'update' { Invoke-OnFrameOfficialUpdate }
    'open-log' {
      New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
      if (-not (Test-Path -LiteralPath $LogPath -PathType Leaf)) {
        New-Item -ItemType File -Force -Path $LogPath | Out-Null
      }
      Start-Process notepad.exe -ArgumentList "`"$LogPath`""
    }
  }
} catch {
  Write-OnFrameUpdaterLog ("Falha no atualizador: " + $_.Exception.Message)
  Write-Host ''
  Write-Host 'Nao foi possivel atualizar por um clique. Use o comando manual:'
  Write-Host "iwr -useb '$DefaultUpdateScriptUrl' | iex"
  Write-Host ''
  Read-Host 'Pressione Enter para fechar'
  exit 1
}
