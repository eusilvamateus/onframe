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
  Write-OnFrameText ("  {0,-16} " -f $Label) 'Muted' -NoNewLine
  Write-OnFrameText $Value 'Default'
}

function Test-OnFrameUpdaterProtocol {
  $protocolRoot = 'HKCU:\Software\Classes\onframe-updater'
  $commandKey = Join-Path $protocolRoot 'shell\open\command'
  try {
    $command = (Get-Item -LiteralPath $commandKey -ErrorAction Stop).GetValue('')
    return -not [string]::IsNullOrWhiteSpace([string]$command)
  } catch {
    return $false
  }
}

$InstallRoot = Get-InstallRoot -Value $Root
$resolvedRoot = if (Test-Path $InstallRoot) { (Resolve-Path -LiteralPath $InstallRoot).Path } else { $InstallRoot }
$envPath = Join-Path $resolvedRoot '.env'
$extensionPath = Join-Path $resolvedRoot 'extension'
$port = Get-Port -InstallRoot $resolvedRoot
$node = Get-Command node -ErrorAction SilentlyContinue
$protocolReady = Test-OnFrameUpdaterProtocol

Write-OnFrameQuickHeader 'Verificacao local'
Write-OnFrameSection 'Instalacao'
Write-Line 'Pasta' $resolvedRoot
Write-Line 'Extensao' $(if (Test-Path $extensionPath) { $extensionPath } else { 'nao encontrada' })
Write-Line '.env' $(if (Test-Path $envPath) { 'encontrado' } else { 'nao encontrado' })
Write-Line 'Porta' $port
Write-Line 'Atalho por um clique' $(if ($protocolReady) { 'registrado' } else { 'nao registrado' })

if ($node) {
  $nodeVersion = (& $node.Source -p "process.versions.node") 2>$null
  Write-Line 'Node' "v$nodeVersion"
} else {
  Write-Line 'Node' 'nao encontrado'
}

try {
  $diagnostics = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$port/diagnostics" -TimeoutSec 3
  Write-OnFrameSection 'Servico'
  Write-OnFrameText "  [OK] Servico ativo em http://127.0.0.1:$port." 'Success'
  Write-Line 'Versao' $diagnostics.version
  Write-Line 'Token local' $(if ($diagnostics.auth.tokenPresent) { 'salvo' } else { 'nao conectado' })
  if ($diagnostics.config.tokenSecretMode) { Write-Line 'Segredo token' $diagnostics.config.tokenSecretMode }
  if ($diagnostics.auth.userId) { Write-Line 'User ID' $diagnostics.auth.userId }
  Write-OnFrameSection 'Proximos passos'
  foreach ($action in $diagnostics.nextActions) {
    Write-OnFrameText "  - $action" 'Muted'
  }
} catch {
  Write-OnFrameSection 'Servico'
  Write-OnFrameText "  [!] Servico local nao respondeu em http://127.0.0.1:$port." 'Warning'
  Write-OnFrameText '      Use o comando de iniciar para abrir o OnFrame.' 'Warning'
}

if (-not $protocolReady) {
  Write-OnFrameSection 'Atalho local'
  Write-OnFrameText '  [!] O protocolo onframe-updater:// nao esta registrado.' 'Warning'
  Write-OnFrameText '      Execute o comando de reparar instalacao na tela de controle.' 'Warning'
}
