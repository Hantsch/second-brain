/* The run-report hook Gaston installs as .claude/hooks/gaston-run-report.ps1. Windows
 * PowerShell 5.1 reads a BOM-less script as ANSI, so the body stays pure ASCII. It is a
 * String.raw literal: the PowerShell holds no backtick and no dollar-brace. It records and
 * never guards: it writes nothing to stdout (UserPromptSubmit would hand that to the agent as
 * context), never exits 2, and any internal error exits 0 silently. */

export const RUN_REPORT_BODY = String.raw`# Gaston run report for Claude Code (Windows PowerShell 5.1).
# A run starts when a Gaston skill starts and ends at the next user prompt; nested Gaston skills
# belong to the run that is already open, so one run leaves exactly one report.
# Hook input on stdin (code.claude.com/docs/en/hooks): every event carries hook_event_name,
# session_id and cwd.
# UserPromptSubmit: prompt, the line as the user typed it (a skill arrives as "/name args", not
#   expanded). It closes the open run, and opens one when the prompt starts a Gaston skill.
# PostToolUse with tool_name Skill: tool_input names the skill. The docs do not list the Skill
#   tool's fields, so tool_input.skill, .command and .name are all accepted, with or without a
#   leading slash, and the argument comes from tool_input.args or the word after the name. Opens a
#   run only when none is open.
# Stop (stop_hook_active true on a stop-hook continuation): while a run is open, every Stop
#   rewrites the run's one report, so the last write carries the run's end.
# What changed is read from disk (last write >= run start), so shell writes count too. The session
# ledger in the temp folder holds only the open run: skill, argument, start, report file name.
# The prompt is the user's text: only a slug argument is kept, never the prompt itself.
$ErrorActionPreference = 'Stop'
try {
  $Utf8 = [System.Text.UTF8Encoding]::new($false)
  $Invariant = [Globalization.CultureInfo]::InvariantCulture
  $LF = [string][char]10
  $Root = Split-Path (Split-Path $PSScriptRoot)
  $Skills = @('gaston-jobs', 'gaston-curate', 'gaston-propose')
  # RUN_REPORTS_KEPT in src/shared/types/agent-setup.ts.
  $Kept = 50

  # The Gaston skill a name means ('/gaston-curate' or 'gaston-curate'), or '' for any other.
  function Get-Skill([string]$name) {
    $bare = $name.Trim().TrimStart('/')
    if ($Skills -ccontains $bare) { return $bare }
    return ''
  }

  # A slug argument, or '' for anything else: free text from the prompt never reaches a file.
  function Get-Argument([string]$word) {
    if ($word -cmatch '^[a-z0-9-]{1,64}$') { return $word }
    return ''
  }

  function Open-Run([string]$file, [string]$skill, [string]$argument) {
    $run = @{ skill = $skill; argument = $argument; startTicks = [string][DateTime]::UtcNow.Ticks; report = '' }
    [IO.File]::WriteAllText($file, ($run | ConvertTo-Json -Compress), $Utf8)
  }

  # A YAML string in single quotes: a page path or id never turns into a number, list or key.
  function Quote([string]$text) {
    return ("'" + $text.Replace("'", "''") + "'")
  }

  function ConvertTo-YamlList($items) {
    $quoted = @()
    foreach ($item in @($items | Sort-Object)) { $quoted += (Quote $item) }
    return ('[' + ($quoted -join ', ') + ']')
  }

  # Files directly in a folder (or below it) last written at or after the run's start.
  function Get-Changed([string]$dir, [DateTime]$since, [bool]$deep) {
    $found = New-Object System.Collections.Generic.List[string]
    if (-not [IO.Directory]::Exists($dir)) { return ,$found }
    $option = [IO.SearchOption]::TopDirectoryOnly
    if ($deep) { $option = [IO.SearchOption]::AllDirectories }
    foreach ($file in [IO.Directory]::GetFiles($dir, '*', $option)) {
      if ([IO.File]::GetLastWriteTimeUtc($file) -ge $since) { $found.Add($file) }
    }
    return ,$found
  }

  # The status line of a result's frontmatter, or '' when there is none.
  function Get-MarkdownStatus([string]$file) {
    $lines = [IO.File]::ReadAllLines($file, $Utf8)
    if ($lines.Count -eq 0 -or $lines[0].TrimEnd() -ne '---') { return '' }
    for ($i = 1; $i -lt $lines.Count; $i++) {
      if ($lines[$i].TrimEnd() -eq '---') { return '' }
      if ($lines[$i] -cmatch '^status:(.*)$') {
        return (($matches[1] -replace '\s+#.*$', '').Trim() -replace '^[''"]|[''"]$', '')
      }
    }
    return ''
  }

  # Read as UTF-8 bytes: a hook process may have no console whose input encoding could be set.
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), $Utf8)
  $hookInput = $reader.ReadToEnd() | ConvertFrom-Json
  $eventName = [string]$hookInput.hook_event_name
  $sessionId = ([string]$hookInput.session_id) -replace '[^A-Za-z0-9-]', ''
  if ($sessionId -eq '') { $sessionId = 'nosession' }
  $ledgerFile = Join-Path ([IO.Path]::GetTempPath()) ('gaston-run-' + $sessionId + '.json')

  if ($eventName -eq 'UserPromptSubmit') {
    if ([IO.File]::Exists($ledgerFile)) { Remove-Item -LiteralPath $ledgerFile -Force }
    $words = @(([string]$hookInput.prompt).Trim() -split '\s+', 3)
    if (-not $words[0].StartsWith('/')) { exit 0 }
    $skill = Get-Skill $words[0]
    if ($skill -eq '') { exit 0 }
    $argument = ''
    if ($words.Count -gt 1) { $argument = Get-Argument $words[1] }
    Open-Run $ledgerFile $skill $argument
    exit 0
  }

  if ($eventName -eq 'PostToolUse') {
    if ([string]$hookInput.tool_name -ne 'Skill') { exit 0 }
    if ([IO.File]::Exists($ledgerFile)) { exit 0 }
    $toolInput = $hookInput.tool_input
    $name = [string]$toolInput.skill
    if ($name -eq '') { $name = [string]$toolInput.command }
    if ($name -eq '') { $name = [string]$toolInput.name }
    $words = @($name.Trim() -split '\s+', 3)
    $skill = Get-Skill $words[0]
    if ($skill -eq '') { exit 0 }
    $argText = ([string]$toolInput.args).Trim()
    if ($argText -eq '' -and $words.Count -gt 1) { $argText = $words[1] }
    $argWords = @($argText -split '\s+')
    Open-Run $ledgerFile $skill (Get-Argument $argWords[0])
    exit 0
  }

  if ($eventName -ne 'Stop') { exit 0 }
  if (-not [IO.File]::Exists($ledgerFile)) { exit 0 }
  $run = [IO.File]::ReadAllText($ledgerFile, $Utf8) | ConvertFrom-Json
  $skill = Get-Skill ([string]$run.skill)
  if ($skill -eq '') { exit 0 }
  $argument = Get-Argument ([string]$run.argument)
  $start = [DateTime]::new([long]::Parse([string]$run.startTicks, $Invariant), [DateTimeKind]::Utc)
  $runsDir = Join-Path $Root '.secondbrain/agent/runs'
  [void][IO.Directory]::CreateDirectory($runsDir)

  # The file name is fixed at the run's first Stop, so later Stops rewrite the same report.
  $reportName = [string]$run.report
  if ($reportName -notmatch '^[0-9TZ]+-[a-z-]+(-\d+)?\.md$') {
    $base = $start.ToString("yyyyMMdd'T'HHmmss'Z'", $Invariant) + '-' + $skill
    $reportName = $base + '.md'
    $n = 2
    while ([IO.File]::Exists((Join-Path $runsDir $reportName))) {
      $reportName = $base + '-' + $n + '.md'
      $n++
    }
    $saved = @{ skill = $skill; argument = $argument; startTicks = [string]$start.Ticks; report = $reportName }
    [IO.File]::WriteAllText($ledgerFile, ($saved | ConvertTo-Json -Compress), $Utf8)
  }

  # Wiki pages as vault-relative paths; each module's log.md is bookkeeping, not a page.
  $pages = @()
  $modulesDir = Join-Path $Root 'modules'
  if ([IO.Directory]::Exists($modulesDir)) {
    foreach ($moduleDir in [IO.Directory]::GetDirectories($modulesDir)) {
      $wikiDir = Join-Path $moduleDir 'wiki'
      foreach ($file in (Get-Changed $wikiDir $start $true)) {
        $inWiki = $file.Substring($wikiDir.Length).TrimStart('\', '/').Replace('\', '/')
        if (-not $inWiki.EndsWith('.md', [StringComparison]::OrdinalIgnoreCase)) { continue }
        if ($inWiki -ieq 'log.md') { continue }
        $pages += ('modules/' + [IO.Path]::GetFileName($moduleDir) + '/wiki/' + $inWiki)
      }
    }
  }

  $proposals = @()
  foreach ($file in (Get-Changed (Join-Path $Root '.secondbrain/agent/proposals') $start $false)) {
    if ($file.EndsWith('.md', [StringComparison]::OrdinalIgnoreCase)) { $proposals += [IO.Path]::GetFileName($file) }
  }

  # A result that cannot be read yet is left out rather than losing the whole report.
  $jobs = @{ done = @(); failed = @(); skipped = @() }
  foreach ($file in (Get-Changed (Join-Path $Root '.secondbrain/agent/results') $start $false)) {
    $status = ''
    try {
      if ($file.EndsWith('.json', [StringComparison]::OrdinalIgnoreCase)) {
        $status = [string]([IO.File]::ReadAllText($file, $Utf8) | ConvertFrom-Json).status
      } elseif ($file.EndsWith('.md', [StringComparison]::OrdinalIgnoreCase)) {
        $status = Get-MarkdownStatus $file
      }
    } catch {
      $status = ''
    }
    # Hashtable keys ignore case; Gaston's job reader does not.
    if (@('done', 'failed', 'skipped') -ccontains $status) { $jobs[$status] += [IO.Path]::GetFileNameWithoutExtension($file) }
  }

  $stamp = "yyyy-MM-dd'T'HH:mm:ss'Z'"
  $lines = @('---', 'gaston: run-report', 'version: 1', ('skill: ' + $skill))
  if ($argument -ne '') { $lines += ('argument: ' + (Quote $argument)) }
  $lines += @(
    ('started: ' + $start.ToString($stamp, $Invariant)),
    ('finished: ' + [DateTime]::UtcNow.ToString($stamp, $Invariant)),
    ('pages: ' + (ConvertTo-YamlList $pages)),
    ('proposals: ' + (ConvertTo-YamlList $proposals)),
    ('jobsDone: ' + (ConvertTo-YamlList $jobs['done'])),
    ('jobsFailed: ' + (ConvertTo-YamlList $jobs['failed'])),
    ('jobsSkipped: ' + (ConvertTo-YamlList $jobs['skipped'])),
    '---'
  )
  [IO.File]::WriteAllText((Join-Path $runsDir $reportName), (($lines -join $LF) + $LF), $Utf8)

  # Names sort by start time, so the oldest reports are the first names.
  $reports = @([IO.Directory]::GetFiles($runsDir, '*.md') | ForEach-Object { [IO.Path]::GetFileName($_) } | Where-Object { $_.EndsWith('.md', [StringComparison]::OrdinalIgnoreCase) })
  [Array]::Sort($reports, [StringComparer]::Ordinal)
  for ($i = 0; $i -lt $reports.Count - $Kept; $i++) {
    Remove-Item -LiteralPath (Join-Path $runsDir $reports[$i]) -Force
  }
  exit 0
} catch {
  exit 0
}
`;
