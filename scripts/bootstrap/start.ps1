param([string]$Root = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Test-Node {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  $version = (& $command.Source -p "process.versions.node") 2>$null
  if ($version -notmatch '^(\d+)') { return $null }
  if ([int]$Matches[1] -lt 20) { return $null }
  return $command.Source
}

try {
  $InstallRoot = (Resolve-Path -LiteralPath (Get-InstallRoot -Value $Root)).Path
  if (-not (Test-Path (Join-Path $InstallRoot 'service/server.js'))) {
    throw "OnFrame nao encontrado em $InstallRoot."
  }

  $node = Test-Node
  if (-not $node) {
    throw 'Node.js 20 ou superior nao foi encontrado no PATH.'
  }

  $envPath = Join-Path $InstallRoot '.env'
  $envExamplePath = Join-Path $InstallRoot '.env.example'
  if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
    Write-Host 'Arquivo .env criado com a configuracao padrao.' -ForegroundColor Yellow
  }

  $port = Get-Port -InstallRoot $InstallRoot
  if (Invoke-Health -Port $port) {
    Write-Host "OnFrame ja esta ativo em http://127.0.0.1:$port." -ForegroundColor Green
    $global:LASTEXITCODE = 0
  } else {
    $runDir = Join-Path $InstallRoot '.onframe'
    $logDir = Join-Path $runDir 'logs'
    New-Item -ItemType Directory -Force -Path $runDir, $logDir | Out-Null

    $process = Start-Process -FilePath $node `
      -ArgumentList @('service/server.js') `
      -WorkingDirectory $InstallRoot `
      -RedirectStandardOutput (Join-Path $logDir 'service.out.log') `
      -RedirectStandardError (Join-Path $logDir 'service.err.log') `
      -WindowStyle Hidden `
      -PassThru

    Set-Content -LiteralPath (Join-Path $runDir 'onframe-service.pid') -Value $process.Id -Encoding ASCII
    Start-Sleep -Milliseconds 900

    if (Invoke-Health -Port $port) {
      Write-Host "OnFrame iniciado em http://127.0.0.1:$port." -ForegroundColor Green
      $global:LASTEXITCODE = 0
    } else {
      throw 'Nao consegui confirmar que o servico iniciou.'
    }
  }
} catch {
  Write-Host "[OnFrame] $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1
}
