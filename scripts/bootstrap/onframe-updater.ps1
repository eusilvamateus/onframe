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
    'start' { return 'start' }
    'stop' { return 'stop' }
    'restart' { return 'restart' }
    'check' { return 'check' }
    'open-log' { return 'open-log' }
    default { throw "Acao local nao suportada: $action" }
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

function Invoke-OnFrameBootstrapScript {
  param(
    [string]$ScriptName,
    [string]$Label,
    [switch]$KeepOpen
  )

  $installRoot = Get-OnFrameInstallRoot
  $scriptPath = Join-Path (Join-Path $installRoot 'scripts') "bootstrap\$ScriptName.ps1"
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Script local nao encontrado: $scriptPath"
  }

  Write-OnFrameUpdaterLog "$Label do OnFrame em: $installRoot"
  $escapedScriptPath = $scriptPath.Replace("'", "''")
  $escapedInstallRoot = $installRoot.Replace("'", "''")
  $command = "& '$escapedScriptPath' -Root '$escapedInstallRoot'; exit `$global:LASTEXITCODE"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $command
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label terminou com codigo $exitCode."
  }

  if ($KeepOpen) {
    Write-Host ''
    Read-Host 'Pressione Enter para fechar'
  } else {
    Start-Sleep -Seconds 2
  }
}

function Get-OnFrameManualCommand {
  param([string]$Action)

  switch ($Action) {
    'start' { return '$root=Join-Path $env:LOCALAPPDATA ''OnFrame''; & (Join-Path $root ''scripts/bootstrap/start.ps1'') -Root $root' }
    'stop' { return '$root=Join-Path $env:LOCALAPPDATA ''OnFrame''; & (Join-Path $root ''scripts/bootstrap/stop.ps1'') -Root $root' }
    'restart' { return '$root=Join-Path $env:LOCALAPPDATA ''OnFrame''; & (Join-Path $root ''scripts/bootstrap/stop.ps1'') -Root $root; & (Join-Path $root ''scripts/bootstrap/start.ps1'') -Root $root' }
    'check' { return '$root=Join-Path $env:LOCALAPPDATA ''OnFrame''; & (Join-Path $root ''scripts/bootstrap/check.ps1'') -Root $root' }
    default { return "iwr -useb '$DefaultUpdateScriptUrl' | iex" }
  }
}

try {
  $action = Get-OnFrameUpdaterAction -RawUri $Uri
  switch ($action) {
    'update' { Invoke-OnFrameOfficialUpdate }
    'start' { Invoke-OnFrameBootstrapScript -ScriptName 'start' -Label 'Iniciando servico local' }
    'stop' { Invoke-OnFrameBootstrapScript -ScriptName 'stop' -Label 'Encerrando servico local' }
    'restart' {
      Invoke-OnFrameBootstrapScript -ScriptName 'stop' -Label 'Encerrando servico local'
      Invoke-OnFrameBootstrapScript -ScriptName 'start' -Label 'Reiniciando servico local'
    }
    'check' { Invoke-OnFrameBootstrapScript -ScriptName 'check' -Label 'Verificando instalacao local' -KeepOpen }
    'open-log' {
      New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null
      if (-not (Test-Path -LiteralPath $LogPath -PathType Leaf)) {
        New-Item -ItemType File -Force -Path $LogPath | Out-Null
      }
      Start-Process notepad.exe -ArgumentList "`"$LogPath`""
    }
  }
} catch {
  $manualAction = 'update'
  try {
    $manualAction = Get-OnFrameUpdaterAction -RawUri $Uri
  } catch {
    $manualAction = 'update'
  }
  $manualCommand = Get-OnFrameManualCommand -Action $manualAction
  Write-OnFrameUpdaterLog ("Falha no atualizador: " + $_.Exception.Message)
  Write-Host ''
  Write-Host 'Nao foi possivel executar a acao por um clique. Use o comando manual:'
  Write-Host $manualCommand
  Write-Host ''
  Read-Host 'Pressione Enter para fechar'
  exit 1
}
