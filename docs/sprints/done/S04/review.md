# Sprint S04 review — The journal becomes one thing

## Overview

**Goal.** Writing a day stops being a choice between "Day" and "Conversation": one field, a
stance next to it (listen / tips / analyse), and an interview button for when the field is
empty. The day list gets a "not finished" filter, and a month calendar sits above it showing
entries, mood and unfinished state.

| Story                                                     | Status | Commit    |
| --------------------------------------------------------- | ------ | --------- |
| 011 — one entry instead of day and conversation           | done   | `4cf651d` |
| 012 — the interview, for when I do not know what to write | done   | `3434c84` |
| 009 — filter for days that are not finished               | done   | `890118f` |
| 010 — a calendar on top of the days                       | done   | `173507f` |

All four stories done, none blocked. Every story went through a `story-review-hard` clean-agent
review; 011, 012 and 010 came back with real findings on the first pass and were fixed in the
same build run with regression tests before being marked done.

## Implemented stories

**011 — one entry instead of day and conversation.** The day file's `## Day`/`## Conversation`
split is replaced by a single chronological stream: the user's prose as plain Markdown, the
app's answers as blockquote turns interleaved directly under the paragraph they answer. Stance
(listen/tips/analyse) is chosen at write time and is not persisted — listen never calls a model,
tips/analyse respond only on request. Existing Day/Conversation files keep working unmigrated;
migrating a legacy day into the new stream is one explicit, hash-guarded, per-day action. Exposes
`appendEntry`/`appendAnswer` as the stable writing surface that 012 builds on.

**012 — the interview, for when I do not know what to write.** A focused overlay that asks a
fixed five-topic backbone (work, events, people, open, still-feeling) one question at a time,
with an optional single model follow-up per answer when a model is configured. Every answer is
written to the day file before the next question is asked, as a question/answer pair through
011's stream, attributed as the app's question and the user's own prose. Repeatable per day,
skippable per question, works fully without a model.

**009 — filter for days that are not finished.** A new `closed: YYYY-MM-DD` frontmatter field
(documented in VAULT-FORMAT.md), set by the day close-out or by a manual mark/reopen switch in
the day header. The day list gets a checkbox filter, a count, and a "nothing open" zero state;
the count also shows as a badge on the journal rail item, hidden at zero. Today and future days
are exempt until they are over.

**010 — a calendar on top of the days.** A collapsible month grid sits above the day list,
reusing the derived `journal:list` data client-side (no new IPC, no re-derivation). Cells show
an entry/mood dot plus 009's unfinished marker (two-marker budget), today and selected are
visually distinct, and the grid has its own keyboard navigation that coexists with the existing
day-list arrow-key switching. Clicking an empty day opens a write-now state; no file is created
by browsing.

## Findings & decisions

Aggregated from each story's `## Decisions (Sprint)` and `## Done`, and from the review cycles —
relevant input for future planning:

- **The journal's file format changed for the first time since M1 explicitly left it alone.**
  011 supersedes the "journal stays untouched" line in
  [systems/navigation.md](../../systems/navigation.md); only the journal's _inner_ structure
  changed, its place in the rail did not.
- **Migration is opt-in, not automatic.** Legacy `## Day`/`## Conversation` files render fine
  unmigrated; folding one into the new stream is a deliberate, hash-guarded, per-day action. The
  vault can carry both formats indefinitely — worth remembering before writing any tooling that
  assumes one shape for day bodies.
- **`closed` is now part of the vault format** (day frontmatter, `YYYY-MM-DD` or absent/`null`),
  documented in VAULT-FORMAT.md. 010 consumes it read-only; no other system reads it yet.
- **Stance (listen/tips/analyse) is deliberately not persisted anywhere** — it is chosen at the
  moment of writing/asking, per the user's own decision in the clarification round. A day's file
  carries no record of which stance produced which answer.
- **Review caught real defects in three of four stories**, all fixed before done:
  - 011: a duplicate-render bug in the new entry stream, and an edit-path bug where editing a
    heading-less day could silently drop an embedded app answer (`dayText()`/`rawDayText()`
    split fixed it).
  - 012: a double-submit race on fast Ctrl+Enter that could append the same Q/A pair twice; an
    interview closing message that claimed full day coverage even when everything was skipped;
    the "which engine is running" line trusting client-side routing config instead of the
    server-decided actual mode; missing `todosDue` context for model follow-ups.
  - 010: a wide-layout toolbar overflowing the 200–240px side column; a keydown-guard gap, an
    off-scale font size, a dead CSS rule, a specificity bug dropping the "today" accent when
    today was also selected, and the weekday header staying visible while collapsed.
- **Accepted-as-is, not fixed:** 012's interview overlay does not show the day's existing text as
  context (a stated Decision, but outside its deliverable's own acceptance list); 010 leaves two
  pre-existing inline locale ternaries in `DayList.tsx`/`DayEntry.tsx` unmigrated to the
  newly-exported `locale()` helper (out of scope); a repeated inherited icon-choice pattern
  (globe next to "no model needed" copy) already present elsewhere in the journal screens.
- **`tests/core/wiki/module.test.ts` remains red**, confirmed on every story's build as
  pre-existing and unrelated (predates S01, already tracked as a gap under M1 in the roadmap).

## Blocked / open

None. All four stories built, reviewed and verified; no open user decision remains from this
sprint.
