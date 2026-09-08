# Sprint S11 — Review

## Overview

**Goal:** the guardrail M12 decided but never enforced becomes real — an answer can no longer cite
the app's own condensation as evidence, always the file it was written from. Around it, the three
carve-outs sitting in the roadmap's unprioritised table close: the format gate goes green on
Windows, a maintenance run stays visible on navigation, and a condensed artifact can be deleted
from inside the app.

| Story                                                    | Status                         | Commit                                                          |
| -------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| 040 — An answer cites the source, never the condensation | done                           | `040: an answer cites the source, never the condensation`       |
| 042 — A maintenance run stays visible wherever I am      | built, live acceptance pending | `042: strip lives in the shell; close guard warns during a run` |
| 043 — I can delete a condensed artifact                  | built, live acceptance pending | `043: delete a condensed artifact`                              |
| 041 — The format gate is green on Windows                | done                           | `041: the format gate is green on Windows`                      |

All four stories built in order on `sprint/S11` (branched from `dev`), one commit per story,
`npm run build`/`test`/`lint`/`typecheck` green after every story. 040 and 041 are `done` outright;
042 and 043 are fully implemented, reviewed and unit/integration-tested but held at `in-progress`
per the profile's P2 live-smoke policy — their end-to-end UI paths could not be reliably driven
interactively in this session (see Blocked / open).

## Implemented stories

**040 — An answer cites the source, never the condensation.** `EVIDENCE_EXCLUDED_TYPES` (currently
just `condensed`) now sits in `src/core/wiki/evidence.ts` and narrows the existing `types`
whitelist inside `retrieve()` before any search runs — the exclusion is a retrieval-time filter,
not a prompt instruction, and applies identically with and without a model, across module/project/
whole-vault scopes. A request that resolves to only excluded types returns `[]` before search
executes, producing the honest "no evidence found" answer. `file-back()` re-validates citations
against the same list so a condensed excerpt cannot ride into a filed wiki page. The artifact stays
fully reachable in full-text search and `Ctrl+K` (Q2), and the condensed tab now states in one line
that the artifact is not used as evidence and answers go to its sources, in `de` and `en`.

**042 — A maintenance run stays visible wherever I am.** The root cause of the original bug was
established before anything was moved: `useGardenerProgress`'s seed uses `staleTime: Infinity` +
`gcTime: 0` while a permanent rail-footer observer of the same query key kept it from ever being
evicted, so a remounted maintenance screen read the stale boot-time cache; the live layer on top is
per-hook-instance state fed by non-replaying events, so the remounted instance also saw nothing
until the next event arrived. Progress state was moved into a module-level store
(`src/renderer/lib/gardener-progress.ts`) fed by a subscription that never unmounts, and the bar
itself became a shell-level `RunStrip` mounted once in `AppShell`, painted with neutral
surface/fog tokens (not the teal accent, keeping the one-focus-point rule) — the old
`RunBar`/`GardenerIndicator` were retired rather than duplicated. Closing the app during a run is
now vetoed at the main-process level (`src/main/close-guard.ts`) on both the window's `close` and
`app`'s `before-quit`, with a Gaston dialog offering stop-and-close through 021b's existing stop
path; a ~5s dead-man timer and an added `window:cancelClose` channel (found missing during review)
guarantee the window can never become unclosable and a cancelled close truly cancels, timer
included.

**043 — I can delete a condensed artifact.** A new `condense:delete` channel (own group, not a
generic vault delete — the hash guard and trash/index-settle semantics are artifact-specific) takes
`{slug, expectedHash}`, pre-checks the hash, then routes through `VaultStore.delete()` for a
trash-backed, undoable removal and re-settles the index. The area's condensed tab shows a delete
control only when an artifact exists, behind a confirmation dialog that names the directives
section explicitly as the part no later run can reproduce (per 043-Q1: delete takes everything,
directives included). A stale hash reports a conflict instead of silently removing a changed file;
the operation never touches the LLM gateway.

**041 — The format gate is green on Windows.** Measurement at refine corrected the story's own
premise: the git index was already 100% LF (`core.autocrlf` only affected the working tree), so
the real fix was a repo-wide `.gitattributes` rule (`* text=auto eol=lf`, with explicit `-text`
pins for binaries) replacing three narrow `eol=lf` carve-outs that are now redundant, plus fixing
~13 genuinely misformatted files — not the ~1077-file rewrite the story was budgeted for. Running
last, its sweep also renormalized everything 040/042/043 had just written. `format:check` now
passes and joined `.claude/ai-scrum.md`'s `## Verify` list (041-Q3), so it gates every story from
S12 on. A real, unrelated bug in `scripts/handoff.mjs` was found and fixed along the way:
`spawnSync` with `shell: true` doesn't quote command lines on Windows, which silently broke
`npm run handoff` whenever Node is installed under a path containing spaces (e.g.
`C:\Program Files\...`) — this predates the story and was blocking one of its own acceptance
criteria.

## Findings & decisions

Aggregated from each story's `## Decisions (Sprint)`, the build agents' return summaries, and the
review passes.

- **The three deliberately-deferred-to-refine questions all resolved cleanly, no user escalation
  needed:** 040 dropped the condensation from candidates rather than following its `sources:` (Q1,
  user-decided) with the exclusion held in one named list (`EVIDENCE_EXCLUDED_TYPES`) so a future
  machine-written type is one entry, not a hunt through the answer path; 041-Q4 kept the vendored
  Gaston stylesheet prettier-ignored but git-normalized, matching its already-LF state; 042-Q1's
  bug cause (stale-forever cache + non-replaying per-instance event state, not any of the three
  originally-suspected candidates) was named before the fix was designed, so the fix removes the
  cause structurally rather than patching the symptom; 043-Q2 chose its own `condense:delete`
  channel over a generic vault delete, since a generic door would still need the hash guard and
  trash semantics wired per caller.
- **042 grew during build, not just at the plan.** Review caught that the close-warning dialog's
  "cancel" path had no way to actually cancel — the 5s dead-man timer would close the window anyway
  — so a `window:cancelClose` channel was added mid-build; not anticipated in refine's plan.
- **format:check's actual scope was smaller than budgeted**, and the story documented that
  correction transparently rather than silently overdelivering against the sprint.md estimate that
  called it "the largest piece" after 042 for the renormalization pass itself.
- **A pre-existing, out-of-scope bug (`scripts/handoff.mjs` quoting on Windows) was found and fixed
  in-story** because it blocked one of 041's own acceptance criteria (AC3, `npm run handoff` runs
  to completion) — recorded as a decision rather than silently expanding scope.
- **A pre-existing test flake was ruled out, not ignored.** During 043's build, `overview-flow.test.ts`
  timed out once and passed on isolated re-run and on the final full suite — consistent with the
  kind of cold-cache flakiness S10's review also recorded, not caused by this sprint's changes.
- **`tests/core/wiki/ask.test.ts` grew past the ~300-line soft guidance** (~450 lines) during 040;
  left as one cohesive block rather than split, documented as a conscious decision rather than an
  oversight.
- **Deliberately not touched, per sprint.md's own scope statement:** the condensed layer's module
  and project levels, CND-2, CND-17, the MCP outlook, and the German `MODULE-SCHEMA.md` migration —
  all remain in the roadmap's "Open / unprioritised" table, none were affected by this sprint's
  work.

## Blocked / open

Nothing is `BLOCKED` — every story reached a fully implemented, verified, and clean-agent-reviewed
state. Two are held short of `done` by the project's own P2 acceptance policy, not by a defect:

1. **042 — built, live acceptance pending.** The shell-level `RunStrip` was confirmed live via a
   Playwright `_electron` script (appears on run start with neutral tokens, disappears cleanly, no
   phantom bar), but navigation-persistence, stop-from-elsewhere, and the close-during-a-run dialog
   itself could not be raced reliably against the demo vault's sub-second, model-less run. Those
   paths are covered by deterministic automated tests instead of a live walkthrough. Recommend:
   configure a model, then run the story's `## Test Plan (manual acceptance)` before setting it to
   `done`.
2. **043 — built, live acceptance pending.** `npm run seed && npm run shot` produced a real
   screenshot of the delete confirmation dialog with correct copy, but the full 8-step manual test
   plan (confirm + undo via trash, index drop, conflict, no-model, German strings) was not driven
   interactively end-to-end. Recommend the same manual walkthrough before `done`.

Live acceptance (the manual test plan below) is pending the user for 042 and 043; nothing in this
review should be read as "user-accepted" for those two until that walkthrough happens. 040 and 041
have no comparable gap: 040 is a pure retrieval/backend guardrail with test coverage that
substitutes for a UI walkthrough (its condensed-tab string change was, however, confirmed live),
and 041 is exempt from P1/P2 as a tooling story with no user-facing surface — its gate result
(`npm run verify` and `npm run handoff` both green) is itself the acceptance evidence.

The standing backlog is unchanged by this sprint: M4, M6, M9, M10, M11 and M12 are all still built
with acceptance pending, and this sprint adds 042/043 to that same pending set rather than shrinking
it — a live walkthrough covering the whole backlog remains the next real unblock.
