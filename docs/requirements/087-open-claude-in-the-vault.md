---
id: 087
title: Open Claude in the vault from Gaston
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

The subscription is used by the user in the official CLI, never by Gaston (concept §2 non-goals,
AGT-8). What Gaston can do is save the steps: open a terminal in the vault folder with `claude`
already started and, where it fits, the right skill as the first prompt (AGT-18).

The Agent tab's **Terminal** section gets three buttons: "Open Claude in the vault", "Work the
jobs", "Curate a module" (with a module picker). The launch runs in the main process; the renderer
never spawns anything (guardrail 5). Each button is disabled with a visible reason when the CLI is
absent ([[083]]) or the setup is missing ([[084]]).

## Acceptance Criteria

- [ ] **AC1** — "Open Claude in the vault" opens a terminal window whose working directory is the
      vault folder and which runs `claude`.
- [ ] **AC2** — "Work the jobs" opens the same with the job-queue skill as the first prompt.
- [ ] **AC3** — "Curate a module" asks for a module and opens the same with the curator skill and
      that module as the first prompt.
- [ ] **AC4** — With the CLI absent or the setup missing, all three buttons are disabled and the
      section says why.
- [ ] **AC5** — The launched command contains no print/headless flag, no API key and no credential
      Gaston holds; Gaston starts the terminal and nothing else.
- [ ] **AC6** — A vault path with spaces or non-ASCII characters launches correctly.
- [ ] **AC7** — A launch that fails (no terminal found) says so in the tab, with the reason.

## Open Questions

~~- **Q1 — Which terminal** (concept O2): Windows Terminal with a fallback to PowerShell, or
PowerShell only? Gaston ships for Windows only (M19) — is macOS/Linux out for this story?~~ answered → Decisions (Sprint)
~~- **Q2 — Concurrent runs** (concept O5): warn on "Curate a module" when Gaston has a digestion or
condensation running in the same module, or rely on the hash guard alone?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Which terminal: Windows Terminal with PowerShell fallback; macOS/Linux out of scope
- **(User)** Concurrent runs: hash guard only, no extra warning for concurrent runs
- **Launch is Windows-only, refused in main elsewhere:** on a non-`win32` platform the launch
  returns `unsupported-platform` and the section shows that sentence; the renderer probes no
  platform — Gaston ships for Windows only (M19), a renderer probe would be dead code.
- **PowerShell is the shell in both terminals:** Windows Terminal runs `powershell.exe -NoExit
-Command <claude line>`, the fallback opens a PowerShell console via `cmd.exe /c start` —
  PowerShell resolves `claude` (`.exe`, `.cmd`, `.ps1`) exactly as when the user types it, and
  `-NoExit` leaves the user a prompt in the vault after `claude` ends.
- **No execution-policy flag, no env changes:** the terminal inherits Gaston's environment
  unchanged (no `env` option) and gets no `-ExecutionPolicy` — "Gaston starts the terminal and
  nothing else" means it behaves like a terminal the user opened themselves.
- **The vault path never enters a command string:** it is passed only as the spawn `cwd` and, for
  Windows Terminal, as one argv element after `-d` (with `;` escaped as `\;`, because `wt` splits
  its command line on `;`) — so spaces, quotes, `&`, `%` and non-ASCII need no shell quoting (AC6).
- **The first prompt is built only from constants and a validated slug:** `/<queue skill>` or
  `/<curator skill> <slug>`, skill names imported from 084's templates; a module whose name is not
  a slug (`slugify(name) !== name`) is refused with a reason, not quoted — nothing user-typed ever
  reaches a shell.
- **Fallback trigger is a spawn error only:** `wt.exe` failing with `ENOENT` (or any spawn
  `error`) tries the PowerShell plan; both failing is `no-terminal` with the errno code as the
  reason — whether a window appeared cannot be observed, so it is not guessed.
- **Ready = CLI `installed` and no managed setup file `missing`:** outdated or modified setup files
  still allow the launch (the rules are in the vault, 084 shows the update separately); CLI
  `absent` or `unknown` (083) and any missing managed file block it, each with its own sentence.
- **Main re-checks readiness on every launch:** the renderer's disabled state is convenience; the
  handler refuses (`cli-absent`, `cli-unknown`, `setup-missing`, `no-vault`) with fresh data,
  because a stale tab must not open an unprotected agent session.
- **Expected failures are a result union, not exceptions:** `agent:launchTerminal` resolves
  `{ ok: true, terminal }` or `{ ok: false, reason, detail? }`; `fail('invalid')` only for a
  malformed request — the reason is user-facing state the section renders via `t()`.
- **The success state names the terminal:** "Opened in Windows Terminal" / "Opened in PowerShell"
  as a calm status line — the fallback is visible instead of silent.
- **The module picker excludes the help module (`gaston-help`, 086's constant):** it is
  Gaston-managed and read-only by convention; a curator run there would be overwritten by Update.
- **"Curate a module" stays disabled until a module is picked**, and with no modules it says so —
  the picker is the "asks for a module" of AC3, inline, no dialog.
- **Own narrow `SpawnFn` for the launcher, no shared spawn helper:** the two existing seams
  (`ollama-runtime.ts`, `llamacpp-spawn.ts`) deliberately differ in options and their comments
  forbid harmonising them; a third narrow type is the established pattern, not a copy.
- **e2e fakes the spawn, not the launcher:** `SB_E2E_TERMINAL_FIXTURE` swaps only the `SpawnFn`
  for a recorder, read per launch, so the real plan building, readiness guard and fallback run in
  e2e and the spec can switch `wt.exe`/`cmd.exe` to "missing" mid-flow.
- **No concurrent-run warning is built** (User decision above): nothing in this story reads module
  locks or running tasks.
- **Opening a real window is manual residue:** tests never start a real terminal or `claude`; that a
  real Windows Terminal / PowerShell window appears with `claude` running is checked by hand once.

## Plan

Depends on 083 (CLI status, Agent tab), 084 (setup status, skill-name constants) and 086
(help-module slug constant) being built first — sprint order already guarantees it.

1. **Pure plan + readiness (D1).** `src/core/agent/terminal.ts` turns an intent (`open` | `jobs`
   | `curate <slug>`) plus vault root into an ordered list of launch plans (Windows Terminal,
   then PowerShell via `cmd /c start`). `src/shared/agent/terminal-readiness.ts` maps CLI state +
   setup completeness to `ready` or a reason — shared so renderer and main use one rule.
2. **Main launcher + IPC (D2).** `src/main/agent-terminal-launcher.ts` tries the plans in order
   through an injectable `SpawnFn` (waits for `spawn` vs `error`, `unref()`s), returns which
   terminal opened or `no-terminal`. Handler `agent:launchTerminal` in
   `src/main/ipc/agent-terminal.ts` re-checks readiness with 083's/084's live status, validates
   the module, refuses on non-Windows. Fake spawn in `tests/fakes/terminal.ts`.
3. **Terminal section (D3).** `AgentTerminalSection.tsx` in the Agent tab: three buttons, module
   picker, disabled reason sentence, launch result line. i18n de/en, CHANGELOG entry.
4. **e2e seam + flow (D4).** `SB_E2E_TERMINAL_FIXTURE` swaps the `SpawnFn` for a recorder;
   `tests/e2e/agent-terminal.spec.ts` walks setup-missing → install → three launches → fallback
   → no terminal.

Order: D1 → D2 → D3 → D4. No vault format change, no systems doc touched (`docs/systems/` has
only `navigation.md`; no route changes).

## Deliverables

- [ ] **D1 — Launch plan and readiness, pure.** Files: `src/shared/types/agent-terminal.ts`
      (new), `src/shared/agent/terminal-readiness.ts` (new), `src/core/agent/terminal.ts` (new),
      `tests/core/agent/terminal.test.ts` (new), `tests/shared/agent-terminal-readiness.test.ts`
      (new). Types: `TerminalIntent = { kind: 'open' } | { kind: 'jobs' } | { kind: 'curate';
    module: string }`; `TerminalLaunchPlan = { terminal: 'windows-terminal' | 'powershell';
    command: string; args: string[]; cwd: string; windowsVerbatimArguments: boolean }`;
      `TerminalBlock = 'no-vault' | 'cli-absent' | 'cli-unknown' | 'setup-missing'`;
      `TerminalLaunchResult = { ok: true; terminal } | { ok: false; reason: TerminalBlock |
    'unsupported-platform' | 'invalid-module' | 'no-terminal'; detail?: string }` (detail = errno
      code only, never a path or content). `terminalReadiness({ vaultOpen, cli: 'installed' |
    'absent' | 'unknown', setupComplete }) → { ready: true } | { ready: false; reason:
    TerminalBlock }`, checked in that order. Core: `firstPrompt(intent)` → `null` (open),
      `/<queueSkill>` (jobs), `/<curatorSkill> <slug>` (curate) — import the queue and curator
      skill names from 084's skill templates under `src/core/agent/`, never redeclare the strings;
      a curate slug with `slugify(slug) !== slug` (`src/core/vault/slug.ts`) throws a typed
      `invalid-module` error. `claudeLine` = `claude` or `claude '<prompt>'`. `buildLaunchPlans
    (intent, vaultRoot)` returns `[wt, powershell]`: wt = `wt.exe`, args `['-d',
    vaultRoot.replaceAll(';', '\\;'), 'powershell.exe', '-NoExit', '-Command', claudeLine]`,
      `cwd: vaultRoot`, verbatim `false`; powershell = `cmd.exe`, args `['/d', '/s', '/c',
    '"start "" powershell.exe -NoExit -Command "' + claudeLine + '""']`, `cwd: vaultRoot`,
      verbatim `true`. The vault path appears nowhere except `cwd` and the wt `-d` element. Tests
      in both test files as listed under Acceptance Tests.
- [ ] **D2 — Launcher and `agent:launchTerminal`.** Files: `src/shared/ipc.ts` (route + entry in
      `IPC_CHANNELS`: req `TerminalIntent`, res `TerminalLaunchResult`),
      `src/main/agent-terminal-launcher.ts` (new), `src/main/ipc/agent-terminal.ts` (new,
      `agentTerminalHandlers(services, deps)` via `defineHandlers`, `src/main/ipc/registry.ts`),
      `src/main/ipc/register-all.ts`, `src/renderer/lib/api.ts` (`api.agent.launchTerminal` or a
      sibling group), `src/renderer/lib/mock-bridge.ts`, `tests/fakes/terminal.ts` (new),
      `tests/main/ipc/agent-terminal.test.ts` (new). Launcher: own narrow `SpawnFn` (`file, args,
    { cwd, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments, shell: false }` →
      `{ once('spawn' | 'error'), unref() }`) — model it on `SpawnFn`/`nodeSpawn` in
      `src/main/ipc/ollama-runtime.ts:40-60`, but do not merge with it or with
      `llamacpp-spawn.ts`; no `env`, no `detached`. For each plan in order: spawn, await the first
      of `spawn` (→ `unref()`, return `{ ok: true, terminal }`) or `error` (→ next plan); all
      failed → `{ ok: false, reason: 'no-terminal', detail: <last errno code> }`. Handler: on
      `process.platform !== 'win32'` (inject the platform) → `unsupported-platform`; else compute
      `terminalReadiness` from the vault root (`services.vaultRoot()`), 083's CLI-presence check
      and 084's setup status (the functions behind the agent CLI-status and setup-status channels
      in `src/shared/ipc.ts`; "complete" = no managed file `missing`) → refuse with the reason;
      for `curate`, the module must exist in the vault (same source as `modules:list`) and pass
      the slug check → else `invalid-module`; malformed request → `fail('invalid')`. Exactly one
      launch attempt chain per call, nothing else spawned (no `claude --version`). Fake:
      `createFakeSpawn({ missing?: string[] })` records `{ file, args, options }` and emits
      `error` (`ENOENT`) asynchronously for listed files, `spawn` otherwise. Extend the
      `electron` mock in `tests/main/ipc-coverage.test.ts` only if the handler needs it. Tests as
      listed under Acceptance Tests.
- [ ] **D3 — Terminal section in the Agent tab.** Files:
      `src/renderer/screens/settings/AgentTerminalSection.tsx` (new; place it next to 083's Agent
      tab file if 083 used a subfolder), the Agent tab component from 083 (mount the section after
      the setup sections), `src/renderer/lib/queries/agent-terminal.ts` (new,
      `useLaunchAgentTerminal()` — `useMutation` like `useLinkAgentProject` in
      `src/renderer/lib/queries/agents.ts:137`), `src/renderer/i18n/en-settings.ts`,
      `src/renderer/i18n/de-settings.ts`, `CHANGELOG.md`,
      `tests/renderer/agent-terminal-section.test.tsx` (new). Section: heading "Terminal", three
      `Button` atoms ("Open Claude in the vault", "Work the jobs", "Curate a module") and a `Select`
      atom fed by `useModules()` (`src/renderer/lib/queries/data.ts:96`) minus 086's help-module
      slug constant. Readiness comes from `terminalReadiness` (D1) fed with the Agent tab's 083
      CLI-status and 084 setup-status query data; not ready → all three disabled, one sentence per
      reason. Curate also disabled until a module is picked; no modules → its own sentence. On
      result: success → status line naming the terminal (`role="status"`); failure → reason
      sentence (+ errno detail for `no-terminal`) in a `role="alert"` line inside the section — no
      toast-only feedback. Gaston atoms and tokens only, sentence case, no emoji; every string via
      `t()`, German with „…“. CHANGELOG: one user-facing line under the unreleased section.
      Renderer test as listed under Acceptance Tests.
- [ ] **D4 — e2e seam and flow.** Files: `src/main/ipc/terminal-e2e-fixture.ts` (new, pattern of
      `src/main/ipc/tasks-e2e-fixture.ts`: inert unless `SB_E2E_TERMINAL_FIXTURE` is set),
      `src/main/ipc/agent-terminal.ts` (choose the fixture `SpawnFn` when the env var is set, the
      real one otherwise), `tests/e2e/fixtures/app.ts` (new option `terminalFixture` → env var via
      `extraEnv`), `tests/scripts/e2e-wiring.test.ts` (only if its static check needs the new
      var), `tests/e2e/agent-terminal.spec.ts` (new, `test.use({ specId })`). Fixture: the env var
      is a JSON file path `{ "missing": string[] }`, re-read on every spawn; the recorder appends
      `{ file, args, cwd }` to `<fixture>.launches.json` and emits `error`/`ENOENT` for files in
      `missing`, `spawn` otherwise. The spec sets the CLI to installed through 083's e2e
      CLI-presence seam (if 083 shipped none, add `SB_E2E_CLAUDE_CLI=installed|absent` where 083's
      detector is constructed) and installs the setup through 084's real Install → confirm UI.
      Steps as listed under Acceptance Tests.

## Model Hints

No `deliverable-hard`: the quoting risk is removed by design (path only in `cwd`/one argv
element, prompt from constants + slug) and pinned by D1/D2 tests; the remaining risk — whether a
real window appears — no agent tier can test.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/agent/terminal.test.ts` › "opening claude plans windows terminal then
  powershell, both in the vault folder with no first prompt"; e2e
  `tests/e2e/agent-terminal.spec.ts` › "the terminal section launches claude in the vault, falls
  back to powershell and reports a missing terminal" (step: open → recorded launch has the vault
  as `cwd` and runs `claude`)
- AC2 → unit `tests/core/agent/terminal.test.ts` › "working the jobs plans claude with the queue
  skill as the first prompt"; e2e same spec, step: work the jobs → recorded launch carries
  `/<queue skill>`
- AC3 → unit `tests/core/agent/terminal.test.ts` › "curating a module plans claude with the
  curator skill and the module slug as the first prompt" and › "a module name that is not a slug
  is refused instead of quoted"; unit `tests/main/ipc/agent-terminal.test.ts` › "curating a
  module that is not in the vault is refused"; e2e same spec, step: pick a seeded module → curate
  → recorded launch carries `/<curator skill> <slug>`
- AC4 → unit `tests/shared/agent-terminal-readiness.test.ts` › "the terminal is ready only with
  the cli installed and no managed setup file missing"; unit
  `tests/main/ipc/agent-terminal.test.ts` › "a launch with the cli absent or the setup missing is
  refused without spawning"; renderer `tests/renderer/agent-terminal-section.test.tsx` › "with the
  cli absent or unknown all three buttons are disabled and the section says why"; e2e same spec,
  step: setup missing → three buttons disabled with the setup sentence → install → enabled
- AC5 → unit `tests/core/agent/terminal.test.ts` › "no plan carries a print, headless,
  permission-bypass or key flag" (no `-p`, `--print`, `--output-format`, `--api-key`,
  `--dangerously-skip-permissions`, `--permission-mode`, no `ANTHROPIC_` anywhere); unit
  `tests/main/ipc/agent-terminal.test.ts` › "a launch spawns only the terminal, once, with the
  inherited environment" (exactly one successful spawn, no `env` option, no other process)
- AC6 → unit `tests/core/agent/terminal.test.ts` › "a vault path with spaces, quotes, semicolons
  and non-ascii appears only as the working directory and the escaped -d argument"; unit
  `tests/main/ipc/agent-terminal.test.ts` › "a vault path with spaces and non-ascii survives the
  real argv round-trip" (real `spawn` of `process.execPath` printing its argv and cwd, run with
  the wt plan's args and `cwd` set to a temp dir named like `Zoë's vault; a&b` — no terminal,
  no `claude`)
- AC7 → unit `tests/main/ipc/agent-terminal.test.ts` › "windows terminal missing falls back to
  powershell" and › "with no terminal found the launch reports no-terminal with the errno code";
  renderer `tests/renderer/agent-terminal-section.test.tsx` › "a failed launch shows the reason in
  the section"; e2e same spec, steps: `wt.exe` missing → "Opened in PowerShell"; `wt.exe` and
  `cmd.exe` missing → no-terminal sentence in the tab
- AC1–AC3 → manual residue: that a real Windows Terminal / PowerShell window opens in the vault
  with `claude` running and the skill typed — tests must never start a real terminal or the real
  CLI (needs the user's desktop session and CLI login).

## Done
