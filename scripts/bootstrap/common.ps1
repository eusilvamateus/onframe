Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
$global:ProgressPreference = 'SilentlyContinue'

$script:OnFrameEscape = [char]27
$script:OnFrameSideMargin = 2
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$script:OnFrameColors = @{
  Blue = "${script:OnFrameEscape}[38;2;48;86;163m"
  White = "${script:OnFrameEscape}[38;2;242;240;232m"
  Orange = "${script:OnFrameEscape}[38;2;237;124;46m"
  Brand = "${script:OnFrameEscape}[38;2;10;78;228m"
  Cyan = "${script:OnFrameEscape}[38;2;64;180;220m"
  Green = "${script:OnFrameEscape}[38;2;119;158;61m"
  Coral = "${script:OnFrameEscape}[38;2;220;65;65m"
  Amber = "${script:OnFrameEscape}[38;2;235;124;45m"
  Muted = "${script:OnFrameEscape}[38;2;130;138;150m"
  Border = "${script:OnFrameEscape}[38;2;70;85;110m"
  Reset = "${script:OnFrameEscape}[0m"
  Bold = "${script:OnFrameEscape}[1m"
  Dim = "${script:OnFrameEscape}[2m"
}
$script:OnFrameSymbol2L = @('▄█▀▀▀▀▀█ ▀▀█▄', '▀█▄▄▄ █▄▄▄▄█▀')
$script:OnFrameSymbol3L = @('▄█▀▀▀▀▀█  ▀▀█▄', '██    ▄▀    ██', '▀█▄▄▄ █▄▄▄▄▄█▀')
$script:BrailleLeftDots = @(0x40, 0x04, 0x02, 0x01)
$script:BrailleRightDots = @(0x80, 0x20, 0x10, 0x08)
$script:OnFrameSpinnerFrames = @('⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏')
$script:OnFrameTuiSurfaceOpen = $false
$script:OnFrameWorkflow = $null
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

$script:OnFrameSymbolOnlyMask = @(
  ' {###########  ######{'
  '###}}}}}}}}##  }}}}}###'
  '###        ##       ###'
  '###       ##        ###'
  '###       ##        ###'
  '###       ##        ###'
  '###{{{{{  ##{{{{{{{{###'
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

  if ($script:OnFrameWorkflow) { return }
  Write-Host ''
  Write-OnFrameBrand
  Write-Host ''
  Write-OnFrameText ("  {0}" -f $Mode.ToUpperInvariant()) 'Blue'
  Write-OnFrameText '  Operação local do OnFrame' 'Muted'
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

  if ($script:OnFrameWorkflow) {
    $script:OnFrameWorkflow.Section = $Title
    return
  }
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

  if ($script:OnFrameWorkflow) { Update-OnFrameWorkflow -Current $Current -Total $Total -Message $Message -Status $Status | Out-Null; return }
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

  if ($script:OnFrameWorkflow) { Add-OnFrameWorkflowDetail -Message $Message -Type $Type | Out-Null; return }
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

  if ($script:OnFrameWorkflow) { Complete-OnFrameWorkflow -Title $Title -Lines $Lines | Out-Null; return }
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

  if ($script:OnFrameWorkflow) {
    Fail-OnFrameWorkflow -Message $Message | Out-Null
    return
  }
  if ($script:OnFrameCurrentActionType -eq 'workflow') {
    Show-OnFrameFailureScreen -Message $Message -Mode $script:OnFrameCurrentActionMode -LargeLogo | Out-Null
    return
  }
  Write-Host ''
  Write-OnFrameDivider
  Write-OnFrameText '  [ERRO] O processo nao foi concluido.' 'Error'
  Write-OnFrameText "         $Message" 'Error'
  Write-Host ''
}

# TUI compartilhada: geometria, TrueColor, animação Braille e loops de ação.
function Get-OnFrameProp { param($Object, [string]$Name, $Default = $null) if ($null -eq $Object) { return $Default }; $p = $Object.PSObject.Properties[$Name]; if ($null -ne $p) { return $p.Value }; return $Default }
function Get-TrueColorAnsi { param([int]$R,[int]$G,[int]$B) "${script:OnFrameEscape}[38;2;${R};${G};${B}m" }
function Get-OnFrameBackgroundAnsi { param([int]$R,[int]$G,[int]$B) "${script:OnFrameEscape}[48;2;${R};${G};${B}m" }
function Get-OnFrameLerpColor {
  param([int[]]$From, [int[]]$To, [double]$Amount)
  $t = [Math]::Max(0.0, [Math]::Min(1.0, [double]$Amount))
  return @(
    [int][Math]::Round($From[0] + ($To[0] - $From[0]) * $t),
    [int][Math]::Round($From[1] + ($To[1] - $From[1]) * $t),
    [int][Math]::Round($From[2] + ($To[2] - $From[2]) * $t)
  )
}
function Get-OnFrameDisplayWidth {
  param([string]$Text='')
  $clean=$Text -replace '\x1b\[[0-?]*[ -/]*[@-~]',''; $width=0
  foreach($ch in $clean.ToCharArray()) { $code=[int][char]$ch; $wide=(($code -ge 0x1100 -and $code -le 0x115F) -or ($code -ge 0x2E80 -and $code -le 0xA4CF) -or ($code -ge 0xAC00 -and $code -le 0xD7A3) -or ($code -ge 0xF900 -and $code -le 0xFAFF) -or ($code -ge 0xFE10 -and $code -le 0xFE6F) -or ($code -ge 0xFF00 -and $code -le 0xFF60)); $width += if($wide){2}else{1} }
  $width
}
function Get-OnFrameTuiWidth { [Math]::Min(74,[Math]::Max(56,(Get-OnFrameConsoleWidth)-6)) }
function Get-OnFrameCenterPadding { param([int]$ContentWidth) ' ' * [Math]::Max(0,[Math]::Floor(((Get-OnFrameConsoleWidth)-$ContentWidth)/2)) }
function Format-OnFrameCard {
  param([string]$Title='',[string[]]$Lines=@(),[int]$Width=(Get-OnFrameTuiWidth),[int[]]$BorderRgb=@(70,85,110))
  $border=Get-TrueColorAnsi $BorderRgb[0] $BorderRgb[1] $BorderRgb[2]; $reset=$script:OnFrameColors.Reset; $result=[Collections.Generic.List[string]]::new()
  if($Title){$dashes=[Math]::Max(0,$Width-5-(Get-OnFrameDisplayWidth $Title));$result.Add("${border}╭─ ${reset}$($script:OnFrameColors.Bold)$Title${reset}${border} $('─'*$dashes)╮${reset}")}else{$result.Add("${border}╭$('─'*($Width-2))╮${reset}")}
  $inner=$Width-4; foreach($line in @($Lines)){$pad=[Math]::Max(0,$inner-(Get-OnFrameDisplayWidth $line));$result.Add("${border}│${reset}  $line$(' '*$pad)${border}│${reset}")};$result.Add("${border}╰$('─'*($Width-2))╯${reset}");$result.ToArray()
}
function Get-OnFrameBadge { param([string]$Text,[int[]]$BackgroundRgb,[int[]]$ForegroundRgb=@(255,255,255)); "$(Get-OnFrameBackgroundAnsi $BackgroundRgb[0] $BackgroundRgb[1] $BackgroundRgb[2])$(Get-TrueColorAnsi $ForegroundRgb[0] $ForegroundRgb[1] $ForegroundRgb[2])$($script:OnFrameColors.Bold) $Text $($script:OnFrameColors.Reset)" }
function Get-BrailleChar { param([double]$YLeft,[double]$YRight); $left=[int][Math]::Max(0,[Math]::Min(3,[Math]::Round($YLeft*3)));$right=[int][Math]::Max(0,[Math]::Min(3,[Math]::Round($YRight*3)));[char](0x2800 -bor $script:BrailleLeftDots[$left] -bor $script:BrailleRightDots[$right]) }
function Get-AnalogWaveLine {
  param([int]$Width=16,[double]$Elapsed=0,[double]$Speed=4,[double]$Frequency=.28,[double]$Amplitude=.85,[int[]]$ColorRgb=@(119,158,61))
  $sb=[Text.StringBuilder]::new();[void]$sb.Append((Get-TrueColorAnsi $ColorRgb[0] $ColorRgb[1] $ColorRgb[2]));for($i=0;$i -lt $Width;$i++){$left=$i*2;$right=$left+1;$y0=([Math]::Sin($Elapsed*$Speed-$left*$Frequency)*$Amplitude+1)/2;$y1=([Math]::Sin($Elapsed*$Speed-$right*$Frequency)*$Amplitude+1)/2;[void]$sb.Append((Get-BrailleChar $y0 $y1))};[void]$sb.Append($script:OnFrameColors.Reset);$sb.ToString()
}
function Get-OnFrameChromaticWave {
  param([double]$Elapsed,[int]$Width=16,[ValidateSet('green','coral','cyan','amber','flat')][string]$Scheme='green',[double]$Amplitude=.85,[double]$Speed=6.5)
  $palette=switch($Scheme){'coral'{@(@(120,45,35),@(235,120,45),@(255,95,95))};'cyan'{@(@(25,75,180),@(64,180,240),@(255,195,75))};'amber'{@(@(80,40,20),@(235,124,45),@(255,200,100))};'flat'{@(@(60,70,85),@(80,95,115),@(100,115,135))};default{@(@(25,80,60),@(90,190,100),@(180,255,190))}};$sb=[Text.StringBuilder]::new()
  for($i=0;$i -lt $Width;$i++){$left=$i*2;$right=$left+1;if($Amplitude -le .05){$y0=.5;$y1=.5}else{$y0=([Math]::Sin($Elapsed*$Speed-$left*.4)*$Amplitude+1)/2;$y1=([Math]::Sin($Elapsed*$Speed-$right*.4)*$Amplitude+1)/2};$avg=($y0+$y1)/2;$color=if($avg -lt .5){Get-OnFrameLerpColor $palette[0] $palette[1] ($avg/.5)}else{Get-OnFrameLerpColor $palette[1] $palette[2] (($avg-.5)/.5)};$weight=if($avg -gt .7){$script:OnFrameColors.Bold}else{''};[void]$sb.Append("$weight$(Get-TrueColorAnsi $color[0] $color[1] $color[2])$(Get-BrailleChar $y0 $y1)$($script:OnFrameColors.Reset)")};$sb.ToString()
}
function Get-OnFrameProgressBar {
  param([double]$Percent,[int]$Length=30,[ValidateSet('green','coral','cyan','amber')][string]$Scheme='green')
  $value=[Math]::Max(0.0,[Math]::Min(100.0,[double]$Percent));$filled=[int][Math]::Floor($Length*$value/100.0);$start=switch($Scheme){'coral'{@(235,124,45)};'cyan'{@(10,78,228)};'amber'{@(220,65,65)};default{@(48,86,163)}};$end=switch($Scheme){'coral'{@(220,65,65)};'cyan'{@(64,180,220)};'amber'{@(119,158,61)};default{@(119,158,61)}};$mid=switch($Scheme){'amber'{@(237,124,46)};default{$null}};$tipColor=switch($Scheme){'coral'{@(220,65,65)};'cyan'{@(64,180,220)};'amber'{@(119,158,61)};default{@(119,158,61)}};$sb=[Text.StringBuilder]::new();for($i=0;$i -lt $Length;$i++){if($i -lt $filled){$t=$i/[Math]::Max(1,$Length-1);$c=if($mid -and $Scheme -eq 'amber'){if($t -lt .5){Get-OnFrameLerpColor $start $mid ($t/.5)}else{Get-OnFrameLerpColor $mid $end (($t-.5)/.5)}}else{Get-OnFrameLerpColor $start $end $t};[void]$sb.Append("$(Get-TrueColorAnsi $c[0] $c[1] $c[2])━")}elseif($i -eq $filled -and $filled -lt $Length){[void]$sb.Append("$(Get-TrueColorAnsi $tipColor[0] $tipColor[1] $tipColor[2])╸")}else{[void]$sb.Append("$(Get-TrueColorAnsi 55 65 80)─")}};$pctFormatted=[string]::Format([System.Globalization.CultureInfo]::InvariantCulture,"{0,5:F1}%",$value);[void]$sb.Append("$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 230 235 245)$pctFormatted$($script:OnFrameColors.Reset)");$sb.ToString()
}
function Get-OnFrameMiniBar {
  param(
    [double]$Percent,
    [int]$Length = 12,
    [ValidateSet('green','coral','cyan','amber')][string]$Scheme = 'green'
  )
  $val = [Math]::Max(0.0, [Math]::Min(100.0, $Percent))
  $filled = [int][Math]::Round($Length * ($val / 100.0))
  $start = switch ($Scheme) {
    'coral' { @(235, 124, 45) }
    'amber' { @(235, 124, 45) }
    'cyan'  { @(40, 140, 240) }
    default { @(40, 140, 240) }
  }
  $end = switch ($Scheme) {
    'coral' { @(220, 65, 65) }
    'amber' { @(255, 180, 60) }
    'cyan'  { @(64, 180, 220) }
    default { @(119, 158, 61) }
  }
  $sb = [System.Text.StringBuilder]::new()
  for ($i = 0; $i -lt $Length; $i++) {
    if ($i -lt $filled) {
      $t = $i / [Math]::Max(1, $Length - 1)
      $c = Get-OnFrameLerpColor $start $end $t
      [void]$sb.Append("$(Get-TrueColorAnsi $c[0] $c[1] $c[2])▰")
    } else {
      [void]$sb.Append("$(Get-TrueColorAnsi 55 65 80)▱")
    }
  }
  [void]$sb.Append($script:OnFrameColors.Reset)
  return $sb.ToString()
}
function Get-OnFrameSegmentedGauge {
  param(
    [double]$Score = 100.0,
    [int]$MaxSegments = 20,
    [ValidateSet('green','coral','cyan','amber')][string]$Scheme = 'green'
  )
  $pct = [Math]::Max(0.0, [Math]::Min(100.0, $Score))
  $filled = [int][Math]::Floor($MaxSegments * ($pct / 100.0))
  $start = switch ($Scheme) {
    'coral' { @(235, 124, 45) }
    'amber' { @(50, 150, 255) }
    'cyan'  { @(40, 140, 240) }
    default { @(50, 150, 255) }
  }
  $end = switch ($Scheme) {
    'coral' { @(220, 65, 65) }
    'amber' { @(235, 124, 45) }
    'cyan'  { @(64, 180, 220) }
    default { @(120, 220, 120) }
  }
  $sb = [System.Text.StringBuilder]::new()
  for ($i = 0; $i -lt $MaxSegments; $i++) {
    $t = $i / [Math]::Max(1, $MaxSegments - 1)
    if ($i -lt $filled) {
      $c = Get-OnFrameLerpColor $start $end $t
      [void]$sb.Append("$(Get-TrueColorAnsi $c[0] $c[1] $c[2])█")
    } else {
      [void]$sb.Append("$(Get-TrueColorAnsi 45 55 70)░")
    }
  }
  [void]$sb.Append($script:OnFrameColors.Reset)
  return $sb.ToString()
}
function Get-OnFrameSymbolWithSheen {
  param([string]$Row,[int]$RowIndex,[double]$Elapsed)
  $pos=-5+(($Elapsed%2.6)/2.6)*52;$sb=[Text.StringBuilder]::new();for($i=0;$i -lt $Row.Length;$i++){$ch=$Row[$i];if($ch -eq ' '){[void]$sb.Append(' ');continue};$dist=[Math]::Abs(($i-$RowIndex)-$pos);$t=if($dist -lt 4.2){[Math]::Pow((1+[Math]::Cos([Math]::PI*$dist/4.2))/2,1.3)}else{0};$c=Get-OnFrameLerpColor @(10,78,228) @(185,235,255) $t;$bold=if($t -gt .2){$script:OnFrameColors.Bold}else{''};[void]$sb.Append("$bold$(Get-TrueColorAnsi $c[0] $c[1] $c[2])$ch$($script:OnFrameColors.Reset)")};$sb.ToString()
}
function Get-OnFrameBrandWithSheen {
  param([double]$Elapsed,[int]$Offset=16)
  $text='Onblide │ OnFrame';$pos=-5+(($Elapsed%2.6)/2.6)*52;$sb=[Text.StringBuilder]::new();for($i=0;$i -lt $text.Length;$i++){$ch=$text[$i];if($ch -eq ' '){[void]$sb.Append(' ');continue};$base=if($i -le 1){@(245,248,255)}elseif($i -le 6){@(235,124,45)}elseif($i -eq 8){@(80,95,115)}else{@(70,140,255)};$sheen=if($i -le 6){@(255,218,150)}else{@(225,255,255)};$dist=[Math]::Abs(($Offset+$i)-$pos);$t=if($dist -lt 4.2){[Math]::Pow((1+[Math]::Cos([Math]::PI*$dist/4.2))/2,1.3)}else{0};$c=Get-OnFrameLerpColor $base $sheen $t;$bold=if($t -gt .2 -or $ch -ne '│'){$script:OnFrameColors.Bold}else{''};[void]$sb.Append("$bold$(Get-TrueColorAnsi $c[0] $c[1] $c[2])$ch$($script:OnFrameColors.Reset)")};$sb.ToString()
}
function Get-OnFrameBlockPadding {
  param([int]$CardWidth)
  return Get-OnFrameCenterPadding -ContentWidth $CardWidth
}

function Get-OnFrameProjectVersion {
  param([string]$Root = '')
  $candidateRoots = [System.Collections.Generic.List[string]]::new()
  if ($Root) { [void]$candidateRoots.Add($Root) }
  if ($env:ONFRAME_HOME) { [void]$candidateRoots.Add($env:ONFRAME_HOME) }
  if ($PSScriptRoot) {
    [void]$candidateRoots.Add((Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
    [void]$candidateRoots.Add((Split-Path $PSScriptRoot -Parent))
    [void]$candidateRoots.Add($PSScriptRoot)
  }
  [void]$candidateRoots.Add((Join-Path $env:LOCALAPPDATA 'OnFrame'))

  foreach ($c in $candidateRoots) {
    if ($c) {
      $pkg = Join-Path $c 'package.json'
      if (Test-Path -LiteralPath $pkg) {
        try {
          $json = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
          if ($json.version) {
            return "v$($json.version)"
          }
        } catch {}
      }
    }
  }
  return 'v0.4.0'
}

function Get-OnFrameHeader3L {
  param(
    [string]$Tag,
    [string]$Subtitle,
    [ValidateSet('green','coral','amber','cyan','brand')][string]$TagTone='brand',
    [double]$Elapsed=0,
    [string]$BlockPad='',
    [int]$CardWidth=0,
    [string]$Detail=''
  )
  $tone = switch ($TagTone) {
    'green' { $script:OnFrameColors.Green }
    'coral' { $script:OnFrameColors.Coral }
    'amber' { $script:OnFrameColors.Amber }
    'cyan'  { $script:OnFrameColors.Cyan }
    default { $script:OnFrameColors.Brand }
  }
  $targetWidth = if ($CardWidth -gt 0) { $CardWidth } else { Get-OnFrameTuiWidth }

  $s0 = Get-OnFrameSymbolWithSheen $script:OnFrameSymbol3L[0] 0 $Elapsed
  $s1 = Get-OnFrameSymbolWithSheen $script:OnFrameSymbol3L[1] 1 $Elapsed
  $s2 = Get-OnFrameSymbolWithSheen $script:OnFrameSymbol3L[2] 2 $Elapsed

  $brand = Get-OnFrameBrandWithSheen -Elapsed $Elapsed -Offset 17
  $tagFormatted = "$($script:OnFrameColors.Bold)$tone$Tag$($script:OnFrameColors.Reset)"
  $leftPart = "$s0   $brand"
  $leftWidth = Get-OnFrameDisplayWidth -Text $leftPart
  $tagWidth = Get-OnFrameDisplayWidth -Text $Tag

  $gapCount = [Math]::Max(2, $targetWidth - $leftWidth - $tagWidth)
  $gap = ' ' * $gapCount

  $detailText = if ($Detail) {
    $Detail
  } else {
    $p = if ($env:ML_SERVICE_PORT) { $env:ML_SERVICE_PORT } else { '4765' }
    $ver = Get-OnFrameProjectVersion
    "Painel de Controle Local • Porta $p • $ver"
  }

  $line0 = "$leftPart$gap$tagFormatted"
  $line1 = "$s1   $($script:OnFrameColors.Muted)$Subtitle$($script:OnFrameColors.Reset)"
  $line2 = "$s2   $(Get-TrueColorAnsi 100 115 135)$detailText$($script:OnFrameColors.Reset)"

  $pad = if ($BlockPad) { $BlockPad } else { Get-OnFrameCenterPadding -ContentWidth $targetWidth }
  return @('', "$pad$line0", "$pad$line1", "$pad$line2", '')
}

function Get-OnFrameHeader2L {
  param(
    [string]$Tag,
    [string]$Subtitle,
    [ValidateSet('green','coral','amber','cyan','brand')][string]$TagTone='brand',
    [double]$Elapsed=0,
    [string]$BlockPad='',
    [int]$CardWidth=0,
    [string]$Detail=''
  )
  Get-OnFrameHeader3L -Tag $Tag -Subtitle $Subtitle -TagTone $TagTone -Elapsed $Elapsed -BlockPad $BlockPad -CardWidth $CardWidth -Detail $Detail
}
function Get-OnFrameLargeLogoLines {
  param(
    [double]$Elapsed = 0.0,
    [string]$Mode = 'install',
    [string]$Version = '',
    [int]$TermWidth = (Get-OnFrameConsoleWidth)
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $waveWidth = 16.0
  $wavePos = (($Elapsed * 55.0) % 150.0) - 20.0

  $byTag = "$($script:OnFrameColors.Dim)$($script:OnFrameColors.Muted)By$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 80 145 255)Onblide$($script:OnFrameColors.Reset)"

  if ($TermWidth -ge 115) {
    $leftPad = [Math]::Max(0, [int][Math]::Floor(($TermWidth - 110) / 2))
    $padStr = ' ' * $leftPad

    for ($rIdx = 0; $rIdx -lt $script:OnFrameCompactMask.Count; $rIdx++) {
      $row = $script:OnFrameCompactMask[$rIdx]
      $sb = [System.Text.StringBuilder]::new($padStr)

      for ($cIdx = 0; $cIdx -lt $row.Length; $cIdx++) {
        $ch = $row[$cIdx]
        if ($ch -eq ' ') {
          [void]$sb.Append(' ')
          continue
        }
        $glyph = switch ($ch) {
          '{' { [char]0x2584 }
          '#' { [char]0x2588 }
          '}' { [char]0x2580 }
          default { $ch }
        }

        $base = if ($cIdx -lt 24) { @(48, 86, 163) } elseif ($cIdx -lt 53) { @(242, 240, 232) } else { @(237, 124, 46) }
        $sheen = if ($cIdx -lt 24) { @(150, 210, 255) } elseif ($cIdx -lt 53) { @(255, 255, 255) } else { @(255, 215, 130) }

        $diagX = $cIdx - ($rIdx * 1.6)
        $dist = [Math]::Abs($diagX - $wavePos)
        $factor = if ($dist -lt $waveWidth) {
          [Math]::Pow(([Math]::Cos($dist / $waveWidth * [Math]::PI) + 1.0) / 2.0, 1.6)
        } else {
          0.0
        }

        $color = Get-OnFrameLerpColor -From $base -To $sheen -Amount $factor
        $ansi = Get-TrueColorAnsi -R $color[0] -G $color[1] -B $color[2]
        [void]$sb.Append("$ansi$glyph")
      }
      [void]$sb.Append($script:OnFrameColors.Reset)

      if ($rIdx -eq 7) {
        $tagLen = 10
        $gap = $script:OnFrameCompactMask[6].Length - $row.Length - $tagLen
        [void]$sb.Append(' ' * [Math]::Max(1, $gap))
        [void]$sb.Append($byTag)
      }

      [void]$lines.Add($sb.ToString())
    }
  } else {
    $symbolW = 23
    $sideText = switch -Wildcard ($Mode.ToLowerInvariant()) {
      { $_ -like '*desinstala*' -or $_ -like '*uninstall*' } {
        @(
          '',
          "  $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 242 240 232)O N$(Get-TrueColorAnsi 237 124 46) F R A M E$($script:OnFrameColors.Reset)",
          "         $byTag",
          "  $(Get-TrueColorAnsi 60 75 95)──────────────────────────────$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Desinstalador Oficial do Aplicativo$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Ação: $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 237 124 46)Remoção Segura de Componentes$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Ambiente: $(Get-TrueColorAnsi 100 180 240)Instalação Local Validada$($script:OnFrameColors.Reset)",
          ''
        )
      }
      { $_ -like '*atualiza*' -or $_ -like '*update*' } {
        $realVer = Get-OnFrameProjectVersion
        $verText = if ($Version) { $Version } else { "$realVer $($script:OnFrameColors.Muted)(Canal Oficial)$($script:OnFrameColors.Reset)" }
        @(
          '',
          "  $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 242 240 232)O N$(Get-TrueColorAnsi 237 124 46) F R A M E$($script:OnFrameColors.Reset)",
          "         $byTag",
          "  $(Get-TrueColorAnsi 60 75 95)──────────────────────────────$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Atualizador Oficial do Aplicativo$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Atualização: $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 242 240 232)$verText$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Ambiente: $(Get-TrueColorAnsi 100 180 240)Instalação Existente Validada$($script:OnFrameColors.Reset)",
          ''
        )
      }
      default {
        $realVer = Get-OnFrameProjectVersion
        $verText = if ($Version) { $Version } else { "$realVer (Estável)" }
        @(
          '',
          "  $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 242 240 232)O N$(Get-TrueColorAnsi 237 124 46) F R A M E$($script:OnFrameColors.Reset)",
          "         $byTag",
          "  $(Get-TrueColorAnsi 60 75 95)──────────────────────────────$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Instalador Oficial do Aplicativo$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Versão: $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 242 240 232)$verText$($script:OnFrameColors.Reset)",
          "  $($script:OnFrameColors.Muted)Ambiente: $(Get-TrueColorAnsi 100 180 240)Pronto para Configurar$($script:OnFrameColors.Reset)",
          ''
        )
      }
    }

    $totalW = $symbolW + 35
    $leftPad = [Math]::Max(0, [int][Math]::Floor(($TermWidth - $totalW) / 2))
    $padStr = ' ' * $leftPad

    for ($rIdx = 0; $rIdx -lt $script:OnFrameSymbolOnlyMask.Count; $rIdx++) {
      $row = $script:OnFrameSymbolOnlyMask[$rIdx]
      $sb = [System.Text.StringBuilder]::new($padStr)

      for ($cIdx = 0; $cIdx -lt $row.Length; $cIdx++) {
        $ch = $row[$cIdx]
        if ($ch -eq ' ') {
          [void]$sb.Append(' ')
          continue
        }
        $glyph = switch ($ch) {
          '{' { [char]0x2584 }
          '#' { [char]0x2588 }
          '}' { [char]0x2580 }
          default { $ch }
        }

        $base = @(48, 86, 163)
        $sheen = @(150, 210, 255)

        $diagX = $cIdx - ($rIdx * 1.5)
        $dist = [Math]::Abs($diagX - ($wavePos % 35))
        $factor = if ($dist -lt 12.0) {
          [Math]::Pow(([Math]::Cos($dist / 12.0 * [Math]::PI) + 1.0) / 2.0, 1.6)
        } else {
          0.0
        }

        $color = Get-OnFrameLerpColor -From $base -To $sheen -Amount $factor
        $ansi = Get-TrueColorAnsi -R $color[0] -G $color[1] -B $color[2]
        [void]$sb.Append("$ansi$glyph")
      }
      [void]$sb.Append($script:OnFrameColors.Reset)

      if ($rIdx -lt $sideText.Count) {
        [void]$sb.Append($sideText[$rIdx])
      }

      [void]$lines.Add($sb.ToString())
    }
  }

  return $lines.ToArray()
}

function Get-OnFrameWorkflowGradientBar {
  param(
    [double]$Percent,
    [int]$Length = 36
  )

  $pct = [Math]::Max(0.0, [Math]::Min(100.0, $Percent))
  $filledLen = [int][Math]::Floor($Length * ($pct / 100.0))
  $sb = [System.Text.StringBuilder]::new()

  for ($i = 0; $i -lt $Length; $i++) {
    if ($i -lt $filledLen) {
      $t = $i / [Math]::Max(1, $Length - 1)
      $col = if ($t -lt 0.5) {
        $subT = $t / 0.5
        Get-OnFrameLerpColor -From @(48, 86, 163) -To @(56, 170, 220) -Amount $subT
      } else {
        $subT = ($t - 0.5) / 0.5
        Get-OnFrameLerpColor -From @(56, 170, 220) -To @(237, 124, 46) -Amount $subT
      }
      $ansi = Get-TrueColorAnsi -R $col[0] -G $col[1] -B $col[2]
      [void]$sb.Append("${ansi}━")
    } elseif ($i -eq $filledLen) {
      $sheenOrange = Get-TrueColorAnsi -R 255 -G 215 -B 130
      [void]$sb.Append("${sheenOrange}╸")
    } else {
      $dimTrack = Get-TrueColorAnsi -R 55 -G 65 -B 80
      [void]$sb.Append("${dimTrack}─")
    }
  }

  $reset = $script:OnFrameColors.Reset
  $bold = $script:OnFrameColors.Bold
  $pctCol = Get-TrueColorAnsi -R 230 -G 235 -B 245
  $pctFormatted = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0,5:F1}%", $pct)
  [void]$sb.Append("$reset $bold$pctCol$pctFormatted$reset")
  return $sb.ToString()
}

function Get-OnFrameLongLogoWithSheen {
  param([double]$Elapsed=0)
  return Get-OnFrameLargeLogoLines -Elapsed $Elapsed
}
function Test-OnFrameInteractiveConsole { try{[Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected}catch{$false} }
function Start-OnFrameTuiSurface { if(-not(Test-OnFrameInteractiveConsole)){return $false};Write-Host "${script:OnFrameEscape}[2J${script:OnFrameEscape}[H${script:OnFrameEscape}[?25l" -NoNewline;$script:OnFrameTuiSurfaceOpen=$true;$true }
function Stop-OnFrameTuiSurface { if($script:OnFrameTuiSurfaceOpen){Write-Host "${script:OnFrameEscape}[?25h" -NoNewline;$script:OnFrameTuiSurfaceOpen=$false} }
function Write-OnFrameTuiFrame { param([string[]]$Lines);if(-not $script:OnFrameTuiSurfaceOpen){foreach($line in $Lines){Write-Host $line};return};$sb=[Text.StringBuilder]::new();[void]$sb.Append("${script:OnFrameEscape}[H");foreach($line in $Lines){[void]$sb.Append($line).Append("${script:OnFrameEscape}[K`n")};[void]$sb.Append("${script:OnFrameEscape}[J");Write-Host $sb.ToString() -NoNewline }
function Test-ExitKey { try{if(-not [Console]::KeyAvailable){return $false};$key=[Console]::ReadKey($true);if($key.Key -in @([ConsoleKey]::Enter,[ConsoleKey]::Spacebar,[ConsoleKey]::Q,[ConsoleKey]::Escape)){return 'exit'};if($key.Key -eq [ConsoleKey]::C){return 'copy'}}catch{return 'exit'};$false }
function Copy-CommandToClipboard { param([string]$Command);try{Set-Clipboard -Value $Command;$true}catch{try{$Command|clip.exe;$true}catch{$false}} }
function Start-OnFrameLiveLoop {
  param([scriptblock]$RenderCallback,[string]$CopyCommand='',[switch]$NoPause)
  if($NoPause -or -not(Test-OnFrameInteractiveConsole)){Write-OnFrameTuiFrame @(& $RenderCallback 0.0 '');return};$own=-not $script:OnFrameTuiSurfaceOpen;if($own){Start-OnFrameTuiSurface|Out-Null};$start=[datetime]::UtcNow;$notice='';try{while($true){$elapsed=([datetime]::UtcNow-$start).TotalSeconds;Write-OnFrameTuiFrame @(& $RenderCallback $elapsed $notice);$key=Test-ExitKey;if($key-eq'exit'){break};if($key-eq'copy'-and $CopyCommand){$notice=if(Copy-CommandToClipboard $CopyCommand){'✔ COMANDO COPIADO! BASTA COLAR NO POWERSHELL (CTRL+V)'}else{'Não foi possível copiar o comando automaticamente.'}};Start-Sleep -Milliseconds 33}}finally{if($own){Stop-OnFrameTuiSurface}}
}

function Get-OnFrameQuickActionFrame {
  param(
    [double]$Elapsed,
    [string]$Tag,
    [string]$Subtitle,
    [string]$CardTitle,
    [string]$Badge,
    [string]$Title,
    [string]$Detail,
    [double]$Percent,
    [ValidateSet('green','coral','amber','cyan','brand')][string]$Tone='brand',
    [string]$Footer='',
    [int[]]$BadgeBg=$null,
    [int[]]$DotColor=$null,
    [string]$WaveScheme='',
    [double]$WaveAmplitude=-1.0,
    [double]$WaveSpeed=-1.0,
    [string]$WaveTag='',
    [string]$BarScheme=''
  )
  $width = Get-OnFrameTuiWidth
  $bgRgb = if ($BadgeBg) { $BadgeBg } elseif ($Tone -eq 'coral') { @(45, 55, 90) } elseif ($Tone -eq 'amber') { @(45, 55, 90) } else { @(35, 65, 110) }
  $dotCol = if ($DotColor) { $DotColor } elseif ($Tone -eq 'coral') { @(80, 145, 255) } elseif ($Tone -eq 'amber') { @(220, 65, 65) } else { @(119, 158, 61) }
  $spinIdx = [int]($Elapsed * 30) % $script:OnFrameSpinnerFrames.Count
  $spin = $script:OnFrameSpinnerFrames[$spinIdx]
  $spinColor = switch ($Tone) {
    'coral' { @(220, 65, 65) }
    'amber' { @(237, 124, 46) }
    default { @(119, 158, 61) }
  }
  $spinAnsi = Get-TrueColorAnsi $spinColor[0] $spinColor[1] $spinColor[2]
  $dotAnsi = Get-TrueColorAnsi $dotCol[0] $dotCol[1] $dotCol[2]

  $wScheme = if ($WaveScheme) { $WaveScheme } elseif ($Tone -eq 'coral') { 'coral' } elseif ($Tone -eq 'amber') { 'coral' } else { 'cyan' }
  $wAmp = if ($WaveAmplitude -ge 0) { $WaveAmplitude } elseif ($Tone -eq 'coral') { 0.75 } else { 0.9 }
  $wSpeed = if ($WaveSpeed -gt 0) { $WaveSpeed } elseif ($Tone -eq 'coral') { 7.0 } elseif ($Tone -eq 'amber') { 6.0 } else { 8.0 }
  $waveStr = Get-OnFrameChromaticWave -Elapsed $Elapsed -Width 16 -Scheme $wScheme -Amplitude $wAmp -Speed $wSpeed
  $signalLine = if ($WaveTag) {
    "$($script:OnFrameColors.Muted)Sinal analógico:$($script:OnFrameColors.Reset) $waveStr  $WaveTag"
  } else {
    "$($script:OnFrameColors.Muted)Sinal analógico:$($script:OnFrameColors.Reset) $waveStr"
  }

  $bScheme = if ($BarScheme) { $BarScheme } elseif ($Tone -eq 'coral') { 'coral' } elseif ($Tone -eq 'amber') { 'amber' } else { 'green' }
  $bar = Get-OnFrameProgressBar -Percent $Percent -Length ([Math]::Max(14, $width - 32)) -Scheme $bScheme

  $badgeStr = Get-OnFrameBadge -Text $Badge -BackgroundRgb $bgRgb
  $titleLine = "$dotAnsi●$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 245 248 255)$Title$($script:OnFrameColors.Reset)"
  $detailLine = "$($script:OnFrameColors.Muted)$Detail$($script:OnFrameColors.Reset)"
  $progressLine = "$spinAnsi$spin$($script:OnFrameColors.Reset) Progresso:      $bar"

  $content = @(
    $badgeStr,
    $titleLine,
    $detailLine,
    '',
    $signalLine,
    $progressLine
  )

  $out = [Collections.Generic.List[string]]::new()
  $out.AddRange([string[]](Get-OnFrameHeader2L -Tag $Tag -Subtitle $Subtitle -TagTone $Tone -Elapsed $Elapsed -CardWidth $width))
  $pad = Get-OnFrameCenterPadding -ContentWidth $width
  foreach ($line in (Format-OnFrameCard -Title $CardTitle -Lines $content -Width $width -BorderRgb @(70, 85, 110))) {
    $out.Add("$pad$line")
  }
  if ($Footer) {
    $out.Add('')
    $footerPad = Get-OnFrameCenterPadding -ContentWidth (Get-OnFrameDisplayWidth -Text $Footer)
    $out.Add("$footerPad$($script:OnFrameColors.Muted)$Footer$($script:OnFrameColors.Reset)")
  }
  return $out.ToArray()
}
function Get-OnFrameFailurePresentation {
  param(
    [string]$Message,
    [string]$RecoveryCommand = ''
  )
  $m = $Message.ToLowerInvariant()
  $cmd = if ($RecoveryCommand) { $RecoveryCommand } else { '$root=Join-Path $env:LOCALAPPDATA ''OnFrame''; & (Join-Path $root ''scripts/bootstrap/check.ps1'') -Root $root' }

  if ($m -match 'eaddrinuse|porta.*(uso|ocupada)|address.*use') {
    return [pscustomobject]@{
      Code     = 'E1'
      Title    = 'Conflito de Porta Local'
      Badge    = '▲ FALHA NA INICIALIZAÇÃO • PORTA EM USO'
      Headline = 'Não foi possível abrir o serviço local do OnFrame.'
      Reason   = 'A porta local já está em uso por outro processo.'
      Impact   = 'Uma instância anterior ou outro aplicativo retém o canal local.'
      Manual   = 'Alternativa Manual: Encerrar Instância'
      Display  = @('$root=Join-Path $env:LOCALAPPDATA ''OnFrame'';', '& (Join-Path $root ''scripts/bootstrap/stop.ps1'') -Root $root')
      Command  = $cmd
      Tone     = @(235, 124, 45)
    }
  }

  if ($m -match 'service[\\/]server\.js|onframe nao encontrado|não é possível localizar o caminho|nao é possível localizar o caminho|cannot find path|não existe') {
    return [pscustomobject]@{
      Code     = 'E2'
      Title    = 'Instalação Incompleta'
      Badge    = '▲ ARQUIVOS AUSENTES • ONFRAME NÃO ENCONTRADO'
      Headline = 'Não encontramos os arquivos necessários do OnFrame.'
      Reason   = 'A instalação local está incompleta ou foi movida de lugar.'
      Impact   = 'O serviço não pode ser preparado sem os arquivos da aplicação.'
      Manual   = 'Alternativa Manual: Verificar Instalação'
      Display  = @('$root=Join-Path $env:LOCALAPPDATA ''OnFrame'';', '& (Join-Path $root ''scripts/bootstrap/check.ps1'') -Root $root')
      Command  = $cmd
      Tone     = @(220, 65, 65)
    }
  }

  if ($m -match 'node\.js|node.*path|runtime') {
    return [pscustomobject]@{
      Code     = 'E3'
      Title    = 'Ambiente Incompleto'
      Badge    = '▲ RUNTIME AUSENTE • NODE.JS NÃO ENCONTRADO'
      Headline = 'O serviço local requer o ambiente Node.js.'
      Reason   = 'O Node.js 20 ou superior não foi localizado no computador.'
      Impact   = 'O canal de sincronização não pode ser iniciado.'
      Manual   = 'Alternativa Manual: Instalar Node.js LTS'
      Display  = @('winget install OpenJS.NodeJS.LTS')
      Command  = 'winget install OpenJS.NodeJS.LTS'
      Tone     = @(220, 65, 65)
    }
  }

  if ($m -match 'acesso negado|access.*denied|permiss') {
    return [pscustomobject]@{
      Code     = 'E4'
      Title    = 'Permissão Insuficiente'
      Badge    = '▲ PERMISSÃO NECESSÁRIA • AÇÃO BLOQUEADA'
      Headline = 'O Windows bloqueou a alteração solicitada.'
      Reason   = 'A operação precisa ser executada pelo mesmo usuário do OnFrame.'
      Impact   = 'O serviço anterior não pôde ser alterado com segurança.'
      Manual   = 'Alternativa Manual: Diagnosticar Serviço'
      Display  = @('$root=Join-Path $env:LOCALAPPDATA ''OnFrame'';', '& (Join-Path $root ''scripts/bootstrap/check.ps1'') -Root $root')
      Command  = $cmd
      Tone     = @(235, 124, 45)
    }
  }

  if ($m -match 'download|webclient|github|conexão|conexao|tempo limite|timeout|rede|network') {
    return [pscustomobject]@{
      Code     = 'E5'
      Title    = 'Falha de Conexão'
      Badge    = '▲ FALHA DE REDE • DOWNLOAD INTERROMPIDO'
      Headline = 'Não foi possível baixar os arquivos necessários.'
      Reason   = if ($Message) { $Message } else { 'A conexão com o repositório oficial foi interrompida.' }
      Impact   = 'A instalação ou atualização depende do download do pacote oficial.'
      Manual   = 'Alternativa Manual: Tentar Novamente'
      Display  = @('$root=Join-Path $env:LOCALAPPDATA ''OnFrame'';', '& (Join-Path $root ''scripts/bootstrap/check.ps1'') -Root $root')
      Command  = $cmd
      Tone     = @(220, 65, 65)
    }
  }

  return [pscustomobject]@{
    Code     = 'E0'
    Title    = 'Falha na Operação'
    Badge    = '▲ OPERAÇÃO INTERROMPIDA'
    Headline = 'A operação local foi interrompida antes de concluir.'
    Reason   = if ($Message) { $Message } else { 'Uma inconformidade inesperada impediu a finalização do processo.' }
    Impact   = 'Verifique as informações acima ou execute o diagnóstico do ambiente.'
    Manual   = 'Alternativa Manual: Diagnosticar Ambiente'
    Display  = @('$root=Join-Path $env:LOCALAPPDATA ''OnFrame'';', '& (Join-Path $root ''scripts/bootstrap/check.ps1'') -Root $root')
    Command  = $cmd
    Tone     = @(220, 65, 65)
  }
}

function Show-OnFrameFailureScreen {
  param(
    [string]$Tag = '▲ AÇÃO MANUAL NECESSÁRIA',
    [string]$Message,
    [string]$RecoveryCommand = '',
    [string]$Mode = '',
    [switch]$LargeLogo,
    [switch]$NoPause
  )

  $failure = Get-OnFrameFailurePresentation -Message $Message -RecoveryCommand $RecoveryCommand
  $useLarge = $LargeLogo -or ($Mode -ne '') -or ($script:OnFrameWorkflow -ne $null) -or ($script:OnFrameCurrentActionType -eq 'workflow')
  $effectiveMode = if ($Mode) {
    $Mode
  } elseif ($script:OnFrameWorkflow -and $script:OnFrameWorkflow.Mode) {
    $script:OnFrameWorkflow.Mode
  } elseif ($script:OnFrameCurrentActionMode) {
    $script:OnFrameCurrentActionMode
  } else {
    'install'
  }

  $render = {
    param($elapsed, $notice)
    $cols = Get-OnFrameConsoleWidth
    $width = Get-OnFrameTuiWidth
    $cardLeftPad = ' ' * [Math]::Max(0, [int][Math]::Floor(($cols - $width) / 2))

    $content = [System.Collections.Generic.List[string]]::new()
    [void]$content.Add((Get-OnFrameBadge -Text $failure.Badge -BackgroundRgb @(130, 50, 45)))
    [void]$content.Add("$($script:OnFrameColors.Bold)$($failure.Headline)$($script:OnFrameColors.Reset)")
    [void]$content.Add("$($script:OnFrameColors.Muted)$($failure.Reason)$($script:OnFrameColors.Reset)")
    [void]$content.Add("$($script:OnFrameColors.Muted)$($failure.Impact)$($script:OnFrameColors.Reset)")
    [void]$content.Add('')

    $inner = Format-OnFrameCard -Title $failure.Manual -Lines $failure.Display -Width ($width - 8) -BorderRgb $failure.Tone
    foreach ($line in $inner) {
      [void]$content.Add("  $line")
    }

    [void]$content.Add('')
    $actionHint = if ($notice) {
      "$($script:OnFrameColors.Green)$notice$($script:OnFrameColors.Reset)"
    } else {
      "$($script:OnFrameColors.Muted)[C] Copiar comando  •  [Enter] Retornar$($script:OnFrameColors.Reset)"
    }
    [void]$content.Add($actionHint)

    $out = [System.Collections.Generic.List[string]]::new()
    if ($useLarge) {
      $logoLines = Get-OnFrameLargeLogoLines -Elapsed $elapsed -Mode $effectiveMode -TermWidth $cols
      [void]$out.Add('')
      foreach ($l in $logoLines) {
        [void]$out.Add($l)
      }
      [void]$out.Add('')
    } else {
      $out.AddRange([string[]](Get-OnFrameHeader2L -Tag $Tag -Subtitle 'Procedimento de Recuperação & Diagnóstico' -TagTone 'amber' -Elapsed $elapsed))
    }

    $cardTitle = "$($script:OnFrameColors.Coral)$($failure.Code)$($script:OnFrameColors.Reset) $($failure.Title)"
    $cardLines = Format-OnFrameCard -Title $cardTitle -Lines $content.ToArray() -Width $width -BorderRgb $failure.Tone
    foreach ($line in $cardLines) {
      [void]$out.Add("$cardLeftPad$line")
    }

    if ($useLarge) {
      [void]$out.Add('')
      $footerText = "$($script:OnFrameColors.Muted)A operação foi interrompida com segurança. Seus dados locais permanecem protegidos.$($script:OnFrameColors.Reset)"
      $footerCleanLen = Get-OnFrameDisplayWidth -Text $footerText
      $footerPad = ' ' * [Math]::Max(0, [int][Math]::Floor(($cols - $footerCleanLen) / 2))
      [void]$out.Add("$footerPad$footerText")
    }

    $out.ToArray()
  }

  Start-OnFrameLiveLoop -RenderCallback $render -CopyCommand $failure.Command -NoPause:$NoPause
}

# Declaração formatada para preservar o ScriptBlock de sucesso separado do
# objeto de resultado (PowerShell trata nomes de variável sem diferenciar caso).
function Invoke-OnFrameQuickAction {
  param(
    [string]$Tag,
    [string]$Subtitle,
    [string]$CardTitle,
    [ValidateSet('green','coral','amber','cyan','brand')][string]$Tone,
    [object[]]$Steps,
    [scriptblock]$Operation,
    [scriptblock]$Success,
    [string]$RecoveryCommand = '',
    [switch]$NoPause
  )

  $interactive = Test-OnFrameInteractiveConsole
  if ($interactive) { Start-OnFrameTuiSurface | Out-Null }
  try {
    $script:OnFrameCurrentActionType = 'quick'
    $script:OnFrameCurrentActionMode = $Tag
    $count = [Math]::Max(1, @($Steps).Count)
    $started = [DateTime]::UtcNow
    $totalPlanned = 0.0
    foreach ($s in $Steps) {
      $d = Get-OnFrameProp $s 'Duration' $null
      $totalPlanned += if ($null -ne $d) { [double]$d } else { 1.05 }
    }
    if ($totalPlanned -le 0) { $totalPlanned = 3.2 }

    for ($index = 0; $index -lt $count; $index++) {
      $step = $Steps[$index]
      $stageStarted = [DateTime]::UtcNow
      $stepDuration = Get-OnFrameProp $step 'Duration' $null
      $stageDuration = if ($NoPause -or -not $interactive) { 0.0 } elseif ($null -ne $stepDuration) { [double]$stepDuration } else { 1.05 }
      $sPct = Get-OnFrameProp $step 'StartPct' $null
      $startPct = if ($null -ne $sPct) { [double]$sPct } else { ($index / $count) * 100.0 }
      $ePct = Get-OnFrameProp $step 'EndPct' $null
      $endPct = if ($null -ne $ePct) { [double]$ePct } else { (($index + 1) / $count) * 100.0 }

      $stepBadgeBg = Get-OnFrameProp $step 'BadgeBg' $null
      $badgeBg = if ($null -ne $stepBadgeBg) {
        $stepBadgeBg
      } elseif ($Tone -eq 'coral') {
        @(@(45, 55, 90), @(140, 75, 35), @(130, 45, 45))[$index % 3]
      } elseif ($Tone -eq 'amber') {
        @(@(45, 55, 90), @(130, 75, 30), @(40, 95, 120))[$index % 3]
      } else {
        @(@(35, 65, 110), @(45, 60, 125), @(40, 95, 120))[$index % 3]
      }

      $stepDotCol = Get-OnFrameProp $step 'DotColor' $null
      $dotColor = if ($null -ne $stepDotCol) {
        $stepDotCol
      } elseif ($Tone -eq 'coral') {
        @(@(80, 145, 255), @(235, 124, 45), @(220, 65, 65))[$index % 3]
      } elseif ($Tone -eq 'amber') {
        @(@(220, 65, 65), @(235, 124, 45), @(119, 158, 61))[$index % 3]
      } else {
        @(@(235, 160, 45), @(80, 145, 255), @(119, 158, 61))[$index % 3]
      }

      do {
        $elapsed = ([DateTime]::UtcNow - $started).TotalSeconds
        $stageElapsed = ([DateTime]::UtcNow - $stageStarted).TotalSeconds
        $subFrac = if ($stageDuration -gt 0) { [Math]::Min(1.0, $stageElapsed / $stageDuration) } else { 1.0 }
        $progress = $startPct + ($endPct - $startPct) * $subFrac
        $ratio = [Math]::Max(0.0, [Math]::Min(1.0, $elapsed / $totalPlanned))

        $stepWaveScheme = Get-OnFrameProp $step 'WaveScheme' $null
        $waveScheme = if ($stepWaveScheme) {
          $stepWaveScheme
        } elseif ($Tone -eq 'coral') {
          'coral'
        } elseif ($Tone -eq 'amber') {
          if ($ratio -lt 0.4) { 'coral' } else { 'green' }
        } else {
          'cyan'
        }

        $stepWaveAmp = Get-OnFrameProp $step 'WaveAmplitude' $null
        $waveAmp = if ($null -ne $stepWaveAmp) {
          [double]$stepWaveAmp
        } elseif ($Tone -eq 'coral') {
          [Math]::Max(0.0, 1.0 - $ratio)
        } elseif ($Tone -eq 'amber') {
          if ($ratio -lt 0.4) { [Math]::Max(0.0, 1.0 - ($ratio / 0.4)) }
          else { [Math]::Min(0.85, ($ratio - 0.4) / 0.6) }
        } else {
          0.9
        }

        $waveSpeed = if ($Tone -eq 'coral') { 7.0 } elseif ($Tone -eq 'amber') { 6.0 } else { 8.0 }

        $stepWaveTag = Get-OnFrameProp $step 'WaveTag' $null
        $waveTag = if ($stepWaveTag) {
          $stepWaveTag
        } elseif ($Tone -eq 'coral') {
          "$(Get-TrueColorAnsi 235 124 45)[Drenando socket]$($script:OnFrameColors.Reset)"
        } elseif ($Tone -eq 'amber') {
          if ($ratio -lt 0.4) {
            "$(Get-TrueColorAnsi 220 65 65)[Liberando socket]$($script:OnFrameColors.Reset)"
          } else {
            "$(Get-TrueColorAnsi 237 124 46)[Sincronizando]$($script:OnFrameColors.Reset)"
          }
        } else {
          "$(Get-TrueColorAnsi 100 180 240)[:4765]$($script:OnFrameColors.Reset)"
        }

        $barScheme = if ($Tone -eq 'coral') { 'coral' } elseif ($Tone -eq 'amber') { 'amber' } else { 'green' }

        $stepBadge = Get-OnFrameProp $step 'Badge' ''
        $stepTitle = Get-OnFrameProp $step 'Title' ''
        $stepDetail = Get-OnFrameProp $step 'Detail' ''
        $stepFooter = Get-OnFrameProp $step 'Footer' ''

        $frame = Get-OnFrameQuickActionFrame `
          -Elapsed $elapsed `
          -Tag $Tag `
          -Subtitle $Subtitle `
          -CardTitle $CardTitle `
          -Badge ('{0:00}/{1:00} • {2}' -f ($index + 1), $count, $stepBadge) `
          -Title $stepTitle `
          -Detail $stepDetail `
          -Percent $progress `
          -Tone $Tone `
          -Footer $stepFooter `
          -BadgeBg $badgeBg `
          -DotColor $dotColor `
          -WaveScheme $waveScheme `
          -WaveAmplitude $waveAmp `
          -WaveSpeed $waveSpeed `
          -WaveTag $waveTag `
          -BarScheme $barScheme

        Write-OnFrameTuiFrame -Lines $frame
        if (-not $interactive -or $stageDuration -le 0) { break }
        Start-Sleep -Milliseconds 33
      } while (([DateTime]::UtcNow - $stageStarted).TotalSeconds -lt $stageDuration)
    }

    $result = & $Operation
    $successData = & $Success $result
    $render = {
      param($elapsed, $notice)
      $rgb = switch ($Tone) { 'green' { @(119,158,61) } 'coral' { @(220,65,65) } 'amber' { @(235,124,45) } 'cyan' { @(64,180,220) } default { @(10,78,228) } }
      $wave = if ($Tone -eq 'coral') { 'flat' } elseif ($Tone -eq 'cyan') { 'cyan' } else { 'green' }
      $amplitude = if ($Tone -eq 'coral') { 0.0 } else { .72 }
      $bulletIcon = if ($Tone -eq 'coral') { '■' } else { '●' }
      $bulletTone = switch ($Tone) { 'coral' { $script:OnFrameColors.Coral } 'amber' { $script:OnFrameColors.Amber } default { $script:OnFrameColors.Green } }
      $waveStr = Get-OnFrameChromaticWave -Elapsed $elapsed -Width 16 -Scheme $wave -Amplitude $amplitude
      $waveStatus = if ($Tone -eq 'coral') {
        "$($script:OnFrameColors.Muted)(Linha Inativa / Fechada)$($script:OnFrameColors.Reset)"
      } elseif ($Tone -eq 'amber') {
        "$($script:OnFrameColors.Green)(Reestabelecido / Heartbeat)$($script:OnFrameColors.Reset)"
      } else {
        "$($script:OnFrameColors.Green)(Estável / Heartbeat)$($script:OnFrameColors.Reset)"
      }
      $signalLine = "   $bulletTone$bulletIcon$($script:OnFrameColors.Reset) $($script:OnFrameColors.Bold)Sinal analógico:$($script:OnFrameColors.Reset) $waveStr $waveStatus"

      $width = Get-OnFrameTuiWidth
      $barScheme = if ($Tone -eq 'coral') { 'coral' } else { 'green' }
      $finalBar = Get-OnFrameProgressBar -Percent 100.0 -Length ([Math]::Max(14, $width - 32)) -Scheme $barScheme
      $checkIco = if ($Tone -eq 'coral') { "$($script:OnFrameColors.Coral)✔$($script:OnFrameColors.Reset)" } else { "$($script:OnFrameColors.Green)✔$($script:OnFrameColors.Reset)" }
      $statusFinalLine = "$checkIco Status final:  $finalBar"

      $sucCardTitle = Get-OnFrameProp $successData 'CardTitle' $null
      $finalCardTitle = if ($sucCardTitle) {
        $sucCardTitle
      } elseif ($Tone -eq 'coral') {
        "$($script:OnFrameColors.Coral)■$($script:OnFrameColors.Reset) Serviço Local Encerrado"
      } elseif ($Tone -eq 'amber') {
        "$($script:OnFrameColors.Green)✔$($script:OnFrameColors.Reset) Serviço Local Reiniciado"
      } else {
        "$($script:OnFrameColors.Green)✔$($script:OnFrameColors.Reset) Serviço Local Operacional"
      }

      $sucBadge = Get-OnFrameProp $successData 'Badge' ''
      $sucTitle = Get-OnFrameProp $successData 'Title' ''
      $sucSubtitle = Get-OnFrameProp $successData 'Subtitle' ''
      $sucLines = Get-OnFrameProp $successData 'Lines' @()
      $sucFooter = Get-OnFrameProp $successData 'Footer' 'Operação concluída.'

      $content = [System.Collections.Generic.List[string]]::new()
      [void]$content.Add((Get-OnFrameBadge -Text ([string]$sucBadge) -BackgroundRgb $rgb))
      [void]$content.Add("$($script:OnFrameColors.Bold)$([string]$sucTitle)$($script:OnFrameColors.Reset)")
      if ($sucSubtitle) {
        [void]$content.Add("$($script:OnFrameColors.Muted)$([string]$sucSubtitle)$($script:OnFrameColors.Reset)")
      }
      [void]$content.Add('')
      foreach ($l in $sucLines) {
        [void]$content.Add($l)
      }
      [void]$content.Add($signalLine)
      [void]$content.Add('')
      [void]$content.Add($statusFinalLine)

      if ($notice) {
        [void]$content.Add('')
        [void]$content.Add("$($script:OnFrameColors.Green)$notice$($script:OnFrameColors.Reset)")
      }
      $output = [Collections.Generic.List[string]]::new()
      $output.AddRange([string[]](Get-OnFrameHeader2L -Tag $Tag -Subtitle $Subtitle -TagTone $Tone -Elapsed $elapsed -CardWidth $width))
      $pad = Get-OnFrameCenterPadding -ContentWidth $width
      foreach ($line in (Format-OnFrameCard -Title $finalCardTitle -Lines $content.ToArray() -Width $width -BorderRgb $rgb)) { $output.Add("$pad$line") }
      $output.Add('')
      $footerText = "$($script:OnFrameColors.Muted)● $sucFooter Pressione $($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 230 235 245)[Enter]$($script:OnFrameColors.Reset)$($script:OnFrameColors.Muted) para retornar...$($script:OnFrameColors.Reset)"
      $output.Add("$(Get-OnFrameCenterPadding -ContentWidth (Get-OnFrameDisplayWidth -Text $footerText))$footerText")
      return $output.ToArray()
    }
    Start-OnFrameLiveLoop -RenderCallback $render -NoPause:$NoPause
    return [pscustomobject]@{ Success = $true; Result = $result }
  } catch {
    Show-OnFrameFailureScreen -Message $_.Exception.Message -RecoveryCommand $RecoveryCommand -NoPause:$NoPause
    return [pscustomobject]@{ Success = $false; Error = $_.Exception }
  } finally {
    if ($interactive) { Stop-OnFrameTuiSurface }
    $script:OnFrameCurrentActionType = $null
  }
}

function Resolve-OnFrameInstallRoot {
  param([string]$Root = '')
  if ($Root) { return $Root }
  if ($env:ONFRAME_HOME) { return $env:ONFRAME_HOME }
  return Join-Path $env:LOCALAPPDATA 'OnFrame'
}

function Get-OnFrameServicePort {
  param([string]$Root)
  $path = Join-Path $Root '.env'
  if (Test-Path -LiteralPath $path) {
    $line = Get-Content -LiteralPath $path | Where-Object { $_ -match '^\s*ML_SERVICE_PORT\s*=' } | Select-Object -First 1
    if ($line) {
      $value = ($line -replace '^\s*ML_SERVICE_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")
      if ($value -match '^\d+$') { return [int]$value }
    }
  }
  return 4765
}

function Test-OnFrameServiceHealth {
  param([int]$Port)
  try {
    $s = [System.Net.Sockets.Socket]::new([System.Net.Sockets.AddressFamily]::InterNetwork, [System.Net.Sockets.SocketType]::Stream, [System.Net.Sockets.ProtocolType]::Tcp)
    $s.Blocking = $false
    try { $s.Connect('127.0.0.1', $Port) } catch {}
    $connected = $s.Poll(35000, [System.Net.Sockets.SelectMode]::SelectWrite)
    $s.Close()
    if (-not $connected) { return $false }

    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/health")
    $req.Timeout = 350
    $req.ReadWriteTimeout = 350
    $req.Method = 'GET'
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return ($code -ge 200 -and $code -lt 300)
  } catch {
    return $false
  }
}

function Get-OnFrameNodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $version = (& $cmd.Source -p 'process.versions.node') 2>$null
  if ($version -notmatch '^(\d+)' -or [int]$Matches[1] -lt 20) { return $null }
  return $cmd.Source
}

function New-OnFrameTokenSecret {
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
  param([string]$EnvPath)
  if (-not (Test-Path -LiteralPath $EnvPath)) { return }
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.AddRange([string[]](Get-Content -LiteralPath $EnvPath))
  $index = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*ONBLIDE_TOKEN_SECRET\s*=') {
      $index = $i
      break
    }
  }
  if ($index -ge 0) {
    $value = ($lines[$index] -replace '^\s*ONBLIDE_TOKEN_SECRET\s*=\s*', '').Trim().Trim('"').Trim("'")
    if ($value) { return }
  }
  $secret = New-OnFrameTokenSecret
  if ($index -lt 0) {
    $lines.Add("ONBLIDE_TOKEN_SECRET=$secret")
  } else {
    $lines[$index] = "ONBLIDE_TOKEN_SECRET=$secret"
  }
  Set-Content -LiteralPath $EnvPath -Value $lines -Encoding UTF8
}

function Get-OnFramePortProcessId {
  param([int]$Port)
  try {
    $s = [System.Net.Sockets.Socket]::new([System.Net.Sockets.AddressFamily]::InterNetwork, [System.Net.Sockets.SocketType]::Stream, [System.Net.Sockets.ProtocolType]::Tcp)
    $s.Blocking = $false
    try { $s.Connect('127.0.0.1', $Port) } catch {}
    $connected = $s.Poll(35000, [System.Net.Sockets.SelectMode]::SelectWrite)
    $s.Close()
    if (-not $connected) { return $null }

    $item = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') } |
      Select-Object -First 1
    if ($item -and $item.OwningProcess) {
      return [int]$item.OwningProcess
    }
  } catch {
    # Port query fallback
  }
  return $null
}

function Test-OnFrameServiceProcess {
  param([int]$ProcessId)
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    return [bool]($process.CommandLine -match 'service[\\/]server\.js')
  } catch {
    return $null
  }
}

function Start-OnFrameServiceCore {
  param([string]$Root)

  $installRoot = (Resolve-Path -LiteralPath (Resolve-OnFrameInstallRoot -Root $Root) -ErrorAction Stop).Path
  $serverScript = Join-Path $installRoot 'service/server.js'
  if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    throw 'Os arquivos do serviço local não foram encontrados.'
  }

  $nodeExe = Get-OnFrameNodePath
  if (-not $nodeExe) {
    throw 'Node.js 20 ou superior não foi encontrado no PATH.'
  }

  $envPath = Join-Path $installRoot '.env'
  $envExample = Join-Path $installRoot '.env.example'
  if (-not (Test-Path -LiteralPath $envPath) -and (Test-Path -LiteralPath $envExample)) {
    Copy-Item -LiteralPath $envExample -Destination $envPath
  }
  Ensure-OnFrameTokenSecret -EnvPath $envPath

  $port = Get-OnFrameServicePort -Root $installRoot
  if (Test-OnFrameServiceHealth -Port $port) {
    return [pscustomobject]@{
      AlreadyRunning = $true
      Port           = $port
      ProcessId      = (Get-OnFramePortProcessId -Port $port)
    }
  }

  $runDir = Join-Path $installRoot '.onframe'
  $logsDir = Join-Path $runDir 'logs'
  New-Item -ItemType Directory -Force -Path $runDir, $logsDir | Out-Null

  $outLog = Join-Path $logsDir 'service.out.log'
  $errLog = Join-Path $logsDir 'service.err.log'
  $process = Start-Process -FilePath $nodeExe `
    -ArgumentList @('service/server.js') `
    -WorkingDirectory $installRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath (Join-Path $runDir 'onframe-service.pid') -Value $process.Id -Encoding ASCII

  for ($i = 0; $i -lt 30; $i++) {
    if (Test-OnFrameServiceHealth -Port $port) {
      return [pscustomobject]@{
        AlreadyRunning = $false
        Port           = $port
        ProcessId      = $process.Id
      }
    }
    Start-Sleep -Milliseconds 50
  }

  throw 'O serviço local não respondeu após a inicialização.'
}

function Stop-OnFrameServiceCore {
  param([string]$Root)

  $installRoot = (Resolve-Path -LiteralPath (Resolve-OnFrameInstallRoot -Root $Root) -ErrorAction Stop).Path
  $port = Get-OnFrameServicePort -Root $installRoot
  $pidPath = Join-Path (Join-Path $installRoot '.onframe') 'onframe-service.pid'
  $candidate = $null

  if (Test-Path -LiteralPath $pidPath) {
    $saved = (Get-Content -LiteralPath $pidPath -TotalCount 1).Trim()
    if ($saved -match '^\d+$' -and (Test-OnFrameServiceProcess -ProcessId ([int]$saved))) {
      $candidate = [int]$saved
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }

  if (-not $candidate) {
    $portPid = Get-OnFramePortProcessId -Port $port
    if ($portPid) {
      $isOnFrame = Test-OnFrameServiceProcess -ProcessId $portPid
      if ($isOnFrame -eq $false) {
        throw "A porta $port está sendo usada por outro processo."
      }
      if ($isOnFrame) {
        $candidate = $portPid
      }
    }
  }

  if (-not $candidate) {
    if (Test-OnFrameServiceHealth -Port $port) {
      throw "O serviço na porta $port não pode ser identificado com segurança."
    }
    return [pscustomobject]@{
      AlreadyStopped = $true
      Port           = $port
      ProcessId      = $null
    }
  }

  $process = Get-Process -Id $candidate -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $candidate -Force -ErrorAction Stop
    [void]$process.WaitForExit(300)
  }

  Start-Sleep -Milliseconds 60
  if (Test-OnFrameServiceHealth -Port $port) {
    throw 'O serviço local continua ativo após a tentativa de parada.'
  }

  return [pscustomobject]@{
    AlreadyStopped = $false
    Port           = $port
    ProcessId      = $candidate
  }
}

function Get-OnFrameWorkflowPresentation {
  param([string]$Mode)
  $m = $Mode.ToLowerInvariant()
  if ($m -match 'desinstala|uninstall') {
    return [pscustomobject]@{ Tag = '■ DESINSTALAÇÃO LOCAL'; Subtitle = 'Remoção Segura & Preservação de Dados'; Tone = 'coral' }
  }
  if ($m -match 'atualiza|update') {
    return [pscustomobject]@{ Tag = '↻ ATUALIZAÇÃO LOCAL'; Subtitle = 'Download Seguro & Renovação do Serviço'; Tone = 'amber' }
  }
  return [pscustomobject]@{ Tag = '↓ INSTALAÇÃO LOCAL'; Subtitle = 'Preparação & Inicialização do OnFrame'; Tone = 'brand' }
}

function Start-OnFrameWorkflow {
  param(
    [string]$Mode,
    [int]$Total = 1,
    [string]$RootPath = '',
    [string]$Repository = '',
    [switch]$NoPause
  )

  $p = Get-OnFrameWorkflowPresentation -Mode $Mode
  $isUninstall = ($Mode -match 'desinstala|uninstall')
  $isUpdate = ($Mode -match 'atualiza|update')

  $initialMessage = if ($isUninstall) {
    'Localizando componentes do OnFrame...'
  } elseif ($isUpdate) {
    'Buscando novas atualizações...'
  } else {
    'Preparando o ambiente para você...'
  }

  $initialDetail = if ($isUninstall) {
    'Identificando arquivos, serviços e registros locais.'
  } elseif ($isUpdate) {
    'Conferindo a versão e conectando aos servidores.'
  } else {
    'Conferindo o espaço e organizando tudo com segurança.'
  }

  $initialSection = if ($isUninstall) {
    'LOCALIZANDO'
  } elseif ($isUpdate) {
    'VERIFICANDO'
  } else {
    'PREPARANDO'
  }

  $script:OnFrameCurrentActionType = 'workflow'
  $script:OnFrameCurrentActionMode = $Mode
  $script:OnFrameWorkflow = [ordered]@{
    Mode           = $Mode
    Total          = [Math]::Max(1, $Total)
    Current        = 1
    Section        = $initialSection
    Message        = $initialMessage
    Detail         = $initialDetail
    RootPath       = $RootPath
    Repository     = $Repository
    Tag            = $p.Tag
    Subtitle       = $p.Subtitle
    Tone           = $p.Tone
    Lines          = @()
    NoPause        = [bool]$NoPause
    DisplayPercent = 0.0
    StartTime      = [DateTime]::UtcNow
  }

  if (Test-OnFrameInteractiveConsole) {
    Start-OnFrameTuiSurface | Out-Null
  }
  Show-OnFrameWorkflowFrame -Elapsed 0.0 -Percent 0.0
}

function Show-OnFrameWorkflowFrame {
  param(
    [double]$Elapsed = -1.0,
    [double]$Percent = -1.0
  )
  if (-not $script:OnFrameWorkflow) { return }

  $flow = $script:OnFrameWorkflow
  $cols = Get-OnFrameConsoleWidth
  $cardWidth = [Math]::Min(74, [Math]::Max(56, $cols - 6))
  $cardLeftPad = ' ' * [Math]::Max(0, [int][Math]::Floor(($cols - $cardWidth) / 2))

  $realElapsed = if ($Elapsed -ge 0.0) { $Elapsed } else { ([DateTime]::UtcNow - $flow.StartTime).TotalSeconds }
  $logoLines = Get-OnFrameLargeLogoLines -Elapsed $realElapsed -Mode $flow.Mode -TermWidth $cols

  $spinChar = $script:OnFrameSpinnerFrames[[int]($realElapsed * 30) % $script:OnFrameSpinnerFrames.Count]
  $spinColored = "$($script:OnFrameColors.Muted)$spinChar$($script:OnFrameColors.Reset)"

  $curPercent = if ($Percent -ge 0.0) {
    $Percent
  } elseif ($flow.DisplayPercent -ge 0.0) {
    [double]$flow.DisplayPercent
  } elseif ($flow.Total -gt 0 -and $flow.Current -gt 0) {
    [Math]::Min(100.0, ($flow.Current / $flow.Total) * 100.0)
  } else {
    0.0
  }
  $bar = Get-OnFrameWorkflowGradientBar -Percent $curPercent -Length ([Math]::Max(14, $cardWidth - 32))

  $sec = if ($flow.Section) { $flow.Section } else { 'EM ANDAMENTO' }
  $badgeText = '{0:00}/{1:00} • {2}' -f $flow.Current, $flow.Total, $sec.ToUpperInvariant()

  $isUninstall = ($flow.Mode -match 'desinstala|uninstall')
  $isUpdate = ($flow.Mode -match 'atualiza|update')

  $badgeBg = if ($curPercent -lt 30.0) {
    @(35, 65, 110)
  } elseif ($curPercent -lt 60.0) {
    @(45, 55, 120)
  } elseif ($curPercent -lt 85.0) {
    if ($isUninstall) { @(140, 75, 35) } else { @(40, 85, 130) }
  } else {
    @(160, 85, 30)
  }
  $badge = Get-OnFrameBadge -Text $badgeText -BackgroundRgb $badgeBg

  $actionTitle = if ($isUninstall) {
    'Desinstalação em Andamento'
  } elseif ($isUpdate) {
    'Atualização em Andamento'
  } else {
    'Instalação em Andamento'
  }
  $cardTitle = "$(Get-TrueColorAnsi 237 124 46)◆$($script:OnFrameColors.Reset) $actionTitle"

  $titleText = if ($flow.Message) { $flow.Message } else { 'Processando operação...' }
  $subtitleText = if ($flow.Detail) { $flow.Detail } else { 'Organizando tudo com segurança.' }

  $content = @(
    $badge,
    "$($script:OnFrameColors.Bold)$(Get-TrueColorAnsi 245 248 255)$titleText$($script:OnFrameColors.Reset)",
    "$($script:OnFrameColors.Muted)$subtitleText$($script:OnFrameColors.Reset)",
    '',
    "$spinColored Progresso:  $bar"
  )

  $cardLines = Format-OnFrameCard -Title $cardTitle -Lines $content -Width $cardWidth -BorderRgb @(70, 85, 110)

  $footerText = if ($isUninstall) {
    "$(Get-TrueColorAnsi 100 110 125)Desinstalando com segurança. Seus dados e sistema permanecem protegidos.$($script:OnFrameColors.Reset)"
  } elseif ($isUpdate) {
    "$(Get-TrueColorAnsi 100 110 125)Atualizando com segurança. Suas configurações pessoais serão preservadas.$($script:OnFrameColors.Reset)"
  } else {
    "$(Get-TrueColorAnsi 100 110 125)Sente-se e aproveite. Configuraremos tudo de forma automática para você.$($script:OnFrameColors.Reset)"
  }
  $footerCleanLen = Get-OnFrameDisplayWidth -Text $footerText
  $footerPad = ' ' * [Math]::Max(0, [int][Math]::Floor(($cols - $footerCleanLen) / 2))

  $out = [System.Collections.Generic.List[string]]::new()
  [void]$out.Add('')
  foreach ($l in $logoLines) {
    [void]$out.Add($l)
  }
  [void]$out.Add('')
  foreach ($cl in $cardLines) {
    [void]$out.Add("$cardLeftPad$cl")
  }
  [void]$out.Add('')
  [void]$out.Add("$footerPad$footerText")

  Write-OnFrameTuiFrame -Lines $out.ToArray()
}

function Update-OnFrameWorkflow {
  param(
    [int]$Current,
    [int]$Total,
    [string]$Message,
    [string]$Status = 'running'
  )

  if (-not $script:OnFrameWorkflow) { return $false }
  $script:OnFrameWorkflow.Current = $Current
  $script:OnFrameWorkflow.Total = [Math]::Max(1, $Total)
  $script:OnFrameWorkflow.Message = $Message

  $targetPct = [Math]::Min(100.0, ($Current / [Math]::Max(1, $Total)) * 100.0)
  $startPct = [double]$script:OnFrameWorkflow.DisplayPercent

  if ((-not $script:OnFrameWorkflow.NoPause) -and (Test-OnFrameInteractiveConsole)) {
    $animStart = [DateTime]::UtcNow
    $animDurationMs = 850.0
    do {
      $now = [DateTime]::UtcNow
      $t = [Math]::Min(1.0, ($now - $animStart).TotalMilliseconds / $animDurationMs)
      $eased = 1.0 - [Math]::Pow(1.0 - $t, 3)
      $curPct = $startPct + ($targetPct - $startPct) * $eased
      $script:OnFrameWorkflow.DisplayPercent = $curPct
      $elapsed = ($now - $script:OnFrameWorkflow.StartTime).TotalSeconds
      Show-OnFrameWorkflowFrame -Elapsed $elapsed -Percent $curPct
      Start-Sleep -Milliseconds 33
    } while (([DateTime]::UtcNow - $animStart).TotalMilliseconds -lt $animDurationMs)
    $script:OnFrameWorkflow.DisplayPercent = $targetPct
  } else {
    $script:OnFrameWorkflow.DisplayPercent = $targetPct
    Show-OnFrameWorkflowFrame -Elapsed 0.0 -Percent $targetPct
  }
  return $true
}

function Add-OnFrameWorkflowDetail {
  param(
    [string]$Message,
    [string]$Type = 'info'
  )

  if (-not $script:OnFrameWorkflow) { return $false }
  $script:OnFrameWorkflow.Detail = $Message

  if ((-not $script:OnFrameWorkflow.NoPause) -and (Test-OnFrameInteractiveConsole)) {
    $animStart = [DateTime]::UtcNow
    $detailDurationMs = 650.0
    do {
      $now = [DateTime]::UtcNow
      $elapsed = ($now - $script:OnFrameWorkflow.StartTime).TotalSeconds
      Show-OnFrameWorkflowFrame -Elapsed $elapsed -Percent ([double]$script:OnFrameWorkflow.DisplayPercent)
      Start-Sleep -Milliseconds 33
    } while (([DateTime]::UtcNow - $animStart).TotalMilliseconds -lt $detailDurationMs)
  } else {
    Show-OnFrameWorkflowFrame -Elapsed 0.0 -Percent ([double]$script:OnFrameWorkflow.DisplayPercent)
  }
  return $true
}

function Expand-OnFrameArchive {
  param(
    [Parameter(Mandatory=$true)][string]$ZipPath,
    [Parameter(Mandatory=$true)][string]$DestinationPath
  )
  $ProgressPreference = 'SilentlyContinue'
  $global:ProgressPreference = 'SilentlyContinue'
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestinationPath)
  } catch {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $DestinationPath -Force
  }
}

function Invoke-OnFrameAnimatedDownload {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][string]$OutFile,
    [double]$TargetPercent = 48.0,
    [int]$TimeoutSec = 120
  )
  $ProgressPreference = 'SilentlyContinue'
  $global:ProgressPreference = 'SilentlyContinue'
  $startPct = if ($script:OnFrameWorkflow -and $script:OnFrameWorkflow.DisplayPercent) { [double]$script:OnFrameWorkflow.DisplayPercent } else { 25.0 }

  $wc = [System.Net.WebClient]::new()
  $wc.Headers.Add('User-Agent', 'onframe-bootstrap-installer')
  if ($env:GITHUB_TOKEN) { $wc.Headers.Add('Authorization', "Bearer $env:GITHUB_TOKEN") }
  elseif ($env:GH_TOKEN) { $wc.Headers.Add('Authorization', "Bearer $env:GH_TOKEN") }

  $task = $wc.DownloadFileTaskAsync($Uri, $OutFile)
  $downloadStart = [DateTime]::UtcNow

  if ($script:OnFrameWorkflow -and (-not $script:OnFrameWorkflow.NoPause) -and (Test-OnFrameInteractiveConsole)) {
    $minDlDuration = 1.8
    while ((-not $task.IsCompleted) -or (([DateTime]::UtcNow - $downloadStart).TotalSeconds -lt $minDlDuration)) {
      $now = [DateTime]::UtcNow
      $elapsed = ($now - $script:OnFrameWorkflow.StartTime).TotalSeconds
      $dlSeconds = ($now - $downloadStart).TotalSeconds
      $factor = [Math]::Min(1.0, $dlSeconds / $minDlDuration)
      $eased = 1.0 - [Math]::Pow(1.0 - $factor, 2)
      $curPct = $startPct + ($TargetPercent - $startPct) * $eased
      $script:OnFrameWorkflow.DisplayPercent = $curPct
      Show-OnFrameWorkflowFrame -Elapsed $elapsed -Percent $curPct
      Start-Sleep -Milliseconds 33
    }
  } else {
    $task.Wait()
  }

  if ($task.IsFaulted) {
    $msg = if ($task.Exception.InnerException) { $task.Exception.InnerException.Message } else { $task.Exception.Message }
    throw "Falha no download: $msg"
  }
}

function Complete-OnFrameWorkflow {
  param(
    [string]$Title,
    [string[]]$Lines = @()
  )

  if (-not $script:OnFrameWorkflow) { return $false }
  $flow = $script:OnFrameWorkflow

  $render = {
    param($elapsed, $notice)
    $cols = Get-OnFrameConsoleWidth
    $cardWidth = [Math]::Min(74, [Math]::Max(56, $cols - 6))
    $cardLeftPad = ' ' * [Math]::Max(0, [int][Math]::Floor(($cols - $cardWidth) / 2))

    $logoLines = Get-OnFrameLargeLogoLines -Elapsed $elapsed -Mode $flow.Mode -TermWidth $cols

    $isUninstall = ($flow.Mode -match 'desinstala|uninstall')
    $isUpdate = ($flow.Mode -match 'atualiza|update')

    $successBadge = if ($isUninstall) {
      Get-OnFrameBadge -Text '✔ DESINSTALADO COM SUCESSO' -BackgroundRgb @(119, 158, 61)
    } elseif ($isUpdate) {
      Get-OnFrameBadge -Text '✔ ATUALIZADO COM SUCESSO' -BackgroundRgb @(119, 158, 61)
    } else {
      Get-OnFrameBadge -Text '✔ CONCLUÍDO COM SUCESSO' -BackgroundRgb @(119, 158, 61)
    }

    $finalBar = Get-OnFrameWorkflowGradientBar -Percent 100.0 -Length ([Math]::Max(14, $cardWidth - 32))

    $greenAnsi = Get-TrueColorAnsi 119 158 61
    $bold = $script:OnFrameColors.Bold
    $reset = $script:OnFrameColors.Reset
    $muted = $script:OnFrameColors.Muted
    $whiteBright = Get-TrueColorAnsi 245 255 250

    $cardTitle = if ($isUninstall) {
      "${greenAnsi}✔$reset Desinstalação Concluída"
    } elseif ($isUpdate) {
      "${greenAnsi}✔$reset Atualização Concluída"
    } else {
      "${greenAnsi}✔$reset Instalação Completa"
    }

    $successTitle = if ($isUninstall) {
      "${bold}${whiteBright}O OnFrame foi desinstalado com sucesso.$reset"
    } elseif ($isUpdate) {
      "${bold}${whiteBright}Tudo pronto! O OnFrame foi atualizado.$reset"
    } else {
      "${bold}${whiteBright}Tudo pronto! Os arquivos do OnFrame estão preparados.$reset"
    }

    $successSubtitle = if ($isUninstall) {
      "${muted}Dica: No navegador, clique em Remover na extensão.$reset"
    } elseif ($isUpdate) {
      "${muted}Dica: No navegador, basta clicar em ↻ Recarregar na extensão.$reset"
    } else {
      "${muted}A extensão descompactada está pronta para carregar.$reset"
    }

    $bullets = [System.Collections.Generic.List[string]]::new()
    if ($isUninstall) {
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Arquivos locais:$reset Pasta do aplicativo removida")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Serviço local:$reset Processos encerrados com sucesso")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Navegadores:$reset Extensão pronta para ser removida")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Sistema:$reset Ambiente limpo e sem arquivos residuais")
    } elseif ($isUpdate) {
      $ver = ''
      foreach ($l in $Lines) {
        if ($l -match 'Versao:\s*(.*)') { $ver = $Matches[1] }
      }
      $verDisplay = if ($ver) { $ver } else { (Get-OnFrameProjectVersion) }
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Versão atual:$reset $verDisplay")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Suas configurações:$reset 100% preservadas e intactas")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Extensão local:$reset Pasta atualizada e pronta")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Serviço local:$reset Reiniciado e em execução")
    } else {
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Extensão:$reset Pasta pronta (sem empacotamento)")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Navegadores:$reset Google Chrome e Microsoft Edge")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Requisito:$reset Ativar o ${bold}Modo de Desenvolvedor$reset")
      [void]$bullets.Add("   ${greenAnsi}●$reset ${bold}Serviço local:$reset Em execução em segundo plano")
    }

    $content = @(
      $successBadge,
      $successTitle,
      $successSubtitle,
      ''
    ) + $bullets.ToArray() + @(
      '',
      "${greenAnsi}✔$reset Status final:  $finalBar"
    )

    $cardLines = Format-OnFrameCard -Title $cardTitle -Lines $content -Width $cardWidth -BorderRgb @(119, 158, 61)

    $actionName = if ($isUninstall) { 'Desinstalação' } elseif ($isUpdate) { 'Atualização' } else { 'Instalação' }
    $enterKey = "${bold}$(Get-TrueColorAnsi 230 235 245)[Enter]$reset"
    $footerCol = Get-TrueColorAnsi 130 140 155
    $footerText = if ($notice) {
      "${greenAnsi}$notice$reset"
    } else {
      "${footerCol}● $actionName concluída. Pressione $enterKey${footerCol} para retornar...$reset"
    }
    $footerCleanLen = Get-OnFrameDisplayWidth -Text $footerText
    $footerPad = ' ' * [Math]::Max(0, [int][Math]::Floor(($cols - $footerCleanLen) / 2))

    $out = [System.Collections.Generic.List[string]]::new()
    [void]$out.Add('')
    foreach ($l in $logoLines) {
      [void]$out.Add($l)
    }
    [void]$out.Add('')
    foreach ($cl in $cardLines) {
      [void]$out.Add("$cardLeftPad$cl")
    }
    [void]$out.Add('')
    [void]$out.Add("$footerPad$footerText")

    return $out.ToArray()
  }

  try {
    Start-OnFrameLiveLoop -RenderCallback $render -NoPause:$flow.NoPause
  } finally {
    Stop-OnFrameTuiSurface
    $script:OnFrameWorkflow = $null
  }
  return $true
}

function Fail-OnFrameWorkflow {
  param([string]$Message)
  if (-not $script:OnFrameWorkflow) { return $false }
  $flow = $script:OnFrameWorkflow
  try {
    Show-OnFrameFailureScreen -Message $Message -RecoveryCommand "& '$($flow.RootPath)\scripts\bootstrap\check.ps1' -Root '$($flow.RootPath)'" -Mode $flow.Mode -LargeLogo -NoPause:$flow.NoPause
  } finally {
    Stop-OnFrameTuiSurface
    $script:OnFrameWorkflow = $null
    $script:OnFrameCurrentActionType = $null
  }
  return $true
}
