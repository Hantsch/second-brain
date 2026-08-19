# Sprint S03 review — Where I left off

## Overview

**Goal.** A project stops being read-only outside the status dropdown: notes and
waiting-on entries can be added in place, the detail view says where status and next
step came from and whether they're stale, and the project list surfaces the project I
last worked on and the ones I keep coming back to — one list, no duplicates.

| Story | Status | Commit |
| --- | --- | --- |
| 003 — Project notes and waiting-on, editable in place | done | `46c6d07` — add project note and waiting-on composers, editable in place |
| 004 — Where the project status and next step come from | done | `5251324` — project status/next-step provenance |
| 013 — Favourite projects (star) and an order that matches how I work | done | `51a8c35` — favourite projects — star, reordered list, tiles and pickers |

All three stories are done; nothing is blocked. One additional commit landed on the
branch ahead of the stories: `af519ef` — a repo-wide `.gitignore` fix (see Findings).

## Implemented stories

**003 — Project notes and waiting-on.** Two new hash-guarded write paths:
`projects:createNote`/`projects:removeNote` (dated block, byte-identical to what filing
a dump produces) and a waiting-on composer on top of the existing `projects:patch`. Both
are undoable via toast, both work without a model, and both are reachable from the
keyboard (`m`/`w`). The notes panel lost its show/hide toggle and is now always open.

**004 — Status/next-step provenance.** Two new optional frontmatter maps,
`status_set`/`next_step_set` (`{ at, by }`), stamped by the app wherever it writes
`status`/`next_step` (`projects:patch`, `projects:create`, filing). The project detail
now states, per value, whether it was set by the user, accepted from a suggestion, or
written by filing, with a date — or an honest "not recorded" fallback. A next step gets
a "possibly outdated" badge once the project has been touched since it was written
(reusing `lastTouch`, not a second recency notion).

**013 — Favourite projects.** `favorite: boolean` in project frontmatter, toggleable
from the list and the detail view. The list's default sort now reads: last-touched
project first, then favourites, then the rest — computed in one pass so a project never
appears twice, and a starred stale project is pulled into the current section while
keeping its stale marker visible. The list's work/private scope stacking is gone (a
documented, scoped exception — see Findings); dashboard tiles and both project pickers
put favourites first.

## Findings & decisions

**Critical, cross-sprint: `.gitignore` was excluding the vault core module from git.**
Found while refining story 003. The rule `vault/` (intended to keep the user's real
vault data out of the repo) had no anchor, so it matched *any* directory literally named
`vault` anywhere in the tree — including `src/core/vault/`, the module that owns paths,
layout, frontmatter, atomic writes, and the file watcher. That module has never been
tracked in git, on `main`, on `dev`, or on any prior sprint branch (verified: `git show
main:src/core/vault` / `git show dev:src/core/vault` both fail). Fixed on this branch in
commit `af519ef`: anchored the rule to `/vault/` and added the previously-untracked
module (18 files). This predates S03 and was never caused by any story in it — it needs
no further action here, but the fix should be merged and taken seriously: any fresh
clone of `main`/`dev` before this fix was missing the app's core module entirely.

**Real correctness bugs found in review and fixed before a story closed:**

- **003 (F2).** The renderer's read-side heading resolution for the notes section
  (`notesSectionOf`) disagreed with the write-side rule (`headingFor`): read preferred
  "Notizen if non-empty, else Notes", write used "whichever heading appears first in the
  file". On a file carrying both headings this could silently hide handwritten content
  or a freshly written note. Fixed to agree on "first occurrence in the document" on
  both sides.
- **004 (F1).** A cleared `next_step` (explicit `null` patch) could still show a stale
  `next_step_set` stamp next to the empty-state message — an invented author and a
  staleness claim for a value that no longer exists. Fixed: the provenance line and the
  stale badge now only render when the value is actually present.
- **013 (review, first pass).** `story-review-hard`'s first pass on 013 was a **FAIL**:
  the deliverable's own named acceptance tests for the `favorite` field's derivation and
  patch allowlist were never written, leaving a real regression path completely
  unguarded (confirmed correct by inspection, but untested). Fixed in one review-fix
  cycle; coverage added, full verification re-run clean.

**Decisions worth carrying into future sprints:**

- **Provenance fallback reuses `lastTouch`, not a new field** (004) — deliberate, to
  avoid reintroducing a second notion of recency after 013 removed the last one.
  `status_set`/`next_step_set` are app-owned: kept out of `WRITABLE` in
  `project-patch.ts` rather than added to `LOCKED`, so an attempt to write them from the
  renderer is rejected as an unknown field with the correct generic error.
- **One list, no work/private stacking, is scoped to the project list only** (013) — a
  deliberate, documented exception to the scope separation kept everywhere else (todo
  tiles, todo scoping). Written into `VAULT-FORMAT.md` and the relevant code comments so
  it doesn't read as a regression later.
- **The "last worked on" marker is computed over the filtered list** (013), so under a
  narrowed scope filter it marks the most recent project *within that scope*. Intentional
  and tested, but wasn't written down as an explicit Decision during refine — recorded
  here for visibility.
- **List-star writes have no error surface** (013), unlike the detail star (which carries
  `expectedHash` and can conflict). Matches a pre-existing pattern for other list-level
  patches on the same screen; not a regression, but worth remembering if that screen ever
  grows a general error-toast convention.

**Known, pre-existing limitations documented (not fixed) across the sprint** — each
already recorded with its reasoning in the story's own `## Done` section:

- `removeBlock()`'s undo match is an unanchored substring search (003, F1) — a same-day
  prefix collision between two note blocks could splice the wrong one. Pre-existing,
  shared with the dump-filing undo path; no test exercised it before or after this sprint.
- Undo writes for the new composer paths don't send `expectedHash` (003, F4) — an undo
  during a very short external-edit window overwrites rather than conflicts. Matches the
  existing `resolveWaiting` undo this story mirrors.
- The *filing* path (as opposed to the new note composer) still hardcodes the German
  section heading (003, F6) — pre-existing, out of this story's file list, and the
  condition that makes the F2 bug class reachable from the other direction. Worth its own
  story if English-language vaults become common (echoes a gap already on the roadmap
  from S01/S02).
- Two environment conditions surfaced across all three builds, not caused by any story:
  `npm run format:check` fails repo-wide (~190 files) from a CRLF/LF mismatch on this
  Windows checkout vs. Prettier's LF default; the default Vitest `forks` pool fails to
  start jsdom suites on this machine (worked around with `--pool=threads` throughout).
  Both are tooling/checkout issues, not code regressions.

## Blocked / open

Nothing is blocked. No open questions remain — all clarification-round answers were
recorded as `(User)` decisions in the story files before refine, and no story surfaced a
new one during build.

One item flagged for a **future** decision, not this sprint's: story 003's F6 above
means a project using `## Notes` (English heading) can still end up with a second,
German-headed `## Notizen` section if a dump is filed onto it — the note composer avoids
this, filing does not. No story in this sprint touches the general filing path.
