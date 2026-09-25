---
sprint: S17
status: in-progress # planned | in-progress | done
branch: sprint/S17
milestone: M17 — Nothing enters half-true, and nothing trusts more than it must
---

# Sprint S17 — Nothing trusts more than it must

## Goal

At the end of this sprint the main process holds everything the renderer sends to the same
standard the model's output is already held to: a hallucinated absolute path is refused instead
of opened, a rejected citation is not clickable, and a filing proposal is re-validated
server-side. Gaston keeps running from the tray when the window closes, so the hotkey and the
reminder notifier stay alive. A search hit and a citation open inside the app instead of
ejecting into the OS editor. And a knowledge module can be renamed and deleted, not only
created.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 057 — Main re-validates what the renderer sends
- [x] 058 — Gaston stays reachable from the tray
- [x] 059 — A search hit opens in the app
- [x] 063 — A module can be renamed and deleted

## Notes

Cut 2026-09-24, the second half of M17 (see [ROADMAP.md](../../ROADMAP.md)), out of the
2026-09-08 architecture-review backlog (057, 058, 059, 063) that has sat cut but unscheduled
since S16 was planned. Order and story set were already decided at that cut — this sprint just
starts them.

- **057 goes first, deliberately.** It is the review's second P0 (after 050, closed in S16) and
  is disjoint from the other three stories — it edits `src/main/ipc/shell.ts`,
  `src/main/ipc/capture-proposal.ts`, `src/core/capture/sections.ts` and
  `src/renderer/components/Markdown.tsx`, no `Tray`, no search screen, no module lifecycle.
- **057 and 058 both touch `src/main/window.ts`** (057: the `will-navigate` handler around
  line 125; 058: `startMinimized`/`show()` around line 65) — different concerns, same file, so
  057 lands and is reviewed before 058 starts rather than the two running in parallel.
- **058 is the risky story of this sprint** — likely `risk: high` at refine. It changes the
  app's own lifecycle (`src/main/index.ts`'s window-close-quits-app behavior), adds the first
  `Tray` the codebase has ever constructed, and is the load-bearing fix for a documented gap:
  M13's close-during-a-maintenance-run dialog has had no live path since S11 because no tray
  exists yet. Getting quit-vs-hide wrong here regresses every existing close/quit test
  (`close-guard.ts`, `quit-during-run-dialog`).
- **059 needs an in-app reading view that does not exist yet** — rendered Markdown, wikilinks
  navigable in-app, frontmatter not shown as a raw dump. Sequenced after 058 so the tray's
  window-show path is stable before a new screen is wired behind it; independent of 057 and
  063 otherwise.
- **063 is the review's one P2** and, per the story, deliberately excludes merging two modules
  — that stays a future story once rename/delete exist. Reuse, not a new mechanism (CLAUDE.md):
  the hash-aware write, the trash-based undo and the "show what changes first" preview reuse
  M4's exit/undo framework (017) and the delete pattern M12/M13 already built for condensed
  artifacts (story 043), not a fourth write path.
- **Acceptance surface.** 058's tray reachability and 059's in-app reading view are things the
  user does, so per `ui-acceptance-required` they need `npm run test:e2e` through the real app.
  The known S14/S15/S16 e2e-harness limit applies again where it needs a long-running or
  externally-triggered state (a real notification click, a real OS `file://` navigation
  attempt) — name any such gap at refine as manual residue, not late.
- The S08 git-safety rule applies as usual: no unscoped `git restore` / `git clean` in build
  agents.
