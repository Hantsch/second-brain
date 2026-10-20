---
id: 036
title: A day says which areas it belongs to
status: done # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). First of four — the area condensation cannot read
day entries until the link between a day and an area exists. Concept:
[[../concepts/condensed-layer]] (CND-32, CND-33, CND-34).

## Requirement

A day entry today records people, projects, mood, energy and tags — but never says which of my
areas it touched. So the day I spent thinking about "health" or "finances" is invisible from
the area itself: the Notes screen shows me the area's own notes and todos and nothing of what I
actually wrote that week.

When I close a day, the app should propose which areas the entry belongs to, the same way it
already proposes projects and people — as a proposal I confirm, not as something it writes
behind my back. Once confirmed, the area knows its days, and I can see from the area which days
spoke to it.

Search-based matching at read time was rejected in the concept interview: I want an explicit,
confirmed key in the day's frontmatter, not a guess re-made on every read.

## Acceptance Criteria

- [x] Closing a day proposes `areas` alongside the fields it proposes today, with only areas
      that actually exist in the vault offered — no invented slugs.
- [x] The proposal is visible in the close dialog and can be changed or emptied before I accept;
      nothing is written until I accept.
- [x] Accepting writes `areas: [<slug>]` into the day's frontmatter, hash-guarded, without
      touching any other frontmatter key or the body.
- [x] Rejecting or closing the dialog writes nothing.
- [x] Without a configured model, the close still works and the areas field is honestly empty
      rather than absent or broken.
- [x] An area can name its days: given a slug, the app can list the day entries carrying it.
- [x] Days written before this story (no `areas` key) stay valid and readable.
- [x] All new UI strings exist in `de` and `en`.

## Open Questions

- ~~Q1 — Should the close dialog also let me pick an area the model did not propose, or is this
  release accept/remove only? (Adding a picker is a different control than the existing chips.)~~
  answered → Decisions (Sprint)
- ~~Q2 — Where does "the days of this area" become visible in this story — inside the area on the
  Notes screen, or is that deliberately left to story 038's screen work?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — area picker beyond the model's proposal: add a picker, not accept/remove only.
  The close dialog needs an explicit control to add an area the model missed, not just chips to
  confirm or drop what it proposed.
- Q2 — no area-screen UI in 036: the story delivers "an area can name its days" as a core query
  only (`daysOfArea(slug)`), because 038 owns every area-screen surface (its own tab on the area
  in Notes) and AC 6 only asks that the app _can_ list the days, not that it shows them — the
  first real consumer is 037's area run (CND-34).
- No new IPC channel for `daysOfArea`: the consumer is the core-side area run in 037, and an
  unused channel would be dead contract surface.
- No heuristic area matching: without a model the proposed `areas` list is empty (AC 5), because
  guessing an area from prose is exactly the "guess re-made on every read" the concept rejected.
- The model may only return slugs that exist in the vault — `sanitizeFacts` filters against
  `index.areas()`, mirroring the existing project-slug filter (AC 1, no invented slugs).
- The areas row in the close panel is chips with a per-chip remove plus an add-picker fed by
  `areas:list`, not the all-or-nothing keep-checkbox the other fields use — the user's Q1 answer
  requires adding an area the model missed, and per-chip remove is what "changed or emptied" (AC 2)
  needs; the other fields' controls stay untouched.
- `areas` is written through the same `union()` merge as `people`/`projects`/`tags`: removing a
  chip removes it from _this_ write, it never deletes an area already in the frontmatter — the
  close path must not delete what the user wrote by hand.
- `JournalIndexView` gains `areas(): readonly Area[]`; the index service already exposes it, so no
  second area derivation is built for the journal.

## Plan

`areas` becomes the sixth field of the day close, everywhere the existing five already travel.
Nothing new is invented: the field rides the `projects` rails from prompt to frontmatter.

1. **Core proposal** — `JournalIndexView` gets `areas()`; `FactsInput`/`DayFacts` get `areas`;
   `journalClosePrompt` + `JOURNAL_CLOSE_SCHEMA` get the area list and an `areas` output;
   `sanitizeFacts` filters returned slugs against the known areas; `heuristicFacts` returns `[]`;
   `closeDay` carries the field into `JournalFrontmatterSuggestion`.
   (`src/core/journal/{types,facts,close}.ts`, `src/core/llm/prompts/journal-close.ts`)
2. **Contract + write** — `JournalFrontmatterFields` gets `areas: string[]`; `fieldPatch` adds
   `'areas'` to its merged-list keys, so the hash-guarded write, the undo snapshot and "empty list
   changes nothing" all come for free. (`src/shared/ipc.ts`, `src/main/ipc/journal-day.ts`)
3. **Close panel** — a dedicated areas row in `CloseProposal`: chips with remove plus an add-picker
   over `api.areas.list()`; the chosen set lives in `CloseProposalEdits`; strings in `de`/`en`.
   (`src/renderer/screens/journal/CloseProposal.tsx`, `src/renderer/lib/close-proposal.ts`,
   `src/renderer/i18n/{de,en}-journal.ts`)
4. **Reading back** — `toJournalDay` reads `areas` (missing key → `[]`), `JournalDay` gets the
   field, and `daysOfArea(docs, slug)` in `src/core/index/areas.ts` lists the day entries carrying
   a slug — mirrored from `mentions()` in `src/core/overview/status.ts:116`, but slug-exact, with
   no text-mention fallback (the concept rejected read-time matching).

Order: 1 → 2 → 4 can run before 3; 3 needs the contract from 2.

## Deliverables

- [x] **D1 — the close proposes areas (core).**
      `src/core/journal/types.ts` (`JournalIndexView.areas()`, `FactsInput`, `DayFacts`,
      `JournalFrontmatterSuggestion`), `src/core/journal/facts.ts`, `src/core/journal/close.ts`,
      `src/core/llm/prompts/journal-close.ts`, tests in `tests/core/journal/close.test.ts` (+ facts).
      Mirror the `projects` handling in each of those files, one to one.
      _Accepted when:_ with the fake gateway, `closeDay` returns `frontmatter.areas` containing only
      slugs that exist in the vault; a made-up slug from the model is dropped; with
      `createEmptyGateway()` the field is present and `[]`.
- [x] **D2 — accepting writes `areas` (contract + write path).**
      `src/shared/ipc.ts` (`JournalFrontmatterFields`), `src/main/ipc/journal-day.ts` (`fieldPatch`),
      the day-entry key list in `docs/VAULT-FORMAT.md` (optional key `areas`), tests in
      `tests/main/journal-ipc.test.ts`.
      _Accepted when:_ `journal:applyClose` with `areas: ['health']` writes `areas: [health]` into the
      day's frontmatter and changes no other key and not the body; an empty list writes no `areas` key;
      a stale `expectedHash` fails as `conflict`; an existing `areas` value survives the merge; a day
      file without an `areas` key stays readable before and after.
- [x] **D3 — the areas row in the close panel (renderer + i18n).**
      `src/renderer/screens/journal/CloseProposal.tsx`, `src/renderer/lib/close-proposal.ts`,
      `src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`, styles in
      `src/renderer/styles/gaston/components.css` only if an existing class does not fit; tests in
      `tests/renderer/close-proposal.test.ts`. Atoms only (`gs-*`), tokens only, sentence case.
      _Accepted when:_ the proposed areas show as removable chips, a picker over `api.areas.list()`
      adds an area the model did not propose, all chips can be removed to empty, discarding the panel
      writes nothing, and every new key exists in `de` and `en` (German with `„…“`).
- [x] **D4 — an area can name its days (query).**
      `src/shared/types/domain.ts` (`JournalDay.areas`), `src/core/index/journal.ts` (`toJournalDay`),
      `src/core/index/areas.ts` (`daysOfArea`), tests in `tests/core/index/areas.test.ts`.
      _Accepted when:_ `daysOfArea(docs, 'health')` returns the day entries whose frontmatter carries
      the slug, in date order; days without an `areas` key are simply not in the result and cause no
      error.

## Model Hints

- D1, D2, D3, D4 → default tier. Each is a single layer, mirrors an existing field's handling in
  the same files, and carries no cross-module subtlety.
- Review: → default. The write path is an added key in an existing, already-tested hash-guarded
  patch — not a new write mechanism.

## Test Plan (manual acceptance)

`npm run seed`, then start the app (`npm run dev`), with a model configured for `extract-tasks`.

1. Journal → open today, write a few sentences that clearly touch a seeded area (e.g. health),
   press **Close day**.
2. The close panel shows an **Areas** row with the proposed area as a chip. Remove the chip — it
   disappears. Use the picker to add a different existing area. Only areas from the vault are
   offered.
3. Discard the panel. Open the day file in an editor: no `areas` key, body unchanged.
4. Close again, keep one area, accept. The day file now has `areas: [<slug>]`; all other
   frontmatter keys and the body are untouched.
5. Switch the UI language to German and back: the areas row's label, picker and empty state are
   translated, German quotes are `„…“`.
6. Remove the model for `extract-tasks` in settings, close another day: the close still runs, the
   areas row is empty (no error, no dead state), accepting writes no `areas` key.

## Done

`areas` now rides the exact same rails as `projects` end to end: `JournalIndexView.areas()` →
the close prompt/schema → `sanitizeFacts` (model-proposed slugs filtered against the vault, no
heuristic guessing without a model) → `JournalFrontmatterSuggestion.areas` → a dedicated
chips-plus-picker row in the close panel (`CloseProposal.tsx`) → the hash-guarded, merged-list
`fieldPatch` write (`journal-day.ts`) → `toJournalDay` reading it back with a safe `[]` default
→ `daysOfArea(docs, slug)` as the new core query for 037's area run. No new IPC channel was
added for the query, per the sprint decision (037 consumes it core-side).

Decisions (implementation-detail, made while building, no user input needed):

- The picker in the close panel offers only areas from `api.areas.list()` not already chosen —
  read from the same source as everywhere else in the app, so there is nothing to invent here.
- `heuristicFacts` hardcodes `areas: []` with an inline comment; only the model path
  (`sanitizeFacts`) can ever populate `areas`, per the concept's rejection of read-time/guessed
  area matching.
- Fixup pass (mechanical, not a deliverable): several pre-existing object literals across
  `src/main/ipc/journal.ts`, `src/renderer/lib/mock-bridge.ts`, `src/renderer/lib/mock-fixtures.ts`
  and a handful of test fixtures construct `JournalDay`/`JournalFrontmatterFields` values; once
  `areas` became a required field on those types (D2/D4), `npm run typecheck` failed at ten call
  sites unrelated to any single D. Added `areas: []` to each, mirroring the adjacent
  `people`/`projects`/`tags` fields — no logic changed, no assertions weakened.

Commit message:

```
036: a day says which areas it belongs to
```

Verification:

- `npm run build` — green.
- `npm test` — 221 files / 3173 tests, all green.
- `npm run lint` — clean.
- `npm run typecheck` — clean (after the fixup pass above).
- Clean-agent code review (default tier): PASS. All 8 acceptance criteria PASS with file:line
  evidence; no weakened tests, no scope creep, no guardrail violations found. One neutral note:
  `JournalIndexView.areas()` has no caller yet in this diff (it exists on `IndexService` already
  and is exposed on the interface per the Decisions section, forward-looking for 037/038).
- Live smoke (P2): `npm run seed && npm run shot` — no console errors. Screenshot
  `.screenshots/15-journal-close-proposal.png` shows the new "Bereiche" row in the close panel
  in the no-model demo vault: empty state "Kein Bereich ausgewählt." plus the
  "Bereich hinzufügen …" picker, sentence case, German quotes correct — confirms AC 5 (honest
  empty state without a model) and the row's placement/visibility (AC 1–2) visually. Chip-add/
  remove interaction and the accept-write path are covered by the automated renderer/IPC tests,
  not by a second manual run, since no model is configured in the demo vault to produce a
  proposed chip to interact with live.
- No open points, no unfixed findings.
