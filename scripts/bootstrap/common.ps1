Set-StrictMode -Version Latest

$script:OnFrameEscape = [char]27
$script:OnFrameSideMargin = 2
$script:OnFrameTheme = @{
  Blue = "${script:OnFrameEscape}[38;2;48;86;163m"
  Orange = "${script:OnFrameEscape}[38;2;237;124;46m"
  Default = "${script:OnFrameEscape}[39m"
  Success = "${script:OnFrameEscape}[38;2;112;157;63m"
  Warning = "${script:OnFrameEscape}[38;2;237;124;46m"
  Error = "${script:OnFrameEscape}[38;2;210;61;61m"
  Muted = "${script:OnFrameEscape}[38;2;137;137;137m"
  Reset = "${script:OnFrameEscape}[0m"
}

# The masks below are a byte-safe transcription of onframe-corrigido.py.
# {, # and } become lower-half, full and upper-half block characters at runtime.
$script:OnFrameSymbolMask = @(
  '     {#######################     ##########{{'
  '  {##########################     ##############{'
  ' ######}}}}}}}}}}}}}}}}######      }}}}}}}########'
  '#####}                  #####              }######'
  '#####                   #####               ######'
  '#####                 {####}                ######'
  '#####                 #####                 ######'
  '#####                 #####                 ######'
  '#####                 #####                 ######'
  '#####                 #####                 ######'
  '}#####{               #####               {######}'
  ' }###############     ##########################}'
  '    }}###########     ####################}}}'
)

$script:OnFrameOMask = @(
  ''
  ''
  ''
  '  {{{##############{{'
  '{#####################{'
  '#####}           }#####'
  '#####             #####'
  '#####             #####'
  '#####             #####'
  '#####{{{{{{{{{{{{{#####'
  ' }###################}'
  '   }}}}}}}}}}}}}}}}}'
  ''
)

$script:OnFrameNMask = @(
  ''
  ''
  ''
  '  {{{##############{{'
  '{#####################{'
  '#####             #####'
  '#####             #####'
  '#####             #####'
  '#####             #####'
  '#####             #####'
  '#####             #####'
  '}}}}}             }}}}}'
  ''
)

$script:OnFrameFMask = @(
  '  {{##########'
  '{#############'
  '######'
  '######'
  '##############'
  '######}}}}}}}}'
  '######'
  '######'
  '######'
  '######'
  '######'
  '}}}}}}'
  ''
)

$script:OnFrameRMask = @(
  ''
  ''
  ''
  '  {{##############{'
  '{##################'
  '######'
  '######'
  '######'
  '######'
  '######'
  '######'
  '}}}}}'
  ''
)

$script:OnFrameAMask = @(
  ''
  ''
  ''
  '  ###################{{'
  '  ######################{'
  '                   }#####'
  '   {{{{{{{{{{{{{{{  #####'
  ' {################  #####'
  '{####}              #####'
  '#####{             {#####'
  ' }#####################}'
  '   }}}}}}}}}}}}}}}}}}}'
  ''
)

$script:OnFrameMMask = @(
  ''
  ''
  ''
  '   {{############{{#############{{'
  ' ##################################'
  '######         ######         ######'
  '######         ######         ######'
  '######         ######         ######'
  '######         ######         ######'
  '######         ######         ######'
  '######         ######         ######'
  '}}}}}}         }}}}}}         }}}}}}'
  ''
)

$script:OnFrameEMask = @(
  ''
  ''
  ''
  '   {{###############{{'
  ' ######################{'
  '#####}             #####'
  '#####             {#####'
  '#####  ################}'
  '#####  }}}}}}}}}}}}}}'
  '#####{{'
  ' }######################'
  '    }}}}}}}}}}}}}}}}}}}}'
  ''
)

$script:OnFrameCompactMask = @(
  ' {###########  ######{                               {#####'
  '###}}}}}}}}##  }}}}}###                              ###'
  '###        ##       ###    {#########{  {#########{  ###{{{ {######## ##########{  {##############{   {##########{'
  '###       ##        ###   ###       ### ###     ###  ###}}} ###               }### ###    ###    ### ###       ###'
  '###       ##        ###   ###       ### ###     ###  ###    ###       {####### ### ###    ###    ### ###  #######}'
  '###       ##        ###   ###       ### ###     ###  ###    ###      ###       ### ###    ###    ### ###    '
  '###{{{{{  ##{{{{{{{{###    }#########}  ###     ###  ###    ###      }###########} ###    ###    ### }###########'
  ' }######  ###########}'
)

function ConvertFrom-OnFrameMask {
  param([string]$Value)

  return $Value.Replace('{', [string][char]0x2584).Replace('#', [string][char]0x2588).Replace('}', [string][char]0x2580)
}

function ConvertFrom-OnFrameMaskRows {
  param([string[]]$Rows)

  return @($Rows | ForEach-Object { ConvertFrom-OnFrameMask -Value $_ })
}

function Test-OnFrameColorEnabled {
  if ($env:NO_COLOR -ne $null) { return $false }
  if ($env:TERM -and $env:TERM.ToLowerInvariant() -eq 'dumb') { return $false }
  try {
    return -not [Console]::IsOutputRedirected
  } catch {
    return $true
  }
}

function Get-OnFrameStyle {
  param([string]$Tone = 'Default')

  if (-not (Test-OnFrameColorEnabled)) { return '' }
  return $script:OnFrameTheme[$Tone]
}

function Write-OnFrameText {
  param(
    [string]$Text = '',
    [string]$Tone = 'Default',
    [switch]$NoNewLine
  )

  $style = Get-OnFrameStyle -Tone $Tone
  $reset = Get-OnFrameStyle -Tone 'Reset'
  $output = if ($style) { "$style$Text$reset" } else { $Text }
  if ($NoNewLine) {
    Write-Host $output -NoNewline
  } else {
    Write-Host $output
  }
}

function Get-OnFrameFullBrand {
  $symbolRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameSymbolMask
  $oRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameOMask
  $nRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameNMask
  $fRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameFMask
  $rRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameRMask
  $aRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameAMask
  $mRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameMMask
  $eRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameEMask

  $symbolWidth = ($symbolRows | Measure-Object -Property Length -Maximum).Maximum
  $letterWidths = @{ O = 23; N = 23; F = 14; R = 19; A = 25; M = 36; E = 24 }
  $rows = @()
  for ($index = 0; $index -lt 13; $index++) {
    $symbol = $symbolRows[$index].PadRight($symbolWidth)
    $on = $oRows[$index].PadRight($letterWidths.O) + (' ' * 3) + $nRows[$index].PadRight($letterWidths.N)
    $frame = $fRows[$index].PadRight($letterWidths.F) + (' ' * 1) + $rRows[$index].PadRight($letterWidths.R) + $aRows[$index].PadRight($letterWidths.A) + (' ' * 2) + $mRows[$index].PadRight($letterWidths.M) + (' ' * 2) + $eRows[$index].PadRight($letterWidths.E)
    $rows += [pscustomobject]@{ Symbol = $symbol; On = $on; Frame = $frame }
  }

  return [pscustomobject]@{
    Rows = $rows
    Width = $symbolWidth + 7 + $letterWidths.O + 3 + $letterWidths.N + 3 + $letterWidths.F + 1 + $letterWidths.R + $letterWidths.A + 2 + $letterWidths.M + 2 + $letterWidths.E
  }
}

function Get-OnFrameConsoleWidth {
  try {
    $width = [Console]::WindowWidth
    if ($width -gt 0) { return $width }
  } catch {
    # Use the same fallback width as the Python visual reference.
  }
  return 120
}

function Write-OnFrameBrand {
  param([switch]$CompactOnly)

  $columns = Get-OnFrameConsoleWidth
  $full = Get-OnFrameFullBrand
  $compactRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameCompactMask
  $symbolRows = ConvertFrom-OnFrameMaskRows -Rows $script:OnFrameSymbolMask
  $compactWidth = ($compactRows | Measure-Object -Property Length -Maximum).Maximum
  $symbolWidth = ($symbolRows | Measure-Object -Property Length -Maximum).Maximum
  $blue = Get-OnFrameStyle -Tone 'Blue'
  $default = Get-OnFrameStyle -Tone 'Default'
  $orange = Get-OnFrameStyle -Tone 'Orange'
  $reset = Get-OnFrameStyle -Tone 'Reset'

  if (-not $CompactOnly -and $columns -ge ($full.Width + ($script:OnFrameSideMargin * 2))) {
    $padding = ' ' * [Math]::Max([Math]::Floor(($columns - $full.Width) / 2), 0)
    foreach ($row in $full.Rows) {
      Write-Host ("$padding$blue$($row.Symbol)$(' ' * 7)$default$($row.On)$(' ' * 3)$orange$($row.Frame)$reset")
    }
    return
  }

  if ($columns -ge ($compactWidth + ($script:OnFrameSideMargin * 2))) {
    $padding = ' ' * [Math]::Max([Math]::Floor(($columns - $compactWidth) / 2), 0)
    foreach ($row in $compactRows) {
      $parts = [System.Text.StringBuilder]::new($padding)
      $activeTone = ''
      for ($index = 0; $index -lt $row.Length; $index++) {
        $character = $row[$index]
        if ($character -eq ' ') {
          [void]$parts.Append($character)
          continue
        }
        $tone = if ($index -lt 24) { 'Blue' } elseif ($index -lt 53) { 'Default' } else { 'Orange' }
        if ($tone -ne $activeTone) {
          [void]$parts.Append((Get-OnFrameStyle -Tone $tone))
          $activeTone = $tone
        }
        [void]$parts.Append($character)
      }
      if ($reset) { [void]$parts.Append($reset) }
      Write-Host $parts.ToString()
    }
    return
  }

  if ($columns -ge ($symbolWidth + ($script:OnFrameSideMargin * 2))) {
    $padding = ' ' * [Math]::Max([Math]::Floor(($columns - $symbolWidth) / 2), 0)
    foreach ($row in $symbolRows) {
      Write-Host "$padding$blue$row$reset"
    }
  }
}

function Write-OnFrameDivider {
  Write-OnFrameText ('  ' + ('-' * 62)) 'Muted'
}

function Write-OnFrameHeader {
  param(
    [string]$Mode,
    [string]$RootPath,
    [string]$Repository = ''
  )

  Write-Host ''
  Write-OnFrameBrand
  Write-Host ''
  Write-OnFrameText ("  {0}" -f $Mode.ToUpperInvariant()) 'Blue'
  Write-OnFrameText '  Onblide local toolkit' 'Muted'
  Write-OnFrameDivider
  Write-OnFrameText ("  {0,-10} {1}" -f 'Pasta', $RootPath) 'Default'
  if ($Repository) {
    Write-OnFrameText ("  {0,-10} {1}" -f 'Repo', $Repository) 'Default'
  }
  Write-OnFrameDivider
}

function Write-OnFrameQuickHeader {
  param([string]$Title)

  Write-Host ''
  Write-OnFrameBrand -CompactOnly
  Write-OnFrameText ("  {0}" -f $Title.ToUpperInvariant()) 'Blue'
  Write-OnFrameDivider
}

function Write-OnFrameSection {
  param([string]$Title)

  Write-Host ''
  Write-OnFrameText ("  {0}" -f $Title.ToUpperInvariant()) 'Blue'
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
  $tone = switch ($Status) {
    'ok' { 'Success' }
    'warning' { 'Warning' }
    'error' { 'Error' }
    default { 'Blue' }
  }
  $progress = '{0:00}/{1:00}' -f $Current, $Total
  Write-OnFrameText "  [$icon] " $tone -NoNewLine
  Write-OnFrameText "$progress " 'Muted' -NoNewLine
  Write-OnFrameText $Message 'Default'
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
  $tone = switch ($Type) {
    'ok' { 'Success' }
    'warning' { 'Warning' }
    'error' { 'Error' }
    default { 'Muted' }
  }
  Write-OnFrameText "       $icon $Message" $tone
}

function Write-OnFrameSuccess {
  param(
    [string]$Title,
    [string[]]$Lines = @()
  )

  Write-Host ''
  Write-OnFrameDivider
  Write-OnFrameText "  [OK] $Title" 'Success'
  foreach ($line in $Lines) {
    Write-OnFrameText "       $line" 'Muted'
  }
  Write-Host ''
}

function Write-OnFrameFailure {
  param([string]$Message)

  Write-Host ''
  Write-OnFrameDivider
  Write-OnFrameText '  [ERRO] O processo nao foi concluido.' 'Error'
  Write-OnFrameText "         $Message" 'Error'
  Write-Host ''
}
