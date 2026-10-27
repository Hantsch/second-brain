---
id: 089
title: Every agent run leaves a report
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Hash detection shows that files changed, not why. Every run of a Gaston skill ends with one report
file under `.secondbrain/`: when, which skill, wiki pages changed, proposals written, jobs finished
or failed (concept §5, AGT-17). The Agent tab's **Last run** section shows the newest report and
links to Maintenance when proposals wait ([[088]]).

## Acceptance Criteria

- [ ] **AC1** — Every run of an installed Gaston skill ends with one report file in the reports
      folder, written by the setup's stop hook in the format Gaston reads; a test runs the installed
      hook and parses its report with Gaston's reader, and the template test pins the hook.
      _(Reworded at refine to the (User) decision that a stop hook, not the skill, writes it.)_
- [ ] **AC2** — The Agent tab shows the newest report: time, skill, pages changed, proposals
      written, jobs finished and failed.
- [ ] **AC3** — A report written while Gaston is open updates the tab without a restart.
- [ ] **AC4** — With no report yet, the section says no run has happened.
- [ ] **AC5** — An unreadable report shows as unreadable with its path; the tab still renders.
- [ ] **AC6** — When proposals are waiting, the section links to Maintenance.

## Open Questions

- ~~**Q1 — Who writes the report.** The skill (the model can forget), or a CLI stop hook that writes it deterministically from what changed?~~ answered → Decisions (Sprint)
- ~~**Q2 — Retention** (concept O3): keep every report, the last N, or the last N days?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Who writes the report: a CLI stop hook, deterministically from what changed.
- **(User)** Retention: keep the last 50 reports.

Decided at refine:

- **One new hook script, not an extension of the wiki check.** `.claude/hooks/gaston-run-report.ps1`
  (template id `hook-gaston-run-report`), Windows PowerShell 5.1 in exec form like 085's hooks; one
  file, one responsibility, and 085's runtime decision covers it.
- **The hook is registered outside `PROTECTION_RULES`** (a separate `REPORT_HOOKS` list rendered into
  the same `settings.json`), because a run report is not protection and must not add a row to the
  Protection panel.
- **A run starts when a Gaston skill starts:** a `UserPromptSubmit` whose prompt begins with
  `/gaston-jobs`, `/gaston-curate` or `/gaston-propose`, or a `PostToolUse` on the `Skill` tool naming
  one of them. Both are watched because the user types the skill and a skill may call another.
- **A run that is open absorbs nested skills** (curate calling propose stays one run with the outer
  skill), so a run never yields two reports.
- **The run's report is written at every `Stop` while the run is open, rewriting the same file; the
  next `UserPromptSubmit` closes the run.** A blocking Stop hook (085's wiki check) makes the agent
  continue, and that continuation belongs to the run, so the first Stop cannot be the last word.
- **"What changed" is read from disk, not from the tool calls:** files under `modules/*/wiki/`
  (`.md`, without `log.md`), `.secondbrain/agent/proposals/` and `.secondbrain/agent/results/` whose
  last write time is at or after the run start. This also catches shell writes, which a tool ledger
  misses; a page Gaston itself wrote during the run is attributed to it, which is documented as a
  limit.
- **Job outcome comes from each result's `status`** (`done` → finished, `failed`, `skipped`), read from
  `.json` results (today's format, `src/core/agent/jobs.ts`) and from a `status:` frontmatter line in
  `.md` results, so 090 may pick either without touching the hook.
- **Report format:** `.secondbrain/agent/runs/<yyyyMMddTHHmmssZ>-<skill>.md` (UTC start time; `-2`,
  `-3` … on a name collision), frontmatter `gaston: run-report`, `version: 1`, `skill`, optional
  `argument`, `started`, `finished` (ISO UTC), and the lists `pages` (vault-relative paths),
  `proposals` (file names), `jobsDone`, `jobsFailed`, `jobsSkipped` (job ids), empty as `[]`. File
  names sort by start time, so "newest" is the last name.
- **Proposals are listed by file name, not path,** so the reference survives 088's (User) decision to
  move accepted and rejected proposals aside.
- **`argument` is kept only when it is a slug** (`[a-z0-9-]`, at most 64 characters), else omitted:
  the prompt is the user's text and does not belong in a file (guardrail 6).
- **The hook prunes:** after writing, it deletes the oldest `runs/*.md` by name beyond 50. The folder
  stays bounded even when Gaston is never opened.
- **The newest report is shown as it is:** if it is unreadable, the section shows it as unreadable with
  its path instead of falling back to an older one (AC5), so a broken hook is visible.
- **No new watcher plumbing.** A file under `.secondbrain/agent/runs/` already reaches the renderer as
  `event:vault-changed` (the watcher ignores only `index` and `trash`), which invalidates the `agent`
  query root; the new query key lives under it.
- **"Proposals waiting" is the Maintenance count from 088**, not the run's own `proposals` list: the
  link is about what still needs the user.
- **The agent is told not to write reports; runs/ is not denied.** Skills and the vault `CLAUDE.md`
  say the hook writes the report. Adding a deny rule and a shell-guard change is out of scope, and a
  forged report misleads nobody beyond the agent's own run.
- **Template versions are bumped by one from whatever they are at build time** (088 bumps the propose
  skill in the same sprint). 084's mechanism tests already prove that a bumped template shows
  "outdated" and updates; this story adds no separate e2e for that.
- **The Last run section sits in the Settings → Agent tab** between Protection and About this, as
  the story and concept §12 say; the link goes to the Maintenance route `#/garden`.

## Plan

Order D1 → D2 → D3 → D4 → D5. D3 is independent of D2 once D1 is in.

1. **Format + reader (D1):** shared types and constants for the run report, a pure core reader
   `src/core/agent/run-reports.ts` that finds the newest report and parses it (or says why not), and
   the format section in `docs/VAULT-FORMAT.md`.
2. **Hook (D2):** the PowerShell run-report hook as a setup template, registered on
   `UserPromptSubmit`, `PostToolUse` (`Skill`) and `Stop` through a `REPORT_HOOKS` list rendered into
   `settings.json`. Tested by running the installed script as Claude Code does and parsing its output
   with D1's reader.
3. **Instructions (D3):** the three skills and the vault `CLAUDE.md` say the hook writes the report
   and the agent never writes `runs/`.
4. **IPC (D4):** `agent:lastRun` through main, typed client, query hook under `qk.agent`.
5. **UI (D5):** the Last run panel in the Agent tab, with the Maintenance link from 088's count; one
   e2e flow walks no-run → report appears → proposal waits → unreadable report.

Data flow: skill run → hook writes `runs/<id>.md` → watcher → `event:vault-changed` → `agent` query
root invalidated → `agent:lastRun` → core reader → panel.

## Deliverables

- **D1 — Run report format and reader.**
  - In `src/shared/types/agent-setup.ts` add `RUN_REPORT_FORMAT = 'run-report'`,
    `RUN_REPORT_VERSION = 1`, `RUN_REPORTS_KEPT = 50`, and the types
    `AgentRunReport { skill: string; argument: string | null; started: string; finished: string; pages: string[]; proposals: string[]; jobsDone: string[]; jobsFailed: string[]; jobsSkipped: string[] }`
    and
    `AgentLastRun = { state: 'none' } | { state: 'read'; path: string; report: AgentRunReport } | { state: 'unreadable'; path: string; reason: string }`.
  - New `src/core/agent/run-reports.ts`: `parseRunReport(content): AgentRunReport | { error: string }`
    using `parse` from `src/core/vault/frontmatter.ts`; and
    `readLastRun(store: Pick<VaultStore, 'list' | 'readText'>): Promise<AgentLastRun>`
    that lists `AGENT_DIRS.runs` (`store.list({ dir })`, see `ListOptions` in `src/core/vault/types.ts`), takes the last `*.md` by name, and parses it. Missing folder or no
    file → `none`. Rules: `gaston` must equal `RUN_REPORT_FORMAT`, `version` must be a number ≤
    `RUN_REPORT_VERSION` (a higher one is unreadable, reason "written by a newer Gaston"), `skill`
    a non-empty string, `started`/`finished` ISO timestamps, the five lists arrays of strings (absent
    → `[]`), `argument` a string or absent → `null`. The reason is short, English, never contains the
    file's content, at most 200 characters. Pure core, no `node:fs`, no Electron.
  - Add a subsection "Run reports" under "Agent setup" in `docs/VAULT-FORMAT.md`: who writes
    (the setup's stop hook), file name, fields, retention of 50, and the limit that a page Gaston
    wrote during a run counts as the run's.
  - New `tests/core/agent/run-reports.test.ts` with `MemoryVaultStore`:
    "a vault without reports has no last run", "the newest report is read with its skill, time,
    pages, proposals and jobs" (three files, the last by name wins), "an unreadable newest report is
    shown as unreadable with its path" (broken frontmatter, wrong `gaston`, missing `skill`).
- **D2 — The run-report hook.**
  - First verify the hook input shapes against the current Claude Code hooks documentation
    (`code.claude.com/docs/en/hooks`): `UserPromptSubmit` (`prompt`), `PostToolUse` for the `Skill`
    tool (the field naming the skill and its arguments), `Stop` (`stop_hook_active`), `session_id`,
    `cwd`. Cite the verified field names in the script's header comment.
  - New `src/core/agent/templates/hook-run-report.ts`: `RUN_REPORT_BODY`, a `String.raw` PowerShell
    5.1 script, pure ASCII, in the style of `src/core/agent/templates/hook-wiki-check.ts` (vault root
    = two folders above `$PSScriptRoot`, UTF-8 stdin reader, any internal error exits 0 silently, never
    exit 2 — it reports nothing to the agent). Behaviour:
    - Session ledger `gaston-run-<session>.json` in `[IO.Path]::GetTempPath()` holding only the open
      run: skill, argument, start time (UTC), report file name. No content.
    - `UserPromptSubmit`: close any open run (delete the ledger). If the prompt starts with
      `/gaston-jobs`, `/gaston-curate` or `/gaston-propose` (the `AGENT_SKILLS` values), open a run;
      the first following word is the argument, kept only if it matches `^[a-z0-9-]{1,64}$`.
    - `PostToolUse` with tool `Skill` naming a Gaston skill: open a run only if none is open.
    - `Stop` with an open run: compute the lists from disk (files with `LastWriteTimeUtc` ≥ start):
      `modules/*/wiki/**/*.md` except `log.md` as vault-relative `/` paths; file names in
      `.secondbrain/agent/proposals/`; results in `.secondbrain/agent/results/` split by their
      `status` (`.json` via `ConvertFrom-Json`, `.md` via a `status:` frontmatter line; id = file name
      without extension; unknown status is ignored). Write the report (format in
      `docs/VAULT-FORMAT.md` "Run reports", fields as in D1's `AgentRunReport` plus
      `gaston: run-report`, `version: 1`) to `.secondbrain/agent/runs/` under the ledger's file name,
      fixed at the first Stop as `<yyyyMMddTHHmmssZ of start>-<skill>.md` (`-2`, `-3` … if taken);
      later Stops of the same run rewrite that file. Then delete the oldest `runs/*.md` by name beyond 50. LF line endings, UTF-8 without BOM, no absolute path in the file.
  - `src/core/agent/templates/protection.ts`: widen `HookRequirement['event']` with
    `'UserPromptSubmit'`; add exported `REPORT_HOOKS: readonly HookRequirement[]` (the three
    registrations, `failClosed: false`, `Stop` and `UserPromptSubmit` without matcher, `PostToolUse`
    matcher `Skill`); `renderSettings(rules, reportHooks = REPORT_HOOKS)` renders both; add
    `HOOK_RUN_REPORT_TEMPLATE` (id `hook-gaston-run-report`, path `.claude/hooks/gaston-run-report.ps1`,
    version 1, format `script`); bump `SETTINGS_TEMPLATE.version` by one. `protection-status.ts`
    keeps checking `PROTECTION_RULES` only; make its `Stop`-has-no-matcher rule also cover
    `UserPromptSubmit` if the types require it.
  - Register the template in `src/core/agent/setup-templates.ts`; add the path and versions to
    `src/renderer/lib/mock-agent-setup.ts` (pinned to `SETUP_TEMPLATES` by
    `tests/renderer/mock-agent-setup.test.ts`).
  - Mirrors: new `docs/agent-setup/hook-gaston-run-report.ps1`, updated
    `docs/agent-setup/settings.json` (prettier on these two files only, LF).
  - `tests/helpers/hook.ts`: widen `registeredHook`'s event union; it must pick the run-report group
    when an event has more than one registration (select by script path).
  - New `tests/core/agent/hook-run-report.test.ts`, `describe.runIf(process.platform === 'win32')`,
    shaped like `tests/core/agent/hook-wiki-check.test.ts` (temp vault, installed rendered files,
    `runHook` with JSON stdin):
    - "a Gaston skill run ends with exactly one report that Gaston's reader parses":
      `/gaston-curate travel`, then a wiki page, a proposal and a `done` and a `failed` result are
      written, then Stop → one file in `runs/`, `parseRunReport` (D1) gives skill, argument
      `travel`, the page, the proposal, the job ids.
    - "a stop-hook continuation rewrites the run's report instead of adding one": two Stops (second
      with `stop_hook_active: true`) after another page → still one file, now listing both pages.
    - "a turn without a Gaston skill writes no report", and a prompt with a non-slug argument keeps
      no argument.
    - "the report folder keeps the newest 50 reports": 50 pre-existing reports + one run → 50 left,
      the oldest gone.
    - The existing "every setup template matches its docs mirror" test covers the new template.
- **D3 — Skills and vault `CLAUDE.md` say the hook writes the report.**
  - `src/core/agent/templates/skills.ts`: in all three skills replace "End the run with one report
    in `.secondbrain/agent/runs/`" and "The exact report format follows in later versions" with one
    line: Gaston's hook writes the run report when the turn ends; never write to `runs/` yourself.
    Bump each skill's version by one from its value at build time.
  - `src/core/agent/templates/vault-claude.ts`: the sentence "Every skill run ends with one report
    in `runs/`" becomes "Gaston's hook writes one report per skill run to `runs/`; the agent never
    writes there." Remove `runs/` from the list of folders the agent may write. Bump its version.
  - Update mirrors `docs/agent-setup/skill-gaston-{jobs,curate,propose}.md` and
    `docs/agent-setup/vault-claude.md` (prettier on these files only, LF), and the versions in
    `src/renderer/lib/mock-agent-setup.ts`.
  - Test in `tests/core/agent/templates.test.ts`: "no Gaston skill tells the agent to write its own run
    report": each skill and the vault `CLAUDE.md` name `AGENT_DIRS.runs` only together with "never"
    and contain no "End the run with one report". Existing assertions on the CLAUDE.md content that
    list `runs/` as writable are updated to the new rule, not deleted.
- **D4 — IPC `agent:lastRun`.**
  - `src/shared/ipc.ts`: route `'agent:lastRun': { req: void; res: AgentLastRun }` and the entry in
    `IPC_CHANNELS`.
  - `src/main/ipc/agent-setup.ts`: handler `'agent:lastRun': async () => readLastRun(services.requireStore())`
    next to `agent:protectionStatus`.
  - `src/renderer/lib/api.ts`: `api.agent.lastRun()`; `src/renderer/lib/mock-bridge.ts`: stub
    `{ state: 'none' }`.
  - `src/renderer/lib/queries/keys.ts`: `qk.agent.lastRun()` = `['agent', 'lastRun']` (under the
    `agent` root, so `event:vault-changed` invalidates it). `src/renderer/lib/queries/agent.ts`:
    `useAgentLastRun()` shaped like `useAgentProtection()` (`enabled: useVaultReady()`,
    `retry: false`, `staleTime: 0`).
  - The existing `tests/main/ipc-coverage.test.ts` proves the wiring; behaviour is proven by D1's unit
    tests and D5's e2e.
- **D5 — Last run panel.**
  - New `src/renderer/screens/settings/agent/AgentLastRunPanel.tsx`, mounted in
    `src/renderer/screens/settings/AgentTab.tsx` between `AgentProtectionPanel` and the About this
    panel. Shape like `AgentProtectionPanel.tsx` (`Panel`, `Skeleton`, `Badge`, Gaston atoms and
    tokens only; read `src/renderer/styles/gaston/README.md`). States:
    - loading → skeleton; query error → a sentence with the reason.
    - `none` → "No agent run yet."
    - `read` → finished time (mono, the renderer's existing date formatter), skill name (mono, with
      argument), and counts with names: pages changed, proposals written, jobs finished, failed,
      skipped (skipped only when > 0).
    - `unreadable` → "The last run report cannot be read." plus the path in mono and the reason.
    - When 088's waiting-proposals count (the same query the Maintenance rail badge uses; find it in
      `src/renderer/lib/queries/`, do not add a second count) is > 0, a link "{n} proposals wait in
      Maintenance" to `#/garden`, in every state.
  - i18n keys `settings.agent.lastRun.*` in a new pair `src/renderer/i18n/en-settings-agent.ts` /
    `de-settings-agent.ts`, spread into `en-settings.ts` / `de-settings.ts` the way
    `en-settings-models.ts` is (both are near 300 lines). German quotes `„…“`.
  - One `### Added` line in `CHANGELOG.md`.
  - New `tests/e2e/agent-last-run.spec.ts` (`test.use({ specId: 'agent-last-run' })`, navigation as
    in `tests/e2e/agent-protection.spec.ts`), one test "the last run section follows the newest
    report while the app is open":
    1. Open Settings → Agent: the section says "No agent run yet.", no Maintenance link.
    2. With the tab open, the spec writes a valid report into `.secondbrain/agent/runs/` (skill
       `gaston-curate`, argument, two pages, one proposal, one done and one failed job): the section
       shows time, skill, 2 pages, 1 proposal, 1 finished, 1 failed — without navigating away.
    3. The spec writes one valid proposal in 088's format into `.secondbrain/agent/proposals/`: the
       Maintenance link appears; clicking it opens the Maintenance screen.
    4. Back in the tab, the spec writes a newer report with broken frontmatter: the section shows it
       as unreadable with its path, and the rest of the tab still renders.

## Model Hints

- D2 → deliverable-hard: a new PowerShell script driven by three CLI events with a run boundary
  that spans Stops; a wrong boundary or a wrong reading of the CLI's hook input writes zero or
  several reports per run, which no Gaston-side test sees, and a crash must stay silent rather than
  block the agent.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/agent/hook-run-report.test.ts` › "a Gaston skill run ends with exactly one
  report that Gaston's reader parses"; unit `tests/core/agent/templates.test.ts` › "every setup
  template matches its docs mirror"; unit `tests/core/agent/templates.test.ts` › "no Gaston skill
  tells the agent to write its own run report"
- AC2 → e2e `tests/e2e/agent-last-run.spec.ts` › "the last run section follows the newest report
  while the app is open"; unit `tests/core/agent/run-reports.test.ts` › "the newest report is read
  with its skill, time, pages, proposals and jobs"
- AC3 → e2e `tests/e2e/agent-last-run.spec.ts` › "the last run section follows the newest report
  while the app is open"
- AC4 → e2e `tests/e2e/agent-last-run.spec.ts` › "the last run section follows the newest report
  while the app is open"; unit `tests/core/agent/run-reports.test.ts` › "a vault without reports has
  no last run"
- AC5 → e2e `tests/e2e/agent-last-run.spec.ts` › "the last run section follows the newest report
  while the app is open"; unit `tests/core/agent/run-reports.test.ts` › "an unreadable newest report
  is shown as unreadable with its path"
- AC6 → e2e `tests/e2e/agent-last-run.spec.ts` › "the last run section follows the newest report
  while the app is open"

The (User) retention decision is proven by `tests/core/agent/hook-run-report.test.ts` › "the report
folder keeps the newest 50 reports".

Coverage gate:

| AC  | Delivered by       |
| --- | ------------------ |
| AC1 | D1, D2, D3         |
| AC2 | D1, D4, D5         |
| AC3 | D4 (query key), D5 |
| AC4 | D1, D5             |
| AC5 | D1, D5             |
| AC6 | D5 (088's count)   |

## Done
