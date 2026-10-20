---
id: 062
title: Codex work counts as work
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-4](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: full readers, the session browser, and linking exist for both CLIs
(`src/core/claude/`, `src/core/codex/`, `src/main/ipc/agents.ts:257`), but
`applyExternalTouches` is reached only from `claudeSessions()`
(`src/main/ipc/overview-deps.ts:188`); `codexSessions()` never updates the index;
`dashboardData` takes `ClaudeSession[]` only (`src/core/overview/dashboard.ts:174`) and
`recentWork` emits `kind: 'claude-session'` only (`src/core/overview/recent.ts:200`). The
dashboard reads 20 Claude sessions where the browser reads 100
(`src/main/ipc/overview-deps.ts:36` vs `src/main/ipc/agents.ts:42`).

## Requirement

"What did I last work on, and where did I leave off?" is the first of the three questions the
app exists to answer. For work done through Claude Code it answers well. For work done through
Codex — which the app already reads, lists, and links to projects in the session browser — it
answers wrongly: a Codex session never counts as a project's last touch, so a project worked on
exclusively via Codex still shows as stale, still triggers the stale-project reminder, and never
appears in recent work. The dashboard actively misreports exactly the thing it is for.

Everything that treats an agent session as a work trace — recent work, last touch, staleness,
the sessions tile — should treat both CLIs the same. The plumbing exists; only the overview
wiring is Claude-shaped.

## Acceptance Criteria

- [x] A Codex session in a linked repo updates the project's last touch and suppresses the
      stale-project reminder, exactly as a Claude session does.
- [x] Recent work on the dashboard shows Codex sessions, labeled by their agent kind.
- [x] The sessions tile and counts include both kinds.
- [x] The dashboard/browser session-limit asymmetry is either removed or justified in a comment
      where the limits live.
- [x] Tests cover a project whose only recent work is a Codex session: not stale, present in
      recent work.

## Open Questions

None.

## Decisions (Sprint)

- **One overview session type, Claude-shaped:** `AgentWorkSession = ClaudeSession & { agent: AgentKind; projectKey: string }`
  in `src/shared/types/overview.ts`; a Codex session is carried in that shape (summary = thread
  title, `firstPrompt: ''`, `files: []`, `subagents: null`) — the same adaptation `asLinkable`
  in `agents.ts` already does, so no second session model enters core.
- **Distinct kinds, not a generic one:** `RecentWorkItem.kind` and `Project.lastTouchSource`
  both gain `'codex-session'` next to `'claude-session'` — the AC asks for "labeled by agent kind",
  and a generic `'agent-session'` would erase exactly that distinction.
- **The visible label is the detail text:** `RecentWorkLabels.session` gains the agent as first
  parameter ("Claude-Session, …" / "Codex session, …"); the row icon stays `workflow` for both,
  because the design system allows one accent and the text already names the CLI.
- **One touches map, merged before it is applied:** `applyExternalTouches` replaces the map
  wholesale, so Claude and Codex touches are merged (newest `at` per slug, Claude on a tie) and
  applied in one call — two separate applies would erase each other's traces on every call.
- **The merge rides inside `claudeSessions()`:** every existing caller (dashboard, reminders,
  reminder-notify, condense, projects, `claude:sessions`) already calls it for its touch side
  effect, so putting the Codex merge there covers all of them without touching six call sites.
- **The Codex read path moves into `overview-deps.ts`:** it is overview wiring like Claude's;
  `agents.ts` imports it the way it already imports `claudeSessions`, which avoids an
  `overview-deps` ↔ `agents` import cycle.
- **Limit asymmetry removed where it mattered, justified where it stays:** both CLIs always
  _read_ `AGENT_SESSION_LIMIT` (100) so touches never depend on which channel ran last; the
  dashboard payload keeps a _display_ limit of 20 (`SESSION_LIMIT`), justified in a comment next
  to both constants.
- **The `claude-sessions` tile shows both kinds from `dashboard:data`'s `sessions`:** there is no
  flat Codex list channel, and the dashboard payload already carries the list the empty-dashboard
  check counts (`DashboardScreen.tsx:92`) — no new IPC channel.
- **Module id stays `claude-sessions`, the display name becomes "Agent sessions":** the id is
  persisted in vault layouts; the name must stop claiming Claude-only content.
- **Tile "off" state only when both CLIs are off:** with one CLI on, its sessions are real
  content; claiming "switched off" would be false.
- **Codex rows link inline via `agents:link`:** the same write the session browser uses
  (`useLinkAgentProject`, keyed by `projectKey`); a Codex row without a working directory offers
  no link, since `agents:link` cannot resolve it either.
- **No e2e line:** none of the criteria is a user action (all describe what is shown), so
  main-process IPC tests against real session files plus renderer tests satisfy the profile.

## Plan

Three deliverables, strictly in order; each leaves `npm run typecheck` green.

1. **D1 — types + core.** Shared types gain `AgentWorkSession` and the `'codex-session'` kind /
   touch source. `recentWork` and `dashboardData` take `readonly AgentWorkSession[]`;
   `sessionItem` emits the kind from `session.agent` and passes the agent to
   `labels.session`. `linkSessions` gets a `source` option (default `'claude-session'`). The
   compile ripple (English labels, icon map, trace-source i18n key, mock bridge, the dashboard
   IPC call site) is fixed in the same D, nothing more.
2. **D2 — main wiring (hard).** Codex read path moves from `agents.ts` into `overview-deps.ts`
   and links with `source: 'codex-session'`. `mergeTouches` in `claude-touches.ts`.
   `claudeSessions()` applies the merged Claude + Codex touches in both branches (Claude off,
   Claude on). Both readers read `AGENT_SESSION_LIMIT`. New `agentWorkSessions(services)`
   returns both kinds merged newest-first; `dashboard:data` passes the top `SESSION_LIMIT` of it.
3. **D3 — renderer.** `ClaudeSessionsTile` renders `dashboard:data`'s `sessions` (both kinds),
   an agent label per row, off only when both are off, Codex rows link via
   `useLinkAgentProject`. Display name "Agent sessions" / "Agent-Sitzungen".

Affected: `src/shared/types/{overview,domain}.ts`, `src/core/overview/{recent,dashboard,labels}.ts`,
`src/core/claude/link.ts`, `src/main/{messages,claude-touches}.ts`,
`src/main/ipc/{overview-deps,agents,dashboard}.ts`, renderer tile + i18n + mocks, tests.

## Deliverables

- [x] **D1 — Types and core treat both CLIs as work traces.**
      Files: `src/shared/types/overview.ts` (add
      `export type AgentWorkSession = ClaudeSession & { agent: AgentKind; projectKey: string }`
      with a doc comment saying Codex sessions travel in the Claude shape — summary = thread
      title, `firstPrompt: ''`, `files: []`, `subagents: null`; `RecentWorkItem.kind` adds
      `'codex-session'`; `DashboardData.sessions: AgentWorkSession[]`),
      `src/shared/types/domain.ts` (`lastTouchSource` adds `'codex-session'`),
      `src/core/overview/labels.ts` (`session(agent: AgentKind, messages, branch)`; German
      first part `Claude-Session` / `Codex-Session`), `src/core/overview/recent.ts` and
      `src/core/overview/dashboard.ts` (parameter type `readonly AgentWorkSession[]`;
      `sessionItem` sets `kind: session.agent === 'codex' ? 'codex-session' : 'claude-session'`
      and passes `session.agent` to the label), `src/core/claude/link.ts` (`LinkOptions.source?:
ExternalTouch['source']`, default `'claude-session'`, used for `touches`).
      Compile ripple only: `src/main/messages.ts` (English: `Claude session, …` / `Codex session, …`),
      `src/main/ipc/dashboard.ts` (map the Claude list to `{ ...s, agent: 'claude', projectKey: pathKey(s.cwd) }`
      — D2 replaces this line), `src/renderer/components/tiles/RecentWorkTile.tsx`
      (`KIND_ICONS['codex-session'] = 'workflow'`), `src/renderer/i18n/{de,en}-projects.ts`
      (`project.trace.source.codex-session`: „Codex-Session“ / "Codex session"),
      `src/renderer/lib/mock-bridge.ts` / `mock-fixtures.ts` (dashboard `sessions` entries get
      `agent`, `projectKey`). Update existing test fixtures that build `dashboardData`/`recentWork`
      inputs by adding `agent: 'claude'` — never drop an assertion.
      Tests: `tests/core/overview/recent.test.ts` › "a Codex session appears as codex-session with
      its agent in the detail"; `tests/core/overview/dashboard.test.ts` › "dashboard sessions carry
      both agent kinds"; `tests/core/claude/link.test.ts` › "touches carry the given source".
- [x] **D2 — The overview reads Codex, and one touches map holds both CLIs.**
      Files: `src/main/ipc/overview-deps.ts`, `src/main/ipc/agents.ts`,
      `src/main/claude-touches.ts`, `src/main/ipc/dashboard.ts`, new test
      `tests/main/codex-overview.test.ts`. Mirror: `claudeSessions()` in `overview-deps.ts`, and
      `createCodexFixture` / `createHarness` in `tests/main/ipc/agents.test.ts` (with
      `syntheticSession` from `tests/core/codex/fixtures`, `freezeTime`/`NOW` = 2026-08-10 from
      `tests/helpers/time`, harness pattern from `tests/main/dashboard-ipc.test.ts`).
      Steps: (a) move `codexReader`, `LinkedCodexSession`, the Codex cache, `codexSessions()` and
      `forgetCodexSessions` from `agents.ts` into `overview-deps.ts` (export them; `agents.ts`
      imports them and re-exports `forgetCodexSessions` so existing test imports keep working);
      `codexSessions()` links with `linkSessions(..., { source: 'codex-session' })` and caches the
      resulting `touches` alongside the sessions. (b) `claude-touches.ts`: add pure
      `mergeTouches(a, b)` — per slug the newer `at` wins, `a` wins a tie. (c) `claudeSessions()`:
      in both branches (reading off: Claude touches = empty map; reading on: `linked.touches`)
      call `applyExternalTouches(mergeTouches(claudeTouches, await codexTouches(services)))`,
      where `codexTouches` is empty when Codex reading is off. Also serve cached Claude sessions
      without re-applying (as today). (d) Move `AGENT_SESSION_LIMIT = 100` into `overview-deps.ts`
      as the _read_ limit for both CLIs (`claudeSessions` reads `Math.max(want, AGENT_SESSION_LIMIT)`);
      keep `SESSION_LIMIT = 20` as the dashboard _display_ limit; a comment at both constants says
      why: touches must come from the same read regardless of which channel ran last, the payload
      stays small. (e) Export `agentWorkSessions(services)`: Claude (tagged `agent: 'claude'`,
      `projectKey: pathKey(cwd)`) + Codex (Claude shape as in `asLinkable`, `summary: title`,
      `agent: 'codex'`, `projectKey: pathKey(cwd ?? '')`, `vaultProject` from linking) merged
      newest-first; calls `claudeSessions` first so the touches are applied. (f) `dashboard:data`
      uses `(await agentWorkSessions(services)).slice(0, SESSION_LIMIT)`. Update the header
      comments of `overview-deps.ts` and `agents.ts` to say both CLIs.
      Tests in `tests/main/codex-overview.test.ts` (Codex session `lastActivity` on 2026-08-10,
      `cwd` resolving to a sample-vault project that no Claude fixture session touches, e.g. via
      `repos` or unique slug name match): "a project whose only recent work is a Codex session is
      not stale" (`dashboard:data` › `staleProjects` excludes it, project `lastTouchSource` is
      `'codex-session'`); "a Codex-only project raises no stale-project reminder" (`reminders:list`);
      "a Codex session appears in recent work"; "dashboard sessions include both kinds, newest
      first"; "Claude and Codex touches on different projects both survive a dashboard call
      followed by claude:sessions"; "a Codex session beyond the display limit still counts as last
      touch" (21+ synthetic Codex files, only the oldest links the project; payload
      `sessions.length` is 20, project not stale).
- [x] **D3 — The sessions tile shows both CLIs.**
      Files: `src/renderer/components/tiles/ClaudeSessionsTile.tsx`,
      `src/renderer/i18n/{de,en}-dashboard.ts`, `tests/renderer/dashboard.test.tsx`,
      `tests/renderer/dashboard-fixtures.ts`. Mirror: the tile's own Claude link flow and
      `useLinkAgentProject` in `src/renderer/lib/queries/agents.ts`.
      Rows come from `useDashboardData().data?.sessions` (type `AgentWorkSession`, from
      `@shared/types`) instead of `useClaudeSessions()`; each row shows an agent label in mono
      (i18n keys, e.g. `tile.sessions.agent.claude` / `.codex` — reuse an existing agent-name key
      if `src/renderer/i18n/*-agents.ts` already has one); detail line uses `summary ?? firstPrompt`.
      "Off" state only when `useClaudeSessions` **and** `useCodexSessions` are both false (text:
      „Das Mitlesen der Agent-Sitzungen ist ausgeschaltet.“ / "Reading agent sessions is switched
      off."). Linking: Claude row → `useLinkSession` (unchanged); Codex row →
      `useLinkAgentProject({ agent: 'codex', projectKey, project })`; a Codex row with empty `cwd`
      shows no link button. `module.claude-sessions.name` → „Agent-Sitzungen“ / "Agent sessions"
      (id unchanged). Gaston atoms/tokens only, sentence case, no hardcoded strings. Existing tile
      tests move their fixture from `claude:sessions` to `dashboard:data` `sessions` and keep every
      assertion (update the off-text string to the new one).
      Tests in `tests/renderer/dashboard.test.tsx`: "the sessions tile lists a Codex session with
      its agent label"; "a Codex row links through agents:link"; "the tile is off only when both
      CLIs are off"; "recent work shows a Codex session with its detail".

## Model Hints

- D2 → deliverable-hard: `applyExternalTouches` replaces the single process-wide touches map
  wholesale, so an apply that misses either CLI silently erases the other's `lastTouch` and
  flips `stale` between calls, and the change reaches every caller of `claudeSessions()`
  (dashboard, reminders, reminder-notify, condense, projects, agents).
- Review: → default — the plausible wrong implementation (two separate applies) is caught by the
  named "both survive a dashboard call followed by claude:sessions" test, not only by review.

## Acceptance Tests

- AC1 → unit (main IPC) `tests/main/codex-overview.test.ts` › "a project whose only recent work is
  a Codex session is not stale" and › "a Codex-only project raises no stale-project reminder";
  merge safety › "Claude and Codex touches on different projects both survive a dashboard call
  followed by claude:sessions"
- AC2 → unit `tests/core/overview/recent.test.ts` › "a Codex session appears as codex-session with
  its agent in the detail"; unit (main IPC) `tests/main/codex-overview.test.ts` › "a Codex session
  appears in recent work"; renderer `tests/renderer/dashboard.test.tsx` › "recent work shows a
  Codex session with its detail"
- AC3 → unit (main IPC) `tests/main/codex-overview.test.ts` › "dashboard sessions include both
  kinds, newest first"; unit `tests/core/overview/dashboard.test.ts` › "dashboard sessions carry
  both agent kinds"; renderer `tests/renderer/dashboard.test.tsx` › "the sessions tile lists a
  Codex session with its agent label", › "a Codex row links through agents:link", › "the tile is
  off only when both CLIs are off"
- AC4 → unit (main IPC) `tests/main/codex-overview.test.ts` › "a Codex session beyond the display
  limit still counts as last touch" (proves read limit ≠ display limit; the justifying comment
  sits at `AGENT_SESSION_LIMIT` / `SESSION_LIMIT` in `src/main/ipc/overview-deps.ts`, checked by
  review)
- AC5 → unit (main IPC) `tests/main/codex-overview.test.ts` › "a project whose only recent work is
  a Codex session is not stale" and › "a Codex session appears in recent work"

Coverage: AC1 → D2 · AC2 → D1 (core, label) + D3 (tile) · AC3 → D1 (type) + D2 (payload) + D3
(tile) · AC4 → D2 · AC5 → D2.

## Done

Codex sessions now count as work throughout the overview layer. `AgentWorkSession` carries both
CLIs in the Claude shape; `'codex-session'` is a distinct kind/touch-source; a new `mergeTouches`
combines Claude and Codex touches (newest `at` wins, Claude on a tie) into one
`applyExternalTouches` call per `claudeSessions()` invocation, so neither CLI erases the other's
last touch. `agentWorkSessions()` merges both, newest-first, feeding `dashboard:data`. The
sessions tile reads from `dashboard:data`, labels rows by agent, links Codex rows via
`useLinkAgentProject`, and only shows "off" when both CLIs are off.

Commit message: `062: Codex sessions count as work traces (last touch, recent work, sessions tile)`

Verification (narrow gate): `npm run build`, `npm run lint`, `npm run typecheck` — green.
`npm run format:check` — red only on 3 pre-existing unrelated files (052, 061 requirement docs,
`tests/main/services.test.ts`); the story's own touched files (this file, progress.md,
`tests/core/overview/fixtures.ts`) formatted clean. `npx vitest run --changed HEAD` — green except
the pre-existing, unrelated `tests/renderer/quick-capture.test.tsx` failure (`localStorage.clear`
jsdom issue, fails identically on HEAD without this story's changes). No e2e run: no criterion
describes a user-driven UI flow (per `Decisions (Sprint)` → "No e2e line").

AC → test, all verified passing: AC1/AC5 → `tests/main/codex-overview.test.ts` › "a project whose
only recent work is a Codex session is not stale", › "a Codex-only project raises no
stale-project reminder", › "a Codex session appears in recent work", merge-safety › "Claude and
Codex touches on different projects both survive a dashboard call followed by claude:sessions".
AC2 → `tests/core/overview/recent.test.ts` (Codex detail/label), `tests/renderer/dashboard.test.tsx`
(Codex recent-work detail). AC3 → `tests/main/codex-overview.test.ts` (both kinds, newest first),
`tests/core/overview/dashboard.test.ts` (both agent kinds), `tests/renderer/dashboard.test.tsx`
(tile label, Codex link, off-only-when-both-off). AC4 → `tests/main/codex-overview.test.ts` ›
"a Codex session beyond the display limit still counts as last touch", justifying comment at
`AGENT_SESSION_LIMIT`/`SESSION_LIMIT` in `src/main/ipc/overview-deps.ts` confirmed by review.

Review: PASS, no findings requiring a fix (stage 1/default only, per `Review: → default`). Two
noted, non-blocking coverage gaps: no direct unit test for `mergeTouches`'s exact-tie rule, no
renderer test for "a Codex row without `cwd` shows no link button". `overview-deps.ts` is ~409
lines (over the ~300-line soft limit) — accepted per plan (Codex read path deliberately moved
there); reviewer judged it still one coherent responsibility, flagged as a future-split
candidate, not a blocker.

Decisions: none beyond what `## Decisions (Sprint)` already states; implementation followed the
plan as written, no gaps found.

Open points: none blocking. Non-blocking follow-ups noted above (tie-rule test, no-cwd-link
renderer test, `overview-deps.ts` size).

tiers: D 3 / hard 1 · review default · cycles 1 · agents 5
