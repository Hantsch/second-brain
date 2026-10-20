# Sprint S10 — Review

## Overview

**Goal:** the condensed layer gets its first real instance at the area level — a day names the
areas it touched, an area can be condensed into one machine-written file with _state_, _patterns_
and _open_, that file is only ever written after the diff has been read (including what it
deleted), and maintenance says when it has gone stale.

| Story                                                        | Status | Commit                                                        |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------- |
| 036 — A day says which areas it belongs to                   | done   | `036: a day says which areas it belongs to`                   |
| 037 — An area can be condensed into one file                 | done   | `037: an area can be condensed into one file`                 |
| 038 — I see what a condensation changes before it is written | done   | `038: I see what a condensation changes before it is written` |
| 039 — Maintenance says a condensation is due                 | done   | `039: maintenance says a condensation is due`                 |

All four stories are `done`, built in order on `sprint/10` (branched from `dev`), one commit per
story, `npm run verify` green after every story.

## Implemented stories

**036 — A day says which areas it belongs to.** The day-close proposal now includes an `areas`
row (chips with remove, plus a picker to add an area the model did not propose), mirroring the
existing `projects` field. Accepting writes `areas: string[]` into the day's frontmatter,
hash-guarded and merged so a hand-written area is never dropped. Without a model, the field is
honestly empty. The index gained `daysOfArea(slug)` so an area can name its days — but no new
screen surfaces that list; it deliberately stays a capability for 037/038 to consume.

**037 — An area can be condensed into one file.** A new `src/core/condense/` module reads an
area's notes/todos plus its day entries from the last ~90 days and produces a proposal for a new
`condensed` document (`areas/<slug>.condensed.md`, with a documented dotted-filename exception in
VAULT-FORMAT.md). Sections are _state_, _patterns_, _open_, each ending in the source paths it was
written from; attribution is enforced deterministically (a section's sources must be a subset of
what was actually read), not left to the model's obedience. The task kind `condense-area` is
sensitive and independently routable; with no model assigned the run does not start and says so.
No screen — the run only returns a proposal, never writes on its own.

**038 — I see what a condensation changes before it is written.** Inside an area (its own tab
next to notes and todos) the condensation can be triggered, and the result is shown as a
whole-artifact diff — a pure LCS line diff built in core, removals as visible as additions.
Accepting is hash-guarded, leaves an undo copy in `.secondbrain/trash/` (new `VaultStore.snapshot`)
and a stale hash discards the proposal as a conflict rather than merging. Rejecting requires a
reason, which is appended to the artifact's directives section and never rewritten by a later run.
Without a model configured for `condense-area`, the area states that plainly with a link to
settings; an existing artifact stays readable regardless.

**039 — Maintenance says a condensation is due.** A new deterministic gardener check,
`condensation-due`, compares each input's recorded content hash (now written by 037's artifact
writer alongside the existing `sources:` path list) against its current hash to decide whether a
condensation has gone stale, or reports an area with material and no artifact at all. Severity is
informational, model-free, participates correctly in scoped runs and stop/continue, and a
condensed artifact is structurally exempt from the orphan/near-duplicate checks and not counted as
a module page. The finding's only exit opens the area — it writes nothing.

## Findings & decisions

Aggregated from each story's `## Decisions (Sprint)`, the build agents' return summaries, and the
review passes.

- **Architectural calls settled in the clarification round (all user decisions, recorded per
  story):** artifact `type:` is a new `DocType` (`condensed`), not a reuse of `overview`; file name
  is `areas/<slug>.condensed.md` with an explicit dotted-file exception added to
  VAULT-FORMAT.md; soft size cap is ~2000 words/~12k characters per artifact; input bounds are the
  last ~90 days of tagged day entries plus the area's full notes/todos; a human hand-edit is
  flagged in the diff rather than silently overwritten; the condensation diff is whole-artifact,
  not per-section; the trigger lives in its own tab on the area; a condensed artifact is never
  cited as evidence in answers (always the primary source); the day-close dialog gets a picker to
  add an area the model did not propose, not accept/remove only.
- **Cross-story contract, not anticipated at refine time:** 037's real `CondenseAreaProposal`
  shape differed from 038's planned `CondenseProposal` — adapted in the `condense:run` IPC
  handler rather than in 037's `run.ts`, so the run itself stayed the single source of truth.
- **039's hash contract retrofits 037's writer.** `source_hashes:` is a new frontmatter map added
  next to the existing `sources:` path list rather than replacing it, so a missing hash reads
  honestly as "changed" instead of assuming freshness — this is the one place a later story
  reached back into an earlier, already-committed story's code.
- **Review passes caught real bugs before they shipped**, not just style: 037's area-notes were
  being read as a 240-character preview while the artifact's `sources:` claimed the whole file
  (fixed to read `verbatim: true`); a missing i18n key showed the raw key
  `settings.fallback.condense-area` in the German settings row (fixed, caught only by driving the
  real app); 038's first `story-review-hard` pass found nine issues on the write path (an orphaned
  trash entry on conflict, a reject-path hash-guard race, reject silently rewriting section
  headings via a language-forced recompose, no server-side reason validation, path-vs-slug trust,
  double-read hashes, a quote-style bug, a missing a11y label, a stale dialog and an inaccurate
  doc comment) — all fixed in one cycle, verified individually in a second pass.
- **Deliberate scope boundaries, not gaps:** deleting a condensed artifact from the UI and
  enforcing that a `condensed` document is never offered as evidence in `query-answer` were both
  explicitly answered as out-of-scope by the user during clarification. Neither has an acceptance
  criterion in any of the four stories, so neither was built. Carried into "Open / unprioritised"
  below per the user's explicit instruction on 038-Q3.
- **039 documented, non-blocking gaps found during its own review:** an almost-empty area can
  produce a dead-end "missing artifact" finding (no material worth condensing, but the check still
  fires); the generalized area route in `targets.ts` also changed the inbox's "filed into" link
  destination as a side effect (verified as a correct generalization, not a regression, but worth
  a second look next time that screen is touched).
- **A pre-existing, unrelated flakiness was ruled out, not ignored.** Mid-story-037, ~35 timeouts
  appeared in `tests/main/**` under a cold transform cache; confirmed via `git stash` comparison
  that this reproduces on `dev` before any of this sprint's changes and is not caused by the
  sprint. Final verification runs were green.
- **format:check** was not run as part of any story's "done" gate — the pre-existing
  never-green-on-Windows carve-out (CRLF vs. prettier's LF) is tracked in the roadmap's
  "Open / unprioritised" table and deliberately not part of this sprint (per `sprint.md`'s Notes).

## Blocked / open

Nothing is blocked. All four stories reached `done`. Two items were deliberately deferred by user
decision during clarification and are not gaps in this sprint's stories — they are recorded in the
roadmap's "Open / unprioritised" table for a future sprint to pick up:

1. **Delete a condensed artifact from the UI** — out of scope per 038-Q3; the concept says it is
   regenerable without loss except for the directives section, so deletion is a convenience, not a
   correctness requirement.
2. **Enforcing that `query-answer` never cites a `condensed` document as evidence** — out of scope
   per 038-Q4/concept O9; no story's acceptance criteria touch `query-answer`, so nothing in the
   answer path currently checks a document's `type`. This is the one item worth prioritising soon:
   until it is built, a `condensed` document could in principle be surfaced as evidence exactly as
   any other page, which is the guardrail-3 gap the user's answer was meant to close.

Live acceptance (the manual test plan below) is pending the user; nothing in this review should be
read as "user-accepted" until that walkthrough happens.
