Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProtocolRoot = 'HKCU:\Software\Classes\onframe-updater'
$UpdaterRoot = Join-Path $env:LOCALAPPDATA 'OnFrame\Updater'

if (Test-Path -LiteralPath $ProtocolRoot) {
  Remove-Item -LiteralPath $ProtocolRoot -Recurse -Force
}

if (Test-Path -LiteralPath $UpdaterRoot) {
  Remove-Item -LiteralPath $UpdaterRoot -Recurse -Force
}

Write-Host 'Protocolo onframe-updater:// removido.'
