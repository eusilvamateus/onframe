param(
  [string]$Root = '',
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

function Get-InstallRoot {
  param([string]$Value)
  if ($Value) { return $Value }
  if ($env:ONFRAME_HOME) { return $env:ONFRAME_HOME }
  return Join-Path $env:LOCALAPPDATA 'OnFrame'
}

function Get-Port {
  param([string]$InstallRoot)

  $envPath = Join-Path $InstallRoot '.env'
  if (Test-Path $envPath) {
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*ML_SERVICE_PORT\s*=' } | Select-Object -First 1
    if ($line) {
      $value = ($line -replace '^\s*ML_SERVICE_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")
      if ($value -match '^\d+$') { return [int]$value }
    }
  }
  return 4765
}

function Invoke-Health {
  param([int]$Port)
  try {
    Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-PortProcessId {
  param([int]$Port)

  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') } |
      Select-Object -First 1
    if ($connection -and $connection.OwningProcess) {
      return [int]$connection.OwningProcess
    }
  } catch {
    return $null
  }

  return $null
}

function Get-ProcessCommandLine {
  param([int]$ProcessId)

  try {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    if ($processInfo -and $processInfo.CommandLine) {
      return [string]$processInfo.CommandLine
    }
  } catch {
    return $null
  }

  return $null
}

function Test-OnFrameServiceProcess {
  param([int]$ProcessId)

  $commandLine = Get-ProcessCommandLine -ProcessId $ProcessId
  if (-not $commandLine) { return $null }
  return $commandLine -match 'service[\\/]server\.js'
}

function Stop-OnFrameProcess {
  param([int]$ProcessId)

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $true }

  try {
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 800
    if (-not $Quiet) { Write-OnFrameSubStep "Processo encerrado. PID $($process.Id)." 'ok' }
    return $true
  } catch {
    if (-not $Quiet) { Write-OnFrameSubStep "Windows recusou encerrar o PID $($process.Id): $($_.Exception.Message)" 'warning' }
    return $false
  }
}

if (-not $Quiet) {
  Write-OnFrameQuickHeader 'Servico local'
  Write-OnFrameSection 'Encerrando'
}

try {
  $InstallRoot = (Resolve-Path -LiteralPath (Get-InstallRoot -Value $Root)).Path
  $pidPath = Join-Path (Join-Path $InstallRoot '.onframe') 'onframe-service.pid'
  $port = Get-Port -InstallRoot $InstallRoot
  $candidatePid = $null
  $portPid = $null
  $stopped = $true

  if (Test-Path $pidPath) {
    $pidValue = (Get-Content -LiteralPath $pidPath -TotalCount 1).Trim()
    if ($pidValue -match '^\d+$') {
      $candidatePid = [int]$pidValue
      $isOnFrameProcess = Test-OnFrameServiceProcess -ProcessId $candidatePid
      if ($isOnFrameProcess -eq $false) {
        if (-not $Quiet) { Write-OnFrameSubStep "PID salvo nao parece ser o servico do OnFrame: $candidatePid." 'warning' }
        $candidatePid = $null
      }
    } else {
      if (-not $Quiet) { Write-OnFrameSubStep 'PID invalido removido.' 'warning' }
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }

  $portPid = Get-PortProcessId -Port $port
  if ($candidatePid -and $portPid -and $candidatePid -ne $portPid) {
    if (-not $Quiet) { Write-OnFrameSubStep "PID salvo difere do processo na porta $port; usando PID $portPid." 'warning' }
    $candidatePid = $portPid
  }

  if (-not $candidatePid) {
    $candidatePid = $portPid
  }

  if ($candidatePid) {
    if (-not $Quiet) { Write-OnFrameStep 1 1 'Encerrando o servico local.' }
    $stopped = Stop-OnFrameProcess -ProcessId $candidatePid
  }

  if (Invoke-Health -Port $port) {
    if (-not $stopped) {
      throw 'O servico local continua ativo e o Windows negou permissao para encerra-lo. Feche o OnFrame pelo mesmo usuario ou execute este comando como administrador.'
    }
    throw 'O servico local continua ativo apos a tentativa de parada.'
  }

  if (-not $candidatePid) {
    if (-not $Quiet) { Write-OnFrameSuccess 'O servico ja estava parado.' }
  } else {
    if (-not $Quiet) { Write-OnFrameSuccess 'Servico local parado.' }
  }
  $global:LASTEXITCODE = 0
} catch {
  if (-not $Quiet) {
    Write-OnFrameFailure $_.Exception.Message
  }
  $global:LASTEXITCODE = 1
}
