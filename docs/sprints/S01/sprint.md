---
sprint: S01
status: in-progress # planned | in-progress | done
branch: sprint/01
milestone: M1 — Navigation: places, actions, systems
---

# Sprint S01 — The rail becomes places

## Goal

Three screens that are not places stop being rail entries and move into the place they belong
to: Sources into Knowledge, agent sessions into Projects, capture and ask into the shell as
overlays. At the end the rail is down from eleven entries to seven, every screen keeps every
function it has today, and no existing deep link, hotkey or palette entry lands on a dead route.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 002 — Knowledge absorbs sources
- [ ] 007 — Capture and ask become actions, not places
- [ ] 008 — Agent sessions move inside projects

## Notes

**Why this order.** 002 is already refined (`status: ready`, plan + six deliverables) and
establishes the pattern the other two follow: fold a screen into a tab, move the route, add a
query-preserving redirect, repoint palette and screenshot scripts. 007 and 008 then reuse it.
007 before 008 because 008 is the larger of the two — it merges the existing work trace in the
project detail with the sessions view rather than putting them side by side.

**Renderer only, or close to it.** 002 states it explicitly: no file under `src/core/`,
`src/main/` or `src/shared/` is touched. 007 and 008 should stay that way too — if either one
starts wanting a new IPC channel, that is a signal the story grew and is worth raising before
building it.

**The recurring risk is the redirect.** `<Navigate to="…" />` drops the query string. Every
route that leaves the rail in this sprint has deep links pointing at it — citations, maintenance
findings, the command palette, toasts. A green test run will not catch a silently emptied query
string.

**Hotkeys are left with holes on purpose.** Four entries disappear here; Notes arrives in S02.
Renumbering the rail twice is churn. See the M1 gap note in
[../../ROADMAP.md](../../ROADMAP.md) — the wholesale renumber has no owner yet and must be
assigned before S02.

**Open questions to resolve in the clarification round** (from the story files):

- 007 — does the capture _screen_ disappear entirely, leaving the global
  `Ctrl+Shift+Space` window as the only capture path, or does it stay as an overlay?
- 007 — Ask and the command palette are both `Ctrl+K`-shaped: one control with two modes, or
  two separate controls?
- 008 — where does the all-sessions view hang: a Projects top-level tab beside the project
  list, or its own route under Projects?
- 008 — a project with no linked agent project: Sessions tab hidden, or visible with an empty
  state that offers to link one?
- 008 — do agent projects that will never map to a vault project need to be dismissable?

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true: all three
stories are user-facing, so each needs a real path through the running app
(`npm run seed && npm run shot`) before it may be called done.
