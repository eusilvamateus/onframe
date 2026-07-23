param([string]$Root = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = if ($env:ONFRAME_UPDATE_REPO) { $env:ONFRAME_UPDATE_REPO } else { 'eusilvamateus/onframe' }
$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

function Write-Step {
  param([string]$Message)
  Write-Host "[OnFrame] $Message" -ForegroundColor Cyan
}

function Fail-Install {
  param([string]$Message)
  throw $Message
}

function Get-LatestRelease {
  param([string]$Repository)

  $headers = @{
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'onframe-bootstrap-installer'
  }
  if ($env:GITHUB_TOKEN) {
    $headers.Authorization = "Bearer $env:GITHUB_TOKEN"
  } elseif ($env:GH_TOKEN) {
    $headers.Authorization = "Bearer $env:GH_TOKEN"
  }

  $release = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers $headers -TimeoutSec 30
  $asset = @($release.assets) |
    Where-Object { $_.name -match '^onframe-release-v?\d+\.\d+\.\d+.*\.zip$' } |
    Select-Object -First 1
  if (-not $asset) {
    throw 'Release sem pacote ZIP.'
  }
  return [pscustomobject]@{
    Tag = [string]$release.tag_name
    AssetName = [string]$asset.name
    AssetUrl = [string]$asset.browser_download_url
  }
}

try {
  if (Test-Path $InstallRoot) {
    $existingPackage = Join-Path $InstallRoot 'package.json'
    if (Test-Path $existingPackage) {
      Write-Step 'Instalacao existente encontrada. Atualizando.'
    } else {
      Fail-Install "A pasta $InstallRoot ja existe, mas nao parece ser uma instalacao do OnFrame."
    }
  }

  Write-Host 'OnFrame - instalacao' -ForegroundColor Cyan
  Write-Host "Pasta: $InstallRoot"
  Write-Host "Repo : $Repo"
  Write-Host ''

  Write-Step 'Consultando ultima release.'
  $release = Get-LatestRelease -Repository $Repo
  Write-Step "Release encontrada: $($release.Tag)"

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-install-" + [guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'release.zip'
  $extractPath = Join-Path $tempRoot 'extract'
  New-Item -ItemType Directory -Force -Path $tempRoot, $extractPath, $InstallRoot | Out-Null

  Write-Step 'Baixando pacote.'
  Invoke-WebRequest -Uri $release.AssetUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120

  Write-Step 'Extraindo pacote.'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
  $source = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
  if (-not $source) { Fail-Install 'Pacote vazio.' }
  $sourceRoot = $source.FullName

  foreach ($required in @('package.json', 'extension', 'service', 'scripts')) {
    if (-not (Test-Path (Join-Path $sourceRoot $required))) {
      Fail-Install "Pacote invalido: $required ausente."
    }
  }

  Write-Step 'Copiando arquivos.'
  foreach ($target in @('extension', 'service', 'scripts')) {
    $destination = Join-Path $InstallRoot $target
    if (Test-Path $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $sourceRoot $target) -Destination $destination -Recurse -Force
  }
  foreach ($file in @('package.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md', '.env.example')) {
    $sourceFile = Join-Path $sourceRoot $file
    if (Test-Path $sourceFile) {
      Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $InstallRoot $file) -Force
    }
  }

  $envPath = Join-Path $InstallRoot '.env'
  $envExamplePath = Join-Path $InstallRoot '.env.example'
  if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
    Write-Host 'Arquivo .env criado com a configuracao padrao.' -ForegroundColor Yellow
  }

  Write-Step 'Iniciando servico.'
  & (Join-Path $InstallRoot 'scripts/bootstrap/start.ps1') -Root $InstallRoot

  Write-Host ''
  Write-Host 'Instalacao concluida.' -ForegroundColor Green
  Write-Host "Carregue esta pasta como extensao no Chrome/Edge: $((Join-Path $InstallRoot 'extension'))"
} catch {
  Write-Host "[OnFrame] $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1
}
