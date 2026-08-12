---
id: 001
title: Agent session browser (Claude & Codex)
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The work trails of the agent CLIs are currently only visible as one tile on the dashboard
(`claude-sessions`): six rows, newest first, no way in. That answers "what ran last" and
nothing else. I cannot see which projects an agent has worked on at all, how often, or what
happened inside a single session.

I want the agent traces as a screen of their own, reachable from the left rail, with three
levels I can walk down and back up:

1. **Sources** — switch between **Claude Code** and **Codex** on the same screen. Both are
   agent CLIs that leave a session trail on disk; which one I am looking at is a filter, not
   a second screen. Only the Claude trail exists in the code today (`src/core/claude/`);
   the Codex trail (`~/.codex/sessions/`) has to be read the same way and, where the formats
   differ, honestly say what it cannot supply.
2. **Projects** — a list of the working directories the selected agent has worked in, with
   the facts I judge by: when the last session was, how many sessions there are, over what
   period, and whether the directory is linked to a vault project.
3. **Sessions and the transcript** — inside a project, its sessions with per-session facts
   (start, duration, message count, branch, model, subagents used, context/token size where
   the trail records it), and from there into a single session to read the actual course of
   the conversation.

Why: the sessions are my worklog. "What did I last work on, and where did I leave off?" is
one of the app's three questions, and today it can only be answered for the last six
sessions overall — not per project, and never below the headline.

This stays a **read-only** view. The app reads the trail; it never writes into `~/.claude`
or `~/.codex`, and it never invokes an agent binary.

## Acceptance Criteria

- [ ] The left rail has an entry for the agent sessions; it opens the new screen and is
      marked active while I am on it. (The digits 1–0 are already taken by the ten existing
      screens — a keyboard shortcut is optional.)
- [ ] The screen has a visible switch between **Claude** and **Codex**. The choice is
      remembered while I navigate down and back up.
- [ ] With the source switched, the project list shows the working directories of that agent
      with: project name, path, number of sessions, last activity (relative), first activity,
      and the linked vault project where one is known.
- [ ] The project list is sorted by last activity, newest first.
- [ ] Clicking a project opens its detail view with a back path (breadcrumb or back button)
      that returns me to the project list with the source switch unchanged.
- [ ] The project detail lists that project's sessions, newest first, each with: start,
      last activity, duration, message count, git branch, and — where the trail records it —
      model, subagents used, and context/token size. Anything the trail does not contain is
      shown as unknown, not as a zero or an invented value.
- [ ] Clicking a session opens the transcript: the course of the session in order, user and
      assistant turns distinguishable, tool calls recognisable as tool calls. Long sessions
      stay usable (no full multi-megabyte file pulled into the renderer at once).
- [ ] A session that is not linked to a vault project can be linked from here, the same way
      the dashboard tile already does it.
- [ ] Deep links work: opening a project or session URL directly lands on that view.
- [ ] Honest states everywhere, per guardrail 1: the reading is switched off in the Behavior
      tab, the directory does not exist, the agent has never run, a session file is empty or
      corrupt — each says what is the case, with the path to fix it where there is one. Never
      an empty screen, never a silent failure.
- [ ] Codex not being installed does not break the screen — switching to it says so.
- [ ] The screen needs no LLM. Nothing on it calls the gateway.
- [ ] The existing dashboard tile keeps working and now links into the new screen.
- [ ] Nothing is written to `~/.claude` or `~/.codex`; no agent binary is started.
- [ ] Tests run against fakes, never against the real `~/.claude` or `~/.codex` (as
      `src/core/claude/` already does via `ClaudeFileSystem`).
- [ ] No hardcoded German or English strings in the renderer — every string goes through
      `t()`, keys exist in both `de.ts` and `en.ts`.
- [ ] Gaston: `gs-*` atoms and tokens only, sentence case, no emoji, no raw Tailwind palette
      classes.

## Open Questions

Resolved during refine (2026-08-12):

- **Rail label** → "Agents" (covers both CLIs and survives a third one).
- **Keyboard shortcut** → none. `hotkey` becomes optional in `ScreenDef`; the digits 1–0 stay
  where they are. Reachable by click and command palette.
- **Transcript depth** → condensed: user and assistant turns in full, tool calls as one
  collapsed line (name + target), expandable; reasoning blocks hidden.

## Plan

**Measured, not assumed** (checked against the real `~/.codex` on 2026-08-12, 205 sessions):

- Path is `~/.codex/sessions/YYYY/MM/DD/rollout-<iso>-<uuid>.jsonl` — **three levels deep**,
  unlike Claude's flat `~/.claude/projects/<slug>/`.
- Line 1 is `session_meta` and is **~18 KB** (it carries `base_instructions`). Claude's
  `HEAD_BYTES` (64 KB) / `HEAD_LINES` (20) would cover only ~4 lines — Codex needs its own
  window sizes.
- `session_meta.payload` has `session_id`, `cwd`, `git` (branch), `cli_version`,
  `context_window`, `originator`, `model_provider`.
- `turn_context.payload` has `model`, `cwd`, `workspace_roots`.
- `event_msg`/`token_count` has `info.total_token_usage.total_tokens` and
  `model_context_window` — that is the context figure.
- Turns: `event_msg`/`user_message`, `response_item`/`message` (role user/assistant/developer),
  `function_call` + `custom_tool_call` (+ `_output`), `reasoning`.
- `~/.codex/session_index.jsonl` maps session id → `thread_name` → a session title.
- **Codex has no subagents.** That field stays null there — shown as unknown, not as zero.
- Claude side: `model` sits on assistant records, `subagent_type` inside Task tool calls,
  token use in `usage`. None of it is read today.

**Approach:** no rename of `src/core/claude/`. A new agent-neutral layer sits above it.

1. `src/shared/types/agents.ts` + 3 channels in `src/shared/ipc.ts` (`agents:projects`,
   `agents:sessions`, `agents:transcript`). `claude:sessions` / `claude:link` stay untouched,
   so the dashboard tile keeps working.
2. `src/core/agents/` — `AgentKind`, the reader registry, project aggregation, transcript
   assembly. `AgentFileSystem` is an alias of the existing `ClaudeFileSystem`; the interface
   does not change (guardrail 4).
3. `src/core/codex/` — `records.ts`, `jsonl.ts`, `reader.ts`, mirroring `src/core/claude/`
   file for file, with Codex window sizes and a recursive `listDirs` walk over YYYY/MM/DD.
4. `src/core/claude/` grows model, subagents and token facts in `SessionFacts` — additive only.
5. `src/main/ipc/agents.ts` + `register-all.ts`, then `lib/api.ts`, `lib/queries/agents.ts`,
   `lib/queries/keys.ts`.
6. `src/renderer/screens/agents/` mirrors `screens/modules/`: **the address is the state**
   (`#/agents?a=codex&p=<key>&s=<id>`), so deep links and the back path come for free.
7. Settings get `useCodexSessions` + `codexSessionsDir` next to the existing Claude pair,
   with fields in the Behavior tab.

Everything read-only: no write into `~/.claude` or `~/.codex`, no agent binary started, no
LLM call. Fixtures are **synthetic** — never a copy of the user's real sessions (guardrail 6).

## Deliverables

- [ ] D1 — **Contract.** `src/shared/types/agents.ts` (`AgentKind`, `AgentProject`,
      `AgentSessionSummary`, `TranscriptEntry`, `TranscriptPage`), exported from
      `types/index.ts`; the three `agents:*` channels in `src/shared/ipc.ts` incl. the
      `IPC_CHANNELS` list. No handler, no logic.
      _Acceptance:_ `npm run typecheck` green; the renderer can name the types.
- [ ] D2 — **Agent layer skeleton.** `src/core/agents/types.ts` (`AgentFileSystem` as alias of
      `ClaudeFileSystem`, `AgentSessionSource` interface) + `registry.ts` mapping kind →
      source + `index.ts`.
      _Acceptance:_ unit test resolves both kinds; ESLint proves no Electron import.
- [ ] D3 — **Codex fixtures.** `tests/fixtures/codex/sessions/2026/08/12/rollout-*.jsonl`
      (2–3 sessions, one with an ~18 KB `session_meta` line, one with a truncated last line,
      one empty) + a matching `session_index.jsonl`. Synthetic content only.
      _Acceptance:_ fixtures parse as JSONL line by line; the truncated one is broken on
      purpose and documented as such.
- [ ] D4 — **Codex records.** `src/core/codex/records.ts` + `jsonl.ts`: interpret
      `session_meta`, `turn_context`, `token_count`, the message and tool records; skip
      broken lines.
      _Acceptance:_ tests against D3 read cwd, branch, model, token total and context window;
      the broken line is skipped and counted, not thrown.
- [ ] D5 — **Codex reader.** `src/core/codex/reader.ts`: recursive walk over YYYY/MM/DD,
      newest first, `limit`/`since`, empty file is not a session, titles from
      `session_index.jsonl`. Missing directory → empty list, not an error.
      _Acceptance:_ reader test over D3 returns the sessions in order; a nonexistent root
      returns `[]`.
- [ ] D6 — **Claude facts extended.** `model`, `subagents`, `tokens`/`contextWindow` added to
      `SessionFacts` and the session type — additive.
      _Acceptance:_ existing `tests/core/claude/*` stay green unchanged; a new test reads the
      three fields from the existing fixture.
- [ ] D7 — **Project aggregation.** `src/core/agents/projects.ts`: sessions → `AgentProject[]`
      (normalized cwd as key, session count, first/last activity, vault project), sorted by
      last activity. Pure function.
      _Acceptance:_ tests for grouping, sorting, and case-differing Windows paths landing in
      one project.
- [ ] D8 — **Transcript.** `src/core/agents/transcript.ts`: paged, condensed entries from both
      formats onto one `TranscriptEntry` type; tool calls collapsed, reasoning dropped.
      _Acceptance:_ tests for both kinds; a test proves a large file is not read whole
      (byte budget per page).
- [ ] D9 — **Settings.** `useCodexSessions` + `codexSessionsDir` in `OverviewSettings`,
      defaults, plus the two fields in the Behavior tab with i18n keys.
      _Acceptance:_ toggle and path survive a restart; empty path falls back to
      `~/.codex/sessions`.
- [ ] D10 — **Wiring.** `src/main/ipc/agents.ts` + `register-all.ts`, `lib/api.ts`,
      `lib/queries/agents.ts`, `lib/queries/keys.ts`.
      _Acceptance:_ the three channels answer through the preload; a main-side test covers
      each handler.
- [ ] D11 — **Rail + screen shell.** `hotkey` optional in `ScreenDef`, `agents` entry in
      `SCREENS` (icon `bot`, no digit), route in `App.tsx`, `AgentsScreen.tsx` with the
      Claude/Codex switch and the URL as state. Off / empty / error states.
      _Acceptance:_ the entry is visible, opens the screen, is marked active; the switch
      survives navigating down and back.
- [ ] D12 — **Project list.** `ProjectList.tsx` mirroring `ModuleCards.tsx`: name, path,
      session count, last and first activity, vault project.
      _Acceptance:_ sorted newest first; a click enters the detail view.
- [ ] D13 — **Project detail.** `ProjectDetail.tsx` with breadcrumb/back and the session rows
      (start, duration, messages, branch, model, subagents, context).
      _Acceptance:_ back returns to the list with the switch unchanged; unknown fields read
      as unknown, never as 0.
- [ ] D14 — **Transcript view.** `Transcript.tsx`: condensed course of the session, tool
      calls expandable, paged loading.
      _Acceptance:_ a 370 KB session opens without freezing; user and assistant are
      distinguishable.
- [ ] D15 — **Finish.** All i18n keys in `de.ts` and `en.ts`, dashboard tile links into
      `/agents`, `npm run seed && npm run shot`.
      _Acceptance:_ no hardcoded string in the new screens; both languages complete;
      screenshot present.

## Model Hints

`Delegate:` marks whether the deliverable is a candidate for `/delegate` (local Qwen3-Coder).
That is orthogonal to the ai-scrum tier — it says who *types*, the tier says who *supervises*.

- D1 → default · `Delegate: no` — IPC contract, excluded per the delegate skill.
- D2 → default · `Delegate: no` — small, but it fixes the shape everything else follows.
- D3 → default · `Delegate: yes` — mechanical fixture writing along an existing pattern.
- D4 → default · `Delegate: no` — new format, subtle record interpretation.
- D5 → default · `Delegate: no` — recursion plus window heuristics on real-world files.
- D6 → default · `Delegate: no` — touches a reader that is already under test.
- D7 → default · `Delegate: yes` — pure function with a fixed signature, the Qwen sweet spot.
- D8 → **deliverable-hard** · `Delegate: no` — the paging must map two different record
  formats onto one entry type without ever pulling a multi-megabyte file into memory; getting
  the byte budget wrong is a freeze the tests would not catch.
- D9 → default · `Delegate: no` — persisted settings schema.
- D10 → default · `Delegate: no` — IPC wiring, excluded per the delegate skill.
- D11 → default · `Delegate: yes` — mirrors `screens/modules/ModulesScreen.tsx`.
- D12 → default · `Delegate: yes` — mirrors `screens/modules/ModuleCards.tsx`.
- D13 → default · `Delegate: yes` — pattern-following composition of existing atoms.
- D14 → default · `Delegate: no` — paged rendering, the one UI piece with a perf trap.
- D15 → default · `Delegate: yes` — i18n keys and a one-line link, the classic delegable task.

Review: → **story-review-hard** — the story crosses core, main, preload and renderer and adds a
new filesystem reader; a cheap review would not catch a read path that quietly loads whole
files or a core module that grew an Electron import.

## Test Plan (manual acceptance)

Automated coverage is in the deliverables. These steps need a human, in the running app
(`npm run seed && npm run dev`):

1. **Rail.** The left rail shows "Agents" without a digit. Click it — the screen opens and the
   entry is marked active. The other ten shortcuts 1–0 still jump where they used to.
2. **Switch.** The screen opens on Claude and lists projects. Switch to Codex — the list
   changes. Switch back — Claude again.
3. **Project list.** Pick a project you know you worked in. Session count and last activity
   match your recollection; the path is the real working directory.
4. **Down and back.** Click the project → session list. Use the breadcrumb/back → you are back
   in the project list, **still on the same agent**. Not on the dashboard, not reset to Claude.
5. **Session facts.** In a Claude session with subagents, the subagents are named. In a Codex
   session, subagents read as unknown — not as "0".
6. **Transcript.** Open a long session (the Codex rollouts around 370 KB). It opens without a
   visible freeze, turns are in order, a tool call expands on click.
7. **Deep link.** Copy the address of an open session, reload the app (Ctrl+R), paste it — you
   land on that session again.
8. **Honest states.** Switch the Codex reading off in Settings → Behavior. The Codex tab says
   it is switched off and offers the way to the setting — no empty screen. Set the Codex path
   to a nonexistent folder: it says so instead of failing silently.
9. **Nothing written.** Note the mtime of a session file in `~/.codex/sessions/...`, browse it
   in the app, check again — unchanged.

## Done
