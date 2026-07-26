param([string]$Root = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = if ($env:ONFRAME_UPDATE_REPO) { $env:ONFRAME_UPDATE_REPO } else { 'eusilvamateus/onframe' }
$InstallRoot = if ($Root) { $Root } elseif ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

$script:OnFrameColors = @{
  Primary = 'Cyan'
  Success = 'Green'
  Warning = 'Yellow'
  Error = 'Red'
  Muted = 'DarkGray'
  Text = 'White'
}

function Write-OnFrameText {
  param(
    [string]$Text,
    [string]$Color = 'White',
    [switch]$NoNewLine
  )

  if ($NoNewLine) {
    Write-Host $Text -ForegroundColor $Color -NoNewline
  } else {
    Write-Host $Text -ForegroundColor $Color
  }
}

function Write-OnFrameHeader {
  param(
    [string]$Mode,
    [string]$RootPath,
    [string]$Repository = ''
  )

  Write-Host ''
  Write-OnFrameText '  ONFRAME' $script:OnFrameColors.Primary
  Write-OnFrameText '  Onblide local toolkit' $script:OnFrameColors.Muted
  Write-OnFrameText ("  " + ('-' * 58)) $script:OnFrameColors.Muted
  Write-OnFrameText ("  {0,-10} {1}" -f 'Modo', $Mode) $script:OnFrameColors.Text
  Write-OnFrameText ("  {0,-10} {1}" -f 'Pasta', $RootPath) $script:OnFrameColors.Text
  if ($Repository) {
    Write-OnFrameText ("  {0,-10} {1}" -f 'Repo', $Repository) $script:OnFrameColors.Text
  }
  Write-OnFrameText ("  " + ('-' * 58)) $script:OnFrameColors.Muted
}

function Write-OnFrameSection {
  param([string]$Title)

  Write-Host ''
  Write-OnFrameText ("  [{0}]" -f $Title.ToUpperInvariant()) $script:OnFrameColors.Primary
}

function Write-OnFrameStep {
  param(
    [int]$Current,
    [int]$Total,
    [string]$Message,
    [string]$Status = 'running'
  )

  $icon = switch ($Status) {
    'ok' { '+' }
    'warning' { '!' }
    'error' { 'x' }
    default { '>' }
  }
  $color = switch ($Status) {
    'ok' { $script:OnFrameColors.Success }
    'warning' { $script:OnFrameColors.Warning }
    'error' { $script:OnFrameColors.Error }
    default { $script:OnFrameColors.Primary }
  }
  $progress = '{0:00}/{1:00}' -f $Current, $Total

  Write-OnFrameText "  [$icon] " $color -NoNewLine
  Write-OnFrameText "$progress " $script:OnFrameColors.Muted -NoNewLine
  Write-OnFrameText $Message $script:OnFrameColors.Text
}

function Write-OnFrameSubStep {
  param(
    [string]$Message,
    [string]$Type = 'info'
  )

  $icon = switch ($Type) {
    'ok' { '+' }
    'warning' { '!' }
    'error' { 'x' }
    default { '-' }
  }
  $color = switch ($Type) {
    'ok' { $script:OnFrameColors.Success }
    'warning' { $script:OnFrameColors.Warning }
    'error' { $script:OnFrameColors.Error }
    default { $script:OnFrameColors.Muted }
  }

  Write-OnFrameText "       $icon $Message" $color
}

function Write-OnFrameSuccess {
  param(
    [string]$Title,
    [string[]]$Lines = @()
  )

  Write-Host ''
  Write-OnFrameText "  [OK] $Title" $script:OnFrameColors.Success
  foreach ($line in $Lines) {
    Write-OnFrameText "       $line" $script:OnFrameColors.Muted
  }
  Write-Host ''
}

function Write-OnFrameFailure {
  param([string]$Message)

  Write-Host ''
  Write-OnFrameText '  [ERRO] O processo nao foi concluido.' $script:OnFrameColors.Error
  Write-OnFrameText "         $Message" $script:OnFrameColors.Error
  Write-Host ''
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
  $assets = @($release.assets)
  $asset = $assets |
    Where-Object { $_.name -match '^onframe-v?\d+\.\d+\.\d+.*\.zip$' } |
    Select-Object -First 1
  if (-not $asset) {
    $asset = $assets |
      Where-Object { $_.name -match '^onframe-release-v?\d+\.\d+\.\d+.*\.zip$' } |
      Select-Object -First 1
  }
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
  $mode = 'Instalacao'
  if (Test-Path $InstallRoot) {
    $mode = 'Atualizacao pela instalacao'
  }

  Write-OnFrameHeader -Mode $mode -RootPath $InstallRoot -Repository $Repo

  Write-OnFrameSection 'Preparando'
  Write-OnFrameStep 1 7 'Validando destino.'
  if (Test-Path $InstallRoot) {
    $existingPackage = Join-Path $InstallRoot 'package.json'
    if (Test-Path $existingPackage) {
      Write-OnFrameSubStep 'Instalacao existente encontrada; os arquivos serao atualizados.' 'warning'
    } else {
      Fail-Install "A pasta $InstallRoot ja existe, mas nao parece ser uma instalacao do OnFrame."
    }
  } else {
    Write-OnFrameSubStep 'Nova instalacao local.' 'ok'
  }

  Write-OnFrameSection 'Baixando'
  Write-OnFrameStep 2 7 'Consultando ultima release.'
  $release = Get-LatestRelease -Repository $Repo
  Write-OnFrameSubStep "Release encontrada: $($release.Tag) / $($release.AssetName)" 'ok'

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-install-" + [guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'release.zip'
  $extractPath = Join-Path $tempRoot 'extract'
  New-Item -ItemType Directory -Force -Path $tempRoot, $extractPath | Out-Null

  Write-OnFrameStep 3 7 'Baixando pacote.'
  Invoke-WebRequest -Uri $release.AssetUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120
  Write-OnFrameSubStep 'Download concluido.' 'ok'

  Write-OnFrameStep 4 7 'Extraindo e validando pacote.'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
  $source = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
  if (-not $source) { Fail-Install 'Pacote vazio.' }
  $sourceRoot = $source.FullName

  foreach ($required in @('package.json', 'extension', 'service', 'scripts')) {
    if (-not (Test-Path (Join-Path $sourceRoot $required))) {
      Fail-Install "Pacote invalido: $required ausente."
    }
  }
  Write-OnFrameSubStep 'Pacote valido.' 'ok'

  Write-OnFrameSection 'Aplicando'
  Write-OnFrameStep 5 7 'Copiando arquivos.'
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
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
  Write-OnFrameSubStep 'Arquivos do aplicativo atualizados.' 'ok'

  Write-OnFrameStep 6 7 'Preparando configuracao local.'
  $envPath = Join-Path $InstallRoot '.env'
  $envExamplePath = Join-Path $InstallRoot '.env.example'
  if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
    Write-OnFrameSubStep 'Arquivo .env criado com a configuracao padrao.' 'warning'
  } else {
    Write-OnFrameSubStep 'Configuracao local preservada.' 'ok'
  }

  Write-OnFrameSection 'Finalizando'
  Write-OnFrameStep 7 7 'Iniciando servico local.'
  $global:LASTEXITCODE = 0
  & (Join-Path $InstallRoot 'scripts/bootstrap/start.ps1') -Root $InstallRoot
  if ($global:LASTEXITCODE -ne 0) {
    Fail-Install 'Arquivos instalados, mas o servico local nao iniciou.'
  }

  Write-OnFrameSuccess 'Instalacao concluida.' @(
    "Versao: $($release.Tag)",
    "Extensao: $((Join-Path $InstallRoot 'extension'))",
    'Gerenciador de extensoes:',
    'Chrome: chrome://extensions/',
    'Edge: edge://extensions/',
    'Recarregue ou carregue a extensao nessa pagina.'
  )
  $global:LASTEXITCODE = 0
} catch {
  Write-OnFrameFailure $_.Exception.Message
  $global:LASTEXITCODE = 1
}
