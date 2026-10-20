---
sprint: S05
status: done
branch: sprint/S05
milestone: M4 — A finding can be acted on (plus story 020, M6)
---

# Sprint review S05 — A finding can be acted on

## Overview

**Goal.** Every maintenance finding names a real way out, not just "Passt so". A near-duplicate
can be discarded or marked as superseded, an orphaned page can be linked wherever the user says,
and every card is honest about what happened to the findings that got hidden along the way.
Riding along: the journal notices what was announced and never followed up on.

All five stories were built. Nothing is blocked.

| Story                                                     | Status | Commit                                                                             |
| --------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| 014 — The maintenance run reports findings, not results   | done   | `c2bb6b9` German maintenance UI says "Befund" instead of "Ergebnis"                |
| 015 — A near-duplicate can be resolved, not only compared | done   | `6555273` resolve a near-duplicate — discard or supersede, undoable                |
| 016 — An orphaned page can be linked where I say          | done   | `00da852` orphan page — I pick the target                                          |
| 017 — A finding says how it ends                          | done   | `17f63b0` a finding names its ways out, snooze/dismiss stay visible and reversible |
| 020 — Journal: announced and never followed up            | done   | `85609a8` journal loose ends — detect, surface, answer                             |

The preceding commit `0ecee2b` holds the clarification round's user decisions and all five
refined story plans.

## Implemented stories

**014 — findings, not results.** A pure vocabulary rename across 20 German string values in six
i18n bundles and 11 test assertions. No key was added or renamed; the English strings were left
untouched by decision. The maintenance screen, the dashboard tile, the wiki and settings surfaces
now all say "Befund".

**015 — resolve a near-duplicate.** Two new core actions beside the existing "compare both pages"
fix: `discard` (proposal, then write — repoint inbound links and remove the catalog line first,
delete the page last) and `supersede` (writes the `supersedes` relation into the newer page,
direction proposed from frontmatter `created`). Own IPC channels, one shared undo token through
the fix journal, and a reusable `DiscardPageAction` component. The near-duplicate check now drops
a pair as soon as either page names the other.

**016 — orphan page, I pick the target.** A new pure core module ranks the module's pages
(overview first, then word overlap, then the rest) and returns the exact target line. Two
channels: a read-only target list and a hash-guarded write, with main re-deriving the allowed
target set rather than trusting the renderer. A one-click "link from the module overview" covers
the common case; the searchable picker covers the rest. 015's discard action is mounted here, not
reimplemented.

**017 — a finding says how it ends.** The generalizing story. Gardener state learned a `snoozed`
map and now splits its output into open findings and hidden ones (dismissed or snoozed, with an
`until`). A new pure `exits.ts` derives the ways out from a finding's shape rather than hardcoding
them per check, so 020 could plug straight into it. Hidden findings stay visible behind a fourth
filter axis with a restore action, and the health card names how many findings it left out of the
score.

**020 — journal loose ends.** A forward-looking sentence whose day has passed with no later entry
speaking to it becomes a `loose-end` finding in the same maintenance surface. Detection is a
heuristic rule module over the derived journal days, optionally extended by a model pass that
drops any quote not verbatim in the file. Answering appends the user's own words into today's
entry with a back-reference wikilink, hash-guarded. Loose ends also surface as reminders and can
add at most one question to the journal interview.

## Findings & decisions

**User decisions from the clarification round** (20 in total, recorded per story under
`## Decisions (Sprint)` with the `(User)` marker). The load-bearing ones:

- Discarding a page removes its catalog line in the same action, and offers to repoint inbound
  links — so a resolution does not manufacture the next finding. The `raw/` source stays; it is
  the immutable ingest archive.
- The discard action belongs to **every** finding that names a page, with the same wording — one
  shared action across 015 and 016, not two.
- 017 gets a third state ("not now" / snooze) after all, reusing the reminders' snooze mechanism.
  Hidden findings live behind a filter value, `gardener:report` carries them, and "handled in the
  vault" triggers a full run rather than a second, narrower notion of what a check is.
- 020's loose ends live as a finding kind in the maintenance surface, reusing 017's framework
  instead of building a second one. The answer goes into today's entry with a back-reference, the
  state lives in its own place, there is no automatic expiry, and the app may quote the user's own
  wording back at them.

**Review findings fixed during the sprint** (all caught by the clean-agent review, none resolved
by weakening a test):

- 015: a file edited between the check run and opening the dialog could be discarded silently —
  findings now carry a check-time hash that is compared before any write. This guard was then
  carried through 016, 017 and 020.
- 020: the model pass was wired into `runGardener` but never into the app's real progress path, so
  it would never have run live. Plus an answered-id leak across report reads, and a hash guard no
  renderer caller ever armed. All fixed, re-reviewed against real code, second cycle PASS.
- 017: a model-audit rejection could silently delete a user's dismissal; hardened with a
  `consideredIds` field, backward compatible.

**Direction input for the next planning round:**

- **The repo's quality gate is not fully green, and was not before this sprint.**
  `tests/core/wiki/module.test.ts:150` asserts that `MODULE_SCHEMA_TEMPLATE` is
  character-for-character `docs/MODULE-SCHEMA.md`; the two have drifted. Verified red on a clean
  tree cut from `dev`. Every story in this sprint was therefore verified as "no new failures
  relative to its base commit" rather than "all green" — an honest but weaker gate. Deciding which
  side is the truth is a content decision and belongs in its own small story.
- **`npm run format:check` is red repo-wide on CRLF**, independent of any change. Same problem: it
  makes the gate unusable as a pass/fail signal and should be settled once.
- **Two files are over the ~300-line soft limit**: `src/main/ipc/gardener.ts` and
  `src/main/gardener-state.ts`. Both grew through this milestone's write paths and were reviewed
  as still single-responsibility, but the gardener IPC surface is now the obvious candidate for a
  split.
- **`sources:` frontmatter citations remain unbuilt** (016, by user decision). An orphan can only
  be resolved by a body-line link today. Worth its own story.
- **020's model path never ran against a real model.** Covered by fake-provider and
  "no model configured" tests only; the live smoke exercised the heuristic path.

## Blocked / open

No story is blocked. Nothing needs a user decision to continue.

**Open for the user, after the sprint:**

- **Live acceptance is pending for all five stories.** An autonomous sprint cannot perform manual
  UI acceptance. Every story was smoke-tested through the running Electron app via the Playwright
  `_electron` harness, and screenshots were inspected — but the end-to-end walk is
  [testplan.md](testplan.md), and it is the user's to run. Until then M4 and M6 are "built,
  acceptance pending", not accepted.
- **The two red quality gates above** (`module.test.ts` drift, repo-wide `format:check`) need a
  decision on which side is the truth. They predate this sprint; no story in S05 touched them.
