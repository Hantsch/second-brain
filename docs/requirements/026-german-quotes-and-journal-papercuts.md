---
id: 026
title: German text closes its quotes, and three journal papercuts
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

A collection of small, visible defects that each individually never justified a story, and
together do. All of them are things I can see on screen; none of them changes what the app can
do.

### 1. German quotation marks are half-typeset

The German UI opens quotes with `„` and closes them with a straight `"` — 98 occurrences across
13 `de-*.ts` files in [src/renderer/i18n/](../../src/renderer/i18n/), and zero correctly closed
`„…”`. It is consistent, which is why nobody has noticed it as a defect rather than a style: the
app is typographically careful everywhere else (Gaston, IBM Plex, sentence case, no emoji), and
this is the one place the German text reads as machine-set. It was noted as "two strings" in
story 022's Done section — that count was wrong, it is the whole German catalogue.

One related, smaller thing: at least one English file (`en-journal.ts`) carries a German `„`,
which is straightforwardly wrong regardless of the typography decision.

### 2. A loose end can link to nowhere

`LooseEndsTile.tsx`'s journal link sends an empty `d=` query parameter when a loose end's day
cannot be resolved. Defensive-only in practice — a loose end's path is always a journal day file
— but it means a clickable link that goes to an undefined day exists in the code (documented as
a deliberate non-fix in 022).

### 3. Two dates are formatted by hand

Story 010 introduced the `locale()` helper in [src/renderer/lib/format.ts](../../src/renderer/lib/format.ts#L17)
and left two pre-existing inline `language === 'de' ? 'de-DE' : 'en-GB'` ternaries unmigrated
(`DayList.tsx`, `DayEntry.tsx`, noted under M3). Same output today; two places that will drift
the next time the helper learns something the ternary does not.

## Acceptance Criteria

- [ ] German text in the app closes its quotes the way German typography does — consistently,
      in every `de-*.ts` file, with no mixed pairs left.
- [ ] No English string file contains a German quotation mark.
- [ ] Whatever the quote convention ends up being, it is written down where the next person
      adding a German string will read it, so the catalogue does not drift back.
- [ ] Clicking a loose end on the dashboard always lands on a real journal day, or the link is
      not offered.
- [ ] The two journal date formats are produced by the same helper as every other date in the
      app, and read exactly as they do today in both languages.
- [ ] Nothing in this story changes what any screen can do — only how it reads.

## Open Questions

1. **`„…”` or `«…»` or straight `"…"` throughout?** German typography allows `„…”` and the
   guillemets; a technical UI sometimes deliberately stays with straight quotes. One decision
   for the whole catalogue.
2. **Should there be a guard** (lint rule, i18n test) that catches an unmatched `„` in a new
   string, or is writing the convention down enough?
3. **The loose-end link: drop it or fix it?** If a loose end's day genuinely cannot be resolved,
   is not offering the link the honest answer, or should the tile show why?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
