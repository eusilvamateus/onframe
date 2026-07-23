Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = if ($env:ONFRAME_UPDATE_REPO) { $env:ONFRAME_UPDATE_REPO } else { 'eusilvamateus/onframe' }
$InstallRoot = if ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

function Write-Step {
  param([string]$Message)
  Write-Host "[OnFrame] $Message" -ForegroundColor Cyan
}

function Fail-Update {
  param([string]$Message)
  throw $Message
}

function Assert-ChildPath {
  param([string]$Parent, [string]$Child)

  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $childFull = [System.IO.Path]::GetFullPath($Child)
  if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho fora da pasta do OnFrame: $childFull"
  }
}

function Get-OnFrameRunDir {
  param([string]$Root)
  Join-Path $Root '.onframe'
}

function Get-OnFramePidPath {
  param([string]$Root)
  Join-Path (Get-OnFrameRunDir -Root $Root) 'onframe-service.pid'
}

function Get-OnFramePort {
  param([string]$Root)

  $port = 4765
  $envPath = Join-Path $Root '.env'
  if (Test-Path $envPath) {
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*ML_SERVICE_PORT\s*=' } | Select-Object -First 1
    if ($line) {
      $value = ($line -replace '^\s*ML_SERVICE_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")
      if ($value -match '^\d+$') { $port = [int]$value }
    }
  }

  $port
}

function Invoke-OnFrameHealth {
  param([int]$Port)

  try {
    Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 | Out-Null
    $true
  } catch {
    $false
  }
}

function Test-Node {
  $nodePath = $null
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) {
    $version = (& $command.Source -p "process.versions.node") 2>$null
    if ($version -match '^(\d+)' -and [int]$Matches[1] -ge 20) {
      $nodePath = $command.Source
    }
  }
  $nodePath
}

function Stop-OnFrameService {
  param([string]$Root)

  $pidPath = Get-OnFramePidPath -Root $Root
  if (Test-Path $pidPath) {
    $pidValue = (Get-Content -LiteralPath $pidPath -TotalCount 1).Trim()
    if ($pidValue -match '^\d+$') {
      $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $process.Id -Force
        Start-Sleep -Milliseconds 800
      }
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }
}

function Start-OnFrameService {
  param([string]$Root)

  $node = Test-Node
  if (-not $node) {
    throw 'Node.js 20 ou superior nao foi encontrado no PATH.'
  }

  $port = Get-OnFramePort -Root $Root
  if (-not (Invoke-OnFrameHealth -Port $port)) {
    $runDir = Get-OnFrameRunDir -Root $Root
    $logDir = Join-Path $runDir 'logs'
    New-Item -ItemType Directory -Force -Path $runDir, $logDir | Out-Null

    $process = Start-Process -FilePath $node `
      -ArgumentList @('service/server.js') `
      -WorkingDirectory $Root `
      -RedirectStandardOutput (Join-Path $logDir 'service.out.log') `
      -RedirectStandardError (Join-Path $logDir 'service.err.log') `
      -WindowStyle Hidden `
      -PassThru

    Set-Content -LiteralPath (Get-OnFramePidPath -Root $Root) -Value $process.Id -Encoding ASCII

    $started = $false
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      Start-Sleep -Milliseconds 500
      if (Invoke-OnFrameHealth -Port $port) {
        $started = $true
        break
      }
      if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
        throw 'O servico encerrou antes de responder.'
      }
    }

    if (-not $started) {
      throw 'O servico nao respondeu dentro do tempo esperado.'
    }
  }
}

function Get-Release {
  param([string]$Repository)

  $headers = @{
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'onframe-bootstrap-updater'
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
    $asset = @($release.assets) | Where-Object { $_.name -match '\.zip$' } | Select-Object -First 1
  }
  if (-not $asset) {
    throw 'Release sem pacote ZIP.'
  }

  [pscustomobject]@{
    Tag = [string]$release.tag_name
    AssetName = [string]$asset.name
    AssetUrl = [string]$asset.browser_download_url
  }
}

try {
  $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
  if (-not (Test-Path (Join-Path $InstallRoot 'package.json'))) {
    Fail-Update "Pasta do OnFrame nao encontrada: $InstallRoot"
  }
  if (Test-Path (Join-Path $InstallRoot '.git')) {
    Fail-Update 'Esta pasta e um checkout de desenvolvimento. Atualize com git pull.'
  }

  Write-Host 'OnFrame - atualizacao via GitHub Releases' -ForegroundColor Cyan
  Write-Host "Pasta: $InstallRoot"
  Write-Host "Repo : $Repo"
  Write-Host ''

  Write-Step 'Consultando ultima release.'
  $release = Get-Release -Repository $Repo
  Write-Step "Release encontrada: $($release.Tag) / $($release.AssetName)"

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-update-" + [guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'release.zip'
  $extractPath = Join-Path $tempRoot 'extract'
  New-Item -ItemType Directory -Force -Path $tempRoot, $extractPath | Out-Null

  Write-Step 'Baixando pacote.'
  Invoke-WebRequest -Uri $release.AssetUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120

  Write-Step 'Extraindo pacote.'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
  $source = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
  if (-not $source) {
    Fail-Update 'Pacote vazio.'
  }
  $sourceRoot = $source.FullName

  foreach ($required in @('package.json', 'extension', 'service', 'scripts')) {
    if (-not (Test-Path (Join-Path $sourceRoot $required))) {
      Fail-Update "Pacote invalido: $required ausente."
    }
  }

  Write-Step 'Encerrando servico local.'
  Stop-OnFrameService -Root $InstallRoot

  Write-Step 'Atualizando arquivos.'
  foreach ($target in @('extension', 'service', 'scripts')) {
    $destination = Join-Path $InstallRoot $target
    Assert-ChildPath -Parent $InstallRoot -Child $destination
    if (Test-Path $destination) {
      Remove-Item -LiteralPath $destination -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $sourceRoot $target) -Destination $destination -Recurse -Force
  }

  foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md', '.env.example')) {
    $sourceFile = Join-Path $sourceRoot $file
    if (Test-Path $sourceFile) {
      Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $InstallRoot $file) -Force
    }
  }

  Write-Step 'Reiniciando servico.'
  Start-OnFrameService -Root $InstallRoot

  $port = Get-OnFramePort -Root $InstallRoot
  if (-not (Invoke-OnFrameHealth -Port $port)) {
    Fail-Update 'Arquivos atualizados, mas o servico nao respondeu. Rode scripts\bootstrap\check.ps1.'
  }

  Write-Host ''
  Write-Host 'Atualizacao concluida. Recarregue a extensao no navegador.' -ForegroundColor Green
} catch {
  Write-Host "[OnFrame] $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1
}
