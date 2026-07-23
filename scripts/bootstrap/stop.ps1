param([string]$Root = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-InstallRoot {
  param([string]$Value)
  if ($Value) { return $Value }
  if ($env:ONFRAME_HOME) { return $env:ONFRAME_HOME }
  return Join-Path $env:LOCALAPPDATA 'OnFrame'
}

try {
  $InstallRoot = (Resolve-Path -LiteralPath (Get-InstallRoot -Value $Root)).Path
  $pidPath = Join-Path (Join-Path $InstallRoot '.onframe') 'onframe-service.pid'
  if (-not (Test-Path $pidPath)) {
    Write-Host 'OnFrame nao parece estar ativo.' -ForegroundColor Green
    $global:LASTEXITCODE = 0
  } else {
    $pidValue = (Get-Content -LiteralPath $pidPath -TotalCount 1).Trim()
    if ($pidValue -match '^\d+$') {
      $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $process.Id -Force
        Write-Host "OnFrame encerrado. PID $($process.Id)." -ForegroundColor Green
      } else {
        Write-Host 'Processo ja estava encerrado.' -ForegroundColor Green
      }
    } else {
      Write-Host 'PID invalido removido.' -ForegroundColor Yellow
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    $global:LASTEXITCODE = 0
  }
} catch {
  Write-Host "[OnFrame] $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1
}
