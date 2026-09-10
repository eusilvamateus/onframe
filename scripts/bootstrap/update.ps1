param(
  [switch]$NoHeader,
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
$global:ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

$Repo = if ($env:ONFRAME_UPDATE_REPO) { $env:ONFRAME_UPDATE_REPO } else { 'eusilvamateus/onframe' }
$InstallRoot = if ($env:ONFRAME_HOME) { $env:ONFRAME_HOME } else { Join-Path $env:LOCALAPPDATA 'OnFrame' }

$commonPath = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'common.ps1' } else { '' }
if (-not $commonPath -or -not (Test-Path -LiteralPath $commonPath -PathType Leaf)) {
  $commonPath = Join-Path $InstallRoot 'scripts/bootstrap/common.ps1'
}
if (Test-Path -LiteralPath $commonPath -PathType Leaf) {
  . $commonPath
} else {
  $commonUrl = 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/common.ps1'
  try {
    $commonSource = (Invoke-WebRequest -UseBasicParsing -Uri $commonUrl -TimeoutSec 30).Content
    . ([scriptblock]::Create($commonSource))
  } catch {
    function Write-OnFrameText { param([string]$Text, [string]$Tone = 'Default', [switch]$NoNewLine) if ($NoNewLine) { Write-Host $Text -NoNewline } else { Write-Host $Text } }
    function Write-OnFrameHeader { param([string]$Mode, [string]$RootPath, [string]$Repository = '') Write-Host "OnFrame - $Mode" }
    function Write-OnFrameSection { param([string]$Title) Write-Host "[$($Title.ToUpperInvariant())]" }
    function Write-OnFrameStep { param([int]$Current, [int]$Total, [string]$Message, [string]$Status = 'running') Write-Host ("[{0:00}/{1:00}] {2}" -f $Current, $Total, $Message) }
    function Write-OnFrameSubStep { param([string]$Message, [string]$Type = 'info') Write-Host "  $Message" }
    function Write-OnFrameSuccess { param([string]$Title, [string[]]$Lines = @()) Write-Host $Title; $Lines | ForEach-Object { Write-Host "  $_" } }
    function Write-OnFrameFailure { param([string]$Message) Write-Host $Message }
  }
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

function Get-OnFramePortProcessId {
  param([int]$Port)

  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') } |
      Select-Object -First 1
    if ($connection -and $connection.OwningProcess) {
      return [int]$connection.OwningProcess
    }
  } catch {
    return $null
  }

  return $null
}

function Get-OnFrameProcessCommandLine {
  param([int]$ProcessId)

  try {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    if ($processInfo -and $processInfo.CommandLine) {
      return [string]$processInfo.CommandLine
    }
  } catch {
    return $null
  }

  return $null
}

function Test-OnFrameServiceProcess {
  param([int]$ProcessId)

  $commandLine = Get-OnFrameProcessCommandLine -ProcessId $ProcessId
  if (-not $commandLine) { return $null }
  return $commandLine -match 'service[\\/]server\.js'
}

function Stop-OnFrameProcess {
  param([int]$ProcessId)

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $true }

  try {
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 800
    return $true
  } catch {
    Write-OnFrameSubStep "Windows recusou encerrar o PID $($process.Id): $($_.Exception.Message)" 'warning'
    return $false
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
  $port = Get-OnFramePort -Root $Root
  $candidatePid = $null
  $portPid = $null
  $stopped = $true

  if (Test-Path $pidPath) {
    $pidValue = (Get-Content -LiteralPath $pidPath -TotalCount 1).Trim()
    if ($pidValue -match '^\d+$') {
      $candidatePid = [int]$pidValue
      $isOnFrameProcess = Test-OnFrameServiceProcess -ProcessId $candidatePid
      if ($isOnFrameProcess -eq $false) {
        Write-OnFrameSubStep "PID salvo nao parece ser o servico do OnFrame: $candidatePid." 'warning'
        $candidatePid = $null
      }
    } else {
      Write-OnFrameSubStep 'PID salvo invalido; removendo marcador local.' 'warning'
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }

  $portPid = Get-OnFramePortProcessId -Port $port
  if ($candidatePid -and $portPid -and $candidatePid -ne $portPid) {
    Write-OnFrameSubStep "PID salvo difere do processo na porta $port; usando PID $portPid." 'warning'
    $candidatePid = $portPid
  }

  if (-not $candidatePid) {
    $candidatePid = $portPid
  }

  if ($candidatePid) {
    $stopped = Stop-OnFrameProcess -ProcessId $candidatePid
  }

  if (Invoke-OnFrameHealth -Port $port) {
    if (-not $stopped) {
      throw 'O servico local continua ativo e o Windows negou permissao para encerra-lo. Feche o OnFrame pelo mesmo usuario ou execute o atualizador como administrador.'
    }
    throw 'O servico local continua ativo apos a tentativa de parada.'
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
  Start-OnFrameWorkflow -Mode 'Atualização' -Total 4 -RootPath $InstallRoot -Repository $Repo -NoPause:$NoPause
  if (-not $NoHeader) {
    Write-OnFrameHeader -Mode 'Atualizacao' -RootPath $InstallRoot -Repository $Repo
  }

  Write-OnFrameSection 'VERIFICANDO'
  Write-OnFrameStep 1 4 'Buscando novas atualizações...'
  $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
  if (-not (Test-Path (Join-Path $InstallRoot 'package.json'))) {
    Fail-Update "Pasta do OnFrame nao encontrada: $InstallRoot"
  }
  if (Test-Path (Join-Path $InstallRoot '.git')) {
    Fail-Update 'Esta pasta e um checkout de desenvolvimento. Atualize com git pull.'
  }
  Ensure-OnFrameTokenSecret -Root $InstallRoot
  $release = Get-Release -Repository $Repo
  Write-OnFrameSubStep "Conferindo versao: $($release.Tag) / $($release.AssetName)" 'ok'

  Write-OnFrameSection 'BAIXANDO'
  Write-OnFrameStep 2 4 'Baixando a versão mais recente...'
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("onframe-update-" + [guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'release.zip'
  $extractPath = Join-Path $tempRoot 'extract'
  New-Item -ItemType Directory -Force -Path $tempRoot, $extractPath | Out-Null

  Invoke-OnFrameAnimatedDownload -Uri $release.AssetUrl -OutFile $zipPath -TargetPercent 58.0 -TimeoutSec 120
  Write-OnFrameSubStep "Obtendo as melhorias e novidades da versao $($release.Tag)." 'ok'

  Write-OnFrameSection 'ATUALIZANDO'
  Write-OnFrameStep 3 4 'Atualizando os arquivos da extensão...'
  Expand-OnFrameArchive -ZipPath $zipPath -DestinationPath $extractPath
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

  Stop-OnFrameService -Root $InstallRoot

  foreach ($target in @('extension', 'service', 'scripts')) {
    $destination = Join-Path $InstallRoot $target
    Assert-ChildPath -Parent $InstallRoot -Child $destination
    if (Test-Path $destination) {
      Remove-Item -LiteralPath $destination -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $sourceRoot $target) -Destination $destination -Recurse -Force
  }

  foreach ($legacyPath in @('docs', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md')) {
    $path = Join-Path $InstallRoot $legacyPath
    Assert-ChildPath -Parent $InstallRoot -Child $path
    if (Test-Path $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }

  foreach ($file in @('package.json', '.env.example')) {
    $sourceFile = Join-Path $sourceRoot $file
    if (Test-Path $sourceFile) {
      Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $InstallRoot $file) -Force
    }
  }
  Write-OnFrameSubStep 'Atualizando arquivos e preservando suas configuracoes.' 'ok'

  Write-OnFrameSection 'REINICIANDO'
  Write-OnFrameStep 4 4 'Reiniciando o serviço local...'
  Register-OnFrameUpdaterProtocol -Root $InstallRoot | Out-Null
  Start-OnFrameService -Root $InstallRoot

  $port = Get-OnFramePort -Root $InstallRoot
  if (-not (Invoke-OnFrameHealth -Port $port)) {
    Fail-Update 'Arquivos atualizados, mas o servico nao respondeu. Rode scripts\bootstrap\check.ps1.'
  }
  Write-OnFrameSubStep 'Tudo pronto para voce continuar usando sem pausas.' 'ok'

  Write-OnFrameSuccess 'Atualização Concluída' @(
    "Versao: $($release.Tag)",
    "Pasta: $InstallRoot",
    'Gerenciador de extensoes:',
    'Chrome: chrome://extensions/',
    'Edge: edge://extensions/',
    'Recarregue a extensao nessa pagina para concluir a atualizacao.'
  )
  $global:LASTEXITCODE = 0
} catch {
  Write-OnFrameFailure $_.Exception.Message
  $global:LASTEXITCODE = 1
}
