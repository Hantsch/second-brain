# Gaston wiki check for Claude Code (Windows PowerShell 5.1).
# PostToolUse: a wiki page under modules/<slug>/wiki/ must carry the schema's frontmatter.
# Stop: a module whose wiki changed in this session must have a new heading in its wiki/log.md.
# Input: the hook JSON on stdin. Exit 2 with the reason on stderr reports it to the agent; exit 0
# with no output stays silent. This is a report, not a guard: any internal error exits 0.
# The vault root is two folders above this script. The session ledger in the temp folder holds
# only paths and counts, never page content.
$ErrorActionPreference = 'Stop'
try {
  $Utf8 = [System.Text.UTF8Encoding]::new($false)
  $Required = @('type', 'title', 'module', 'created', 'updated', 'tags', 'sources')
  $PageTypes = @('source', 'entity', 'concept', 'overview')
  $Root = Split-Path (Split-Path $PSScriptRoot)

  function Report([string]$text) {
    [Console]::Error.WriteLine($text)
    exit 2
  }

  # Dated headings in wiki/log.md: one per entry, 0 when the log does not exist yet.
  function Count-Headings([string]$slug) {
    $log = Join-Path $Root ('modules/' + $slug + '/wiki/log.md')
    if (-not [IO.File]::Exists($log)) { return 0 }
    $n = 0
    foreach ($line in [IO.File]::ReadAllLines($log, $Utf8)) {
      if ($line -match '^##\s*\[\d{4}-\d{2}-\d{2}\]') { $n++ }
    }
    return $n
  }

  function Load-Ledger([string]$file) {
    $ledger = @{}
    if (-not [IO.File]::Exists($file)) { return $ledger }
    $saved = [IO.File]::ReadAllText($file, $Utf8) | ConvertFrom-Json
    foreach ($prop in $saved.PSObject.Properties) {
      $ledger[$prop.Name] = @{ baseline = [int]$prop.Value.baseline; logWritten = [bool]$prop.Value.logWritten; pages = @($prop.Value.pages) }
    }
    return $ledger
  }

  function Save-Ledger([string]$file, $ledger) {
    $out = @{}
    foreach ($slug in $ledger.Keys) {
      $m = $ledger[$slug]
      $out[$slug] = @{ baseline = [int]$m.baseline; logWritten = [bool]$m.logWritten; pages = [string[]]@($m.pages) }
    }
    [IO.File]::WriteAllText($file, ($out | ConvertTo-Json -Depth 4 -Compress), $Utf8)
  }

  # The first thing wrong with a page's frontmatter, or $null when it is valid.
  function Get-FrontmatterProblem([string]$file) {
    $lines = [IO.File]::ReadAllLines($file, $Utf8)
    if ($lines.Count -eq 0 -or $lines[0].TrimEnd() -ne '---') { return 'the file does not start with a --- line' }
    $close = -1
    for ($i = 1; $i -lt $lines.Count; $i++) {
      if ($lines[$i].TrimEnd() -eq '---') { $close = $i; break }
    }
    if ($close -lt 0) { return 'the closing --- line is missing' }
    $keys = @{}
    $typeValue = ''
    for ($i = 1; $i -lt $close; $i++) {
      $line = $lines[$i]
      if ($line -match '^\s*$') { continue }
      if ($line -cmatch '^([A-Za-z_][\w-]*):') {
        $name = $matches[1]
        $keys[$name] = $true
        if ($name -ceq 'type') {
          $value = ($line.Substring(5) -replace '\s+#.*$', '').Trim()
          $typeValue = $value -replace '^[''"]|[''"]$', ''
        }
        continue
      }
      if ($line -match '^\s+' -or $line -match '^-\s') { continue }
      return ('line ' + ($i + 1) + ' is not a key: value pair')
    }
    foreach ($key in $Required) {
      if (-not $keys.ContainsKey($key)) { return ('the key ' + $key + ' is missing') }
    }
    if ($PageTypes -cnotcontains $typeValue) { return ('type ' + $typeValue + ' is not one of ' + ($PageTypes -join ', ')) }
    return $null
  }

  # Read as UTF-8 bytes: a hook process may have no console whose input encoding could be set.
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), $Utf8)
  $hookInput = $reader.ReadToEnd() | ConvertFrom-Json
  $eventName = [string]$hookInput.hook_event_name
  $sessionId = ([string]$hookInput.session_id) -replace '[^A-Za-z0-9-]', ''
  if ($sessionId -eq '') { $sessionId = 'nosession' }
  $ledgerFile = Join-Path ([IO.Path]::GetTempPath()) ('gaston-wiki-' + $sessionId + '.json')

  if ($eventName -eq 'Stop') {
    if ($hookInput.stop_hook_active -eq $true) { exit 0 }
    if (-not [IO.File]::Exists($ledgerFile)) { exit 0 }
    $ledger = Load-Ledger $ledgerFile
    $reports = @()
    foreach ($slug in @($ledger.Keys | Sort-Object)) {
      $m = $ledger[$slug]
      if ($m.logWritten -or (Count-Headings $slug) -gt $m.baseline) { continue }
      $reports += ('Gaston wiki check: modules/' + $slug + '/wiki changed (' + ($m.pages -join ', ') + ') without a new entry in wiki/log.md.')
    }
    Remove-Item -LiteralPath $ledgerFile -Force
    if ($reports.Count -gt 0) { Report ($reports -join [Environment]::NewLine) }
    exit 0
  }
  if ($eventName -ne 'PostToolUse') { exit 0 }

  # Quotes and backslashes never change which file a path names; Windows compares case-insensitively.
  $path = ([string]$hookInput.tool_input.file_path -replace '[''"]', '').Replace('\', '/')
  if ($path -eq '') { exit 0 }
  $rootPath = $Root.Replace('\', '/').TrimEnd('/')
  if ($path -notmatch '^([A-Za-z]:|/)') {
    $base = ([string]$hookInput.cwd -replace '[''"]', '').Replace('\', '/').TrimEnd('/')
    if ($base -eq '') { $base = $rootPath }
    $path = $base + '/' + ($path -replace '^\./', '')
  }
  $rootLow = $rootPath.ToLowerInvariant()
  $low = $path.ToLowerInvariant()
  if (-not $low.StartsWith($rootLow + '/', [StringComparison]::Ordinal)) { exit 0 }
  $rel = $path.Substring($rootLow.Length + 1)
  $relLow = $low.Substring($rootLow.Length + 1)
  if ($relLow -match '(^|/)\.\.(/|$)') { exit 0 }
  if ($relLow -notmatch '^modules/([^/]+)/wiki/(.+\.md)$') { exit 0 }
  $slug = $matches[1]
  $inWikiLow = $matches[2]
  $inWiki = $rel.Substring(('modules/' + $slug + '/wiki/').Length)

  $ledger = Load-Ledger $ledgerFile
  if (-not $ledger.ContainsKey($slug)) {
    $ledger[$slug] = @{ baseline = (Count-Headings $slug); logWritten = $false; pages = @() }
  }
  $module = $ledger[$slug]
  if ($inWikiLow -eq 'log.md') {
    $module.logWritten = $true
    Save-Ledger $ledgerFile $ledger
    exit 0
  }
  if ($module.pages -notcontains $inWiki) { $module.pages = @($module.pages) + $inWiki }
  Save-Ledger $ledgerFile $ledger

  if ($inWikiLow -eq 'index.md') { exit 0 }
  $file = Join-Path $Root $rel
  if (-not [IO.File]::Exists($file)) { exit 0 }
  $problem = Get-FrontmatterProblem $file
  if ($null -ne $problem) { Report ('Gaston wiki check: ' + $rel + ' has invalid frontmatter (' + $problem + ').') }
  exit 0
} catch {
  exit 0
}
