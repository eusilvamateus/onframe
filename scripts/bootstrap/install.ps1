param(
  [string]$Root = '',
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repository = if ($env:ONFRAME_UPDATE_REPO) { $env:ONFRAME_UPDATE_REPO } else { 'eusilvamateus/onframe' }
$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

function Get-LatestRelease {
  $headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'onframe-installer' }
  if ($env:GITHUB_TOKEN) { $headers.Authorization = "Bearer $env:GITHUB_TOKEN" }
  elseif ($env:GH_TOKEN) { $headers.Authorization = "Bearer $env:GH_TOKEN" }

  $release = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers $headers -TimeoutSec 30
  $asset = @($release.assets) | Where-Object { $_.name -match '^onframe-v?\d+\.\d+\.\d+.*\.zip$' } | Select-Object -First 1
  if (-not $asset) { throw 'A release mais recente não possui o pacote ZIP do OnFrame.' }
  return [pscustomobject]@{ Tag = [string]$release.tag_name; Url = [string]$asset.browser_download_url }
}

function Copy-ReleaseFiles {
  param([string]$Source, [string]$Destination)

  foreach ($required in @('package.json', 'extension', 'scripts/bootstrap')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Source $required))) {
      throw "Pacote inválido: $required ausente."
    }
  }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  foreach ($entry in @('extension', 'scripts')) {
    $target = Join-Path $Destination $entry
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $Source $entry) -Destination $target -Recurse -Force
  }
  Copy-Item -LiteralPath (Join-Path $Source 'package.json') -Destination (Join-Path $Destination 'package.json') -Force

  foreach ($legacy in @('service', 'docs', '.env', '.env.example', '.onframe', '.runtime', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md')) {
    $target = Join-Path $Destination $legacy
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
}

try {
  Write-Host ''
  Write-Host 'ONFRAME' -ForegroundColor Blue
  Write-Host 'Instalação da extensão e do atualizador'
  Write-Host ''
  Write-Host '[1/4] Consultando a release mais recente...'
  $release = Get-LatestRelease
  Write-Host "      $($release.Tag)" -ForegroundColor Green

  $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-install-" + [guid]::NewGuid().ToString('N'))
  $archive = Join-Path $temporary 'release.zip'
  $extract = Join-Path $temporary 'extract'
  New-Item -ItemType Directory -Force -Path $extract | Out-Null
  try {
    Write-Host '[2/4] Baixando pacote...'
    Invoke-WebRequest -UseBasicParsing -Uri $release.Url -OutFile $archive -TimeoutSec 120
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    $package = Get-ChildItem -LiteralPath $extract -Recurse -Filter package.json -File | Select-Object -First 1
    if (-not $package) { throw 'Pacote vazio ou inválido.' }

    Write-Host '[3/4] Instalando extensão e atualizador...'
    Copy-ReleaseFiles -Source $package.Directory.FullName -Destination $InstallRoot

    Write-Host '[4/4] Registrando atualização por um clique...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'scripts/bootstrap/register-updater-protocol.ps1') -Root $InstallRoot
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível registrar o atualizador.' }
  } finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host ''
  Write-Host 'Instalação concluída.' -ForegroundColor Green
  Write-Host "Extensão: $(Join-Path $InstallRoot 'extension')"
  Write-Host 'Chrome: chrome://extensions/'
  Write-Host 'Edge: edge://extensions/'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
