---
id: 040
title: An answer cites the source, never the condensation
status: done # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. The follow-up M12 decided but did not build: the rule exists as a user decision
(038-Q4 / concept O9, 2026-09-01), nothing in the code enforces it. Depends on
[[037-an-area-can-be-condensed-into-one-file]]. Concept: [[../concepts/condensed-layer]] (O9).
Named in [[../sprints/done/S10/review]] as the one M12 follow-up worth prioritising soon.

## Requirement

A condensed artifact is prose the app wrote about my own files. When I ask a question, it must
never come back as the evidence — the file it was written from must. Today it can: `build.ts`
classifies `areas/<slug>.condensed.md` as a normal indexed document of type `condensed`, and the
answer path never looks at a document's type, so a condensation competes for a citation slot
exactly like a page I typed myself.

That is a guardrail-3 problem, not a cosmetic one. Citing a condensation means quoting the app's
own summary back to me as if it were my note: the evidence chain becomes circular, and a sentence
the condensation got wrong is laundered into a "quote from the vault" with a file path under it.
The whole point of the citation is that I can go and read the line — and behind this line there is
only another machine-written line.

So the answer path has to know the difference. What I want to see cited is the day entry, the
note, the source page. The artifact records the paths it was written from (`sources:`), so the way
back to primary material exists in the file itself.

## Acceptance Criteria

- [x] Answering a question never returns a `condensed` document as an excerpt or as a citation —
      in the with-model path and in the no-model path alike.
- [x] The exclusion sits in retrieval, not in the prompt. A model's obedience is not the guard
      (same reason 037 enforces attribution deterministically).
- [x] Module-scoped, project-scoped and whole-vault questions all behave the same way.
- [x] A question whose only match is a condensed artifact produces the honest "no evidence found"
      answer instead of citing it.
- [x] The existing `types` filter in `retrieve()` is used or extended — no second, parallel
      filtering mechanism.
- [x] The rule survives a new document type: adding a machine-written type later does not require
      remembering to patch the answer path in two places.
- [x] Tests cover it twice, per the project's LLM rule: one with the fake provider, one with no
      model configured.
- [x] Filing an answer back as a wiki page cannot carry a condensed citation into the new page.
- [x] The artifact stays findable in full-text search and in `Ctrl+K` — this story removes it from
      evidence, not from the vault's reach.
- [x] The condensed tab says in one line that the artifact is not cited as evidence and that
      answers go to its sources; the string exists in `de` and `en`.

## Open Questions

- ~~Q1 — Drop the artifact from the candidates, or follow its `sources:` into them?~~
  answered → Decisions (Sprint)
- ~~Q2 — Does the exclusion apply to search too, or only to answers?~~
  answered → Decisions (Sprint)
- ~~Q3 — Only `condensed`, or every machine-written document (a module's `overview.md`)?~~
  answered → Decisions (Sprint)
- ~~Q4 — Should the condensed tab say that the artifact is not used as evidence?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding.

- **(User)** Q1 — **drop, do not follow.** The artifact leaves the candidate set and the ordinary
  full-text search finds the primary files on their own merits. No second retrieval path, and
  nothing is promoted that ranking had already set aside. Accepted cost: a synthesis words things
  differently than its sources, so a question only the condensation phrases well can answer
  "no evidence found" — which is the honest answer this project prefers over a laundered one.
- **(User)** Q2 — **answers only; the artifact stays findable in search.** The 038-Q4 decision was
  about evidence, and hiding a document the user asked the app to write would make it unreachable
  by the fastest route. It appears in `Ctrl+K` and never as a citation — see Q4 for why that
  asymmetry has to be stated.
- **(User)** Q3 — **`condensed` only, held in one named list** (e.g. `EVIDENCE_EXCLUDED_TYPES`), so
  a second type is one entry rather than a hunt through the answer path. A module's `overview.md`
  keeps behaving exactly as it does today: it has been citable since the wiki existed, and
  changing that silently would alter answers outside M13's scope. CND-35/36 handles it when that
  mechanism is retired.
- **(User)** Q4 — **one quiet line on the condensed tab** saying the artifact is not used as
  evidence and answers go to the sources. Because of Q2 the artifact is in search but never in a
  citation, and that asymmetry must read as deliberate rather than as a bug.

- Q3b — the named list lives in a new `src/core/wiki/evidence.ts`, not in `src/shared/types/vault.ts`:
  "is this citable as evidence" is an answer-path rule, and `src/shared/` holds the IPC contract and
  types, not policy. Both consumers of the rule (`ask.ts`, `file-back.ts`) already sit in
  `src/core/wiki/`.
- Q1b — the exclusion is applied by narrowing the `types` whitelist that `retrieve()` already passes
  to `index.search()` (not by a post-filter in the hit loop), so a condensed artifact never even
  consumes one of the `MAX_CANDIDATES` slots that a primary file should have had.
- Q1c — because `matchesTypes()` (`src/core/index/search.ts:77`) treats an **empty** `types` array as
  "no filter at all", a caller that explicitly asks for `types: ['condensed']` must make `retrieve()`
  return `[]` early; passing the emptied list on would silently disable every type filter.
- Q1d — narrowing needs a runtime list of all types, so `ALL_DOC_TYPES` is exported once from
  `src/shared/types/vault.ts` and `build.ts`'s private `DOC_TYPES` set derives from it — one list
  instead of two that drift (CLAUDE.md "reuse instead of copying").
- Q2b — `src/main/ipc/search.ts` and the `Ctrl+K` query stay untouched; the exclusion is imported
  only by the answer path, which is what keeps AC 9 true by construction rather than by a second flag.
- AC8b — `fileBack()` filters citations through the same list rather than trusting that retrieval
  already did: the citation array arrives from the renderer over IPC, so the write path validates it
  itself, as `validateCitations()` does for quotes.
- AC1b — no prompt text changes: the guard is retrieval-side (AC 2), and adding a "do not cite
  condensations" instruction would suggest the model is the guard.

## Plan

Retrieval-side only, one small new module, no new IPC channel and no new screen.

1. **One list of all types.** `src/shared/types/vault.ts`: export
   `ALL_DOC_TYPES: readonly DocType[]` next to `DocType` (line ~27). `src/core/index/build.ts:36`
   builds its private `DOC_TYPES` set from it instead of repeating the literals.
2. **The named exclusion.** New `src/core/wiki/evidence.ts`:
   `EVIDENCE_EXCLUDED_TYPES: readonly DocType[] = ['condensed']`,
   `isEvidenceExcluded(type: DocType): boolean`, and
   `evidenceTypesFor(requested?: readonly DocType[]): DocType[]` = `(requested ?? ALL_DOC_TYPES)`
   minus the excluded ones. Doc comment states why (guardrail 3, decision O9) and that a future
   machine-written type is one entry here.
3. **Retrieval uses it.** `src/core/wiki/ask.ts:59-64`: always pass
   `types: evidenceTypesFor(options.types)` to `index.search`, and return `[]` when that list is
   empty (Q1c). Nothing else in `retrieve()`/`askQuestion()` changes — the honest-empty branch
   (`ask.ts:175-186`), the no-model `passagesAnswer` fallback (`ask.ts:189-197`) and
   `sourcesFor()` all read from the already-filtered candidate set, so both answer paths and all
   three scopes inherit the rule from one place.
4. **Write-back guard.** `src/core/wiki/file-back.ts:104`: drop citations whose indexed
   `docType` is excluded, before `evidenceSection`/`sourcesOf`/`answeredFrom` see them
   (lookup via `deps.index.index().byPath`, as `sourcesFor()` does in `ask.ts:140`).
5. **One line in the UI.** `src/renderer/screens/notes/AreaCondensedTab.tsx` (after the meta line,
   ~line 135) gets a `<span className="gs-hint">{t('notes.condensed.notEvidence')}</span>`, mirroring
   `src/renderer/screens/modules/PageEdit.tsx:135`; key added to `de-notes.ts` / `en-notes.ts` under
   the existing `notes.condensed.*` block.
6. **Tests** in `tests/core/wiki/ask.test.ts` (fake provider via `tests/helpers/llm.ts`
   `gatewayWithReplies`, and `emptyGateway`), plus new `tests/core/wiki/evidence.test.ts` and a case
   in the `file-back` tests.

## Deliverables

**D1 — there is one runtime list of all document types** [x]
Files: `src/shared/types/vault.ts`, `src/core/index/build.ts`, `tests/core/index/build.test.ts`.
Accept: `ALL_DOC_TYPES` is exported and contains exactly the members of `DocType` (a test fails if a
type is added to the union without the list); `build.ts` no longer repeats the type literals and
frontmatter-type validation behaves exactly as before (regression test on `type: 'condensed'` and on
an unknown `type:` falling back to `docTypeFromPath`).

**D2 — `EVIDENCE_EXCLUDED_TYPES` exists as the one named list** [x]
Files: new `src/core/wiki/evidence.ts`, new `tests/core/wiki/evidence.test.ts`.
Accept: `EVIDENCE_EXCLUDED_TYPES` is `['condensed']`; `evidenceTypesFor(undefined)` returns every
`DocType` except `condensed`; `evidenceTypesFor(['page-ish list incl. condensed'])` returns the
requested list minus `condensed`; `evidenceTypesFor(['condensed'])` returns `[]`; adding a second
entry to the list needs no other change (test adds one locally and asserts the result). The doc
comment names guardrail 3 and concept O9.

**D3 — the answer path never retrieves a condensed artifact** [x]
Files: `src/core/wiki/ask.ts`, `tests/core/wiki/ask.test.ts`, `tests/core/wiki/fixtures.ts`
(fixture gains a `condensed` document).
Mirror: the existing `types` pass-through at `ask.ts:63` and the scope/project post-filters at
`ask.ts:72-81`.
Accept: for a fixture vault whose best textual match is `areas/x.condensed.md`,
(a) `retrieve()` returns no excerpt for it; (b) `askQuestion()` with the fake provider returns no
citation and no excerpt for it; (c) with `emptyGateway()` the no-model passages answer lists it
neither; (d) a question whose **only** match is the artifact returns the honest
`noEvidence` answer with `unsupported: true`, `usedLlm: false` and no gateway call;
(e) the same three assertions hold with `module`, with `scope`, with `project` and with none of them
set; (f) `retrieve(index, q, { types: ['condensed'] })` returns `[]` and does **not** fall through to
an unfiltered search; (g) a primary file that was previously cited for the same question is still
cited (no collateral loss of evidence); (h) `index.search({ text })` — the `Ctrl+K` path — still
returns the artifact, proving the exclusion did not leak into search.

**D4 — filing an answer back cannot carry a condensed citation** [x]
Files: `src/core/wiki/file-back.ts`, `tests/core/wiki/file-back.test.ts`.
Accept: given a `citations` array that contains a `condensed` path (as a stale or hand-built IPC
payload could), the created concept page's `## Belege` section, its `sources:` frontmatter and the
chronicle's `answered from:` all omit it while keeping the other citations; a call whose citations
are *only* condensed writes the page with no evidence section rather than throwing.

**D5 — the condensed tab says it is not cited as evidence** [x]
Files: `src/renderer/screens/notes/AreaCondensedTab.tsx`, `src/renderer/i18n/de-notes.ts`,
`src/renderer/i18n/en-notes.ts`, `tests/renderer/i18n.test.ts` (coverage only).
Mirror: `src/renderer/screens/modules/PageEdit.tsx:135` (bare `gs-hint` span in a screen).
Accept: with an artifact present the tab shows one quiet line stating the artifact is not used as
evidence and that answers cite its sources; the key exists in `de` and `en`, the German string uses
`„…“`, the English one contains no U+201E, the i18n coverage test is green, and no raw Tailwind
palette class or hex value is introduced.

**Coverage gate** — AC 1 → D3; AC 2 → D2 + D3; AC 3 → D3(e); AC 4 → D3(d); AC 5 → D3;
AC 6 → D1 + D2; AC 7 → D3(b)+(c); AC 8 → D4; AC 9 → D3(h); AC 10 → D5.

## Model Hints

- D3 → `deliverable-hard` — the change inverts an inclusion whitelist inside the one function every
  answer in the app retrieves through: getting the emptied-list case (Q1c) wrong silently disables
  the module/type filtering for every scoped question, and the regression is invisible in a green run.
- D1, D2, D4, D5 → default tier.
- Review: → `story-review-hard` — this story *is* guardrail 3's enforcement point, and the two
  failure modes it must rule out (a condensation still reaching a citation slot, or the filter
  quietly switching itself off) are both diff-level subtleties rather than missing features.

## Test Plan (manual acceptance)

The seeded demo vault already contains `areas/gesundheit.condensed.md`
(`scripts/seed/projects.mjs`), so all steps run against real content.

1. `npm run seed`, `npm run build`, start the app.
2. `Ctrl+K`, type `gesundheit`: the condensed artifact appears in the search results — it is still
   findable (AC 9). Open it to confirm the hit leads somewhere.
3. `Ctrl+K`, `Tab` into ask mode, and ask a question in the wording of a sentence from the
   artifact's *Stand* section. With no model configured the answer lists the found passages: none
   of them is `areas/gesundheit.condensed.md`; the day entry or `areas/gesundheit.md` is what shows.
4. Ask a question that only the artifact's own phrasing would match (a synthesis sentence that
   appears nowhere in the primary files): the answer is the honest "no evidence found", not a
   citation of the artifact.
5. Configure a model for `query-answer` and repeat steps 3 and 4: the citation list under the
   answer still contains no `.condensed.md` path.
6. Notes → area *Gesundheit* → tab *condensed*: one quiet line states that the artifact is not used
   as evidence and that answers cite its sources. Switch the UI language to English and back — the
   line is translated in both.
7. In a module chat, ask a question, file the answer back as a page, and open the created page: the
   evidence section and the page's `sources:` contain no `.condensed.md` path.

## Done

Retrieval now excludes `condensed` documents from every answer path (with-model and no-model,
all scopes) by narrowing the `types` whitelist passed to `index.search` via a new
`evidenceTypesFor()` in `src/core/wiki/evidence.ts`; `retrieve()` short-circuits to `[]` before
calling `index.search` when that list empties out, so the exclusion cannot silently become "no
filter". `file-back.ts` re-filters incoming citations through the same rule as a defensive
second check on the IPC boundary. The condensed artifact stays fully findable in full-text
search and Ctrl+K (untouched `src/main/ipc/search.ts`), and its tab now states in one line
(`de`/`en`) that it is not cited as evidence.

Commit message: `040: an answer cites the source, never the condensation`

Verification: `npm run build`, `npm test` (240 files / 3360 tests), `npm run lint`,
`npm run typecheck` all green. `npm run format:check` was not run as a gate — story 041 adds it
this sprint; a manual `prettier --check` on the touched files found only two pre-existing-style
lines (see Decisions).

Review: clean-agent `story-review-hard` review returned PASS with 5 non-blocking findings; 3 were
fixed in a follow-up cycle (below), 2 were accepted as documented decisions. One review-fix cycle
used (of 3 allowed).

Live smoke (P2): `npm run seed && npm run shot` ran clean (no console errors); the harness's own
`notes-condensed` deep-state screenshot loads `?a=gesundheit&tab=condensed` without error but its
viewport crop lands above the fold for this content, so a short ad-hoc Playwright `_electron`
check (same `launchApp`/`prepareUserData` harness, deleted after use, no file left in the repo)
opened the same route directly and read the DOM: the hint span's text is exactly
`t('notes.condensed.notEvidence')`'s German string, positioned right after the artifact content,
zero console errors. Confirms AC 10 live, not just via the i18n coverage test.

### Decisions

- **D1 exhaustiveness (review finding 1, fixed).** The original runtime test compared
  `ALL_DOC_TYPES` against a hand-copied literal array in the test file, which could not actually
  catch a `DocType` union member added without updating the list. Added a compile-time
  exhaustiveness check right after `ALL_DOC_TYPES` in `src/shared/types/vault.ts`
  (`Exclude<DocType, (typeof ALL_DOC_TYPES)[number]>` assigned to a `never`-typed const) — a
  missing member now fails `tsc`, not just an unrelated runtime assertion.
- **D2 tautology (review finding 2, fixed).** The original "list-driven design" test derived its
  own expectation from `EVIDENCE_EXCLUDED_TYPES`, so it could not distinguish a data-driven
  implementation from a hardcoded `type !== 'condensed'` check. Replaced with hand-written,
  hardcoded per-`DocType` assertions for `isEvidenceExcluded` and an explicit expected array for
  `evidenceTypesFor`.
- **Import consistency (review finding 5, fixed).** `src/core/wiki/evidence.ts` now imports
  `DocType`/`ALL_DOC_TYPES` via the `@shared/types` barrel, matching `ask.ts`/`build.ts`, instead
  of the deep `@shared/types/vault` path.
- **file-back fail-open on unindexed path (review finding 3, accepted, not fixed).** If a citation
  path is not yet in the index (`byPath` lookup misses), the guard currently keeps it rather than
  dropping it. This matches the plan's specified lookup mechanism exactly (Plan step 4: "lookup
  via `deps.index.index().byPath`, as `sourcesFor()` does in `ask.ts`") and is a narrow race
  (freshly written, not-yet-reindexed file) rather than a spec deviation; not fixed to avoid
  diverging from the agreed mechanism without a new decision round.
- **Two prettier-style lines in the diff (review finding 4, accepted, not fixed).** Two new hunks
  (`src/core/wiki/file-back.ts`, `tests/core/index/build.test.ts`) format one line differently
  than `prettier --printWidth 100` would. `format:check` is not part of this sprint's gate (story
  041 adds it) and the repo is red on it CRLF-wide already; left as-is rather than hand-formatting
  ahead of 041's fix.
- **Pre-existing, out-of-scope observation.** The live-smoke check above also showed the
  artifact's raw YAML frontmatter (`type: condensed title: ... sources: [...]`) rendered as
  literal text inside the markdown body, above the `## Stand` heading. This is a rendering
  issue in the existing `data.content`/`renderMarkdown` path (present before this story, not
  touched by any of D1–D5) — noted here for visibility, not fixed, since fixing it is unrelated
  to the citation-exclusion rule this story implements.
- **Test-file soft length limit.** `tests/core/wiki/ask.test.ts` grew to ~450 lines with the new
  "Beleg-Ausschluss" block, over the ~300-line soft guidance in CLAUDE.md. Left in place rather
  than split into a second file: the block is one cohesive concern (the evidence exclusion) most
  useful read alongside the rest of `ask.test.ts`'s scope/citation tests it mirrors; a future
  story is free to split it if the file keeps growing.
