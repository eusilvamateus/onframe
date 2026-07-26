param(
  [string]$Root = '',
  [switch]$RemoveData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    [string]$RootPath
  )

  Write-Host ''
  Write-OnFrameText '  ONFRAME' $script:OnFrameColors.Primary
  Write-OnFrameText '  Onblide local toolkit' $script:OnFrameColors.Muted
  Write-OnFrameText ("  " + ('-' * 58)) $script:OnFrameColors.Muted
  Write-OnFrameText ("  {0,-10} {1}" -f 'Modo', $Mode) $script:OnFrameColors.Text
  Write-OnFrameText ("  {0,-10} {1}" -f 'Pasta', $RootPath) $script:OnFrameColors.Text
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

function Remove-IfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

try {
  $mode = if ($RemoveData) { 'Desinstalacao total' } else { 'Desinstalacao' }
  Write-OnFrameHeader -Mode $mode -RootPath $InstallRoot

  Write-OnFrameSection 'Preparando'
  Write-OnFrameStep 1 4 'Localizando instalacao.'
  if (-not (Test-Path $InstallRoot)) {
    Write-OnFrameSubStep 'OnFrame nao encontrado; nada para remover.' 'warning'
    Write-OnFrameSuccess 'Nenhuma alteracao foi necessaria.' @(
      "Pasta verificada: $InstallRoot"
    )
    $global:LASTEXITCODE = 0
  } else {
    $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
    if (Test-Path (Join-Path $InstallRoot '.git')) {
      throw 'Esta pasta e um checkout de desenvolvimento. Remova manualmente se desejar.'
    }
    Write-OnFrameSubStep 'Instalacao encontrada.' 'ok'

    Write-OnFrameSection 'Parando'
    Write-OnFrameStep 2 4 'Parando servico local.'
    $global:LASTEXITCODE = 0
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'scripts/bootstrap/stop.ps1') -Root $InstallRoot
    if ($global:LASTEXITCODE -ne 0) {
      throw 'Nao foi possivel executar o script de parada do servico.'
    }
    Write-OnFrameSubStep 'Servico parado quando estava ativo.' 'ok'

    Write-OnFrameSection 'Removendo'
    if ($RemoveData) {
      Write-OnFrameStep 3 4 'Removendo instalacao e dados locais.'
      Remove-IfExists -Path $InstallRoot
      Write-OnFrameSubStep 'Pasta local removida.' 'ok'
    } else {
      Write-OnFrameStep 3 4 'Removendo aplicativo e preservando dados locais.'
      foreach ($target in @('extension', 'service', 'scripts')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $target)
      }
      foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'RELEASE.md', '.env.example')) {
        Remove-IfExists -Path (Join-Path $InstallRoot $file)
      }
      Write-OnFrameSubStep 'Dados preservados: .env e .onframe.' 'warning'
    }

    Write-OnFrameSection 'Finalizando'
    Write-OnFrameStep 4 4 'Concluindo desinstalacao.'
    Write-OnFrameSubStep 'Remova a extensao manualmente do navegador.' 'info'
    Write-OnFrameSuccess 'Desinstalacao concluida.' @(
      'Gerenciador de extensoes:',
      'Chrome: chrome://extensions/',
      'Edge: edge://extensions/',
      'Remova ou recarregue a extensao nessa pagina.'
    )
    $global:LASTEXITCODE = 0
  }
} catch {
  Write-OnFrameFailure $_.Exception.Message
  $global:LASTEXITCODE = 1
}
