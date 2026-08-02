Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = if ($env:ONFRAME_UPDATE_REPO) { $env:ONFRAME_UPDATE_REPO } else { 'eusilvamateus/onframe' }
$InstallRoot = if ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

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

function Fail-Update {
  param([string]$Message)
  throw $Message
}

function Register-OnFrameUpdaterProtocol {
  param([string]$Root)

  $registerScript = Join-Path $Root 'scripts/bootstrap/register-updater-protocol.ps1'
  if (-not (Test-Path -LiteralPath $registerScript -PathType Leaf)) {
    Write-OnFrameSubStep 'Script de protocolo nao encontrado; use o comando manual para atualizar.' 'warning'
    return $false
  }

  try {
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $registerScript -Root $Root 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "registro retornou codigo ${exitCode}: $($output -join [Environment]::NewLine)"
    }
    Write-OnFrameSubStep 'Atualizador por um clique registrado.' 'ok'
    return $true
  } catch {
    Write-OnFrameSubStep "Atualizador por um clique indisponivel: $($_.Exception.Message)" 'warning'
    return $false
  }
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

function New-TokenSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ([Convert]::ToBase64String($bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Ensure-OnFrameTokenSecret {
  param([string]$Root)

  $envPath = Join-Path $Root '.env'
  $envExamplePath = Join-Path $Root '.env.example'
  if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
  }
  if (-not (Test-Path $envPath)) { return }

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.AddRange([string[]](Get-Content -LiteralPath $envPath))
  $index = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*ONBLIDE_TOKEN_SECRET\s*=') {
      $index = $i
      break
    }
  }

  $secret = New-TokenSecret
  if ($index -lt 0) {
    $lines.Add("ONBLIDE_TOKEN_SECRET=$secret")
    Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8
    return
  }

  $value = ($lines[$index] -replace '^\s*ONBLIDE_TOKEN_SECRET\s*=\s*', '').Trim().Trim('"').Trim("'")
  if (-not $value) {
    $lines[$index] = "ONBLIDE_TOKEN_SECRET=$secret"
    Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8
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
    $asset = $assets | Where-Object { $_.name -match '\.zip$' } | Select-Object -First 1
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
  Write-OnFrameHeader -Mode 'Atualizacao' -RootPath $InstallRoot -Repository $Repo

  Write-OnFrameSection 'Preparando'
  Write-OnFrameStep 1 9 'Validando instalacao.'
  $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
  if (-not (Test-Path (Join-Path $InstallRoot 'package.json'))) {
    Fail-Update "Pasta do OnFrame nao encontrada: $InstallRoot"
  }
  if (Test-Path (Join-Path $InstallRoot '.git')) {
    Fail-Update 'Esta pasta e um checkout de desenvolvimento. Atualize com git pull.'
  }
  Write-OnFrameSubStep 'Instalacao valida.' 'ok'

  Write-OnFrameStep 2 9 'Preparando segredo local.'
  Ensure-OnFrameTokenSecret -Root $InstallRoot
  Write-OnFrameSubStep 'Segredo local preservado ou criado quando necessario.' 'ok'

  Write-OnFrameSection 'Baixando'
  Write-OnFrameStep 3 9 'Consultando ultima release.'
  $release = Get-Release -Repository $Repo
  Write-OnFrameSubStep "Release encontrada: $($release.Tag) / $($release.AssetName)" 'ok'

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-update-" + [guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'release.zip'
  $extractPath = Join-Path $tempRoot 'extract'
  New-Item -ItemType Directory -Force -Path $tempRoot, $extractPath | Out-Null

  Write-OnFrameStep 4 9 'Baixando pacote.'
  Invoke-WebRequest -Uri $release.AssetUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120
  Write-OnFrameSubStep 'Download concluido.' 'ok'

  Write-OnFrameStep 5 9 'Extraindo e validando pacote.'
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
  Write-OnFrameSubStep 'Pacote valido.' 'ok'

  Write-OnFrameSection 'Aplicando'
  Write-OnFrameStep 6 9 'Encerrando servico local.'
  Stop-OnFrameService -Root $InstallRoot
  Write-OnFrameSubStep 'Servico local parado quando estava ativo.' 'ok'

  Write-OnFrameStep 7 9 'Atualizando arquivos.'
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
  Write-OnFrameSubStep 'Arquivos atualizados; .env e .onframe preservados.' 'ok'

  Write-OnFrameSection 'Finalizando'
  Write-OnFrameStep 8 9 'Registrando atualizador local.'
  Register-OnFrameUpdaterProtocol -Root $InstallRoot | Out-Null

  Write-OnFrameStep 9 9 'Reiniciando e validando servico.'
  Start-OnFrameService -Root $InstallRoot

  $port = Get-OnFramePort -Root $InstallRoot
  if (-not (Invoke-OnFrameHealth -Port $port)) {
    Fail-Update 'Arquivos atualizados, mas o servico nao respondeu. Rode scripts\bootstrap\check.ps1.'
  }
  Write-OnFrameSubStep "Servico ativo em http://127.0.0.1:$port." 'ok'

  Write-OnFrameSuccess 'Atualizacao concluida.' @(
    "Versao: $($release.Tag)",
    "Pasta: $InstallRoot",
    'Gerenciador de extensoes:',
    'Chrome: chrome://extensions/',
    'Edge: edge://extensions/',
    'Recarregue a extensao nessa pagina.'
  )
  $global:LASTEXITCODE = 0
} catch {
  Write-OnFrameFailure $_.Exception.Message
  $global:LASTEXITCODE = 1
}
