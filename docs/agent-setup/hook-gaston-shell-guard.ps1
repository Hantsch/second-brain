# Gaston pre-tool guard for Claude Code (Windows PowerShell 5.1).
# Input: the hook JSON on stdin. Exit 2 with a one-line reason on stderr blocks the tool call;
# exit 0 with no output allows it. Every error blocks: a false block costs the agent one retry,
# a false allow can send the journal to a cloud model. The guard narrows what the agent does by
# accident; it is not a sandbox (variables and scripts that open files themselves get past it).
# Paths are compared lower-case with forward slashes, segment by segment, against the vault root
# two folders above this script - never against CLAUDE_PROJECT_DIR alone.
$ErrorActionPreference = 'Stop'
try {
  $BT = [string][char]96
  $ReasonJournal = 'Blocked by Gaston: the journal and its derived index are not readable for the agent.'
  $ReasonRecursive = 'Blocked by Gaston: a recursive search, listing, copy or git history dump from the vault root or above reaches the journal and its derived index; scope it to a folder such as modules/.'
  $ReasonDynamic = 'Blocked by Gaston: an encoded or dynamic command cannot be checked.'
  $ReasonNested = 'Blocked by Gaston: shells nested more than three deep cannot be checked.'
  $ReasonRaw = 'Blocked by Gaston: raw/ is read-only; this command may change it.'
  $ReasonSetup = 'Blocked by Gaston: .claude/ and CLAUDE.md are read-only for the agent; this command may change them.'
  $ReasonRoot = 'Blocked by Gaston: this command may change raw/ or the agent setup; run it on a folder such as modules/.'
  $ReasonWrite = 'Write outside the wiki layer: use /gaston-propose.'
  $AgentWritable = @('.secondbrain/agent/results', '.secondbrain/agent/proposals', '.secondbrain/agent/runs')
  $NamesJournal = @('journal')
  $InternalSecret = @('.secondbrain/index', '.secondbrain/chats')
  $NamesProtected = @('raw', '.claude', 'claude.md')

  $WRAP = @('time', 'nohup', 'sudo', 'env', 'command', 'builtin', 'exec', 'xargs', 'nice', 'ionice', 'timeout', 'stdbuf', 'doas', 'unbuffer', 'call', 'start', 'watch', 'winpty', 'busybox', 'parallel', 'start-process', 'saps', 'start-job', 'sajb', 'start-threadjob', 'invoke-command', 'icm')
  $SHELLS = @('bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'wsl', 'cmd', 'powershell', 'pwsh')
  $EVALS = @('eval', 'iex', 'invoke-expression')
  $CDS = @('cd', 'chdir', 'set-location', 'sl', 'pushd', 'push-location')
  $GREPS = @('grep', 'egrep', 'fgrep', 'ugrep', 'ug', 'rg', 'ag', 'ack', 'findstr')
  $ALWAYS = @('rg', 'ag', 'ack', 'tar', 'zip', '7z', '7za', 'rsync', 'robocopy', 'xcopy', 'compress-archive', 'rclone', 'fd', 'fdfind')
  $COPIES = @('cp', 'copy', 'cpi', 'copy-item', 'scp')
  $SEARCHVERBS = $GREPS + $ALWAYS + $COPIES + @('git', 'find', 'ls', 'dir', 'gci', 'get-childitem', 'for', 'forfiles')
  $CMDVERBS = @('dir', 'findstr', 'robocopy', 'xcopy', 'del', 'erase', 'rd', 'rmdir', 'attrib', 'copy', 'move', 'type', 'for', 'forfiles', 'tree')
  $LISTERS = @('ls', 'dir', 'gci', 'get-childitem', 'get-item', 'gi', 'resolve-path', 'rvpa')
  $FILTERS = @('head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'sort', 'uniq', 'wc', 'cut', 'tr', 'less', 'more', 'select-object', 'select', 'where-object', 'where', '?', 'sort-object', 'format-list', 'fl', 'format-table', 'ft', 'format-wide', 'fw', 'out-string', 'measure-object', 'measure', 'out-host', 'write-output', 'findstr', 'convertto-json', 'convertto-csv', 'group-object', 'group')
  $GITWRITES = @('clean', 'checkout', 'restore', 'reset', 'stash', 'switch')
  $GITDUMPS = @('diff', 'diff-tree', 'diff-index', 'diff-files', 'difftool', 'range-diff', 'show', 'blame', 'annotate', 'cat-file', 'archive', 'format-patch', 'bundle', 'fast-export')
  $GITPATCHES = @('log', 'whatchanged', 'reflog', 'stash')
  $PSVALUE = @('filter', 'include', 'exclude', 'depth', 'attributes', 'erroraction', 'ea', 'warningaction', 'wa', 'errorvariable', 'ev', 'outvariable', 'ov', 'pipelinevariable', 'pv', 'outbuffer', 'ob', 'informationaction', 'infa', 'informationvariable', 'iv', 'encoding', 'destinationpath', 'compressionlevel', 'totalcount', 'tail', 'first', 'last', 'skip', 'pattern', 'value', 'delimiter', 'readcount', 'stream')
  $PSPATH = @('path', 'literalpath', 'pspath', 'destination')
  $NOVAL = @('--recursive', '--dereference-recursive', '--line-number', '--ignore-case', '--files-with-matches', '--files-without-match', '--count', '--word-regexp', '--line-regexp', '--fixed-strings', '--extended-regexp', '--perl-regexp', '--basic-regexp', '--no-filename', '--with-filename', '--hidden', '--no-ignore', '--files', '--invert-match', '--only-matching', '--quiet', '--silent', '--smart-case', '--follow', '--no-messages', '--null', '--text', '--binary', '--json', '--vimgrep', '--heading', '--no-heading', '--archive', '--verbose', '--force', '--parents', '--no-clobber', '--update')
  $READONLY = @('cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'wc', 'ls', 'file', 'stat', 'diff', 'cmp', 'sort', 'uniq', 'cut', 'tr', 'echo', 'printf', 'pwd', 'cd', 'md5sum', 'sha1sum', 'sha256sum', 'test', '[', 'find', 'get-content', 'gc', 'type', 'select-string', 'sls', 'get-childitem', 'gci', 'dir', 'get-item', 'gi', 'get-filehash', 'measure-object', 'measure', 'test-path', 'resolve-path', 'select-object', 'select', 'sort-object', 'where-object', 'where', '?', 'foreach-object', '%', 'format-list', 'fl', 'format-table', 'ft', 'out-string', 'write-output', 'write', 'convertfrom-json', 'set-location', 'sl', 'get-location', 'push-location', 'pop-location', 'pushd', 'popd', 'chdir', 'findstr')

  $HomeDir = ''
  if ($env:USERPROFILE) { $HomeDir = $env:USERPROFILE.Replace('\', '/').ToLowerInvariant().TrimEnd('/') }

  function Block([string]$reason) {
    [Console]::Error.WriteLine($reason)
    exit 2
  }

  function Get-Str($obj, [string]$name) {
    $prop = $obj.PSObject.Properties[$name]
    if ($null -eq $prop -or $null -eq $prop.Value) { return '' }
    if ($prop.Value -isnot [string]) { throw 'A hook input field is not a string.' }
    return [string]$prop.Value
  }

  # Quotes, escapes and concatenation never change which file a word names.
  function Clean([string]$word) {
    $s = $word -replace '\$(?=[''"])', ''
    $s = $s -replace '[''"^+]', ''
    return $s.Replace($BT, '').ToLowerInvariant()
  }

  function Has-Glob([string]$s) { return ($s -match '[*?\[]') }

  # Every spelling a word can stand for: \\?\ and localhost-share prefixes, ~ and the home
  # folder, the working directory variables, a /c/ drive (Git Bash); in a shell also the
  # backslash as an escape, comma lists and -Param:value.
  function Variants([string]$word, [bool]$shell) {
    $out = New-Object System.Collections.Generic.List[string]
    $c = Clean $word
    $forms = @($c.Replace('\', '/'))
    if ($shell) { $forms += $c.Replace('\', '') }
    foreach ($f in $forms) {
      $x = $f
      if ($x.StartsWith('//?/unc/')) { $x = '//' + $x.Substring(8) }
      elseif ($x.StartsWith('//?/') -or $x.StartsWith('//./')) { $x = $x.Substring(4) }
      if ($x -match '^//(localhost|127\.0\.0\.1)/([a-z])\$(/.*)?$') { $x = $matches[2] + ':' + $matches[3] }
      if ($x -eq '~' -or $x.StartsWith('~/')) { $x = $HomeDir + $x.Substring(1) }
      $x = $x -replace '\$\{?(env:userprofile|home)\}?|%userprofile%', $HomeDir.Replace('$', '$$')
      $x = $x -replace '\$\{?pwd\}?|%cd%', '.'
      $out.Add($x)
      if ($x -match '^/(cygdrive/|mnt/)?([a-z])(/.*)?$') { $out.Add($matches[2] + ':' + $matches[3]) }
      if (-not $shell) { continue }
      foreach ($part in $x.Split(',')) { if ($part -ne '' -and $part -ne $x) { $out.Add($part) } }
      if ($x -match '^-[a-z][\w-]*:(.+)$') { $out.Add($matches[1]) }
    }
    return ,$out
  }

  # Whether one path segment can name $name: equal, an 8.3 short name of it (JOURNA~1), or,
  # with $glob, a wildcard that matches it.
  function SegMatch([string]$seg, [string]$name, [bool]$glob) {
    if ($seg -eq $name) { return $true }
    if ($seg -match '^([^~]*)~\d') {
      $pre = $matches[1] -replace '[. ]', ''
      if (($name -replace '[. ]', '').StartsWith($pre, [StringComparison]::Ordinal)) { return $true }
    }
    if ($glob -and (Has-Glob $seg)) {
      if ($name -like ($seg -replace '\[[^\]]*\]?', '?')) { return $true }
    }
    return $false
  }

  # The absolute path a word names, as lower-case segments: '.' and '..' resolved lexically
  # against $base, and an existing 8.3 short name expanded through the file system.
  function Get-Segs([string]$path, [string]$base) {
    if ($path -match '^[a-z]:/') { $full = $path }
    elseif ($path -match '^[a-z]:') { $full = $base + '/' + $path.Substring(2) }
    elseif ($path.StartsWith('//')) { $full = $path }
    elseif ($path.StartsWith('/')) { $full = $base.Substring(0, 2) + $path }
    else { $full = $base + '/' + $path }
    $list = New-Object System.Collections.Generic.List[string]
    if ($full.StartsWith('//')) { $list.Add('//') }
    foreach ($s in $full.Split('/')) {
      if ($s.TrimEnd(' ') -eq '..') {
        if ($list.Count -gt 1) { $list.RemoveAt($list.Count - 1) }
        continue
      }
      $seg = $s
      # name:stream and trailing dots or spaces name the same file on Windows.
      if ($list.Count -gt 0) { $seg = $seg.Split(':')[0] }
      $seg = $seg.TrimEnd([char[]]'. ')
      if ($seg -ne '') { $list.Add($seg) }
    }
    for ($k = 1; $k -lt $list.Count; $k++) {
      if (-not $list[$k].Contains('~') -or (Has-Glob $list[$k]) -or $list[0] -eq '//') { continue }
      try {
        $hits = [IO.Directory]::GetFileSystemEntries([string]::Join('\', $list.GetRange(0, $k)) + '\', $list[$k])
        if ($hits.Count -eq 1) { $list[$k] = [IO.Path]::GetFileName($hits[0]).ToLowerInvariant() }
      } catch {
        # Not expandable (missing folder): SegMatch still reads the short name by its prefix.
      }
    }
    return ,$list.ToArray()
  }

  function Join-Segs([string[]]$segs) {
    if ($segs.Count -gt 0 -and $segs[0] -eq '//') { return '//' + [string]::Join('/', $segs, 1, $segs.Count - 1) }
    return [string]::Join('/', $segs)
  }

  # Whether $p names $target or something inside it; with $glob, '**' reaches anything below.
  function Reaches([string[]]$p, [string[]]$target, [bool]$glob) {
    for ($k = 0; $k -lt $target.Count; $k++) {
      if ($k -ge $p.Count) { return $false }
      if ($glob -and $p[$k].Contains('**')) { return $true }
      if (-not (SegMatch $p[$k] $target[$k] $glob)) { return $false }
    }
    return $true
  }

  # Whether $p names $target itself or one of its ancestors.
  function AtOrAbove([string[]]$p, [string[]]$target, [bool]$glob) {
    if ($p.Count -gt $target.Count) { return $false }
    for ($k = 0; $k -lt $p.Count; $k++) {
      if ($glob -and $p[$k].Contains('**')) { return $true }
      if (-not (SegMatch $p[$k] $target[$k] $glob)) { return $false }
    }
    return $true
  }

  # The protected name a word spells literally in any segment (a bare word included), or $null.
  function LiteralHit([string]$word, [string[]]$names) {
    $x = $word
    if ($x.StartsWith($VRootStr + '/', [StringComparison]::Ordinal)) { $x = $x.Substring($VRootStr.Length + 1) }
    foreach ($s in $x.Split([char[]]'/:')) {
      $seg = $s.TrimEnd([char[]]'. ')
      if ($seg -eq '') { continue }
      foreach ($n in $names) { if (SegMatch $seg $n $false) { return $n } }
    }
    return $null
  }

  # Whether a word spells a protected folder literally: journal as any segment, or an internal
  # folder (the state folder, then index or chats) as consecutive segments.
  function SecretLiteral([string]$word) {
    if ($null -ne (LiteralHit $word $NamesJournal)) { return $true }
    $x = $word
    if ($x.StartsWith($VRootStr + '/', [StringComparison]::Ordinal)) { $x = $x.Substring($VRootStr.Length + 1) }
    $segs = New-Object System.Collections.Generic.List[string]
    foreach ($s in $x.Split([char[]]'/:')) {
      $seg = $s.TrimEnd([char[]]'. ')
      if ($seg -ne '') { $segs.Add($seg) }
    }
    foreach ($pair in $SecretPairs) {
      for ($k = 0; $k + $pair.Count -le $segs.Count; $k++) {
        $all = $true
        for ($m = 0; $m -lt $pair.Count; $m++) { if (-not (SegMatch $segs[$k + $m] $pair[$m] $false)) { $all = $false; break } }
        if ($all) { return $true }
      }
    }
    return $false
  }

  # Whether $p names a protected folder (journal/, the derived index, the chat sessions) or
  # something inside one.
  function Hits-Secret([string[]]$p, [bool]$glob) {
    foreach ($dir in $TSecret) { if (Reaches $p $dir $glob) { return $true } }
    return $false
  }

  # Whether $p names a protected folder itself or one of its ancestors (the state folder).
  function Above-Secret([string[]]$p, [bool]$glob) {
    foreach ($dir in $TSecret) { if (AtOrAbove $p $dir $glob) { return $true } }
    return $false
  }

  # Bash brace expansion: j{o,}urnal and jour{m..o}al spell journal.
  function Expand-Braces([string]$word) {
    $out = New-Object System.Collections.Generic.List[string]
    $todo = New-Object System.Collections.Generic.Queue[string]
    $todo.Enqueue($word)
    while ($todo.Count -gt 0) {
      $s = $todo.Dequeue()
      $alts = $null
      $hit = $null
      if ($out.Count + $todo.Count -lt 64) {
        foreach ($group in [regex]::Matches($s, '\{([^{}]*)\}')) {
          $body = $group.Groups[1].Value
          if ($body.Contains(',')) { $alts = $body.Split(','); $hit = $group; break }
          if ($body -match '^(.)\.\.(.)$') {
            $lo = [int][char]$matches[1]
            $hi = [int][char]$matches[2]
            if ($lo -gt $hi) { $swap = $lo; $lo = $hi; $hi = $swap }
            if ($hi - $lo -le 64) {
              $alts = @()
              for ($code = $lo; $code -le $hi; $code++) { $alts += [string][char]$code }
              $hit = $group
              break
            }
          }
        }
      }
      if ($null -eq $hit) { $out.Add($s); continue }
      foreach ($alt in $alts) { $todo.Enqueue($s.Substring(0, $hit.Index) + $alt + $s.Substring($hit.Index + $hit.Length)) }
    }
    return ,$out
  }

  function Verb-Name([string]$word) {
    $n = $word.Substring($word.LastIndexOf('/') + 1)
    if ($n.EndsWith('.exe') -or $n.EndsWith('.com')) { $n = $n.Substring(0, $n.Length - 4) }
    return $n
  }

  # One command segment: its cleaned words and the index of the verb, after assignments,
  # wrappers (xargs, env, timeout ...) and nested shells (bash -c, cmd /c, powershell -Command,
  # eval, iex) are stepped over. Depth counts the nested shells.
  function Parse-Seg([string]$text) {
    $s = $text
    for ($k = 0; $k -lt 8; $k++) {
      $n = $s -replace '^\s*(\[[^\]]*\]\s*)*\$[\w:.]+\s*[-+*/]?=\s*', ''
      $n = $n -replace '^\s*([a-z_]\w*=\S*\s+)+', ''
      if ($n -eq $s) { break }
      $s = $n
    }
    $w = New-Object System.Collections.Generic.List[string]
    foreach ($x in ($s -split '\s+')) {
      $c = (Clean $x).Replace('\', '/')
      if ($c -ne '') { $w.Add($c) }
    }
    $i = 0
    $depth = 0
    $wrapped = $false
    $crossed = $false
    while ($i -lt $w.Count) {
      $v = Verb-Name $w[$i]
      if ($WRAP -contains $v) {
        $wrapped = $true
        $crossed = $true
        $i++
        while ($i -lt $w.Count -and $w[$i] -match '^-|^/[a-z?]+(:\S*)?$|^\d|=') { $i++ }
        continue
      }
      if ($EVALS -contains $v) {
        $depth++
        $crossed = $true
        $i++
        while ($i -lt $w.Count -and $w[$i].StartsWith('-')) { $i++ }
        continue
      }
      if ($SHELLS -notcontains $v) { break }
      $depth++
      $crossed = $true
      $i++
      $isPs = ($v -eq 'powershell' -or $v -eq 'pwsh')
      while ($i -lt $w.Count) {
        $f = $w[$i]
        if ($v -eq 'cmd') {
          if ($f -match '^/[ck](.+)$') { $w[$i] = $matches[1]; break }
          if ($f.StartsWith('/')) { $i++; continue }
          break
        }
        if ($f.StartsWith('-') -or ($isPs -and $f -match '^/[a-z]')) {
          $name = ($f.TrimStart([char[]]'-/') -split ':')[0]
          $i++
          if ($isPs -and $name -match '^(ex\w*|ep|w|wi\w*|v|ve\w*|inputf\w*|if|outputf\w*|o|of|conf\w*|psc\w*|wo\w*|wd|settingsf\w*|cus\w*)$') { $i++ }
          elseif (-not $isPs -and $name -match '^(o|rcfile|init-file|d|distribution|u|user|cd)$') { $i++ }
          continue
        }
        if ($f -eq '+o') { $i += 2; continue }
        break
      }
    }
    return @{ W = $w; I = $i; Depth = $depth; Wrapped = $wrapped; Crossed = $crossed }
  }

  function Glob-Parent([string]$word) {
    $x = $word.Replace('\', '/').TrimEnd('/')
    $k = $x.LastIndexOf('/')
    if (-not (Has-Glob $x.Substring($k + 1))) { return $word }
    if ($k -lt 0) { return '.' }
    if ($k -eq 0) { return '/' }
    return $x.Substring(0, $k)
  }

  function Exists-Any([string]$word) {
    foreach ($v in (Variants $word $true)) {
      foreach ($c in $Cands) {
        $winPath = (Join-Segs (Get-Segs $v $c)).Replace('/', '\')
        if ($winPath.Length -eq 2) { $winPath += '\' }
        if ([IO.Directory]::Exists($winPath) -or [IO.File]::Exists($winPath)) { return $true }
      }
    }
    return $false
  }

  # A git command that prints file content or history (diff, show, blame, log -p ...). It
  # reads the whole repository, whatever the cwd, so only a path after '--' scopes it. Returns
  # the walk info, or $null when the command prints no content.
  function Git-Dump-Info([string[]]$rest) {
    $sub = $null
    foreach ($x in $rest) {
      if (($GITDUMPS -contains $x) -or ($GITPATCHES -contains $x)) { $sub = $x; break }
    }
    if ($null -eq $sub) { return $null }
    if ($GITPATCHES -contains $sub) {
      $patch = $false
      foreach ($x in $rest) {
        if ($x -match '^--(patch|cc|textconv|diff-merges)' -or ($x -match '^-[^-]' -and $x -match '[pul]')) { $patch = $true }
      }
      if (-not $patch) { return $null }
    }
    $t = New-Object System.Collections.Generic.List[string]
    # -C and --git-dir move the repository: the paths no longer say where git reads.
    $moved = ($rest -contains '-c')
    foreach ($x in $rest) { if ($x.StartsWith('--git-dir') -or $x.StartsWith('--work-tree')) { $moved = $true } }
    $dd = [array]::IndexOf($rest, '--')
    $scoped = ($dd -ge 0 -and $dd + 1 -lt $rest.Count -and -not $moved)
    if ($scoped) {
      for ($k = $dd + 1; $k -lt $rest.Count; $k++) {
        if ($rest[$k].StartsWith(':')) { $scoped = $false; break }
        $t.Add((Glob-Parent $rest[$k]))
      }
    }
    if ($scoped) { return @{ T = $t; Cwd = $false; Search = $true } }
    $t.Clear()
    foreach ($c in $Cands) { if (Reaches (Get-Segs $c $c) $VRoot $false) { $t.Add($VRootStr); break } }
    return @{ T = $t; Cwd = $true; Search = $true }
  }

  # Walk-Targets of the command at word $at when it is recursive, else $null. Unsure words
  # count as targets: a false block is cheap.
  function Rec-Info([System.Collections.Generic.List[string]]$w, [int]$at) {
    $verb = Verb-Name $w[$at]
    $rest = @()
    if ($at + 1 -lt $w.Count) { $rest = $w.GetRange($at + 1, $w.Count - $at - 1).ToArray() }
    $t = New-Object System.Collections.Generic.List[string]
    if ($verb -eq 'git') {
      if ($rest -contains 'grep') {
        foreach ($x in $rest) { if (-not $x.StartsWith('-')) { $t.Add($x) } }
        return @{ T = $t; Cwd = $true; Search = $true }
      }
      return (Git-Dump-Info $rest)
    }
    if ($verb -eq 'find') {
      foreach ($x in $rest) { if ($x -match '^[-!(]') { break }; $t.Add($x) }
      return @{ T = $t; Cwd = ($t.Count -eq 0); Search = $true }
    }
    if ($verb -eq 'for' -or $verb -eq 'forfiles') {
      $flag = '/r'
      $dirFlag = '/r'
      if ($verb -eq 'forfiles') { $flag = '/s'; $dirFlag = '/p' }
      if ($rest -notcontains $flag) { return $null }
      $k = [array]::IndexOf($rest, $dirFlag)
      if ($k -ge 0 -and $k + 1 -lt $rest.Count -and -not $rest[$k + 1].StartsWith('%') -and -not $rest[$k + 1].StartsWith('/')) {
        $t.Add($rest[$k + 1])
        return @{ T = $t; Cwd = $false; Search = $true }
      }
      return @{ T = $t; Cwd = $true; Search = $true }
    }
    $isGrep = $GREPS -contains $verb
    $cmdFlags = $CMDVERBS -contains $verb
    $rec = $ALWAYS -contains $verb
    foreach ($x in $rest) {
      if ($x -eq '--recursive' -or $x -eq '--dereference-recursive' -or $x -eq '--archive' -or $x -eq 'recurse' -or $x -like '--directories=rec*' -or $x -like '-rec*' -or $x -like '-depth*' -or $x -eq '/s') { $rec = $true }
      elseif ($x -match '^-[^-]' -and $x.Contains('r') -and ($isGrep -or $x.Length -le 5)) { $rec = $true }
      elseif ($COPIES -contains $verb -and $x -match '^-[a-z]*a[a-z]*$' -and $x.Length -le 5) { $rec = $true }
      elseif ($verb -eq 'findstr' -and $x -match '^/[a-z]*s[a-z]*$') { $rec = $true }
    }
    if (-not $rec) { return $null }
    return (Walk-Targets $w $at)
  }

  # The folders the command at word $at walks: its path words and option values (T), whether it
  # falls back to the working directory (Cwd), and whether it reads or copies content (Search).
  function Walk-Targets([System.Collections.Generic.List[string]]$w, [int]$at) {
    $verb = Verb-Name $w[$at]
    $rest = @()
    if ($at + 1 -lt $w.Count) { $rest = $w.GetRange($at + 1, $w.Count - $at - 1).ToArray() }
    $t = New-Object System.Collections.Generic.List[string]
    $isGrep = $GREPS -contains $verb
    $cmdFlags = $CMDVERBS -contains $verb
    $pos = New-Object System.Collections.Generic.List[string]
    $patFlag = $false
    $valueNext = $false
    foreach ($x in $rest) {
      if ($valueNext) {
        $valueNext = $false
        if (-not (Has-Glob $x)) { $t.Add($x) }
        continue
      }
      if ($x.StartsWith('--')) {
        $eq = $x.IndexOf('=')
        if ($eq -gt 0) {
          $val = $x.Substring($eq + 1)
          if (-not (Has-Glob $val)) { $t.Add($val) }
          if ($x -match '^--(regexp|file)=') { $patFlag = $true }
        } else {
          if ($x -eq '--regexp' -or $x -eq '--file') { $patFlag = $true }
          if ($NOVAL -notcontains $x) { $valueNext = $true }
        }
        continue
      }
      if ($x.StartsWith('-') -and $x.Length -gt 1) {
        if ($isGrep) {
          if ($x -match '[ef]$') { $patFlag = $true }
          if ($x -match '[efgtabcmdj]$') { $valueNext = $true }
          continue
        }
        $name = ($x.Substring(1) -split ':', 2)[0]
        $attached = ''
        if ($x.Contains(':')) { $attached = $x.Substring($x.IndexOf(':') + 1) }
        $isValue = $false
        if ($name.Length -ge 2) {
          foreach ($pv in $PSVALUE) { if ($pv.StartsWith($name, [StringComparison]::Ordinal)) { $isValue = $true } }
          foreach ($pp in $PSPATH) { if ($pp.StartsWith($name, [StringComparison]::Ordinal)) { $isValue = $false } }
        }
        if ($attached -ne '') {
          if (-not $isValue) { $pos.Add($attached) }
          elseif (-not (Has-Glob $attached)) { $t.Add($attached) }
        } elseif ($isValue) { $valueNext = $true }
        continue
      }
      if ($cmdFlags -and $x -match '^/[a-z?]' -and $x.IndexOf('/', 1) -lt 0) {
        if ($x -match '^/[cg]:') { $patFlag = $true }
        continue
      }
      $pos.Add($x)
    }
    $first = 0
    if ($isGrep -and -not $patFlag) { $first = 1 }
    $walksNamed = $false
    for ($k = 0; $k -lt $pos.Count; $k++) {
      if ($k -lt $first) { $t.Add($pos[$k]); continue }
      $t.Add((Glob-Parent $pos[$k]))
      if ((Has-Glob $pos[$k]) -or (Exists-Any $pos[$k])) { $walksNamed = $true }
    }
    return @{ T = $t; Cwd = (-not $walksNamed); Search = ($SEARCHVERBS -contains $verb) }
  }

  function Seg-ReadOnly($seg, [bool]$methods) {
    if ($seg.Wrapped) { return $false }
    $w = $seg.W
    if ($seg.I -ge $w.Count) { return ($seg.Depth -eq 0) }
    $verb = Verb-Name $w[$seg.I]
    $rest = @()
    if ($seg.I + 1 -lt $w.Count) { $rest = $w.GetRange($seg.I + 1, $w.Count - $seg.I - 1).ToArray() }
    if ($verb.StartsWith('$')) { return (-not $methods) }
    if ($verb -eq 'find') { foreach ($x in $rest) { if ($x -match '^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$') { return $false } } }
    if ($verb -eq 'sort') { foreach ($x in $rest) { if ($x -match '^-[a-z]{0,4}o' -or $x -like '--output*') { return $false } } }
    if ($verb -eq '%' -or $verb -eq 'foreach-object') { foreach ($x in $rest) { if ($x -notmatch '^-(process|begin|end)$') { return $false } } }
    if ($verb -eq 'rg') { foreach ($x in $rest) { if ($x -like '--pre*') { return $false } } }
    return ($READONLY -contains $verb)
  }

  # Whether a walk reaches the vault root or above, journal/, or the derived index from any
  # candidate cwd.
  function Walks-Protected($info) {
    $targets = @($info.T)
    if ($info.Cwd) { $targets += '.' }
    foreach ($x in $targets) {
      foreach ($v in (Variants $x $true)) {
        foreach ($c in $Cands) {
          $segs = Get-Segs $v $c
          if ((AtOrAbove $segs $VRoot $true) -or (Hits-Secret $segs $true) -or (Above-Secret $segs $true)) { return $true }
        }
      }
    }
    return $false
  }

  function Code-Char([string]$text, [int]$base) {
    $code = [Convert]::ToInt32($text, $base)
    if ($code -gt 65535) { return '' }
    return [string][char]$code
  }

  # The command with simple indirection undone: escapes and [char] codes decoded, variables
  # assigned in the command substituted, other variables and substitutions read as nothing,
  # and concatenation joined - so jour$()nal, 'jour' + 'nal' and d=jour; $d'nal' spell journal.
  # Backslash escapes are decoded only when $escapes is set: in a Windows path \2026 is a folder.
  function Resolve-Indirection([string]$cmd, [bool]$escapes) {
    $s = [regex]::Replace($cmd, '(?i)\$\(\s*\[char\]\s*(\d+)\s*\)|\[char\]\s*(\d+)', { param($m) Code-Char ($m.Groups[1].Value + $m.Groups[2].Value) 10 })
    $s = [regex]::Replace($s, '(?i)\$\(\s*\[char\]\s*0x([0-9a-f]+)\s*\)|\[char\]\s*0x([0-9a-f]+)', { param($m) Code-Char ($m.Groups[1].Value + $m.Groups[2].Value) 16 })
    if ($escapes) {
      $s = [regex]::Replace($s, '(?i)\\x([0-9a-f]{2})|\\u([0-9a-f]{4})', { param($m) Code-Char ($m.Groups[1].Value + $m.Groups[2].Value) 16 })
      $s = [regex]::Replace($s, '\\([0-7]{3})', { param($m) Code-Char $m.Groups[1].Value 8 })
    }
    foreach ($a in [regex]::Matches($s, '(?i)(?:^|[\s;&|(])\$?([a-z_]\w*)\s*=\s*([''"]?)([^\s;&|''"]*)\2')) {
      $name = [regex]::Escape($a.Groups[1].Value)
      $s = [regex]::Replace($s, '(?i)\$\{' + $name + '\}|\$' + $name + '(?!\w)', $a.Groups[3].Value.Replace('$', '$$'))
    }
    $s = $s -replace '\s*\+\s*', '' -replace '([''"])\s*,\s*([''"])', ''
    $s = $s -replace '\$\([^()]*\)', '' -replace '\$\{[^{}]*\}', '' -replace '\$[a-z_]\w*', '' -replace '%\w*%', ''
    $s = $s -replace ($BT + '[^' + $BT + ']*' + $BT), ''
    return ($s -replace '[!@+*?]\([^()]*\)', '*')
  }

  function Has-Redirect([string]$cmd) {
    foreach ($m in [regex]::Matches($cmd, '(?:[0-9*]|&)?>{1,2}\s*(&?[^\s;|<>()]*)')) {
      $target = (Clean $m.Groups[1].Value).Replace('\', '/')
      if (@('/dev/null', '$null', 'nul', 'nul:', '&1', '&2') -notcontains $target) { return $true }
    }
    return $false
  }

  function Check-Shell([string]$cmd) {
    if ($cmd -match '(?s)(?<![\w.-])(powershell|pwsh)(\.exe)?(?![\w.-]).*?\s[-/](e|ec|en\w*)(?![\w-])') { Block $ReasonDynamic }
    if ($cmd -match 'frombase64string|scriptblock\]::create|newscriptblock|invokescript') { Block $ReasonDynamic }
    if ($cmd -match '(?s)(?<![\w.-])(eval|iex|invoke-expression)(?![\w.-])(.*)$') {
      $after = $matches[2]
      if ($after.Trim() -eq '' -or $after -match '^\s*[|;&)]' -or $after.Contains('$') -or $after.Contains('(') -or $after.Contains($BT)) { Block $ReasonDynamic }
    }

    $joined = Resolve-Indirection $cmd $false
    $decoded = Resolve-Indirection $cmd $true

    $plain = [regex]::Replace($cmd, '(?:[0-9*]|&)?>{1,2}&?\s*(?:"[^"]*"|''[^'']*''|[^\s;|&<>()]*)', ' ')
    $plain = [regex]::Replace($plain, '<{1,3}(?!\()\s*(?:"[^"]*"|''[^'']*''|[^\s;|&<>()]*)', ' ')
    # Segments keep the separator before (Prev) and after (Next) them.
    $sepPattern = '\$\(|&&|\|\||[;|&(){}\r\n' + $BT + ']'
    $parsed = New-Object System.Collections.Generic.List[object]
    $prevSep = ''
    foreach ($s in [regex]::Split($plain, '(' + $sepPattern + ')')) {
      if ($s -match ('^(' + $sepPattern + ')$')) {
        if ($parsed.Count -gt 0 -and $null -eq $parsed[$parsed.Count - 1].Next) { $parsed[$parsed.Count - 1].Next = $s }
        $prevSep = $s
        continue
      }
      if ($s.Trim() -eq '') { continue }
      $seg = Parse-Seg $s
      if ($seg.Depth -gt 3) { Block $ReasonNested }
      # A shell with nothing after it runs what is piped in, which may be decoded or built.
      if ($seg.Depth -gt 0 -and $seg.I -ge $seg.W.Count) { Block $ReasonDynamic }
      $seg.Prev = $prevSep
      $seg.Next = $null
      $parsed.Add($seg)
    }

    # After a cd the command runs elsewhere: also evaluate it at the vault root and at every
    # folder the cd chain can reach.
    $Cands = New-Object System.Collections.Generic.List[string]
    $Cands.Add($WorkDir)
    $cur = @($WorkDir)
    foreach ($seg in $parsed) {
      $w = $seg.W
      $last = $seg.I
      if ($seg.Crossed) { $last = $w.Count - 1 }
      for ($k = $seg.I; $k -le $last -and $k -lt $w.Count; $k++) {
        if ($CDS -notcontains (Verb-Name $w[$k])) { continue }
        if (-not $Cands.Contains($VRootStr)) { $Cands.Add($VRootStr) }
        $dest = '~'
        for ($m = $k + 1; $m -lt $w.Count; $m++) { if ($w[$m] -notmatch '^-|^/d$') { $dest = $w[$m]; break } }
        $next = New-Object System.Collections.Generic.List[string]
        foreach ($origin in ($cur + $VRootStr)) {
          foreach ($v in (Variants $dest $true)) {
            $resolved = Join-Segs (Get-Segs $v $origin)
            if (-not $next.Contains($resolved) -and $next.Count -lt 16) { $next.Add($resolved) }
          }
        }
        $cur = $next.ToArray()
        foreach ($r in $cur) { if (-not $Cands.Contains($r) -and $Cands.Count -lt 32) { $Cands.Add($r) } }
      }
    }

    # The speed shortcut below needs a cwd inside the vault and not in the state folder, where
    # a plain relative word such as index/a.json already names a protected folder.
    $candsInside = $true
    foreach ($c in $Cands) {
      $candSegs = Get-Segs $c $c
      if (-not (Reaches $candSegs $VRoot $false)) { $candsInside = $false }
      if ($candSegs.Count -gt $VRoot.Count -and (Above-Secret $candSegs $false)) { $candsInside = $false }
    }

    $tokens = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($form in @($cmd, $joined, $decoded)) {
      foreach ($word in [regex]::Split($form, '[\s;|&()<>=' + $BT + ']+')) {
        if ($word -eq '') { continue }
        if ($word.IndexOf('{') -lt 0) { [void]$tokens.Add($word); continue }
        foreach ($e in (Expand-Braces $word)) {
          [void]$tokens.Add($e)
          foreach ($part in $e.Split([char[]]'{},')) { if ($part -ne '') { [void]$tokens.Add($part) } }
        }
      }
    }

    # Any word naming a protected folder blocks, literally or as a path or glob that resolves
    # into it. A word naming raw/, .claude/, CLAUDE.md, or the vault root or above only arms
    # the read-only check at the end.
    $trigger = $null
    foreach ($tok in $tokens) {
      # Speed for long heredocs: from a cwd inside the vault, a relative word without a
      # protected name, glob, 8.3 tilde, '..', variable, drive or escape stays inside the cwd.
      if ($candsInside -and (Clean $tok) -notmatch 'journal|secondbrain|raw|claude|~|[*?\[]|\.\.|[:%$\\]|^[/.]|,[/.]') { continue }
      foreach ($v in (Variants $tok $true)) {
        if (SecretLiteral $v) { Block $ReasonJournal }
        $lit = LiteralHit $v $NamesProtected
        if ($null -eq $trigger -and $null -ne $lit) {
          if ($lit -eq 'raw') { $trigger = 'raw' } else { $trigger = 'setup' }
        }
        foreach ($c in $Cands) {
          $segs = Get-Segs $v $c
          if (Hits-Secret $segs $true) { Block $ReasonJournal }
          if ($null -ne $trigger) { continue }
          if (Reaches $segs $TRaw $true) { $trigger = 'raw' }
          elseif ((Reaches $segs $TClaude $true) -or (Reaches $segs $TClaudeMd $true)) { $trigger = 'setup' }
          elseif (AtOrAbove $segs $VRoot $true) { $trigger = 'root' }
        }
      }
    }

    # A recursive walk, or a git command that prints content, whose folder is the vault root,
    # journal/, the derived index or above.
    foreach ($seg in $parsed) {
      $w = $seg.W
      $last = $seg.I
      if ($seg.Crossed) { $last = $w.Count - 1 }
      for ($k = $seg.I; $k -le $last -and $k -lt $w.Count; $k++) {
        $info = Rec-Info $w $k
        if ($null -eq $info -or -not (Walks-Protected $info)) { continue }
        if ($info.Search) { Block $ReasonRecursive }
        if ($null -eq $trigger) { $trigger = 'root' }
      }
    }

    # A listing at the vault root or above whose output becomes paths - piped into anything but a
    # text filter, or substituted - walks into journal/ one level at a time (gci | gci | gc).
    for ($n = 0; $n -lt $parsed.Count; $n++) {
      $seg = $parsed[$n]
      if ($seg.I -ge $seg.W.Count -or $LISTERS -notcontains (Verb-Name $seg.W[$seg.I])) { continue }
      $consumed = @('$(', '(', $BT) -contains $seg.Prev
      if ($seg.Next -eq '|') {
        for ($q = $n + 1; $q -lt $parsed.Count; $q++) {
          $later = $parsed[$q]
          if ($later.I -ge $later.W.Count) { continue }
          $laterVerb = Verb-Name $later.W[$later.I]
          if (-not $laterVerb.StartsWith('$') -and $FILTERS -notcontains $laterVerb) { $consumed = $true }
        }
      }
      if ($consumed -and (Walks-Protected (Walk-Targets $seg.W $seg.I))) { Block $ReasonRecursive }
    }

    # git commands that rewrite the working tree touch everything below the cwd.
    foreach ($seg in $parsed) {
      if ($seg.I -ge $seg.W.Count -or (Verb-Name $seg.W[$seg.I]) -ne 'git') { continue }
      $gitWrite = $false
      foreach ($x in $seg.W) { if ($GITWRITES -contains $x) { $gitWrite = $true } }
      if (-not $gitWrite) { continue }
      foreach ($c in $Cands) { if ($null -eq $trigger -and (AtOrAbove (Get-Segs '.' $c) $VRoot $false)) { $trigger = 'root' } }
    }

    # Near raw/, the setup or the root, only read-only verbs and no output redirect.
    if ($null -eq $trigger) { return }
    $methods = ($cmd -match '\.[a-z_]\w*\s*\(|::')
    $allReadOnly = -not (Has-Redirect $cmd)
    foreach ($seg in $parsed) { if (-not (Seg-ReadOnly $seg $methods)) { $allReadOnly = $false } }
    if ($allReadOnly) { return }
    if ($trigger -eq 'raw') { Block $ReasonRaw }
    if ($trigger -eq 'setup') { Block $ReasonSetup }
    Block $ReasonRoot
  }

  function Check-JournalPath([string]$path) {
    if ($path -eq '') { return }
    foreach ($v in (Variants $path $false)) {
      if (SecretLiteral $v) { Block $ReasonJournal }
      if (Hits-Secret (Get-Segs $v $WorkDir) $false) { Block $ReasonJournal }
    }
  }

  function Check-Literal([string]$text) {
    if ($text -eq '') { return }
    foreach ($v in (Variants $text $false)) { if (SecretLiteral $v) { Block $ReasonJournal } }
  }

  # Inside the vault the agent writes only the wiki layer (not a module overview) and its
  # hand-over folders. Outside the vault Claude Code's own working-directory rules apply.
  function Check-Write([string]$path) {
    Check-JournalPath $path
    foreach ($v in (Variants $path $false)) {
      $segs = Get-Segs $v $WorkDir
      if (-not (Reaches $segs $VRoot $false)) { continue }
      if ($segs.Count -le $VRoot.Count) { Block $ReasonWrite }
      $rel = [string]::Join('/', $segs, $VRoot.Count, $segs.Count - $VRoot.Count)
      if ($rel -match '^modules/[^/]+/wiki/.' -and $rel -notmatch '^modules/[^/]+/wiki/overview\.md$') { continue }
      $handOver = $false
      foreach ($dir in $AgentWritable) { if ($rel.StartsWith($dir + '/', [StringComparison]::Ordinal)) { $handOver = $true } }
      if (-not $handOver) { Block $ReasonWrite }
    }
  }

  # Read as UTF-8 bytes: a hook process may have no console whose input encoding could be set.
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
  $stdinText = $reader.ReadToEnd()
  $hookInput = $stdinText | ConvertFrom-Json
  if ($hookInput -isnot [System.Management.Automation.PSCustomObject]) { throw 'The hook input is not a JSON object.' }
  $toolName = Get-Str $hookInput 'tool_name'
  if (@('Bash', 'PowerShell', 'Read', 'Grep', 'Glob', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit') -notcontains $toolName) { exit 0 }
  $toolProp = $hookInput.PSObject.Properties['tool_input']
  if ($null -eq $toolProp -or $toolProp.Value -isnot [System.Management.Automation.PSCustomObject]) { throw 'The tool input is not a JSON object.' }
  $toolInput = $toolProp.Value

  $VRootStr = Join-Segs (Get-Segs (Variants (Split-Path (Split-Path $PSScriptRoot)) $false)[0] 'c:')
  $VRoot = Get-Segs $VRootStr $VRootStr
  $TJournal = Get-Segs ($VRootStr + '/journal') $VRootStr
  $TRaw = Get-Segs ($VRootStr + '/raw') $VRootStr
  $TClaude = Get-Segs ($VRootStr + '/.claude') $VRootStr
  $TClaudeMd = Get-Segs ($VRootStr + '/claude.md') $VRootStr
  $TSecret = New-Object 'System.Collections.Generic.List[object]'
  $TSecret.Add($TJournal)
  $SecretPairs = New-Object 'System.Collections.Generic.List[object]'
  foreach ($dir in $InternalSecret) {
    $TSecret.Add((Get-Segs ($VRootStr + '/' + $dir) $VRootStr))
    $SecretPairs.Add($dir.Split('/'))
  }
  $WorkDir = $VRootStr
  $cwdText = Get-Str $hookInput 'cwd'
  if ($cwdText -ne '') { $WorkDir = Join-Segs (Get-Segs (Variants $cwdText $false)[0] $VRootStr) }
  # A command that starts inside a protected folder reads it with plain relative words.
  if ((@('Bash', 'PowerShell', 'Read', 'Grep', 'Glob') -contains $toolName) -and (Hits-Secret (Get-Segs $WorkDir $WorkDir) $false)) { Block $ReasonJournal }

  switch ($toolName) {
    'Bash' { Check-Shell (Get-Str $toolInput 'command') }
    'PowerShell' { Check-Shell (Get-Str $toolInput 'command') }
    'Read' { Check-JournalPath (Get-Str $toolInput 'file_path') }
    'Glob' {
      Check-JournalPath (Get-Str $toolInput 'path')
      Check-Literal (Get-Str $toolInput 'pattern')
    }
    'Grep' {
      $searchPath = Get-Str $toolInput 'path'
      Check-JournalPath $searchPath
      Check-Literal (Get-Str $toolInput 'glob')
      if ($searchPath -eq '') { $searchPath = '.' }
      foreach ($v in (Variants $searchPath $false)) {
        $segs = Get-Segs $v $WorkDir
        if ((AtOrAbove $segs $VRoot $false) -or (Hits-Secret $segs $false) -or (Above-Secret $segs $false)) { Block $ReasonRecursive }
      }
    }
    'NotebookEdit' { Check-Write (Get-Str $toolInput 'notebook_path') }
    default { Check-Write (Get-Str $toolInput 'file_path') }
  }

  # Fallback for a path-like field the named checks above do not know (a renamed or newly added
  # one): scan it as well instead of letting it through. Content-like fields are skipped - a
  # wiki page may mention the journal - and so is Grep's pattern, which is a regex, not a path.
  if ($toolName -ne 'Bash' -and $toolName -ne 'PowerShell') {
    $named = @('file_path')
    if ($toolName -eq 'Glob') { $named = @('path', 'pattern') }
    if ($toolName -eq 'Grep') { $named = @('path', 'glob', 'pattern') }
    if ($toolName -eq 'NotebookEdit') { $named = @('notebook_path') }
    foreach ($field in $toolInput.PSObject.Properties) {
      if ($named -contains $field.Name) { continue }
      if ($field.Name -notmatch 'path|file|dir|folder|glob|pattern|target|source|dest') { continue }
      if ($field.Name -match '^(new|old)_|content|string|text|body|edits') { continue }
      $extra = Get-Str $toolInput $field.Name
      if ($field.Name -match 'glob|pattern') { Check-Literal $extra } else { Check-JournalPath $extra }
    }
  }
  exit 0
} catch {
  [Console]::Error.WriteLine('Gaston guard error: blocked to be safe.')
  exit 2
}
