param([string]$Root = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

function Get-InstallRoot {
  param([string]$Value)
  if ($Value) { return $Value }
  if ($env:ONFRAME_HOME) { return $env:ONFRAME_HOME }
  return Join-Path $env:LOCALAPPDATA 'OnFrame'
}

try {
  $InstallRoot = (Resolve-Path -LiteralPath (Get-InstallRoot -Value $Root)).Path
  $stopScript = Join-Path $InstallRoot 'scripts/bootstrap/stop.ps1'
  $startScript = Join-Path $InstallRoot 'scripts/bootstrap/start.ps1'
  if (-not (Test-Path -LiteralPath $stopScript -PathType Leaf) -or -not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    throw 'Scripts de controle do servico nao foram encontrados.'
  }

  Write-OnFrameQuickHeader 'Reiniciar servico'
  Write-OnFrameSection 'Reiniciando'
  Write-OnFrameStep 1 2 'Encerrando o servico atual.'
  & $stopScript -Root $InstallRoot -Quiet
  if ($global:LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel encerrar o servico local.'
  }
  Write-OnFrameSubStep 'Servico anterior encerrado.' 'ok'

  Write-OnFrameStep 2 2 'Iniciando novamente.'
  & $startScript -Root $InstallRoot -Quiet
  if ($global:LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel iniciar o servico local.'
  }

  $port = 4765
  $envPath = Join-Path $InstallRoot '.env'
  if (Test-Path -LiteralPath $envPath) {
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*ML_SERVICE_PORT\s*=' } | Select-Object -First 1
    if ($line) {
      $value = ($line -replace '^\s*ML_SERVICE_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")
      if ($value -match '^\d+$') { $port = [int]$value }
    }
  }
  Write-OnFrameSuccess 'Servico local pronto.' @(
    "Endereco: http://127.0.0.1:$port"
  )
  $global:LASTEXITCODE = 0
} catch {
  Write-OnFrameFailure $_.Exception.Message
  $global:LASTEXITCODE = 1
}
