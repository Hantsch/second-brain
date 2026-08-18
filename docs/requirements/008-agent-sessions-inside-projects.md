---
id: 008
title: Agent sessions move inside projects
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

Agent work is part of the picture of a project, not a screen beside it. What the
agents did *is* what happened on the project — that is exactly the answer to "what
did I last work on, and where did I leave off?"

The link already exists twice, half each: the work trace in the project detail shows
that project's sessions, and the agents screen lists agent projects with a picker to
link them to a vault project. Two entry points into one subject, and neither is the
obvious one.

So: agent sessions become a tab inside Projects. The all-sessions view stays as the
entry point for agent projects that are not linked yet.

Depends on story 001 (agent session browser), which is done.

Target picture: [concepts/navigation.md](../concepts/navigation.md).

## Acceptance Criteria

- [ ] The rail entry "Agents" is gone.
- [ ] A project has a "Sessions" tab showing its agent sessions, with the transcript
      view reachable from there.
- [ ] Projects reaches an all-sessions view that lists agent projects across both
      CLIs (Claude, Codex), including ones not linked to a vault project.
- [ ] Linking an agent project to a vault project is possible from there, and the
      sessions then appear in that project's tab.
- [ ] The existing work trace and the new tab are one thing, not two views of the
      same data side by side.
- [ ] Deep links keep working: `#/agents`, `#/agents?a=codex&p=<key>&s=<id>` and
      everything in between land on the equivalent place.
- [ ] The four honest states survive the move: loading, error, "not configured"
      (with the missing directory named), and empty.
- [ ] The switch between Claude and Codex stays available in both views.
- [ ] Works without a configured model — reading sessions needs no LLM.

## Open Questions

- ~~Where does the all-sessions view hang?~~ answered → Decisions (Sprint)
- ~~A project with no linked agent project: does the Sessions tab stay hidden, or show
  an empty state offering to link one?~~ answered → Decisions (Sprint)
- ~~Agent projects that will never map to a vault project — do they need to be
  dismissable?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** All-sessions view: its own route under Projects (not a top-level tab
  beside the project list).
- **(User)** Project with no linked agent project: Sessions tab hidden by default,
  with an option to reveal it ("show empty" toggle) rather than a permanent empty
  state.
- **(User)** Unmapped agent projects (one-off directories, will never map to a vault
  project): dismissable, with a "show all" option to bring dismissed entries back.
- The all-sessions route is `#/projects/sessions` — nested under Projects, so the rail
  entry stays active through the `NavLink` prefix match and the URL itself says "under
  Projects", without a new rail entry or a tab beside the list.
- The `#/agents*` redirect preserves the query string and keeps the params `a` / `p` /
  `s` unchanged, so every existing deep link only swaps its path — the smallest
  possible change to the riskiest part of the story.
- The per-project "Sessions" tab is a tab of the **project detail**
  (Overview | Sessions), not of the Projects screen: the criterion says "a project has
  a Sessions tab", and the screen-level tab bar already means list | todos.
- The Sessions tab reads `agents:projects` + `agents:sessions` (both CLIs) instead of
  the work trace's `claude:sessions` filter — that is what makes trace and tab one
  thing, and it brings Codex into the project view at no extra cost.
- `WorkTrace.tsx` is deleted; its last-touch line and its `repos` list move into the
  Sessions tab, so no session data stays behind on the Overview tab.
- The project-scoped view derives its agent project keys itself and reuses `a` (CLI)
  and `s` (session) as params; `p` keeps meaning the vault project slug on
  `#/projects`, so there is no param collision.
- The transcript view is reused unchanged from both places (one component, cursor
  paging untouched) — a second transcript implementation is the fastest way to break
  paging.
- Dismissals and the "show empty" flag persist in `VaultSettings.overview` through the
  existing `settings:setVault` channel: the sprint warns explicitly against new IPC
  channels, `deepMerge` replaces arrays wholesale, and `preferredTags` is the
  precedent for a string list in vault settings.
- The dismissal key is agent kind plus project key (`claude:<key>`); only agent
  projects **without** `vaultProject` can be dismissed, because a linked one belongs
  to a project and must not be able to vanish.
- Dismissing states how many entries are hidden and offers "show all" in place — no
  silent hiding, per the navigation concept rule that nothing hides and no place is
  emptied without saying so.
- "Show empty" is **one global toggle** on Projects, not per project: per-project
  state would need a growing map in vault settings, which `deepMerge` cannot prune.
- The command palette gets a static "Agent sessions" command (mirrors D6 of story
  002), since the entry disappears from `SCREENS` together with the rail entry.
- The `agents.*` i18n family and every `agents:*` IPC channel keep their names —
  renaming stops at the UI (navigation concept). Only `rail.agents` goes.
- No hotkey churn: the agents rail entry never had a digit, so nothing is freed here
  and nothing is renumbered.
- `ProjectDetail.tsx` (347 lines) is split into overview + sessions tab components
  rather than grown — the ~300-line soft limit is already reached.
- Screenshot/a11y deep states are repointed (`agents` → `/projects/sessions`) and a
  new `project-sessions` state is added, so both new surfaces are actually shot.

## Plan

Renderer-first, with one small deliberate slice through `shared` + `main` for the two
persisted preferences — no new IPC channel, the existing `settings:setVault` carries
them.

**URL model**

```
#/projects/sessions                        all agent projects, Claude (default)
#/projects/sessions?a=codex                ... Codex
#/projects/sessions?a=codex&p=<key>        agent project detail (its sessions)
#/projects/sessions?a=codex&p=<key>&s=<id> transcript
#/agents*                                  redirect, query string preserved
#/projects?p=<slug>&tab=sessions           project detail, Sessions tab
#/projects?p=<slug>&tab=sessions&s=<id>    ... transcript of that session
```

Order of work:

1. Persisted prefs: `overview.dismissedAgentProjects: string[]`,
   `overview.showEmptySessionsTab: boolean` (types, defaults, validation whitelist).
2. Split `AgentsScreen` into reusable parts: CLI switcher, the state machine
   (loading / error / missing dir / off / empty), project list, session list,
   transcript — all callable from two hosts. Pure refactor.
3. New route `/projects/sessions` hosting the all-sessions view; rail entry `agents`
   removed; query-preserving redirect for `/agents`.
4. Dismiss + "show all" in the all-sessions project list.
5. Project detail gets its tab bar and a Sessions tab that absorbs the work trace,
   over both CLIs, transcript reachable; `WorkTrace.tsx` deleted.
6. Hide the Sessions tab when nothing is linked; reveal it via the global
   "show empty" toggle; from the revealed tab, one click to `/projects/sessions`.
7. Repoint the dashboard tile, the palette, the screenshot/a11y scripts and the rail
   table in `docs/ARCHITECTURE.md`.

**Watch out**

- `<Navigate to="…" />` **drops the query string** — `#/agents?a=…&p=…&s=…` is a real
  deep link (transcript back path, dashboard tile). The redirect must read
  `useLocation().search` and re-append it. Single most likely silent regression;
  stories 002 and 007 hit the same trap.
- The `go()` helper of `ProjectsScreen` rebuilds a fresh `URLSearchParams` and today
  knows only `p` / `tab`; it drops `s` and `a` unless extended.
- The Projects tab bar is not rendered in the error and zero-project branches
  (`ProjectsScreen.tsx:155-193`) — the new route must not depend on it.
- `checkScreenList()` in `scripts/lib/screens.mjs` parses `src/renderer/lib/screens.ts`
  and reports drift; removing the `agents` id has to be mirrored there.

## Deliverables

**D1 — Two persisted preferences, no new channel.**
`dismissedAgentProjects: string[]` and `showEmptySessionsTab: boolean` in
`OverviewSettings`, with defaults (`[]`, `false`) and validation.

- `src/shared/types/settings.ts`, `src/main/settings.ts` (`defaultVaultSettings`)
- `src/main/ipc/settings-validate.ts` (`overview()`, beside `useCodexSessions`)
- the settings validation test under `tests/main/`
- mirror: the `preferredTags: string[]` handling and the `boolean(...)` lines in the
  same `overview()` function

_Acceptance:_ `settings:setVault` accepts both keys, rejects wrong types, a written
array survives a reload, and an unknown extra key is still stripped.

**D2 — Split the agents screen into reusable parts (pure refactor).**
Everything below the screen header of `AgentsScreen` becomes a self-contained
`AgentSessionsPanel` (CLI switcher + the loading / error / missing-dir / off / empty
state machine + project list → detail → transcript), driven by props instead of its own
`useSearchParams`. `AgentsScreen` keeps its route for now and becomes header + panel.

- new `src/renderer/screens/agents/AgentSessionsPanel.tsx` (+ `AgentStates.tsx` for the
  five states if the panel passes ~300 lines)
- `src/renderer/screens/agents/AgentsScreen.tsx`
- mirror: `src/renderer/screens/sources/SourcesTab.tsx` (D1 of story 002)

_Acceptance:_ `tests/renderer/agents.test.tsx`, `agents-project-list.test.tsx`,
`agents-project-detail.test.tsx` and `agents-transcript.test.tsx` all stay green
**without changing a single assertion**.

**D3 — All-sessions view moves under Projects, `#/agents` redirects.**
New screen at `/projects/sessions` (header "Projects · Agent sessions", back link to
Projects) hosting `AgentSessionsPanel` with `a` / `p` / `s` exactly as today. Rail entry
`agents` and `rail.agents` removed, `AgentsScreen.tsx` deleted, query-preserving
redirect `/agents` → `/projects/sessions`.

- new `src/renderer/screens/projects/AllSessionsScreen.tsx`
- the query-preserving redirect component (reuse the one from 002 / 007 if it already
  landed on the sprint branch; otherwise new `src/renderer/components/QueryRedirect.tsx`)
- `src/renderer/App.tsx`, `src/renderer/lib/screens.ts`
- delete `src/renderer/screens/agents/AgentsScreen.tsx`
- `src/renderer/i18n/de.ts`, `en.ts` (drop `rail.agents`), `de-screens.ts`,
  `en-screens.ts` (the `screen.agents.*` header keys)
- `tests/renderer/agents.test.tsx`, `screens.test.tsx`, `i18n.test.ts`

_Acceptance:_ no "Agents" rail entry; `#/agents?a=codex&p=<key>&s=<id>` lands on the
same transcript under `#/projects/sessions?…` with **every** param intact; the Projects
rail entry is highlighted while on the new route.

**D4 — Dismiss an unmapped agent project, and "show all".**
In the all-sessions project list, an agent project **without** `vaultProject` gets a
dismiss control; dismissed keys go into `overview.dismissedAgentProjects`. The list
states how many are hidden and offers a "show all" toggle that brings them back, each
with an undismiss control.

- `src/renderer/screens/agents/ProjectList.tsx`,
  `src/renderer/screens/projects/AllSessionsScreen.tsx`
- `src/renderer/i18n/de-agents.ts`, `en-agents.ts` (`agents.dismiss.*`)
- `tests/renderer/agents-project-list.test.tsx`
- mirror: the gardener dismiss / undismiss flow in `src/renderer/screens/garden/`

_Acceptance:_ dismissing removes the card and shows "n hidden"; "show all" brings it
back and undismiss restores it permanently; a linked agent project has no dismiss
control; the state survives a restart.

**D5 — Project detail gets tabs, and the work trace becomes the Sessions tab.**
`ProjectDetail` splits into a tab bar (`overview` | `sessions`) plus
`ProjectOverviewTab` (today's body minus the trace) and `ProjectSessionsTab`. The
Sessions tab shows the last-touch line, the `repos` and the project's sessions from
`agents:sessions` for every agent project whose `vaultProject` is this project — per
CLI, with the Claude/Codex switch — and opens the transcript via `s`. `WorkTrace.tsx`
and `useProjectSessions` are deleted.

- `src/renderer/screens/projects/ProjectDetail.tsx`, new `ProjectOverviewTab.tsx`, new
  `ProjectSessionsTab.tsx`
- delete `src/renderer/screens/projects/WorkTrace.tsx`
- `src/renderer/lib/queries/projects.ts` (drop `useProjectSessions` / `filterSessions`)
- `src/renderer/i18n/de-projects.ts`, `en-projects.ts` (`project.tab.*`; the
  `project.trace.*` keys move into the tab)
- `tests/renderer/projects.test.tsx`
- mirror: `src/renderer/screens/projects/ProjectsScreen.tsx:144-153` (the `Tabs` atom)

_Acceptance:_ the detail shows Overview | Sessions; Overview has no session list any
more; the Sessions tab lists that project's Claude **and** (after switching) Codex
sessions and opens a transcript; loading, error, "not configured" (with the missing
directory named) and empty all render honestly; nothing on the tab needs an LLM.

**D6 — Hidden by default, revealable, and the way to link.**
The Sessions tab is not offered when the project has no linked agent project, unless
`overview.showEmptySessionsTab` is on — a toggle in the Projects filter bar. Revealed
and empty, the tab names the situation and links to `#/projects/sessions`, where the
link picker lives.

- `src/renderer/screens/projects/ProjectDetail.tsx`, `ProjectSessionsTab.tsx`,
  `ProjectFilters.tsx`
- `src/renderer/i18n/de-projects.ts`, `en-projects.ts`
- `tests/renderer/projects.test.tsx`

_Acceptance:_ project without a link → no Sessions tab; toggle on → the tab appears,
says what belongs in it, one click reaches the all-sessions view; linking there makes
the sessions appear in that project's tab; the toggle survives a restart.

**D7 — Repoint tile, palette, scripts, docs.**

- `src/renderer/components/tiles/ClaudeSessionsTile.tsx:90` (`/agents` →
  `/projects/sessions`)
- `src/renderer/components/CommandPalette.tsx` (static "Agent sessions" command beside
  `action:capture`)
- `scripts/lib/screens.mjs` (`DEEP_STATES`: `agents` → `/projects/sessions`, new
  `project-sessions`; the `checkScreenList` drift check), `scripts/shot.mjs`,
  `scripts/a11y.mjs` where ids are listed explicitly
- `src/renderer/lib/mock-bridge.ts` if the new deep state needs fixture sessions
- `docs/ARCHITECTURE.md` (rail + hotkey table at :108-124)
- `tests/renderer/screens.test.tsx` or a palette test

_Acceptance:_ `Ctrl+K` → "sess" (de: "sitz") finds the agent sessions and lands on
`#/projects/sessions`; the dashboard session tile lands there too; `npm run shot`
produces both new surfaces without a blank frame.

**Coverage** — every acceptance criterion, in order: rail entry "Agents" gone → D3 ·
project Sessions tab with transcript → D5 · all-sessions view across both CLIs incl.
unlinked ones → D3 · linking from there, sessions then in the tab → D6 (picker reused
via D2 / D3) · trace and tab are one thing → D5 · deep links `#/agents…` keep working →
D3 · the four honest states survive → D2 + D5 · Claude/Codex switch in both views →
D2 + D5 · works without a configured model → D5.

## Model Hints

D3 → deliverable-hard — the route move carries every existing `#/agents?a=&p=&s=` deep
link, and both a bare `<Navigate>` and a rebuilt `URLSearchParams` silently drop
params, so the regression is an empty list instead of the transcript, with all tests
green.

D5 → deliverable-hard — it merges two data paths (the `claude:sessions` filter vs.
`agents:*` per CLI) into one tab while splitting a 347-line component; the risk is a
project silently showing no sessions where the trace previously did.

D1, D2, D4, D6, D7 → default.

Review: → story-review-hard — the story deletes a screen, a component and a query
hook, moves a route and touches settings validation; one missed link or one lost query
param is a dead screen that a green test run will not catch.

## Test Plan (manual acceptance)

`npm run seed`, then start the app.

1. Rail: there is no "Agents" entry; digits 1-0 behave exactly as before.
2. Open a project that has agent sessions: the detail shows the tabs
   **Overview | Sessions**. On Overview there is no session list any more.
3. **Sessions** tab: last touch, the repos, the session list. Switch Claude ↔ Codex.
   Open a session → transcript, "load more" pages, back returns to the tab.
4. Open a project **without** a linked agent project: no Sessions tab. Switch on
   "show empty" in the Projects filter bar → the tab appears, states what belongs in
   it and offers the way to the all-sessions view.
5. Reach the all-sessions view from the dashboard session tile and via `Ctrl+K` →
   "sess" (de: "sitz"): both land on `#/projects/sessions`, and Projects stays
   highlighted in the rail.
6. There, link an unlinked agent project to a vault project → toast with undo; open
   that project → its Sessions tab now shows the sessions.
7. Dismiss an unmapped agent project → it disappears, "n hidden" is stated. Toggle
   "show all" → it is back and can be undismissed. Restart the app → the dismissal and
   "show empty" are both still in effect.
8. Reload the app on `#/agents` → the all-sessions view. Reload on
   `#/agents?a=codex&p=<key>&s=<id>` (copy the key from the URL in step 3) → the same
   transcript, Codex selected.
9. Settings → Behaviour: set the Claude sessions directory to a non-existent path →
   both the all-sessions view and a project's Sessions tab name that missing directory
   and offer the way to settings. Switch session reading off → the honest "off" state,
   no error.
10. Settings → remove the configured model → every step above still works.

## Done

<Filled by `/ai-scrum:build 008`.>
