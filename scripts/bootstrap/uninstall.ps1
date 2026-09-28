param(
  [string]$Root = '',
  [switch]$RemoveData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

try {
  $unregister = Join-Path $PSScriptRoot 'unregister-updater-protocol.ps1'
  if (Test-Path -LiteralPath $unregister -PathType Leaf) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $unregister
  }

  if (Test-Path -LiteralPath $InstallRoot) {
    if ($RemoveData) {
      Remove-Item -LiteralPath $InstallRoot -Recurse -Force
    } else {
      foreach ($entry in @('extension', 'scripts', 'service', 'docs', '.env', '.env.example', '.onframe', '.runtime', 'package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md')) {
        $target = Join-Path $InstallRoot $entry
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
      }
    }
  }
  Write-Host 'Desinstalação concluída.'
  Write-Host 'Remova a extensão em chrome://extensions/ ou edge://extensions/.'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
