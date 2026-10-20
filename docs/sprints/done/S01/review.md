# Sprint review — S01: the rail becomes places

Branch: `sprint/01` · Milestone: M1 — Navigation: places, actions, systems

## Overview

**Goal.** Three screens that are not places stop being rail entries and move into the place
they belong to: Sources into Knowledge, agent sessions into Projects, capture and ask into
the shell as overlays. The rail comes down, every screen keeps every function, and no
existing deep link, hotkey or palette entry lands on a dead route.

**Goal reached**, with one honest caveat: the three stories are built, verified and reviewed,
but none of them has had manual live acceptance by the user yet (see "Built, live acceptance
pending" below).

| Story                                            | Status | Commit                                                      |
| ------------------------------------------------ | ------ | ----------------------------------------------------------- |
| 002 — Knowledge absorbs sources                  | done   | `5d8a90c` knowledge absorbs sources                         |
| 007 — Capture and ask become actions, not places | done   | `e9e3daa` capture and ask become overlays, not rail screens |
| 008 — Agent sessions move inside projects        | done   | `a697514` agent sessions move inside projects               |

Plus `20b6a60` — sprint setup, clarification round and the refine of 007/008.

**The rail is down from eleven entries to seven**: dashboard, inbox, projects, journal,
knowledge, garden, settings. Sources, capture, ask and agents left it this sprint.

## Implemented stories

**002 — Knowledge absorbs sources.** The sources screen body became `SourcesTab` and now sits
as a tab under Knowledge; the modules body became `ModulesTab` in the same tab bar. The route
is `#/knowledge`; `#/modules` and `#/sources` redirect there through `KnowledgeRedirect` in
[App.tsx](../../../src/renderer/App.tsx), which appends `useLocation().search` verbatim.
The module detail keeps its own module-scoped sources tab — deliberately not de-duplicated.

**007 — Capture and ask become actions, not places.** Both screen bodies were extracted into
`CapturePanel` / `AskPanel` and are now mounted as overlays hosted by the shell through a new
`ShellOverlays` context. `#/capture` and `#/ask` survive as opener routes: they open the
overlay and `replace` the URL, so every existing deep link (`?q=…` included) still lands.
`Ctrl+K` became one control with two modes — command palette (default) and ask; `Tab` or a
leading `?` switches. The title bar gained a capture button, and the search trigger is now
labelled "search or ask". The global `Ctrl+Shift+Space` quick-capture window is untouched.
This story carries the sprint's only non-renderer change: an additive `project` filter through
`chat:ask` (shared contract, main handler, `core/wiki/ask.ts`).

**008 — Agent sessions move inside projects.** The `agents` rail entry became the nested route
`#/projects/sessions`; `#/agents…` redirects with `a` / `p` / `s` preserved. The project detail
gained `Overview | Sessions` tabs, and the Sessions tab **absorbed** the old work trace —
`WorkTrace.tsx` is deleted, its last-touch line and repo list live in the tab, and the tab now
reads both CLIs (Claude and Codex) instead of only Claude. Unlinked agent projects can be
dismissed and brought back with "show all"; a project with no linked agent project hides its
Sessions tab unless the global "show empty" toggle is on. Both preferences persist through the
existing `settings:setVault` channel — no new IPC channel was added, verified by an empty diff
on `src/shared/ipc.ts` and `src/preload/`.

## Findings & decisions

**The redirect risk was real and was handled three times.** The sprint flagged that
`<Navigate to="…" />` drops the query string. Each story solved it the same way — read
`useLocation().search` and re-append — and each covered it with a test that goes red if the
redirect is replaced by a plain `<Navigate>`. This pattern is now established; later
navigation stories should reuse `KnowledgeRedirect`'s shape rather than reinvent it.

**Two defects were caught by clean-agent review, not by the tests.**

- 007: a second question fired from the palette was silently dropped while the ask overlay was
  open, and `Escape` in the palette tore down the overlay underneath it. A follow-up verifier
  then found a deeper one — firing the mutation from `AskOverlay`'s mount effect wedged the ask
  panel in _every dev build_ (StrictMode double-invoke plus TanStack Query's mutation observer
  never re-attaching). All fixed, with the regression test now running under StrictMode.
- 008: `agents:projects` returns `[]` when session reading is switched off, and the
  hide-the-tab logic read that as "not linked" — the Sessions tab silently vanished from every
  project, taking the honest "switched off" state with it. That is a guardrail-1 violation
  (never a silent failure). Replaced by a deterministic rule: a tab exists if the project has
  `repos` **or** a matched agent project, never because one CLI stayed quiet.

The lesson for the next sprint: the review step earned its cost here. Both defects were in the
seam between a new surface and an existing async data path, which is exactly where unit tests
with fakes look green.

**Scope held, with one deliberate exception.** The sprint said "renderer only, or close to it"
and that a new IPC channel would be a signal the story grew. 007 needed a real `project` filter
in `chat:ask` — prefilling a project scope that does not actually filter would have been a
false claim to the user. That was accepted as an _additive_ change to an existing channel. 008
stayed strictly inside that line: its two new preferences ride `settings:setVault`.

**Decisions worth carrying forward** (full lists live in each story's `## Decisions (Sprint)`):

- Overlay state lives in shell React state, not in a URL param — screens rebuild their own
  search params and would close the overlay.
- Ask mode's `Enter` submits, unlike a `?q=` URL which only prefills: the keystroke is the
  user's action.
- "Show empty sessions tab" is one _global_ toggle, not per project — a per-project map in
  vault settings cannot be pruned by `deepMerge`.
- `WorkTrace.tsx` was deleted rather than kept beside the new tab. That is the merge the sprint
  asked for; no session data stayed behind on the Overview tab.
- The `agents.*` i18n family and every `agents:*` IPC channel keep their names. Renaming stops
  at the UI.

## Built, live acceptance pending

All three stories are user-facing and all three ran the live smoke (`npm run seed && npm run
shot`) green — 53–54 screenshots, no console errors, `npm run a11y` at 0 violations, and the
agents looked at the new surfaces themselves. That is **not** the same as manual acceptance.
The following need the user to drive them by hand before M1 can be called accepted:

- 002 — Knowledge tab bar, and the `#/modules` / `#/sources` deep links from citations,
  maintenance findings and toasts.
- 007 — the capture and ask overlays, `Ctrl+K` in both modes, and the `#/capture` / `#/ask`
  opener routes.
- 008 — `#/projects/sessions`, the project detail's Sessions tab, dismiss + "show all", and the
  hidden-tab reveal.

See [testplan.md](testplan.md) for the step-by-step guide — 17 use cases, all of them UI-only.

## Acceptance gaps (P1)

The test plan is UI-only by rule, and writing it surfaced capabilities this sprint claims that
**cannot be checked through the real UI**. Named here rather than papered over with a console
workaround:

- **The redirects are unreachable.** `#/modules`, `#/sources` and `#/agents?a=&p=&s=` cannot be
  entered by hand: the window is frameless, there is no address field, and every in-app link
  was repointed to the new routes as part of the same stories. Only the redirect _targets_ are
  checkable by hand. The redirects themselves rest on their mutation-tested unit tests — which
  is the load-bearing evidence for the sprint's single biggest risk. `#/capture` and `#/ask?q=`
  are the exception and _are_ covered, because the dashboard tile, the inbox and recent-work
  still navigate to them.
- **"Reload the app on `#/…`" is not performable at all.** All three story test plans ask for
  it; a restart always lands on `/dashboard`.
- **The Codex half of the CLI switch reads the tester's real `~/.codex/sessions`.** The seed
  pins only `claudeProjectsDir` (gap 4 below). Only the control and the honest empty/off state
  can be checked against the demo vault.
- **`Ctrl+Shift+Space` may be taken by another app.** The UI fallback is the palette's
  "Erfassen-Fenster" entry, which exercises the window but not the _global_ part of the
  criterion.
- **Every LLM path is only testable in its "no model configured" shape**, since the demo vault
  ships `providers: []`. That is the guardrail-1 state and worth checking, but it is not the
  full path.

None of these is a defect. They are limits of what manual UI acceptance can reach here, and
they say exactly how far the user's own acceptance run can go.

## Blocked / open

No story was blocked. Nothing needs a user decision to be unblocked. What is open:

**1. `tests/core/wiki/module.test.ts` is red, and was red before this sprint.** The test
asserts that `MODULE_SCHEMA_TEMPLATE` in `src/core/wiki/module.ts` is character-for-character
`docs/MODULE-SCHEMA.md`. The doc was migrated to English in commit `e8959d1`; the constant in
the code was not. Verified pre-existing by running the test against a clean tree. Left
untouched on purpose — resyncing the constant changes the module schema template that gets
written into the user's vault, which is a content decision outside this sprint's scope.
**The sprint's verify gate is therefore not fully green, and this is the reason.** Whoever
picks it up decides which side is authoritative.

**2. The wholesale rail renumber still has no owner.** Four entries left the rail this sprint;
the digit hotkeys now have holes at 2, 4 and 8. Both 002 and 007 deferred it explicitly and
neither claims it in its acceptance criteria. This was already the standing M1 gap — it is now
concrete rather than theoretical, and must be assigned before S02 starts.

**3. `AskPanel.tsx` is 326 lines and `ProjectOverviewTab.tsx` is 312**, both over the ~300-line
soft limit. Both were judged one responsibility by their reviews; `ProjectDetail.tsx` went from
347 down to 163 in the same move. Noted, not urgent.

**4. `scripts/seed/internal.mjs` pins `claudeProjectsDir` for the demo vault but not Codex**, so
a screenshot run still reads the real `~/.codex/sessions`. Pre-existing (came with story 001),
surfaced by 008 because the Sessions tab now reads both CLIs. Worth fixing before the demo
vault is used for anything shareable.

**5. `npm run format:check` reports ~15 markdown offenders under `docs/` and `.claude/`**, all
pre-existing, plus CRLF-vs-LF noise from `core.autocrlf=true`. No new content-level offenders
were added this sprint. A one-off `prettier --write` over `docs/` would clear it.
