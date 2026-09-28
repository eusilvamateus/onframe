param(
  [string]$Root = '',
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }
$InstallerUrl = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.ps1'
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-update-" + [guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Force -Path $temporary | Out-Null
  $installer = Join-Path $temporary 'install.ps1'
  Invoke-WebRequest -UseBasicParsing -Uri $InstallerUrl -OutFile $installer -TimeoutSec 60
  $previousHome = $env:ONFRAME_HOME
  $env:ONFRAME_HOME = $InstallRoot
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Root $InstallRoot -NoPause:$NoPause
  $exitCode = $LASTEXITCODE
  if ($null -eq $previousHome) { Remove-Item Env:\ONFRAME_HOME -ErrorAction SilentlyContinue }
  else { $env:ONFRAME_HOME = $previousHome }
  if ($exitCode -ne 0) { throw "Atualização terminou com código $exitCode." }
} finally {
  Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
