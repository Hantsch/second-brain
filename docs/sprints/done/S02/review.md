# Sprint review — S02: notes get a home

Branch: `sprint/S02` · Milestone: M1 — Navigation: places, actions, systems

## Overview

**Goal.** `areas/` stops being a write path with no read path. A rail entry Notes shows the
areas and their entries, lets a thought be written without picking a target first, and the old
inbox becomes the "unfiled" filter on it — filing turns from a duty into an offer. At the end
the rail stands at the seven entries of [the concept](../../systems/navigation.md), and M1 is
complete.

**Goal reached**, with the same honest caveat as S01: both stories are built, reviewed and
live-smoke-tested, but neither has had manual live acceptance by the user yet.

| Story | Status | Commit |
| ----- | ------ | ------ |
| 005 — Notes — a home for the areas | done | `b4a8077` notes — a home for the areas |
| 006 — Inbox becomes the "unfiled" filter in Notes | done | `0c16419` inbox becomes the unfiled filter in notes |

**The rail is down to its final seven entries**: 1 Dashboard · 2 Projects · 3 Journal ·
4 Knowledge · 5 Notes · 6 Maintenance · 7 Settings — contiguous digits, system entries visually
separated at the foot. M1's target picture is now fully built.

## Implemented stories

**005 — Notes — a home for the areas.** A new core read path derives `Area`/`AreaNote` from
`areas/*.md` (tolerant `Notizen`/`Notes` heading resolution, mirroring the journal's pattern),
exposed through five hash-guarded IPC channels (`areas:list|notes|createNote|create|moveNote`).
The new **Notes** screen (rail hotkey, at this point still provisional — see 006) shows areas as
collapsible sections, newest entry first, with an always-visible composer that needs no target
(writes into a default area `areas/notes.md`, created on first use) and a move/create-area flow
with hash-guarded two-step writes that roll back on a failed target. Area todos are scoped
(`Todo.area`) and count on Today exactly like project todos. Search and citations resolve
`areas/*` hits into `#/notes?a=<slug>`.

**006 — Inbox becomes the "unfiled" filter in Notes.** Depended on 005. Renumbered the rail to
its final seven-entry shape and moved the entire filing workspace — unchanged behaviourally —
onto Notes as a `?filter=unfiled` view (`UnfiledWorkspace`, formerly `InboxScreen`): two columns,
keyboard map, ten-second undo and path-bound selection all survived the move, pinned by the
existing test suite carried over rather than rewritten. `#/inbox` and every in-app link
(tiles, capture panel, palette, gardener) redirect to the filter with their query string intact.
The core filing write path stopped deleting a filed dump into the trash; it now stays in place
as a receipt (`status: filed`, `filed_into`, `filed_at`), surfaced as a collapsed "filed" trail
with a link to the target — answering "where did that thought go?" instead of hiding it. Today
gained an "N unfiled" strip that disappears at zero rather than showing a permanent zero.

## Findings & decisions

**The clarification round paid for itself twice.** Six open questions across both stories
(default-area landing, grouped-vs-flat areas, no area detail view, the notes-vs-journal
sentence, filed dumps staying visible as receipts, and the filter switching layout rather than
sharing one) were all bundled and answered before refine started. None came back as a
mid-build blocker — the one open decision either story raised on its own (`006`'s rail
renumbering, `005`'s deferring that renumber to `006`) was resolved by the agents themselves
against the roadmap's gap note, not escalated.

**A real correctness bug was caught by the hard-tier review, not by any test.** Filing a dump
with an emptied-out edited proposal text used to (pre-story) silently delete the dump into the
trash with nothing written; story 006's "keep in place" model turned that same input into a
**durable, user-visible false claim** — a receipt saying "filed into `<target>`" while the
target file was never touched. Fixed at the root: `applyProposal` now rejects with an error
instead of stamping a dump as `filed` when nothing was actually written. This is the same class
of lesson S01 named — the seam between a new surface and an existing write path is exactly where
green tests can hide a defect.

**005 found and fixed a repo-wide infrastructure bug as a side effect.** `.gitignore`'s bare
`vault/` pattern had silently excluded `tests/core/vault/` and `tests/fixtures/vault/` (25
files, including area fixtures this sprint's own tests depend on) from git on every machine,
predating this sprint. Fixed with narrow negations plus a targeted `.gitattributes` (`eol=lf`)
for both paths, after discovering Windows `core.autocrlf=true` had reintroduced CRLF that broke
~16 unrelated suites for a reason with nothing to do with the code under test.

**Background-orchestration continuity gap.** Story 006's build was interrupted mid-flight
(the orchestrating session lost track of its own background build agent overnight, for reasons
outside this sprint's code — a concurrent, unrelated user session had also committed directly
onto this branch in the meantime). No work was lost: every deliverable the agent had already
produced was sitting correctly in the working tree, verifiable independently of the dead agent's
state, and a fresh agent finished the remaining review/verify/wrap-up steps from that point.
Worth naming as a process observation for future long-running sprints, not a code defect.

**Decisions worth carrying forward** (full lists live in each story's `## Decisions (Sprint)`):

- A note with no chosen target lands in a default area, not the inbox — dumping costs nothing
  and creates no follow-up chore.
- Areas are grouped and named on screen, not a flat stream — the vault's own structure stays
  visible.
- "Filed" is a receipt, not a deletion: the dump keeps its body and gains `filed_into`/
  `filed_at`, findable and undoable exactly like every other status change.
- The unfiled filter switches Notes into the existing two-column workspace rather than forcing
  one shared layout — the workspace's mechanics (key listener, anchor, undo timer) survive the
  move only because of a fixed-position early return, not a merged render tree.
- Vault names stay in the code (`Area`, `areas:*`, `screens/inbox/`, `inbox.*`) — only UI labels
  changed. Renaming stops at the UI, consistent with S01's `agents.*` precedent.
- The rail's final numbering (1–7, system group in the foot) closes the M1 gap S01 left open.

## Built, live acceptance pending

Both stories are user-facing and both ran the live smoke (`npm run seed && npm run shot`) green
— no console errors, rail renumber and redirects confirmed end to end. That is **not** the same
as manual acceptance. The following need the user to drive them by hand before M1 can be called
accepted — see [testplan.md](testplan.md):

- 005 — writing a note without a target, moving a note between areas, creating an area, the
  per-area empty state, external-edit pickup, the conflict path, and search/citation into an
  area note.
- 006 — the unfiled filter end to end (keyboard, undo, "leave it"), the filed trail after filing
  a dump, the Today strip appearing/disappearing, and the rail's final seven-entry numbering.

## Acceptance gaps (P1)

- **`#/inbox` cannot be entered by hand**, same shape as S01's redirect gap: the window is
  frameless, there is no address field, and 006 retargets every in-app link to the filter. The
  redirect rests on its unit test (asserts the query string survives), which is the load-bearing
  evidence here.
- **Every LLM path is only testable in its "no model configured" shape**, since the demo vault
  ships `providers: []` — the heuristic proposal, not the full routed path.

Neither is a defect; both are limits of what manual UI acceptance can reach against the demo
vault.

## Blocked / open

No story was blocked.

**1. `tests/core/wiki/module.test.ts` is red, and was red before this sprint** (same finding as
S01's item 1 — `MODULE_SCHEMA_TEMPLATE` vs. `docs/MODULE-SCHEMA.md` drift from the English
migration in commit `e8959d1`). Confirmed pre-existing and unrelated to both stories; left
untouched. Carried over from S01 without an owner yet.

**2. `capture-proposal.ts` hardcodes the German filing section name** (`SECTION_NOTES =
'Notizen'`) regardless of the vault's document language. 005 built a tolerant heading match for
its own areas-specific write path (`areaSectionIn`) but deliberately did not extend the general
filing path to use it, to keep the story's diff scoped. For a `documents: 'en'` vault this would
create a duplicate "## Notizen" section next to an existing "## Notes" one. Worth its own story
if English-language vaults become common.

**3. Two cosmetic mismatches surfaced by 006's review, left as-is on purpose:** the receipt
toggle in `FiledTrail` reuses the `project.notes.show/hide` i18n key ("Notizen anzeigen") on a
section titled "Abgelegt", which reads as if it toggled notes; and the Notes screen shows two
different counts side by side ("N nicht abgelegt" from `inboxCount`, vs. a "kept" dump still
counted in the workspace's own row list) — both are emergent from decisions the sprint made
deliberately (single-truth `inboxCount` for the strip; `kept` stays in the working list), not
spec breaches, but a user will notice the second one.

**4. No cap on the "filed" receipt trail.** `FiledTrail` renders every `filed` dump ever
produced; nothing in the story asked for pagination or archiving. Fine at demo-vault scale,
worth a follow-up thought once a vault has a year of history.

**5. `format:check` is red on files this sprint did not touch** (pre-existing CRLF drift on
~79 files, same class of noise S01's item 5 named). No new content-level offenders were added by
either story; files this sprint's diffs actually touch are clean.
