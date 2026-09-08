param(
  [string]$Root = '',
  [switch]$SkipProtocolRegistration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProtocolName = 'onframe-updater'
$UpdaterRoot = Join-Path $env:LOCALAPPDATA 'OnFrame\Updater'
$StatePath = Join-Path $UpdaterRoot 'updater-state.json'
$SourceScript = Join-Path $PSScriptRoot 'onframe-updater.ps1'
$SourceCommonScript = Join-Path $PSScriptRoot 'common.ps1'

if (-not (Test-Path -LiteralPath $SourceScript -PathType Leaf)) {
  throw "Script do atualizador nao encontrado: $SourceScript"
}
if (-not (Test-Path -LiteralPath $SourceCommonScript -PathType Leaf)) {
  throw "Interface do atualizador nao encontrada: $SourceCommonScript"
}

if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$InstallRoot = [System.IO.Path]::GetFullPath($Root)
New-Item -ItemType Directory -Force -Path $UpdaterRoot | Out-Null

$TargetScript = Join-Path $UpdaterRoot 'onframe-updater.ps1'
$TargetCommonScript = Join-Path $UpdaterRoot 'common.ps1'
Copy-Item -LiteralPath $SourceScript -Destination $TargetScript -Force
Copy-Item -LiteralPath $SourceCommonScript -Destination $TargetCommonScript -Force

$state = [pscustomobject]@{
  installRoot = $InstallRoot
  registeredAt = (Get-Date).ToString('o')
}
$state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $StatePath -Encoding UTF8

if ($SkipProtocolRegistration) {
  Write-Host "Registro do protocolo ${ProtocolName}:// ignorado."
  return
}

$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Command = "`"$PowerShellExe`" -NoProfile -ExecutionPolicy Bypass -File `"$TargetScript`" `"%1`""
$ProtocolRoot = "HKCU:\Software\Classes\$ProtocolName"

New-Item -Path $ProtocolRoot -Force | Out-Null
Set-Item -Path $ProtocolRoot -Value 'URL:OnFrame Updater Protocol'
Set-ItemProperty -Path $ProtocolRoot -Name 'URL Protocol' -Value ''

New-Item -Path "$ProtocolRoot\DefaultIcon" -Force | Out-Null
Set-Item -Path "$ProtocolRoot\DefaultIcon" -Value "`"$PowerShellExe`",0"

New-Item -Path "$ProtocolRoot\shell\open\command" -Force | Out-Null
Set-Item -Path "$ProtocolRoot\shell\open\command" -Value $Command

Write-Host "Protocolo ${ProtocolName}:// registrado."
