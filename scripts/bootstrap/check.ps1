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

function Write-Line {
  param([string]$Label, [string]$Value)
  Write-Host ("{0,-18} {1}" -f $Label, $Value)
}

$InstallRoot = Get-InstallRoot -Value $Root
$resolvedRoot = if (Test-Path $InstallRoot) { (Resolve-Path -LiteralPath $InstallRoot).Path } else { $InstallRoot }
$envPath = Join-Path $resolvedRoot '.env'
$extensionPath = Join-Path $resolvedRoot 'extension'
$port = Get-Port -InstallRoot $resolvedRoot
$node = Get-Command node -ErrorAction SilentlyContinue

Write-Host 'OnFrame - verificacao' -ForegroundColor Cyan
Write-Line 'Pasta' $resolvedRoot
Write-Line 'Extensao' $(if (Test-Path $extensionPath) { $extensionPath } else { 'nao encontrada' })
Write-Line '.env' $(if (Test-Path $envPath) { 'encontrado' } else { 'nao encontrado' })
Write-Line 'Porta' $port

if ($node) {
  $nodeVersion = (& $node.Source -p "process.versions.node") 2>$null
  Write-Line 'Node' "v$nodeVersion"
} else {
  Write-Line 'Node' 'nao encontrado'
}

try {
  $diagnostics = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$port/diagnostics" -TimeoutSec 3
  Write-Host ''
  Write-Host "Servico ativo em http://127.0.0.1:$port." -ForegroundColor Green
  Write-Line 'Versao' $diagnostics.version
  Write-Line 'PID' $diagnostics.runtime.pid
  Write-Line 'Token local' $(if ($diagnostics.auth.tokenPresent) { 'salvo' } else { 'nao conectado' })
  if ($diagnostics.auth.userId) { Write-Line 'User ID' $diagnostics.auth.userId }
  Write-Host ''
  Write-Host 'Proximos passos:'
  foreach ($action in $diagnostics.nextActions) {
    Write-Host " - $action"
  }
} catch {
  Write-Host ''
  Write-Host "Servico local nao respondeu em http://127.0.0.1:$port." -ForegroundColor Yellow
  Write-Host 'Use o comando de iniciar para abrir o OnFrame.' -ForegroundColor Yellow
}
