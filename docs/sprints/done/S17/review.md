# Sprint S17 review — nothing trusts more than it must

## Overview

Goal: hold the main process to the same standard the model's output is already held to — a
hallucinated absolute path is refused instead of opened, a rejected citation is not clickable, a
filing proposal is re-validated server-side — and close the three P1/P2 usability gaps that came
out of the same architecture review: the app keeps running from the tray, a search hit and a
citation open inside the app instead of ejecting into the OS editor, and a knowledge module can be
renamed and deleted, not only created.

| Story | Status | Commit |
| --- | --- | --- |
| 057 — Main re-validates what the renderer sends | done | `057: main revalidates what the renderer sends` |
| 058 — Gaston stays reachable from the tray | done | `058: Gaston stays reachable from the tray` |
| 059 — A search hit opens in the app | done | `059: a search hit opens in the app` |
| 063 — A module can be renamed and deleted | done | `063: a module can be renamed and deleted` |

All four stories done, none blocked. Built in the planned order (057 → 058 → 059 → 063), each
verified and reviewed before the next started.

## Implemented stories

**057 — Main re-validates what the renderer sends.** `shell:openPath`/`showInFolder` now accept
only vault-relative or vault-contained paths (resolved, case-insensitive containment check,
reusing `isSafeVaultPath`); an uncited or rejected path renders as plain text in `Markdown`/
`ChatMessage` instead of a clickable action; `capture:apply` re-verifies the confirmed proposal's
target against the current index through a new `verifyFilingAction` and normalizes an unknown
section instead of writing it literally; in-window navigation is confined to the app's own entry
pages and http/https/mailto, wired into both the main and quick-capture windows.

**058 — Gaston stays reachable from the tray.** The app's first `Tray` (open / quick capture /
quit), a `closeToTray` setting that makes closing the window hide it instead of quitting (a real
quit — tray "Quit" or a window close with the setting off — still goes through the existing
close-guard veto, so the M13 "still running" prompt fires as before), a `showMainWindow` helper
consolidating four separate show paths, `startMinimized` now genuinely starting into the tray
(falling back to a visible start if no tray exists), both settings exposed in Settings →
Customization, and `ARCHITECTURE.md` brought back in line with reality.

**059 — A search hit opens in the app.** A full search-results screen with snippets and the
scope/type filters the index already supported, a new in-app reading view (rendered Markdown,
frontmatter as a facts row, wikilinks and vault paths navigable), documents that already have an
in-app home (projects, areas, journal days, wiki pages, condensed artifacts) deep-link there
instead; Ctrl+K gained a "show all results" entry and now opens hits in-app; citations in an ask
answer use the same in-app opening, with "open externally" kept as an explicit secondary action.

**063 — A module can be renamed and deleted.** Both operations reuse the existing
`discardPlan`/`discardPage`/`FixJournal`/`undoFix` framework (015/066) rather than a new write
path: a read-only preview lists every file the operation will touch, the folder move/trash is the
one hash-guarded structural step, and undo restores content and folder together. Rename rewrites
`module.md`, every page's `module:` field, `AGENTS.md`, ingest protocols, project frontmatter,
dump `filed_into` receipts and wikilinks; delete never touches raw sources — an emptied
`.ingest.json` module list returns to `sourcePage: null` ("undigested"). Both run through
`withModuleLock`, settle the index immediately, and never call `createGateway`.

## Findings & decisions

- **A real Windows bug was caught by 063's e2e run, not by any unit test**: the live chokidar
  vault watcher holds an OS handle that deterministically blocks `fs.rename()` on any directory
  beneath it, so the first real folder move failed with `EPERM` even though every watcher-less
  unit test was green. Fixed with `Services.withoutWatcher()` (disposes the watcher for the
  apply's duration, always restores it, serialized against concurrent calls). Worth remembering
  for any future story that moves or deletes a directory under vault watch, not just this one.
- **057's review caught a real navigation-guard bypass** before it shipped: `navigationVerdict`
  allowed a `file://` URL with a foreign UNC/SMB-style host when only the directory matched, and
  treated opaque origins (`javascript:`, `data:`) as same-origin. Fixed with a host comparison and
  an opaque-origin exclusion, plus two new tests.
- **058's review (two full rounds, risk: high) caught two real regressions in its own fixes**: a
  `window.maximize()` call that defeated the hidden-start acceptance criterion by showing a
  window that was supposed to start hidden, and an unguarded `Tray` constructor able to kill
  startup entirely (making the no-tray fallback dead code in practice). The first fix's own
  follow-on — the saved "maximized" setting silently dropped once a hidden-never-shown window
  closed — was caught in round 2, not round 1. Three-round review-fix cycles on a `risk: high`
  story did their job here.
- **063's review caught a HIGH-severity data-integrity finding**: `withFrontmatterPatch` rebuilt
  YAML from scratch instead of patching in place, so a page with unreadable frontmatter would
  have been silently replaced rather than refusing the write. Fixed to mirror `composeContent`'s
  existing throw-on-unreadable-YAML behaviour.
- **Reuse held across all four stories**, per CLAUDE.md's "reuse instead of copying": 057 reused
  `isSafeVaultPath`; 058's tray reachability required no new state-management pattern; 059's
  `homeOf()` was extracted from garden's existing `targetFor()`; 063 explicitly built on 015/066's
  discard/undo framework rather than inventing a fourth write path, once refine established that
  the sprint note's originally-named precedents (017, 043) were not actually the reusable ones —
  015/066 was.
- **Deferred, not fixed, each with a stated reason** (none block a real user today): 063's
  `modules:undo` has no lock/digestion-check on the slug it restores, and restoring a deleted
  module after its slug has been reused could mispoint protocols/projects at the wrong module —
  both narrow, pre-existing classes of "undo after the world moved on" risk already accepted
  elsewhere in the codebase. `src/core/wiki/module-lifecycle/plan.ts` (357 lines) and `rename.ts`
  (338 lines) are over CLAUDE.md's ~300-line soft limit — candidate for a future split-only pass.
  058 accepts one low-severity, session-scoped residual: reopening a hidden-started window from
  the tray loses its maximized flag on the next close until manually re-maximized.
- **Infrastructure, not code, interrupted three of the four builds** (058, 059, 063) mid-flight —
  two API rate limits and one session boundary. Each was resumed (not restarted) by checking
  `progress.md` and `npm run typecheck` for the actual state before continuing, the same lesson
  S13/S15 already recorded. No deliverable was redone or lost.

## Blocked / open

None. All four stories done, no open user questions.

## Acceptance

| Story | Criterion | Proved by |
| --- | --- | --- |
| 057 | AC1 refused absolute path | `tests/main/ipc/shell.test.ts` |
| 057 | AC2 rejected citation not clickable | `tests/renderer/ask.test.tsx`, `tests/renderer/markdown.test.tsx` |
| 057 | AC3 `capture:apply` re-validates | `tests/core/capture/verify-action.test.ts`, `tests/core/capture/sections.test.ts`, `tests/main/capture-ipc.test.ts` |
| 057 | AC4 `file://` navigation blocked | `tests/main/navigation.test.ts`, `tests/e2e/navigation-guard.spec.ts` |
| 057 | AC5 tests per seam | covered by AC1–AC4's tests |
| 057 | AC6 no regression | `tests/main/ipc/shell.test.ts`, `tests/main/capture-ipc.test.ts`, `tests/main/capture-flow.test.ts` |
| 058 | AC1 tray menu exists | `tests/main/tray.test.ts` |
| 058 | AC2 close hides, quit quits, guard still asks | `tests/main/close-guard.test.ts`, `tests/renderer/settings.test.tsx` |
| 058 | AC3 hotkey works while closed | `tests/e2e/tray.spec.ts` — **manual residue**: the physical key chord reaching Windows, Playwright's `_electron` cannot inject OS-level global shortcuts |
| 058 | AC4 notifier keeps running; click opens dashboard | `tests/main/reminder-notify.test.ts` — **manual residue**: clicking a real Windows toast in Action Center |
| 058 | AC5 `startMinimized` + second-start | `tests/e2e/start-minimized.spec.ts`, `tests/e2e/close-to-tray-off.spec.ts`, `tests/main/start-hidden.test.ts`, `tests/main/start-without-tray.test.ts` |
| 058 | AC6 ARCHITECTURE.md matches reality | `tests/main/architecture-doc.test.ts` |
| 058 | AC7 M13 warning reachable via tray quit | `tests/e2e/tray-quit-during-run.spec.ts`, `tests/main/close-guard.test.ts` |
| 059 | AC1 full result view with snippets/filters | `tests/e2e/search-results.spec.ts`, `tests/renderer/search-filters.test.ts`, `tests/renderer/snippet.test.tsx` |
| 059 | AC2 hit opens in in-app reading view | `tests/e2e/reader.spec.ts`, `tests/renderer/doc-home.test.ts` |
| 059 | AC3 documents with an in-app home deep-link there | `tests/renderer/doc-home.test.ts` |
| 059 | AC4 "open externally" stays available | covered in `tests/e2e/reader.spec.ts`, `tests/e2e/search-results.spec.ts` |
| 059 | AC5 citations open in-app | `tests/e2e/ask-citation-in-app.spec.ts`, `tests/renderer/ask.test.tsx` |
| 059 | AC6 keyboard-first path | `tests/e2e/search-keyboard.spec.ts` |
| 063 | AC1 rename in the app | `tests/core/wiki/module-lifecycle-plan.test.ts`, `tests/core/wiki/module-rename.test.ts`, `tests/e2e/module-rename.spec.ts` |
| 063 | AC2 delete in the app | `tests/core/wiki/module-delete.test.ts`, `tests/e2e/module-delete.spec.ts` |
| 063 | AC3 hash-aware, conflict not broken half-write | `tests/core/wiki/module-rename.test.ts`, `tests/core/wiki/module-delete.test.ts`, `tests/main/module-lifecycle-ipc.test.ts` |
| 063 | AC4 index/search/ask reflect the change immediately | `tests/main/module-lifecycle-ipc.test.ts` |
| 063 | AC5 works without a model configured | `tests/main/module-lifecycle-ipc.test.ts`, both e2e specs on the no-model harness |

**Manual residue, in total: two, both in story 058**, both with the same root cause (Playwright's
`_electron` cannot drive real OS-level input — a global hotkey chord, a Windows Action Center
toast click). Both are named in `testplan.md`. Every other criterion in the sprint is proven by
an automated test through the real app (`npm run test:e2e`) or at core/main level where no
user-facing surface exists. No criterion was covered a level below the real surface this sprint —
unlike several previous sprints, S17 needed no e2e-harness-gap notes.
