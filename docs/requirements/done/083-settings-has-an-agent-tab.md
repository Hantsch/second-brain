---
id: 083
title: Settings has an Agent tab
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

The vault agent ([concepts/vault-agent.md](../concepts/vault-agent.md)) needs one place in Gaston
where the user sees whether it can work at all. Settings gets a seventh tab, **Agent**, after
Customization and before About, following the existing tab pattern in `SettingsScreen.tsx`
(concept §12).

This story is the tab and its first two sections: **CLI status** (is Claude Code on this machine's
`PATH`, and where) and **About this** (what the agent does and does not do). Gaston does not install
the CLI; when it is absent, the tab says so and links to the official installation guide (AGT-1).
The other sections arrive with their stories: setup [[084]], protection [[085]], terminal
[[087]], last run [[089]].

The tab is never a dead screen (guardrail 1): every state has its sentence.

## Acceptance Criteria

- [x] **AC1** — Settings shows a tab "Agent" between Customization and About, reachable via
      `#/settings?tab=agent`, labelled in `de` and `en`.
- [x] **AC2** — With `claude` on `PATH`, the CLI status reads "installed" with the path it was found
      at — no version, because reading one would mean starting the CLI (Decisions (Sprint), User).
- [x] **AC3** — Without `claude` on `PATH`, the CLI status says it is not installed and offers a
      link to the official installation guide that opens in the external browser.
- [x] **AC4** — Gaston downloads and installs nothing in either state.
- [x] **AC5** — "About this" states in a few sentences what the agent may do (curate the wiki
      layer, write proposals, work handed-over jobs) and what it never does (read `journal/`, write
      `raw/`, be started by Gaston without a terminal).
- [x] **AC6** — A CLI lookup that fails (timeout, a `PATH` directory that cannot be read) shows
      "status unknown" with the reason, not "installed", not "not installed" and not a blank section.

## Open Questions

~~- **Q1 — How the version is read.** `claude --version` starts the CLI binary, though without a
model call or credentials. Does that sit inside AGT-8 ("the only process Gaston starts is the
user's terminal"), or must detection be a pure `PATH` lookup with the version left out?~~ answered → Decisions (Sprint)
~~- **Q2 — The install guide URL** — pin it at refine against the current official documentation.~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** How the version is read: detection is a pure `PATH` lookup, no process is started, no version shown (AGT-8 strict)
- **Install guide URL is `https://code.claude.com/docs/en/setup`** — checked 2026-10-22, it is the
  official Claude Code setup page (native installer, Homebrew, WinGet, npm, per platform).
- **AC2 shows the found path instead of the version** — the user decision forbids starting the CLI,
  and the path is the one honest fact a `PATH` lookup yields.
- **AC6 drops "unreadable output"** — there is no output without a process; the remaining failure
  modes of a pure lookup are a timeout and a `PATH` directory that errors with something other than
  "not there".
- **The lookup has a 3 s time limit** — a `PATH` entry on an unreachable network drive can hang a
  `stat`, and an endless "checking" is a dead screen (guardrail 1).
- **No well-known install folders beyond `PATH`** (e.g. `~/.local/bin`) — the user fixed detection
  as a `PATH` lookup; the "not found" sentence says "on this machine's PATH" so it stays true.
- **Windows resolves `claude` via `PATHEXT`** (default `.COM;.EXE;.BAT;.CMD`), POSIX needs a regular
  file with an executable bit — the native installer ships `claude.exe`, npm ships `claude.cmd`.
- **The status is re-read every time the tab mounts** (`staleTime: 0`, no polling) — presence is
  decided outside the app, like yt-dlp's status.
- **The lookup logic lives in `src/core/agent/`, main only passes `process.env`** — testable with
  injected `stat`/platform per guardrail 5, and the concept puts agent logic in that module.
- **No placeholder panels for setup, protection, terminal, last run** — those sections arrive with
  their own stories; an empty "coming soon" box would be a dead section.
- **The tab says why it shows no version** — one line, so the missing version reads as a choice,
  not a gap.
- **The e2e controls `PATH` through a new worker option of the app fixture** (one spec, one launch;
  the fake binary is written into the dir mid-spec) — a real lookup against a real `PATH`, no
  test-only branch in main, and one flow instead of two.
- **No systems doc update** — `docs/systems/navigation.md` covers the rail and screen-internal
  deep links, not the Settings tabs.

## Plan

1. **Core lookup** (`src/core/agent/cli-presence.ts`): split `PATH`, stat each candidate
   (`claude` + `PATHEXT` on Windows, executable file on POSIX), 3 s limit, result
   `installed{path}` / `absent` / `unknown{reason}`. Injected `stat`, env and platform; no
   `child_process`, no network. Shared type + install URL in `src/shared/types/agent.ts`.
2. **IPC** `agent:cliStatus` (void → `AgentCliStatus`): channel map + `IPC_CHANNELS`, handler in a
   new `src/main/ipc/agent.ts` registered in `register-all.ts`, `api.agent.cliStatus`, mock bridge,
   query hook `useAgentCliStatus` (mirror `useYtdlpStatus`).
3. **Tab** `agent` between `customization` and `about` in `SettingsScreen.tsx`; `AgentTab.tsx` with
   two panels, CLI status and About this; i18n keys in `en-settings.ts`/`de-settings.ts`; screen
   pass entry in `scripts/lib/screens.mjs`; CHANGELOG line.
4. **e2e**: fixture worker option `pathDir` that replaces the launched app's `PATH` (any case
   variant); spec `tests/e2e/settings-agent-tab.spec.ts` walks absent → link → installed and proves
   the fake `claude` never ran.

Order: D1 → D2 → D3 → D4. Nothing in this story writes to the vault.

## Deliverables

- **D1 — CLI presence lookup in core.** New `src/core/agent/cli-presence.ts` exporting
  `findClaudeCli(deps: { pathValue: string; pathExt?: string; platform: NodeJS.Platform; stat:
(p: string) => Promise<{ isFile(): boolean; mode: number }>; timeoutMs?: number }):
Promise<AgentCliStatus>`. Split `pathValue` on `;` (win32) or `:` (else), trim, strip surrounding
  `"` on win32, skip empty entries. Candidates: on win32 `claude` + each extension of `pathExt`
  (default `.COM;.EXE;.BAT;.CMD`, case-insensitive), on other platforms `claude` that is a file with
  `mode & 0o111`. Use `path.win32`/`path.posix` per the injected platform so both are testable on
  any OS. First hit in `PATH` order → `{ state: 'installed', path }`. Errors `ENOENT`/`ENOTDIR` mean
  "not here"; any other error code is remembered — if nothing is found and one was remembered →
  `{ state: 'unknown', reason: 'lookup-error', code }` (error code only, e.g. `EACCES`). Whole lookup
  races a timer (default 3000 ms) → `{ state: 'unknown', reason: 'timeout' }`; clear the timer.
  Otherwise `{ state: 'absent' }`. Must never import `child_process`, `electron` or a network
  module, and never start a process (AGT-8, user decision). New `src/shared/types/agent.ts`:
  `AgentCliStatus` union (`installed{path}` | `absent` | `unknown{reason:'timeout'|'lookup-error';
code?}`) and `export const CLAUDE_CODE_INSTALL_URL = 'https://code.claude.com/docs/en/setup'`.
  Tests in new `tests/core/agent/cli-presence.test.ts` with an in-memory `stat` fake: "finds claude
  in a PATH directory and reports where" (one win32 case via `.CMD`/`.EXE`, one posix case), "a
  non-executable claude file on posix is not a hit", "no PATH directory holding claude reports
  absent", "a lookup that exceeds its time limit reports unknown with timeout" (a `stat` that never
  resolves, `timeoutMs: 20`), "an unreadable PATH directory makes a miss unknown with its error
  code".
- **D2 — `agent:cliStatus` over IPC.** Add channel `'agent:cliStatus'` (request `void`, response
  `AgentCliStatus` from `src/shared/types/agent.ts`) to the channel map and `IPC_CHANNELS` in
  `src/shared/ipc.ts` (mirror `'ingest:ytdlpStatus'`). New `src/main/ipc/agent.ts` with
  `agentHandlers` (shape of `src/main/ipc/claude.ts`) calling `findClaudeCli` from
  `src/core/agent/cli-presence.ts` with `pathValue: process.env.PATH ?? ''`,
  `pathExt: process.env.PATHEXT`, `platform: process.platform`, `stat: fs.promises.stat`; register in
  `src/main/ipc/register-all.ts`. `api.agent.cliStatus` in `src/renderer/lib/api.ts`, an entry in
  `src/renderer/lib/mock-bridge.ts` returning `{ state: 'absent' }`, key `qk.agent.cliStatus()` in
  `src/renderer/lib/queries/keys.ts`, hook `useAgentCliStatus` in new
  `src/renderer/lib/queries/agent.ts` mirroring `useYtdlpStatus` in
  `src/renderer/lib/queries/ingest.ts` (`retry: false`, `staleTime: 0`). Proven by the existing
  `tests/main/ipc-coverage.test.ts` and by D4's e2e.
- **D3 — The Agent tab.** In `src/renderer/screens/settings/SettingsScreen.tsx` add `agent` to
  `TAB_IDS` between `customization` and `about`, icon `bot`, label key `settings.tab.agent`, panel
  `<AgentTab />`; update the header comment from six to seven tabs. `bot` is not in the icon map
  yet: register lucide `Bot` under `bot` in the `ICONS` map of `src/renderer/atoms/Icon.tsx`. New
  `src/renderer/screens/settings/AgentTab.tsx` (mirror `AboutTab.tsx`: `Panel`, `Button`, `Skeleton`,
  `useT`, Gaston atoms only, tokens only) with two panels:
  **CLI status** — loading: skeleton; `installed`: "Claude Code is installed." plus "Found at" and the
  path in mono; `absent`: "Claude Code was not found on this machine's PATH. Gaston does not install
  it." plus one `Button` "Open installation guide" →
  `api.shell.openExternal(CLAUDE_CODE_INSTALL_URL).catch(() => undefined)`; `unknown`: "Status
  unknown: the lookup timed out." or "Status unknown: the lookup failed ({code})."; a query error
  renders as unknown with the lookup-failed sentence, never blank. Under every resolved state one
  muted line: "Gaston only looks for the CLI. It does not start it, so no version is shown." No
  other button in this panel in any state.
  **About this** — en: "The agent is Claude Code, which you open yourself in a terminal with the
  vault as its working folder. It may curate the wiki layer of a module, write proposals for
  everything else, and work the jobs you hand to it. It never reads journal/, never writes raw/,
  and Gaston never starts it without a terminal." de: „Der Agent ist Claude Code, das du selbst in
  einem Terminal mit dem Vault als Arbeitsordner öffnest. Er darf die Wiki-Ebene eines Moduls
  pflegen, für alles andere Vorschläge schreiben und die Aufträge abarbeiten, die du ihm übergibst.
  Er liest nie journal/, schreibt nie raw/, und Gaston startet ihn nie ohne Terminal.“ (without the
  outer quote pair). Keys `settings.tab.agent` (en "Agent", de "Agent") and `settings.agent.*` in
  `src/renderer/i18n/en-settings.ts` and `de-settings.ts`; German strings use „…“ if they quote. Add
  `{ id: 'settings-agent', hash: '/settings?tab=agent', wait: '.sb-panel' }` to the settings list in
  `scripts/lib/screens.mjs`. One `### Added` line in `CHANGELOG.md` under Unreleased. Test in new
  `tests/renderer/settings-agent-tab.test.tsx` (mocked `api.agent.cliStatus`): "an unknown CLI
  status shows the reason instead of a blank section" (timeout and lookup-error with code; asserts
  neither "is installed" nor "was not found" appears).
- **D4 — e2e through the real surface.** In `tests/e2e/fixtures/app.ts` add a worker option
  `pathDir: [undefined, { scope: 'worker', option: true }]`; when set, the launched app's `PATH`
  is exactly that directory. Because the harness copies `process.env` (on Windows the key is
  usually `Path`), `launchApp` in `scripts/lib/app-harness.mjs` must, when `extraEnv` carries a
  key that case-insensitively equals `PATH`, delete every existing case variant before
  `Object.assign` — never two PATH keys. New `tests/e2e/settings-agent-tab.spec.ts`
  (`test.use({ specId, pathDir })`, the dir created empty under `os.tmpdir()` at module load;
  mirror the open-tab and `shell.openExternal` stub of `tests/e2e/about-release-notes.spec.ts`,
  `evaluateMain` from `scripts/lib/app-harness.mjs`). Tests, in order: (1) "the agent tab sits
  between customization and about and explains the agent" — open `#/settings?tab=agent`, the tab
  names in order contain Customization, Agent, About adjacent, the Agent tab is selected, About-this
  text names journal/ and raw/; (2) "without claude on PATH the agent tab links to the official
  install guide" — "was not found" visible, the panel holds exactly one button, clicking it records
  `https://code.claude.com/docs/en/setup` in the stub and opens no new window; (3) "with claude on
  PATH the agent tab shows it installed without starting it" — write a fake `claude.cmd` (win32:
  `@echo ran> "%~dp0ran.txt"`) or `claude` (posix: `#!/bin/sh` + `echo ran > "$(dirname "$0")/ran.txt"`,
  mode 755) into `pathDir`, switch to another tab and back, "is installed" and the fake's path are
  visible, the panel holds no button, and `ran.txt` does not exist. If Electron fails to start with
  only `pathDir` on `PATH`, append `%SystemRoot%\System32` on win32 only — never the runner's PATH.

## Model Hints

All deliverables on the default tier. D1's platform and timeout handling is fully pinned by its
unit tests; D4's PATH-key subtlety is named in the D.

Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/settings-agent-tab.spec.ts` › "the agent tab sits between customization and
  about and explains the agent"; the `de` label by the existing unit `tests/renderer/i18n.test.ts` ›
  "hat in beiden Sprachen denselben Key-Satz"
- AC2 → e2e `tests/e2e/settings-agent-tab.spec.ts` › "with claude on PATH the agent tab shows it
  installed without starting it"; lookup by unit `tests/core/agent/cli-presence.test.ts` › "finds
  claude in a PATH directory and reports where"
- AC3 → e2e `tests/e2e/settings-agent-tab.spec.ts` › "without claude on PATH the agent tab links to
  the official install guide"
- AC4 → e2e `tests/e2e/settings-agent-tab.spec.ts` › "with claude on PATH the agent tab shows it
  installed without starting it" (fake binary never ran, no button) and › "without claude on PATH
  the agent tab links to the official install guide" (the only action is the guide link)
- AC5 → e2e `tests/e2e/settings-agent-tab.spec.ts` › "the agent tab sits between customization and
  about and explains the agent"
- AC6 → unit `tests/core/agent/cli-presence.test.ts` › "a lookup that exceeds its time limit reports
  unknown with timeout" and › "an unreadable PATH directory makes a miss unknown with its error
  code"; display by renderer `tests/renderer/settings-agent-tab.test.tsx` › "an unknown CLI status
  shows the reason instead of a blank section" (a failing lookup cannot be forced through the real
  surface without a test-only branch in main)

## Done

Summary: Settings has a seventh tab, Agent, between Customization and About, at `#/settings?tab=agent`.
CLI status is a pure `PATH` lookup in `src/core/agent/cli-presence.ts` (installed with path / absent with a link to the install guide / unknown with reason); no process is started, no version is shown. "About this" states what the agent may and never does. The lookup runs through the new `agent:cliStatus` channel.

Commit message: `083: settings agent tab — pure PATH lookup for Claude Code, install-guide link, about this`

Verification (narrow gate): `npm run build`, `lint`, `typecheck`, `format:check` green; `npx vitest run --changed HEAD` green (261 files, 3530 tests); `npx playwright test tests/e2e/settings-agent-tab.spec.ts` green (3/3). Review: clean default-tier agent, PASS, no blocking findings.
AC → test (all ran and passed): AC1 e2e "the agent tab sits between customization and about and explains the agent" + i18n key-set unit; AC2 e2e "with claude on PATH the agent tab shows it installed without starting it" + unit "finds claude in a PATH directory and reports where"; AC3 e2e "without claude on PATH the agent tab links to the official install guide"; AC4 both of those e2e tests; AC5 the first e2e test; AC6 units "a lookup that exceeds its time limit reports unknown with timeout" and "an unreadable PATH directory makes a miss unknown with its error code" + renderer "an unknown CLI status shows the reason instead of a blank section". No manual residue. Full regression gate pending (sprint's).

Decisions:
- `src/main/ipc/agent.ts` exports `agentHandlers` as the story pins, though `agents.ts` already exports that name; `register-all.ts` aliases it as `agentCliHandlers` — left as is.
- Added key `settings.agent.cli.unknown.errorNoCode` ("Status unknown: the lookup failed."): a failed query carries no code, so the `({code})` sentence cannot be used.
- Stat errors without a string code are reported as code `UNKNOWN`.
- Review findings left unfixed on purpose: AC5 e2e checks only `journal/` and `raw/` in the About text and the de label equals the en label (both "Agent"), a narrower proof than the criterion but the keys are pinned by the i18n key-set test; untested default `PATHEXT` and the `UNKNOWN` fallback are cosmetic branches; the German header comment in `SettingsScreen.tsx` was already German and only updated to "Sieben Tabs".
- `out/` was rebuilt with `npx electron-vite build` for the e2e run; `tests/renderer/settings.test.tsx` tab-list assertion extended with "Agent" (not weakened).

tiers: D 4 / hard 0 · review default · cycles 1 · agents 6
