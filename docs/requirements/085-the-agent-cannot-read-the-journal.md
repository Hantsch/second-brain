---
id: 085
title: The agent cannot read the journal or touch raw
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Protection by rules, not by trust (concept §7). With the setup from [[084]] installed, the agent in
the vault cannot read `journal/` and cannot write `raw/`, `CLAUDE.md`, `.claude/`, or anything in
`.secondbrain/` outside the hand-over folders (AGT-6). The only direct write target beyond the
hand-over folders is `modules/*/wiki/`, minus `wiki/overview.md` (the condensed artifact, [[081]]).

`permissions.deny` stops the CLI's file tools but not a `cat journal/…` through the shell
(concept O1). What deny rules cannot express goes into hooks: a pre-tool check on shell commands
that would read `journal/` or modify `raw/`, and a post-write check that a changed wiki page still
has valid frontmatter and that `log.md` got its entry (AGT-7). The hooks must run wherever the CLI
runs, without a Node install inside the vault.

The Agent tab's **Protection** section shows the rules as installed, read back from the vault —
not as Gaston thinks they should be.

## Acceptance Criteria

- [ ] **AC1** — The installed `settings.json` denies reading `journal/**` and writing `raw/**`,
      `CLAUDE.md`, `.claude/**`, `modules/*/wiki/overview.md` and `.secondbrain/**` outside the
      hand-over folders.
- [ ] **AC2** — The pre-tool hook, given a shell command that reads a file under `journal/`, blocks
      it with a reason; given one that only reads under `raw/`, it allows it.
- [ ] **AC3** — The pre-tool hook blocks a shell command that writes, moves or deletes under `raw/`.
- [ ] **AC4** — The post-write hook reports a wiki page written without valid frontmatter.
- [ ] **AC5** — The post-write hook reports a wiki page change in a module whose `log.md` got no new
      entry, and stays silent when it did.
- [ ] **AC6** — The Protection section lists each rule as read from the installed files; a rule
      removed by hand from `settings.json` shows as missing there.
- [ ] **AC7** — Without a setup, the Protection section says that nothing protects the vault yet
      and points to "Install".

## Open Questions

~~- **Q1 — Hook runtime** (concept O1): shell script, PowerShell, or a script the CLI's own runtime
executes — what runs on Windows without Node in the vault? Verify against the current CLI
documentation at refine.~~ answered → Decisions (Sprint)
~~- **Q2 — How far the shell check reaches.** A pattern check on the command line cannot catch every
indirection (variables, scripts). Is "the obvious paths blocked, the limit documented in the help
module" acceptable, or must shell access be denied entirely?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Hook runtime: verified at refine against the current Claude Code documentation; must work on Windows without Node in the vault
- **(User)** How far the shell check reaches: obvious journal/raw paths blocked in shell commands; the limit is documented in the help module (no full shell deny)

Verified against the current Claude Code docs on 2026-10-22 (`code.claude.com/docs/en/hooks`,
`/permissions`, `/sandboxing`). These facts drive the decisions below:

- `Read`/`Edit` deny rules cover the built-in file tools, the file commands Claude Code recognizes in
  Bash (`cat`, `head`, `tail`, `sed`, `tee`), and redirect targets. They do not cover `grep -r .`,
  scripts, or (undocumented) PowerShell cmdlets. Grep/Glob coverage is only "best-effort".
- Path rules are gitignore-style. In project settings `/x` anchors at the project root. `Write` rules
  are never consulted, so `Edit` is the write rule. A `!` carve-out cannot reopen a folder that a
  `dir/**` rule blocks.
- Hooks run in exec form (`command` + `args`, no shell, `${CLAUDE_PROJECT_DIR}` substituted by the
  CLI) or in shell form (Git Bash on Windows, PowerShell when Git Bash is missing). Without Git
  Bash, the Bash tool does not exist at all and shell commands arrive as the `PowerShell` tool.
- A hook that exits 2 blocks. Any other non-zero exit, a timeout or a missing script **fails open**,
  unless `"onFailure": "block"` is set (CLI v2.1.295+). Every PreToolUse decision is combined with
  deny > allow.
- The OS sandbox exists on macOS, Linux and WSL2 only, not on native Windows.
- Project `.claude/settings.json` loads from the session's working directory only, with no
  parent-directory fallback.

Decisions taken at refine:

- **Hook runtime is Windows PowerShell 5.1 (`powershell.exe`), called in exec form with
  `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.ps1"`.**
  It ships with every Windows 10/11, does not depend on Git Bash or Node, and needs no shell to
  parse the command, so one implementation runs on every Windows machine.
- **The pre-tool guard sets `"onFailure": "block"` and blocks (exit 2) on every internal error and
  on unparseable input.** By default a crash or timeout fails open, and a fail-open guard is the
  false allow this story exists to prevent.
- **On macOS/Linux the guard fails closed.** `powershell.exe` is missing there, so every guarded
  tool call is blocked. Gaston is packaged for Windows only (`package.json` `build.win`), and a
  blocked agent is safe where a silently unguarded one is not. The limit is documented.
- **The hook scripts are `.ps1`, not 084's `.sh` placeholders.** Template ids stay
  `hook-gaston-shell-guard` and `hook-gaston-wiki-check`, and the paths become
  `.claude/hooks/gaston-shell-guard.ps1` and `.claude/hooks/gaston-wiki-check.ps1`. All versions
  stay `1`, because 084's placeholders ship in the same release and never reach a user, and a bump
  would only churn 084's tests.
- **One pre-tool guard covers the tools `Bash|PowerShell|Read|Grep|Glob|Write|Edit|MultiEdit|NotebookEdit`.**
  Deny-rule matching may be case-sensitive while NTFS is not (`Journal/x.md`, `JOURNA~1`), and
  "only `modules/*/wiki/` and the hand-over folders are writable" is an allowlist, which deny rules
  cannot express. The guard is the layer that is case-insensitive and fail-safe.
- **Deny rules are anchored with a leading `/`** (`Read(/journal/**)`, not `Read(journal/**)`).
  An unanchored deny matches a `journal` folder at any depth, and the protected folders exist only
  at the vault root.
- **`.secondbrain/` writes are denied by enumeration:**
  - `Edit(/.secondbrain/*.json)`
  - one `Edit(/.secondbrain/<dir>/**)` per `INTERNAL_DIRS` entry
  - `Edit(/.secondbrain/agent/jobs/**)`

  This follows 084's note that "deny all except…" cannot be written as rules. The guard's write
  allowlist covers any entry that the enumeration misses.

- **The shell check reaches "obvious" shapes, defined as:**
  - any path token with a segment `journal`, in any spelling (case, `\`, quotes, absolute, `..`,
    8.3 short name)
  - a top-level glob that matches `journal` (`*/…`, `j*/…`, `**`)
  - a recursive traversal (`grep -r`, `rg`, `find`, `Get-ChildItem -Recurse`, `findstr /s`, …)
    from a folder that contains `journal/`
  - nested command strings (`bash -c`, `cmd /c`, `powershell -Command`, `eval`, `iex`)

  Encoded or dynamic commands are blocked outright. A recursive search from the vault root is the
  most likely accidental journal read, so it counts as obvious.

- **A bare word `journal` in a command is blocked too, even as a grep pattern.** A false block
  costs the agent one retry, while a false allow leaks the journal.
- **The shell write check uses an allowlist.** A command that names `raw/`, `.claude/` or
  `CLAUDE.md` passes only if every command segment's verb is a known read-only verb and there is no
  output redirect. Unknown verbs block, which is fail-safe. `.claude/` and `CLAUDE.md` are included
  so that the agent cannot delete or rewrite its own guard through the shell.
- **Glob is checked only for explicit `journal` paths, not for root-level patterns.** Glob returns
  file names only, and journal names are dates (`journal/YYYY/MM/YYYY-MM-DD.md`). The content stays
  behind `Read` deny and the guard.
- **Shell writes to `projects/`, `areas/`, `inbox/`, `.secondbrain/` and wiki pages are not checked.**
  This matches the requirement, which scopes the shell check to journal reads and raw writes. It is
  documented as a limit.
- **The post-write check is one script on two events.**
  - `PostToolUse` (`Write|Edit|MultiEdit`) checks the frontmatter at once and records each changed
    wiki page in a session ledger under the OS temp folder.
  - `Stop` reports modules whose `log.md` got no new entry.

  The log entry is written after the page by convention, so a check at write time would report
  every correct change.

- **"New log entry"** means one of two things:
  - `log.md` was written through Write/Edit after the change in this session.
  - The count of `## [YYYY-MM-DD]` headings (the `HEADING` shape in `src/core/wiki/log-md.ts`)
    rose since the first change.

  This catches an append made through the shell, too.

- **A `Stop` with `stop_hook_active: true` exits 0.** The first Stop already reported the problem,
  and a second block would loop.
- **The post-write check does not set `onFailure`.** It reports and never guards, so a crash must
  not block writes.
- **"Valid frontmatter" for a wiki page** means:
  - an opening `---` on line 1 and a closing `---`
  - every line between them is `key: value`, a `- item` or an indented continuation
  - the keys `type`, `title`, `module`, `created`, `updated`, `tags` and `sources` are present
    (`docs/MODULE-SCHEMA.md`)
  - `type` is `source|entity|concept|overview`

  `wiki/index.md` and `wiki/log.md` carry no frontmatter and are skipped. This is the schema's own
  definition, which PowerShell can check without a YAML parser.

- **The Protection section reads `.claude/settings.json` and the hook scripts from disk.** It shows
  one row per protection rule as installed or missing, and lists deny entries Gaston did not write
  as the user's. A settings file that cannot be parsed is shown as unreadable with the reason, never
  as "unprotected". AC6 says "as installed".
- **The Protection panel carries the limit in one line.** The vault's `docs/VAULT-FORMAT.md`
  section "Agent setup" (084) gets a Protection subsection with the rules and the limits. The help
  module (086, built after this story) must carry the same limits on its agent page, per the (User)
  decision. 085 cannot write that page.
- **The vault `CLAUDE.md` template gets one paragraph** saying that searches are scoped to a folder
  (`modules/`, `projects/` …) because a search from the vault root is blocked. Telling the agent the
  rule saves it a blocked call on every session.
- **A session started in a subfolder of the vault loads no vault settings.** That follows from the
  CLI's loading rule. It is documented as a limit, and 087's terminal opens at the vault root.

## Plan

Builds on [[083]] (Agent tab) and [[084]] (`SETUP_TEMPLATES`, `templates/protection.ts`,
`AGENT_DIRS`, marker/manifest, `agent:` IPC namespace, `AgentSetupPanel`). Order D1 → D2 → D3 → D4
→ D5 → D6.

1. **Rules + settings (D1):** `PROTECTION_RULES` in `src/core/agent/templates/protection.ts` is the
   one list. `SETTINGS_TEMPLATE` (deny + hook registrations) is rendered from it, and the Protection
   reader compares against it. The vault `CLAUDE.md` gets the scoped-search paragraph.
   `VAULT-FORMAT.md` gets a Protection subsection with the limits.
2. **Pre-tool guard (D2, hard):** `gaston-shell-guard.ps1` as a template constant. It covers:
   - journal access by shell, Read, Grep and Glob
   - shell writes to `raw/`, `.claude/` and `CLAUDE.md`
   - an allowlist for Write/Edit

   It fails closed. Tests spawn the real rendered script with `powershell.exe` over a case matrix.

3. **Post-write check (D3):** `gaston-wiki-check.ps1`. On `PostToolUse` it checks frontmatter and
   records the change in a ledger. On `Stop` it reports a missing log entry. Tests spawn it the same
   way.
4. **Protection reader (D4):** `readProtection(store)` in `src/core/agent/protection-status.ts`
   returns `none | unreadable | read{rules, extraDeny}`.
5. **IPC (D5):** `agent:protectionStatus`, api, mock, query hook. The setup mutation also
   invalidates the hook.
6. **Panel (D6):** `AgentProtectionPanel.tsx` under the Setup panel, i18n, CHANGELOG. It comes with
   one e2e flow: no setup → install → hand-edit `settings.json` → the rule shows missing.

Hook registration (exec form, written by D1, the scripts by D2/D3):
`PreToolUse` → `gaston-shell-guard.ps1` (`onFailure: block`, timeout 30);
`PostToolUse` (`Write|Edit|MultiEdit`) and `Stop` → `gaston-wiki-check.ps1` (timeout 30).

## Deliverables

- **D1 — Protection rules, `settings.json` template, docs.**
  - **Edit `src/core/agent/templates/protection.ts`** (created by 084, a placeholder). Export
    `PROTECTION_RULES: readonly ProtectionRule[]`, where
    `ProtectionRule = { id: AgentProtectionRuleId; deny: readonly string[]; hooks: readonly HookRequirement[] }`
    and
    `HookRequirement = { event: 'PreToolUse'|'PostToolUse'|'Stop'; tools: readonly string[]; script: string; failClosed: boolean }`
    (`script` is the vault path). The rules, in this order:
    - `journal-read`: `Read(/journal/**)`, `Edit(/journal/**)`
    - `raw-write`: `Edit(/raw/**)`
    - `setup-write`: `Edit(/CLAUDE.md)`, `Edit(/.claude/**)`
    - `overview-write`: `Edit(/modules/*/wiki/overview.md)`
    - `internal-write`: `Edit(/.secondbrain/*.json)`, then `Edit(/<dir>/**)` for each value of
      `INTERNAL_DIRS` (`src/shared/types/vault.ts`), then `Edit(/${AGENT_DIRS.jobs}/**)`. Derive
      these entries from the constants; do not type them as literals.
    - `pre-tool-guard`: no deny entries. One hook: `PreToolUse`, tools
      `Bash, PowerShell, Read, Grep, Glob, Write, Edit, MultiEdit, NotebookEdit`, script
      `.claude/hooks/gaston-shell-guard.ps1`, `failClosed: true`.
    - `wiki-check`: no deny entries. Two hooks, `PostToolUse` with tools `Write, Edit, MultiEdit`
      and `Stop` with no tools, both on script `.claude/hooks/gaston-wiki-check.ps1`, both
      `failClosed: false`.
  - **`renderSettings(rules)`.** Builds the settings object:
    - `permissions.deny` = every rule's `deny`, in order.
    - `hooks[event]` = one group per hook, `{ matcher: tools.join('|') }` (omitted for `Stop`) plus
      `hooks: [{ type: 'command', command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '${CLAUDE_PROJECT_DIR}/' + script], timeout: 30, onFailure: 'block' }]`.
      `onFailure` is set only when `failClosed`. `${CLAUDE_PROJECT_DIR}` is the literal placeholder
      text, never a resolved path.

    `SETTINGS_TEMPLATE.body` = `JSON.stringify(obj, null, 2) + '\n'`, kept identical to the mirror
    `docs/agent-setup/settings.json`. Run prettier on that one file only and copy the result back
    if it differs.

    Change the two hook template paths from `.sh` to `.ps1`, and keep the placeholder bodies until
    D2/D3, as a PowerShell comment plus `exit 0`. Rename the mirrors to
    `docs/agent-setup/hook-gaston-shell-guard.ps1` and `docs/agent-setup/hook-gaston-wiki-check.ps1`
    and delete the `.sh` mirrors. Update every 084 test or mock that names the `.sh` paths
    (`tests/e2e/agent-setup.spec.ts`, `src/renderer/lib/mock-bridge.ts`). All versions stay `1`.

  - **Shared types.** In `src/shared/types/agent-setup.ts` add:
    - `AgentProtectionRuleId`
    - `AgentProtectionRule = { id; status: 'installed'|'missing'; missing: string[] }`
    - `AgentProtectionState = { state: 'none' } | { state: 'unreadable'; reason: string } | { state: 'read'; rules: AgentProtectionRule[]; extraDeny: string[] }`
  - **`CLAUDE.md` template.** In `src/core/agent/templates/vault-claude.ts` add one paragraph:
    searches and listings name a folder (`modules/`, `projects/`, `areas/`, `inbox/`,
    `.secondbrain/agent/`). A search, recursive listing or glob that would reach `journal/` is
    blocked, and so is a shell write to `raw/`, `.claude/` or `CLAUDE.md`. Update the mirror
    `docs/agent-setup/vault-claude.md` byte-identically.
  - **`docs/VAULT-FORMAT.md`.** Add a subsection "Protection" to the "Agent setup" section (084):
    - the rule table above
    - the hook runtime (Windows PowerShell, exec form, guard fails closed, CLI ≥ 2.1.295 for
      `onFailure`)
    - the limits:
      - indirection: variables, command substitution, scripts that open files themselves
      - shell writes outside `raw/`/`.claude/`/`CLAUDE.md`
      - Glob shows journal file names
      - macOS/Linux fail closed
      - a session started in a subfolder loads no vault rules
  - **Tests.** New `tests/core/agent/protection.test.ts`:
    - "the installed settings deny journal reads and every protected write". Parse
      `SETTINGS_TEMPLATE.body`, then assert:
      - `permissions.deny` contains `Read(/journal/**)`, `Edit(/raw/**)`, `Edit(/CLAUDE.md)`,
        `Edit(/.claude/**)`, `Edit(/modules/*/wiki/overview.md)` and `Edit(/.secondbrain/*.json)`
      - it holds one entry per `INTERNAL_DIRS` value and the `jobs` dir
      - it holds no entry under `AGENT_DIRS.results|proposals|runs`
      - every entry starts with `Read(/` or `Edit(/`
    - "the hooks are registered in exec form and the guard fails closed". The PreToolUse matcher
      lists all nine tools, `command` is `powershell.exe`, the last arg starts with
      `${CLAUDE_PROJECT_DIR}/` and names a path in `SETUP_TEMPLATES`, the guard has
      `onFailure: 'block'`, and the wiki check is registered on `PostToolUse` and `Stop` without it.
- **D2 — The pre-tool guard `gaston-shell-guard.ps1`.**
  - **Template.** New `src/core/agent/templates/hook-shell-guard.ts` exports the body. Register it
    in place of the placeholder in `SETUP_TEMPLATES` (`src/core/agent/setup-templates.ts`): id
    `hook-gaston-shell-guard`, path `.claude/hooks/gaston-shell-guard.ps1`, format `script`,
    version 1. The mirror is `docs/agent-setup/hook-gaston-shell-guard.ps1`, and 084's mirror test
    covers it.
  - **Body constraints.**
    - It is a `String.raw` template literal.
    - The script is pure ASCII (PowerShell 5.1 reads BOM-less files as ANSI).
    - The PowerShell text contains no backtick and no literal `${` (the TS interpolation of
      `AGENT_DIRS` values is the one `${…}` allowed). Use `[char]10` / `[Environment]::NewLine`.
    - It has LF line endings and no absolute path.
    - The vault root is `Split-Path (Split-Path $PSScriptRoot)`. Never trust only
      `CLAUDE_PROJECT_DIR`.
  - **Runtime contract.**
    - Read stdin as UTF-8 (`[Console]::InputEncoding = [Text.Encoding]::UTF8;
[Console]::In.ReadToEnd()`), then `ConvertFrom-Json`.
    - Block = write the reason to stderr (ASCII, one line, never file content) and `exit 2`.
    - Allow = `exit 0` with no output.
    - The whole body is wrapped in `try { … } catch { [Console]::Error.WriteLine('Gaston guard
error: blocked to be safe.'); exit 2 }`. Unparseable JSON and a non-string field also exit 2.
    - Unknown `tool_name` is allowed. An empty `command` is allowed.
  - **Normalisation for every path or token.**
    - strip quotes
    - `\` → `/`
    - strip the `\\?\` prefix
    - lower-case
    - collapse `.`/`..` when resolved against `cwd` (from the input; fall back to the vault root)
    - expand an 8.3 segment: `<prefix>~<digit>` whose prefix starts `journal`, `raw` or `.claude`
      is read as that name, for example `JOURNA~1` → `journal`

    Tokenise the command on whitespace and the operators `; | & && || ( ) { } < > >> =`. Split
    segments at `; | & && || ( ) { } $(` and newline. A segment's verb is its first word after
    `VAR=x` assignments and `$x =`, with the directory part and `.exe` stripped.

  - **Rules for `Bash` and `PowerShell` (`tool_input.command`):**
    - **R1** Block if any token has a path segment equal to `journal` (bare word included).
    - **R2** Block if a token, resolved against the effective cwd, lands under the vault root and
      its top-level segment is a glob that matches `journal` (`*`, `j*`, `?ournal`, `[jJ]*`), or
      if `**` appears at or above that level.
    - **R3** Block a recursive traversal whose target folder (its path tokens, or the effective cwd
      when it has none) is the vault root, `journal/` or an ancestor of the vault root. The
      recursive traversals are:
      - `grep`/`egrep`/`fgrep` with `-r`/`-R`/`--recursive`/`-d recurse` (also inside combined
        short flags such as `-rn`)
      - `rg`, `ag`, `ack`, `git grep`, `find`
      - `ls -R`
      - `cp -r|-R|-a`
      - `tar`, `zip`, `7z`, `rsync`, `robocopy`, `xcopy`
      - `dir /s`, `findstr /s`
      - `Get-ChildItem`/`gci`/`dir`/`ls` with any parameter starting `-r` or with `-Depth`
      - `Copy-Item -Recurse`
      - `Compress-Archive`
    - **R4** A command containing `cd`/`Set-Location`/`sl`/`pushd`/`Push-Location`/`chdir` is
      evaluated with the vault root as its effective cwd.
    - **R5** Nested command strings are checked by the same rules, recursively up to depth 3: the
      string argument of `bash|sh -c`, `cmd /c|/k`, `powershell|pwsh -Command|-c`, `eval`,
      `Invoke-Expression`/`iex`. Block when any of these appears:
      - `-EncodedCommand`, `-enc` or `-e` on `powershell`/`pwsh`
      - `eval`/`iex`/`Invoke-Expression` with a non-literal argument (`$…`)
    - **R6** If any token, after normalisation, has a segment `raw` or `.claude`, or a final
      segment `claude.md`, or is a top-level glob matching one of them (`r*`, `*`), or resolves
      against the effective cwd to the vault root or an ancestor of it (`rm -rf .`,
      `git checkout -- .`), then block unless both of these hold:
      - every segment's verb is in the read-only list
      - there is no output redirect except to `/dev/null`, `$null`, `NUL` or `2>&1`

      `git clean|checkout|restore|reset|stash` with no path token counts as targeting the effective
      cwd, so it is blocked at the vault root. The read-only verbs:
      - POSIX: `cat head tail less more grep egrep fgrep rg wc ls file stat diff cmp sort uniq cut
tr echo printf pwd cd md5sum sha1sum sha256sum test [`, and `find` without
        `-delete|-exec|-execdir|-ok|-okdir|-fprint|-fprintf|-fls`
      - PowerShell, with aliases case-insensitive: `Get-Content gc type Select-String sls
Get-ChildItem gci dir Get-Item gi Get-FileHash Measure-Object measure Test-Path
Resolve-Path Select-Object select Sort-Object sort Where-Object where ? ForEach-Object %
Format-List fl Format-Table ft Out-String Write-Output write echo ConvertFrom-Json
Set-Location sl Get-Location pwd Push-Location Pop-Location`
      - cmd: `type findstr dir more`
  - **Rules for the other tools.**
    - `Read` (`file_path`), `Glob` (`path`, `pattern`) and `NotebookEdit` (`notebook_path`): R1 on
      each field.
    - `Grep`: R1 on `path` and `glob`. Also block when the search folder (`path`, or `cwd` when it
      is empty) is the vault root, `journal/` or an ancestor of the root.
    - `Write`/`Edit`/`MultiEdit`/`NotebookEdit`: R1. Then, for a target inside the vault root,
      allow only these two:
      - `modules/<slug>/wiki/**` except `modules/<slug>/wiki/overview.md`
      - `${AGENT_DIRS.results|proposals|runs}/**`, with the folder names interpolated from the
        TS constant when the body is built

      Block anything else with the reason "Write outside the wiki layer: use /gaston-propose." A
      target outside the vault root is allowed, because the CLI's own working-directory rules
      apply.
  - **Reasons.** Each reason names the rule in plain words, for example "Blocked by Gaston:
    journal/ is not readable for the agent." or "Blocked by Gaston: raw/ is read-only; this
    command may change it."
  - **Tests.** New `tests/core/agent/hook-shell-guard.test.ts`, inside
    `describe.runIf(process.platform === 'win32')`. The comment on that line says the hook runtime
    is Windows PowerShell and the CI runner is Windows.
    - `beforeAll` builds a temp vault with `journal/2026/10/2026-10-01.md`, `raw/web/page.md`,
      `modules/m/wiki/index.md` and `.claude/hooks/`, then writes `renderSetupFile(template)` from
      `src/core/agent/setup-marker.ts` there. Test the rendered artifact, not the bare body.
    - Each case spawns `powershell.exe` with the args D1 registers (script path = the temp vault's
      `.claude/hooks/gaston-shell-guard.ps1`) and the JSON on stdin (`{ hook_event_name:
'PreToolUse', tool_name, tool_input, cwd }`), and asserts the exit code (2 = block, 0 =
      allow), plus a non-empty stderr on block.
    - Run the cases with `it.concurrent.each` so the matrix stays at a few seconds.
    - Tests, each a table:
      - "a shell command that reads a journal file is blocked with a reason":
        - `cat journal/2026/10/2026-10-01.md`
        - `head -n 5 ./Journal/2026/10/2026-10-01.md`
        - the absolute Windows path, quoted, with backslashes
        - `ls journal`
        - `cd journal && cat 2026/10/2026-10-01.md`
        - `cat ../../journal/2026/10/2026-10-01.md` (cwd `modules/m/wiki`)
        - `cat JOURNA~1/2026/10/2026-10-01.md`
        - `cat */2026/10/*.md`
        - `cat j*/2026/10/*.md`
        - `bash -c "cat journal/2026/10/2026-10-01.md"`
        - `cmd /c type journal\2026\10\2026-10-01.md`
        - PowerShell `Get-Content journal\2026\10\2026-10-01.md`
        - PowerShell `gc .\JOURNAL\2026\10\2026-10-01.md`
      - "a recursive search from the vault root is blocked":
        - `grep -rn mood .`
        - `rg mood`
        - `find . -name "*.md" -exec cat {} +`
        - `cd .. && grep -r mood .` (cwd `modules`)
        - `findstr /s mood *.md`
        - PowerShell `Get-ChildItem -Recurse | Select-String mood`
        - PowerShell `Get-ChildItem -Path . -Recurse -Filter *.md`
        - Grep tool without path
        - Grep tool with path `journal`
      - "an encoded or dynamic command is blocked":
        - `powershell -EncodedCommand ZQBjAGgAbwA=`
        - `iex $cmd`
        - `eval "$x"`
      - "a shell command that only reads raw is allowed":
        - `cat raw/web/page.md`
        - `head -20 raw/web/page.md | wc -l`
        - `grep -n mood raw/web/page.md`
        - PowerShell `Get-Content raw\web\page.md -TotalCount 20`
      - "reads and searches scoped away from the journal are allowed":
        - `grep -rn mood modules/`
        - `cat modules/m/wiki/concepts/journal-habits.md`
        - `grep -n journaling modules/m/wiki/index.md`
        - `ls modules/*/wiki`
        - PowerShell `Get-ChildItem modules -Recurse -Filter *.md`
        - Grep tool with path `modules`
        - Glob tool `**/*.md` at the vault root
      - "a shell command that writes, moves or deletes under raw is blocked":
        - `rm raw/web/page.md`
        - `mv raw/web/page.md modules/m/wiki/sources/`
        - `cp modules/m/wiki/index.md raw/web/`
        - `echo hi > raw/web/page.md`
        - `sed -i s/a/b/ raw/web/page.md`
        - `cat raw/web/page.md | tee raw/web/b.md`
        - `rm -rf r*`
        - `git checkout -- .`
        - PowerShell `Remove-Item raw\web\page.md`
        - PowerShell `Set-Content -Path raw\web\page.md -Value x`
        - PowerShell `Move-Item raw\web\page.md modules\m\wiki\sources\page.md`
        - PowerShell `Get-ChildItem raw | ForEach-Object { Remove-Item $_.FullName }`
      - "the agent cannot change its own guard through the shell":
        - `rm -rf .claude/hooks`
        - `echo {} > .claude/settings.json`
        - PowerShell `Set-Content CLAUDE.md x`
      - "file tools reach only the wiki layer and the hand-over folders":
        - block:
          - Read `<root>\Journal\2026\10\2026-10-01.md`
          - Glob path `journal`
          - Write `modules/m/wiki/overview.md`
          - Edit `modules/m/module.md`
          - Write `projects/p.md`
          - Write `.secondbrain/agent/jobs/j1.md`
          - Write `.secondbrain/gardener.json`
          - Write `raw/web/x.md`
        - allow:
          - Read `modules/m/wiki/index.md`
          - Write `modules/m/wiki/concepts/x.md`
          - Write `.secondbrain/agent/results/j1.md`
          - Write a path outside the vault
          - `mkdir -p modules/m/wiki/concepts`
          - `echo x >> modules/m/wiki/log.md`
      - "malformed input is blocked, never allowed": non-JSON stdin, and a `command` that is a
        number.
      - "the guard template is ASCII and safe to embed": no char > 0x7E except LF, no backtick, no
        `${`. Run outside the `runIf`, on every OS.
- **D3 — The post-write check `gaston-wiki-check.ps1`.**
  - **Template.** New `src/core/agent/templates/hook-wiki-check.ts`, registered in
    `SETUP_TEMPLATES` in place of the placeholder: id `hook-gaston-wiki-check`, path
    `.claude/hooks/gaston-wiki-check.ps1`, format `script`, version 1. The mirror is
    `docs/agent-setup/hook-gaston-wiki-check.ps1`. The body follows the same constraints as D2:
    `String.raw`, ASCII, no backtick, no `${`, vault root from `$PSScriptRoot`, UTF-8 stdin,
    `ConvertFrom-Json`. Report = reason on stderr and `exit 2`. Silent = `exit 0`. Any internal
    error → `exit 0` with no output, because this is a report and never a guard.
  - **`PostToolUse`** (`tool_input.file_path`, Windows backslashes possible).
    - Normalise as in D2 and make the path relative to the vault root (case-insensitive). Only
      `modules/<slug>/wiki/**/*.md` counts, and anything else exits 0 at once.
    - For `log.md`: mark `logWritten` for the module in the ledger and exit 0.
    - For any other wiki file: record the module in the ledger if new, with
      `baseline` = the count of lines in `modules/<slug>/wiki/log.md` that match
      `^##\s*\[\d{4}-\d{2}-\d{2}\]` (0 when absent), and add the page.
    - Unless the file is `index.md`, check the frontmatter. Valid means:
      - line 1 is `---`, and a closing `---` follows
      - each non-blank line between them matches `^[A-Za-z_][\w-]*:` or `^\s+` or `^-\s`
      - the keys `type title module created updated tags sources` are present
      - `type` is in `source|entity|concept|overview`

      An invalid page gets "Gaston wiki check: <relative path> has invalid frontmatter (<first
      problem>)." and exit 2.
  - **Ledger.** `Join-Path ([IO.Path]::GetTempPath()) ('gaston-wiki-' + <session_id stripped to
[A-Za-z0-9-]> + '.json')`, holding `{ "<slug>": { "baseline": n, "logWritten": bool, "pages":
[..] } }`. The ledger holds only paths and counts, never content.
  - **`Stop`.**
    - With `stop_hook_active` true, or no ledger, exit 0.
    - Otherwise, a module whose `logWritten` is false and whose current heading count is not above
      its baseline gets one line: "Gaston wiki check: modules/<slug>/wiki changed (<pages>) without
      a new entry in wiki/log.md." Exit 2 if there is any such module.
    - Delete the ledger after reporting or after a clean pass.
  - **Tests.** New `tests/core/agent/hook-wiki-check.test.ts`, same harness and `runIf` comment as
    D2. Set `TEMP` and `TMP` in the spawned env to a per-test temp dir for an isolated ledger, and
    give each test a unique `session_id`. Tests:
    - "a wiki page written without valid frontmatter is reported". Cases:
      - no frontmatter
      - missing closing `---`
      - missing `title`
      - `type: banana`

      Each exits 2, and stderr names the path.

    - "a wiki page with the schema's frontmatter passes". Build the page with `pageFrontmatter`
      from `src/core/wiki/pages.ts` serialized by `src/core/vault/frontmatter.ts` and expect exit 0. Writing `index.md` also exits 0.
    - "a file outside the wiki layer is ignored": `projects/p.md` exits 0, and Stop then exits 0.
    - "a wiki change without a new log entry is reported when the session stops": Post(page),
      then Stop gives exit 2 with stderr naming `modules/m`.
    - "a wiki change with its log entry stays silent". Two variants, both followed by Stop with
      exit 0:
      - Post(page), then Post(`log.md`)
      - Post(page), then append `## [2026-10-22] lint` to `log.md` on disk with no Post
    - "a repeated stop does not loop": Stop with `stop_hook_active: true` exits 0.
    - "the wiki check template is ASCII and safe to embed": runs on every OS.
- **D4 — Protection status in core.**
  - New `src/core/agent/protection-status.ts` with
    `readProtection(store: VaultStore, rules = PROTECTION_RULES): Promise<AgentProtectionState>`.
    - Read `.claude/settings.json` via `store.readText`. `null` gives `{ state: 'none' }`. JSON that
      fails to parse, or a non-object, gives `{ state: 'unreadable', reason }`. The reason is the
      parser message, cut to 200 chars.
    - Otherwise, per rule, `missing` collects:
      - each `deny` entry absent from `permissions.deny` (string array; anything else counts as
        empty), by exact match after trim
      - for each hook requirement, `hook:<event>` unless both of these hold:
        - `hooks[event]` has a group whose `matcher` split on `|` contains every required tool
          (`Stop`: any group)
        - that group has a hook with `type: 'command'` whose `command` + `args` joined contain the
          script path, and with `onFailure === 'block'` when `failClosed`
      - `script:<path>` when the script file does not exist (`store.exists`)

      `status` is `installed` when `missing` is empty.

    - `extraDeny` = deny entries that are in no rule, in file order.
  - Never import Electron or `node:fs`.
  - Tests in new `tests/core/agent/protection-status.test.ts`, with `MemoryVaultStore` and
    `renderSetupFile`/`SETUP_TEMPLATES` to install:
    - "a vault without settings reads as unprotected"
    - "an installed setup reads every rule as installed"
    - "a rule removed by hand reads as missing": drop `Read(/journal/**)`, and only `journal-read`
      is missing, naming that entry
    - "a guard that no longer fails closed or lost its script reads as missing": remove
      `onFailure`, and separately delete the `.ps1`
    - "deny entries Gaston did not write are listed as the user's"
    - "an unreadable settings file is reported, not shown as unprotected"
- **D5 — `agent:protectionStatus` over IPC.**
  - Add `'agent:protectionStatus'` (req `void`, res `AgentProtectionState`) to the route map and
    `IPC_CHANNELS` in `src/shared/ipc.ts`, mirroring `'agent:setupStatus'`.
  - Add a handler in `src/main/ipc/agent-setup.ts` (084's file, same `defineHandlers` shape)
    calling `readProtection(services.requireStore())`.
  - Add `api.agent.protectionStatus()` in `src/renderer/lib/api.ts` and a stub in
    `src/renderer/lib/mock-bridge.ts` returning `{ state: 'none' }`.
  - Add the key `qk.agent.protection()` in `src/renderer/lib/queries/keys.ts` and the hook
    `useAgentProtection()` in `src/renderer/lib/queries/agent.ts`, mirroring `useAgentSetupState`
    (`enabled: useVaultReady()`, `staleTime: 0`). `useApplyAgentSetup` additionally invalidates
    `qk.agent.protection()`.
  - Proven by the existing `tests/main/ipc-coverage.test.ts` and D6's e2e.
- **D6 — Protection panel in the Agent tab.**
  - New `src/renderer/screens/settings/agent/AgentProtectionPanel.tsx`, mounted in `AgentTab.tsx`
    directly after `AgentSetupPanel`. Mirror that panel's structure: `Panel`, `Badge`, `Skeleton`,
    `useT`, atoms and tokens only. Read `src/renderer/styles/gaston/README.md`.
  - **States.**
    - loading: skeleton
    - `none`: "Nothing protects this vault from the agent yet. Install the setup above to add the
      rules."
    - `unreadable`: ".claude/settings.json could not be read: {reason}. The state of the rules is
      unknown."
    - query error: the same sentence with the error reason, never blank
    - `read`: one row per rule, with the sentence and a `Badge` "Installed" or "Missing". A missing
      row lists its `missing` entries in mono. If `extraDeny` is non-empty, the section "Rules you
      added" lists them in mono.
    - Under every resolved state, one muted line: "The shell check reads the command text. A path
      built from variables, or a script that opens files itself, is not caught."
  - **Row sentences (en).**
    - journal-read: "journal/ cannot be read or changed by Claude's file tools."
    - raw-write: "raw/ is read-only."
    - setup-write: "CLAUDE.md and .claude/ are read-only."
    - overview-write: "wiki/overview.md changes only through a proposal."
    - internal-write: ".secondbrain/ is read-only except results, proposals and runs."
    - pre-tool-guard: "A check before each tool call blocks shell access to journal/, shell writes
      to raw/, and writes outside the wiki layer."
    - wiki-check: "Wiki writes are checked for frontmatter and a log.md entry."
  - **German.** Provide all of these in German too. No straight-quote closer: use „…“ only if
    quoting.
  - **Keys.** `settings.agent.protection.*` in 084's settings-agent i18n pair (or
    `en-settings.ts`/`de-settings.ts` if 084 kept them there).
  - **Also.** Add `{ id: 'settings-agent-protection', … }` only if the screen pass needs a separate
    entry (it does not when the agent tab entry already covers the panel). Add one `### Added`
    line to `CHANGELOG.md`.
  - **e2e.** New `tests/e2e/agent-protection.spec.ts` (`test.use({ specId: 'agent-protection' })`,
    navigation as in `tests/e2e/agent-setup.spec.ts`, files edited via `vaultPath`). One test,
    "the protection section reads the rules back from the vault":
    1. Open `#/settings?tab=agent`. The Protection panel shows the "Nothing protects…" sentence
       naming Install.
    2. Click "Install" and confirm the plan dialog with 084's labels. The panel lists all seven
       rows as Installed.
    3. Remove `Read(/journal/**)` from `<vaultPath>/.claude/settings.json` on disk, keeping the
       JSON valid.
    4. Navigate away and back. The journal row shows Missing and names `Read(/journal/**)`, and
       the other six rows stay Installed.

## Model Hints

- D2 → deliverable-hard. A false allow sends the journal to a cloud model. The guard must:
  - hold against command shapes in two shells, with Windows spellings (case, `\`, 8.3, `\\?\`)
  - fail closed on every error path
  - stay byte-safe inside a TS `String.raw` constant (no backtick, no `${`)

  None of these shows up in a happy-path test.

Review: → story-review-hard. A guard that matches exactly the listed test commands passes the
matrix and a default review, yet fails open on a nearby unlisted spelling. Examples: `type
.\JOURNAL\x`, `Get-Content -LiteralPath`, a `catch` that exits 1, a registration that runs in shell
form. Only a second adversarial pass checks the negative claim "no obvious journal read is allowed".

## Acceptance Tests

Spawn-based hook tests run on win32, the only packaged platform and the CI runner
(`.github/workflows/verify.yml`). Elsewhere they report as skipped with that reason.

- AC1 → unit `tests/core/agent/protection.test.ts` › "the installed settings deny journal reads and
  every protected write"
- AC2 → unit `tests/core/agent/hook-shell-guard.test.ts` › "a shell command that reads a journal
  file is blocked with a reason" + "a shell command that only reads raw is allowed"
- AC3 → unit `tests/core/agent/hook-shell-guard.test.ts` › "a shell command that writes, moves or
  deletes under raw is blocked"
- AC4 → unit `tests/core/agent/hook-wiki-check.test.ts` › "a wiki page written without valid
  frontmatter is reported"
- AC5 → unit `tests/core/agent/hook-wiki-check.test.ts` › "a wiki change without a new log entry is
  reported when the session stops" + "a wiki change with its log entry stays silent"
- AC6 → e2e `tests/e2e/agent-protection.spec.ts` › "the protection section reads the rules back
  from the vault"; unit `tests/core/agent/protection-status.test.ts` › "a rule removed by hand reads
  as missing"
- AC7 → e2e `tests/e2e/agent-protection.spec.ts` › "the protection section reads the rules back
  from the vault"; unit `tests/core/agent/protection-status.test.ts` › "a vault without settings
  reads as unprotected"

Coverage gate:

| AC  | Delivered by          |
| --- | --------------------- |
| AC1 | D1                    |
| AC2 | D1 (registration), D2 |
| AC3 | D2                    |
| AC4 | D1 (registration), D3 |
| AC5 | D3                    |
| AC6 | D4, D5, D6            |
| AC7 | D4, D5, D6            |

One new e2e flow: the protection read-back is its own user-facing path. Its install step reuses
084's buttons and does not re-prove them.

## Done
