---
id: 093
title: The agent's guard holds under an adversarial pass
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Story [[085]] shipped the protection that keeps the vault agent out of `journal/` and off `raw/`: deny
rules, a fail-closed PowerShell pre-tool guard (`hook-shell-guard.ts`) and a wiki post-write check. A
false allow leaks the journal to a cloud model, so the guard has to be attacked before a release, not
only tested by its author.

S20's hard review of 085 never ran its adversarial probe battery: a safety classifier stopped it while it
was preparing about 150 probes, and the orchestrator did not retry. The verdicts for 085 rest on reading
the code, the guard author's 198 probes and the stage-1 reviewer's ~100 probes through the real script
(`powershell.exe`, win32 only). That is a merge and release caveat
([S20 review](../sprints/S20/review.md)).

Alongside that pass, five known gaps in the same protection are closed or consciously accepted:

- `[char[]]` indirection can build a path the guard cannot see (documented limit).
- The protection reader judges a hook as installed from its path and existence only; it does not read
  `disableAllHooks`, so the panel can say a rule holds while the hooks are switched off.
- The guard's write allowlist permits `modules/gaston-help/wiki/**`, which the vault `CLAUDE.md` calls
  read-only.
- The wiki post-write check's heading regex is looser than the one in `src/core/wiki/log-md.ts`.
- `.secondbrain/index/` and `.secondbrain/chats/` are protected like `journal/` (beyond the spec text of
  085); the concept and the Protection panel wording should say so.

## Acceptance Criteria

- [ ] **AC1** — An adversarial probe battery against the shell guard has been run through the real
      script, and every probe that reads `journal/` (or `.secondbrain/index/`, `.secondbrain/chats/`)
      or writes `raw/` is blocked. The user runs this pass; every gap this story closes is committed
      as a regression case in the guard's test table.
- [ ] **AC2** — With `disableAllHooks: true` in the vault's `.claude/settings.json` or
      `.claude/settings.local.json`, the Protection section shows the two hook rules
      (`pre-tool-guard`, `wiki-check`) as **Off** with `disableAllHooks` named, while the deny rules
      keep their own status.
- [ ] **AC3** — The guard blocks every write under `modules/gaston-help/` (Write, Edit, MultiEdit,
      NotebookEdit and a shell write), while reading those pages and writing another module's wiki
      still pass.
- [ ] **AC4** — For one table of log lines, the wiki post-write check counts exactly the headings that
      `parseLog` in `src/core/wiki/log-md.ts` parses as entries.
- [ ] **AC5** — A shell command that uses `[char[]]` (or `[System.Char[]]`) is blocked as a dynamic
      command; the agent help page lists it under what the guard blocks, no longer under its limits,
      and the Protection panel's limit sentence does not imply it passes.
- [ ] **AC6** — The Protection panel's `journal-read` sentence names `journal/`, the derived index and
      the chat sessions; the concept and `docs/VAULT-FORMAT.md` say the same.

## Open Questions

- ~~**Q1 — How is the battery run?** The classifier stopped a reviewer that generated ~150 probes itself.
  Options: the probes are hand-written by the guard's author and committed as fixtures, then a reviewer
  only runs and extends them; or the pass is done by the user. The pass must not be skipped again. ~~ answered → Decisions (Sprint)
- ~~**Q2 — `[char[]]` indirection.** Block any shell command that builds a string from char codes, or keep
  it a documented limit? ~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — how is the battery run: the user runs the adversarial pass themselves. AC1 is `manual residue: the user attacks the guard with their own probes (a safety classifier stopped the agent-generated battery in S20)`; the build still commits regression fixtures for probes that already exist and for every gap this story closes.
- **(User)** Q2 — `[char[]]` indirection: block it (fail closed), with a test.
- `[char[]]` is matched as `[char[]]` and `[System.Char[]]`, case- and whitespace-tolerant, anywhere in
  the command, and blocked with the existing dynamic-command reason: the qualified type is the same
  indirection, and a new reason text gives the agent nothing new to act on.
- Legitimate uses such as `'a,b'.Split([char[]]',')` are blocked too, because the user chose to fail
  closed and a false block only costs the agent one retry.
- `[char](106)` with parentheses and `[char]$x` stay out of scope, because the user's own adversarial
  pass decides whether they become a follow-up and this story does not pre-empt that battery.
- The help-module block covers all of `modules/gaston-help/`, not only `wiki/`, because Gaston
  installs every file of that module and one folder rule is simpler than a wiki-only exception.
- Shell writes to `modules/gaston-help/` are blocked the same way as shell writes to `raw/`
  (read-only commands pass). Otherwise AC3 would hold only for the file tools, and a `>` redirect could
  still overwrite a managed page.
- No new deny rule in `settings.json` for the help module, because AC3 asks for the guard. A new rule
  id would ripple through the shared type, the panel, both catalogs and the docs, and the help-module
  status already reports a damaged page as `outdated`.
- `disableAllHooks` is read only from the vault's `.claude/settings.json` and
  `.claude/settings.local.json`. User-level and managed settings live outside the vault, and the
  panel's contract is to read the vault's files back. The help page names this as a limit.
- A disabled hook gets a new rule status `off` (badge "Off" / „Aus“, warning variant) instead of
  `missing`, because the hooks are installed and "Missing" would send the user to reinstall, which
  fixes nothing.
- The wiki check reuses the heading pattern exported from `log-md.ts`: it interpolates the pattern
  into the PowerShell template and matches it case-sensitively (`-cmatch`) on the right-trimmed line.
  With one shared pattern, the two checks cannot drift apart again.
- The guard, wiki-check and help-module template versions are bumped so installed vaults are offered
  the update. The settings template version stays, because no deny entry changes.
- Review tier stays default: D1 already runs on the hard tier, and every behaviour here is a block or
  allow verdict that a test case can see. AC1's open-ended pass is the user's residue, not a review's.

## Plan

1. **Guard (D1):** in `hook-shell-guard.ts`, block `[char[]]` / `[System.Char[]]` early in
   `Check-Shell` with `$ReasonDynamic`. Make `modules/gaston-help/` a protected write target, for the
   file tools through `Check-Write` and for shell writes through the same trigger chain as `raw/`,
   with its own reason. Bump the template version and add the regression cases to the guard's tables.
2. **Heading parity (D2):** export the heading pattern from `log-md.ts`, interpolate it into the wiki
   check and bump that template version. A parity table runs through `parseLog` and the real hook.
3. **disableAllHooks in core (D3):** `readProtection` reads the flag from both vault settings files and
   marks the hook rules `off`. The shared type gets the new status.
4. **disableAllHooks in the panel (D4):** add the badge and catalog strings for `off`, plus one step in
   the existing e2e flow `agent-protection.spec.ts`.
5. **Wording (D5):** update the panel sentences (journal-read, pre-tool-guard, limit), the help page
   `pages-agent.ts` together with `HELP_MODULE_VERSION`, `docs/VAULT-FORMAT.md` Protection/Limits,
   the concept's read-restriction row, and `CHANGELOG.md`.

Order: D1, D2 and D3 are independent; D4 comes after D3; D5 comes last, because it changes the
sentences that D4's e2e flow asserts. No new e2e flow: AC2 and AC6 are steps of the existing
protection flow.

## Deliverables

- **D1: the guard blocks `[char[]]` and writes to the help module.**
  Files: `src/core/agent/templates/hook-shell-guard.ts`, `src/core/agent/templates/protection.ts`
  (`HOOK_SHELL_GUARD_TEMPLATE.version` 1 → 2), `tests/core/agent/hook-shell-guard.test.ts`.
  - In `Check-Shell`, next to the `frombase64string` check, block any command that matches
    `\[\s*(system\.)?char\s*\[\s*\]\s*\]` (case-insensitive) with `$ReasonDynamic`.
  - Interpolate `HELP_MODULE_SLUG` from `src/shared/help-module.ts` (the template already interpolates
    `AGENT_DIRS` and `INTERNAL_DIRS`). Keep the body pure ASCII, with no backtick and no dollar-brace
    inside the PowerShell. Add `$ReasonHelp = 'Blocked by Gaston: modules/gaston-help/ is Gaston''s
    help module and read-only for the agent.'` with the slug interpolated.
  - `Check-Write`: a vault-relative path under `modules/<help-slug>/` blocks with `$ReasonHelp`
    before the wiki-layer allow.
  - Shell writes: add a target `$THelp` (`<root>/modules/<help-slug>`) to the trigger chain next to
    `Reaches $segs $TRaw $true` (around line 646), with trigger `help`, blocked with `$ReasonHelp`.
    Leave the `LiteralHit` path as it is. Read-only commands near the folder must pass exactly as they
    do near `raw/`.
  - Tests: use the existing `bash`/`ps`/`tool` helpers and block/allow tables. Test names describe the
    behaviour, never a story id.
    - Block: `ps('$p = -join [char[]](106,111,117,114,110,97,108); gc $p')`,
      `ps('-join [ CHAR [ ] ](106,111)')`, `ps('[System.Char[]]"journal" -join ""')`, `Write`, `Edit`
      and `MultiEdit` on `modules/gaston-help/wiki/concepts/agent.md`, `NotebookEdit` under
      `modules/gaston-help/`, `bash('echo x > modules/gaston-help/wiki/a.md')`,
      `ps('Set-Content modules/gaston-help/module.md x')`, `bash('cp a.md modules/gaston-help/wiki/')`.
    - Allow: `Read` and `bash('cat modules/gaston-help/wiki/concepts/agent.md')`, and `Write` on
      `modules/other/wiki/a.md`.
  - Do not edit existing cases; every existing case must stay green.
- **D2: the wiki check and `log-md.ts` read the same headings.**
  Files: `src/core/wiki/log-md.ts`, `src/core/agent/templates/hook-wiki-check.ts`,
  `src/core/agent/templates/protection.ts` (`HOOK_WIKI_CHECK_TEMPLATE.version` 1 → 2),
  `tests/core/agent/hook-wiki-check.test.ts`.
  - In `log-md.ts`, export the heading pattern as `LOG_HEADING_SOURCE` and keep the local `HEADING`
    regex built from it.
  - In `Count-Headings`, use `$line.TrimEnd() -cmatch '<interpolated source>'`. The pattern contains no
    `'`; if it ever does, throw at module load rather than emit a broken script.
  - Test: one table of log lines written as one `wiki/log.md` after a page write, modelled on the
    existing Stop cases around lines 160-190 of the test file. The Stop event reports exactly when
    `parseLog(...)` finds no entry among the new lines.
    - Valid lines: `## [2026-10-22] ingest | a`, `## [2026-10-22] lint`, `##[2026-10-22]query`, and a
      heading with trailing spaces.
    - Invalid lines: `## [2026-10-22] note`, `## [2026-10-22]`, `## [2026-10-22] INGEST`,
      `### [2026-10-22] ingest`, `## [26-10-22] ingest`.
- **D3: the protection status knows `disableAllHooks`.**
  Files: `src/shared/types/agent-setup.ts` (`AgentProtectionRule.status` gains `'off'`),
  `src/core/agent/protection-status.ts`, `tests/core/agent/protection-status.test.ts`.
  - `readProtection` also reads `.claude/settings.local.json`. If that file is absent or unparsable it
    is ignored; errors in the main file keep their current behaviour.
  - `disableAllHooks === true` in either file gives every rule with `hooks.length > 0`
    `status: 'off'` and `missing: ['disableAllHooks']`. Rules without hooks are unchanged, and a
    non-boolean value counts as not set.
  - Tests: the flag in `settings.json` turns the hook rules `off` and leaves the deny rules
    `installed`; the flag in `settings.local.json` does the same; `false` and `"true"` change nothing.
- **D4: the panel shows a disabled hook as Off.**
  Files: `src/renderer/screens/settings/agent/AgentProtectionPanel.tsx` (badge variant `warning` for
  `off`), `src/renderer/i18n/en-settings.ts` (`settings.agent.protection.status.off`: `Off`),
  `src/renderer/i18n/de-settings.ts` (`Aus`), `src/renderer/lib/mock-bridge.ts` only if its types
  require it, `tests/e2e/agent-protection.spec.ts`.
  - e2e: add a new `test.step` at the end of the existing test. It writes `disableAllHooks: true` into
    `.claude/settings.json` and re-opens the tab. The guard and wiki rows then show `Off` and
    `disableAllHooks`, and the raw, setup, overview and internal rows stay `Installed` (the journal
    row is still `Missing` from the step before).
- **D5: wording, help page and docs.**
  Files: `src/renderer/i18n/en-settings.ts` and `de-settings.ts`, `tests/e2e/agent-protection.spec.ts`,
  `src/core/agent/help/pages-agent.ts`, `src/core/agent/help/version.ts`, `docs/VAULT-FORMAT.md`,
  `docs/concepts/vault-agent.md`, `CHANGELOG.md`.
  - Panel strings: `rule.journal-read` names journal/, the derived index and the chat sessions.
    `rule.pre-tool-guard` adds the help module. `limit` stays about variables and scripts, without
    implying that `[char[]]` passes. German strings use „…“.
  - `tests/e2e/agent-protection.spec.ts`: the `RULES` constants follow the new sentences.
  - Help page `pages-agent.ts`: "What the shell guard blocks" adds `[char[]]` and writes to
    `modules/gaston-help/`. "What it does not catch" drops the `[char[]]` example and adds that a
    `disableAllHooks` outside the vault's two settings files is not seen. Raise `HELP_MODULE_VERSION`
    in `version.ts` by one from its current value.
  - `docs/VAULT-FORMAT.md`: the same points in the Protection limits.
  - `docs/concepts/vault-agent.md`: the read-restriction row says `.secondbrain/index/` and `chats/` are
    unreadable too, with the reason.
  - `CHANGELOG.md`: one user-facing entry.
  - Run `tests/core/agent/help-module.test.ts` and `tests/e2e/help-module.spec.ts`, and update any
    text assertion that pins an old sentence.

## Model Hints

- D1 → deliverable-hard. The guard is an 800-line fail-closed script: a new target in the shell
  trigger chain can either let a write through (a false allow) or turn every command near `modules/`
  into a block, and the `[char[]]` pattern must not break the existing probe table.
- Review: → default

## Acceptance Tests

- AC1 → manual residue: the user attacks the guard with their own probes (a safety classifier stopped
  the agent-generated battery in S20). The gaps this story closes are regression cases in
  `tests/core/agent/hook-shell-guard.test.ts` › "pre-tool guard" (D1).
- AC2 → unit `tests/core/agent/protection-status.test.ts` › "disableAllHooks turns the hook rules off
  and leaves the deny rules installed" (D3), and e2e `tests/e2e/agent-protection.spec.ts` › "the
  protection section reads the rules back from the vault", new step "hooks switched off by
  disableAllHooks show as off" (D4).
- AC3 → unit `tests/core/agent/hook-shell-guard.test.ts` › "pre-tool guard", help-module block and
  allow cases (D1).
- AC4 → unit `tests/core/agent/hook-wiki-check.test.ts` › "the log check counts the headings parseLog
  reads" (D2).
- AC5 → unit `tests/core/agent/hook-shell-guard.test.ts` › "pre-tool guard", `[char[]]` block cases
  (D1). The help page and panel wording come from D5 and are checked by the review.
- AC6 → e2e `tests/e2e/agent-protection.spec.ts` › "the protection section reads the rules back from
  the vault", step "installing lists all seven rules as installed" with the new journal-read sentence
  (D5). The concept and VAULT-FORMAT wording is checked by the review.

Coverage: AC1 D1 + residue · AC2 D3 + D4 · AC3 D1 · AC4 D2 · AC5 D1 + D5 · AC6 D5.

## Done
