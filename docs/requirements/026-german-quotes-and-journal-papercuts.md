---
id: 026
title: German text closes its quotes, and three journal papercuts
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

A collection of small, visible defects that each individually never justified a story, and
together do. All of them are things I can see on screen; none of them changes what the app can
do.

### 1. German quotation marks are half-typeset

The German UI opens quotes with `„` and closes them with a straight `"` — 98 occurrences across
13 `de-*.ts` files in [src/renderer/i18n/](../../src/renderer/i18n/), and zero correctly closed
`„…“`. It is consistent, which is why nobody has noticed it as a defect rather than a style: the
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

1. ~~**`„…“` or `«…»` or straight `"…"` throughout?**~~ answered → Decisions (Sprint)
2. ~~**Should there be a guard** (lint rule, i18n test) that catches an unmatched `„` in a new
   string?~~ answered → Decisions (Sprint), delivered by D3
3. ~~**The loose-end link: drop it or fix it?**~~ answered → Decisions (Sprint), delivered by D4

## Decisions (Sprint)

- **(User)** Quote convention for the whole catalogue: German low-high quotes, opening
  U+201E (`„`) and closing U+201C (`“`) — i.e. `„…“`. Not the U+201D closer that this story's
  draft text used in places, not guillemets, not straight quotes. Every closer in the German
  catalogue becomes U+201C.
- **The guard is a test in the existing i18n test, not a lint rule** (Q2).
  `tests/renderer/i18n.test.ts` already reads both catalogue objects and the raw `i18n/*.ts`
  sources, so the check costs a few lines there, while a custom ESLint rule would mean a new
  plugin for one string pattern.
- **The loose-end row keeps its text but loses its link when the day is unresolvable** (Q3), with
  no extra explanation string: the AC explicitly allows "or the link is not offered", the detail
  cell already says `reminder.urgency.open` in that case, and a new "why" string would describe a
  state that cannot occur in a real vault.
- **Scope of the quote fix is `src/renderer/i18n/` only.** Guardrail 7 makes that the single
  source of German UI text; the `„` occurrences elsewhere in `src/` and `scripts/` are all inside
  German code comments, whose migration to English is separate planned work.
- **Inside `src/renderer/i18n/` the rewrite is applied uniformly, comments included.** It only
  touches text that follows a `„`, so a German comment in a `de-*.ts` file gets the same
  typography as the strings around it, at zero functional risk.
- **The convention is written down in two places:** the header comment of
  `src/renderer/i18n/index.ts` (where someone adding a string is already looking) and one clause
  in CLAUDE.md guardrail 7 (where the rule holds for everyone).
- **`HealthCard.tsx` is migrated together with the two journal dates.** It is the same one-line
  ternary with identical output; leaving the third instance behind would recreate exactly the
  drift AC 5 exists to remove.
- **The wording of the strings is not touched.** Only the closing glyph changes; anything else
  would break AC 6 ("only how it reads") and the `t()` key/placeholder contract.

## Plan

Measured state in the repo (not from the older note): 100 `„` across the 13 `de*.ts` files, of
which exactly 4 already close with U+201C (`de-projects.ts` 172/173/175, `de-wiki.ts` 188).
Every `„` has its closer on the **same line**, so a per-line rewrite is complete — there is no
multi-line string case. The 14 ASCII `"` that do not close a `„` all sit in comments and are not
matched by the pattern below.

1. **D1 — rewrite the German closers.** Per line `„([^„"“]*)"` → `„$1“` across
   `src/renderer/i18n/de*.ts`. The 4 correct pairs do not match, so the result is 100 `„` / 100
   `“` and no ASCII closer. Read the diff once: only glyphs may have changed — no
   `{placeholder}`, no key, no wording.
2. **D2 — clean `en-journal.ts`**: line 153 `'Due date for „{text}"'` → `“{text}”`, and line 52's
   section comment `„Day"` → `"Day"`. Nothing else in `en*.ts` contains U+201E.
3. **D3 — nail it down.** Convention into the header comment of `src/renderer/i18n/index.ts` and
   into CLAUDE.md guardrail 7; guard into `tests/renderer/i18n.test.ts`: (a) no `de` value
   contains an ASCII `"` or U+201D, and its U+201E count equals its U+201C count; (b) no `en`
   value and no raw `en*.ts` source contains U+201E. Runs after D1/D2 — before them it is red by
   design.
4. **D4 — LooseEndsTile.** When `announcedDay(path)` is `null`, render the title as plain,
   non-interactive text instead of the `sb-line-open` button; the `?d=${day ?? ''}` navigation
   disappears with it.
5. **D5 — one locale helper.** Replace the three inline `language === 'de' ? 'de-DE' : 'en-GB'`
   ternaries (`DayList.tsx:124`, `DayEntry.tsx:118`, `HealthCard.tsx:48`) with `locale(language)`
   from `src/renderer/lib/format.ts`. Same `Intl` options, hence identical output.

Order: D1 → D2 → D3 (the guard is the acceptance of the two before it); D4 and D5 are
independent. No core, no IPC, no shared type, no new key, no LLM path — renderer strings, one
tile branch, three one-line imports.

Coverage: AC 1 → D1, AC 2 → D2, AC 3 → D3, AC 4 → D4, AC 5 → D5. AC 6 ("nothing changes what a
screen can do") is not a deliverable of its own but a constraint on all five: each D's acceptance
forbids a wording, key or placeholder change, and the existing suites plus the live smoke run in
the test plan are the proof.

## Deliverables

**D1 — The German catalogue closes its quotes.** *(renderer strings only)*

- `src/renderer/i18n/de.ts`, `de-agents.ts`, `de-dashboard.ts`, `de-garden.ts`, `de-journal.ts`,
  `de-journal-calendar.ts`, `de-notes.ts`, `de-projects.ts`, `de-screens.ts`, `de-settings.ts`,
  `de-settings-models.ts`, `de-settings-runtime.ts`, `de-wiki.ts`.

Acceptance: the U+201E count over `src/renderer/i18n/de*.ts` is unchanged at 100 and the U+201C
count is 100 as well; no ASCII `"` closes a `„` any more; the existing `tests/renderer/i18n.test.ts`
(same key set, no duplicate keys, keys match the sources) stays green; the diff carries glyph
changes only — no key, no `{placeholder}`, no wording.

**D2 — No German quote in an English file.** *(renderer strings only)*

- `src/renderer/i18n/en-journal.ts` (string on line 153, section comment on line 52).

Acceptance: no `en*.ts` file in `src/renderer/i18n/` contains U+201E any more; the English string
reads `Due date for “{text}”`.

**D3 — The convention is written down and guarded.** *(docs + test)*

- `src/renderer/i18n/index.ts` — one sentence in the header comment.
- `CLAUDE.md` — one clause in guardrail 7.
- `tests/renderer/i18n.test.ts` — reuse the `SOURCES` / `keysBySource` pattern that already
  exists in this same file for the raw-source half of the check.

Acceptance: the new test goes red when a `„…"` (ASCII closer) is introduced into a `de` value and
when a `„` is introduced into an `en` file — demonstrated once with a local scratch edit that is
reverted again.

**D4 — A loose end links to a real day, or not at all.** *(renderer, one tile)*

- `src/renderer/components/tiles/LooseEndsTile.tsx` (the `day === null` branch around lines
  69-84).
- `tests/renderer/dashboard.test.tsx` — mirror the existing loose-ends tile cases.

Acceptance: with a resolvable day the row is still a button that navigates to `/journal?d=<iso>`;
for a reminder whose `path` carries no ISO date the title renders as text, with no `button` role
and no navigation. A `?d=` with an empty value can no longer be produced.

**D5 — Journal and health dates use `locale()`.** *(renderer, three lines)*

- `src/renderer/components/DayList.tsx`, `src/renderer/screens/journal/DayEntry.tsx`,
  `src/renderer/screens/garden/HealthCard.tsx` — import `locale` from `lib/format` (path per
  file) and drop the ternary.

Acceptance: no `'de-DE'` literal is left outside `src/renderer/lib/format.ts`
(`grep -rn "de-DE" src/renderer` finds only `format.ts`); the journal and garden tests stay green
with unchanged expected strings in both languages.

## Model Hints

- D1 → default. Mechanical, one pattern, covered by D3's guard and the existing key tests.
- D2 → default. Two lines.
- D3 → default. Extends a test file whose pattern already lives in it.
- D4 → default. One branch in one tile.
- D5 → default. Three one-line replacements with identical output.
- Review: → default. A cosmetic story with no new path, no write path and no cross-module
  behaviour; the one real risk (a mangled placeholder or changed wording) is exactly what reading
  the diff catches.

## Test Plan (manual acceptance)

P1/P2 apply — the visible change has to be seen in the running app.

1. `npm run verify`, then `npm run seed && npm run shot`.
2. Open the app with UI language **German** and look at screens with quoted text (Projects search
   empty state, Maintenance findings, Settings → Languages): every quote reads `„…“`, none ends
   on a straight `"`.
3. Switch the UI language to **English** and open the journal day-close dialog: the due-date
   label reads `Due date for “…”`, with no `„` anywhere.
4. Dashboard → switch on the **Loose ends** tile: a row still opens the journal on the announced
   day (URL `#/journal?d=YYYY-MM-DD`).
5. Journal → day list and a day entry: the dates read exactly as before in both languages
   (`10. Aug. 2026` / `10 Aug 2026`), likewise the timestamp on the Maintenance health card.

## Done
