---
id: 069
title: A day shows how its own loose ends were answered
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

From the user's own feedback (2026-09-07), describing a confusing moment: a correctly shown
follow-up (a loose end from an earlier day — "we're meeting Michi today") was answered, but the
answer landed on today's day, not on the day the meeting itself belonged to. Opening that earlier
day still shows nothing about it having been dealt with.

Investigated the same day: this is by design, not a bug — `answerLooseEnd()`
(`src/core/journal/loose-end-answer.ts:40-52`) always writes the answer into **today's** entry
with a `[[<announcingDay>]]` backlink, a decision recorded under M6
(`requirements/done/020-journal-loose-ends.md`). What is missing is the other direction: the
announcing day itself has no view of what happened to the loose end it raised — the resolution is
findable only if you already know which later day answered it.

## Requirement

Opening a day that raised a loose end should show, on that day, whether and how it was resolved —
without needing to already know which later day holds the answer. The answer keeps living in the
entry that actually wrote it (M6's decision is unchanged); this story only makes that resolution
visible from the day it belongs to, as a derived, read-only pointer.

## Acceptance Criteria

- [ ] **AC1** — A day that raised a loose end which has since been answered shows, next to that
      loose end, that it was answered and links to the day/entry that answered it.
- [ ] **AC2** — This indicator is derived at read time, not written into the announcing day's file —
      no write path in this story touches the original day's content (consistent with "the files
      are the truth" and no silent overwrite).
- [ ] **AC3** — A loose end raised on a day that has not yet been answered shows as open on that
      day, consistent with how it already appears on the maintenance/loose-ends surface today.

## Open Questions

- Where does the indicator sit — inline next to the day's own loose-end row, a small banner on the
  day view, or both? Needs a concrete placement decision, not a default guess.
- The user's feedback also named a second, separate want: a proactive reminder at the moment a
  forward-looking sentence is written (before its day arrives), rather than only after the day has
  passed. That is a materially different mechanism (write-time detection vs. read-time visibility)
  from what this story covers — tracked as its own story, [[070-a-future-mention-becomes-visible-before-its-day-arrives]],
  not folded into this one.
