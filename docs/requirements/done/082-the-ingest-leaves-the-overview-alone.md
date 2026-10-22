---
id: 082
title: The ingest leaves the overview alone
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Once [[081]] makes `wiki/overview.md` the module's condensed artifact, the ingest must stop
appending to it (CND-35): two writers with two ideas of what the file is would undo each other.
Today `ingestSource()` calls `updateOverview()` when the model reports an `overviewChange`, and
`linkIntoOverview()` adds source links (`src/core/wiki/ingest.ts`).

Real vaults already carry bullet-list overviews. They must stay readable and be replaced by the
first condensation without losing anything (CND-36) — the trash copy is the safety net, the diff is
where the user sees what goes.

The module schema the app writes into every new module (`MODULE_SCHEMA_TEMPLATE`, mirrored in
`docs/MODULE-SCHEMA.md`) still tells any LLM to update `overview.md` on ingest. That instruction
has to change too, because the vault agent ([[084]]) reads it.

## Acceptance Criteria

- [x] **AC1** — After a digestion, `wiki/overview.md` of the target module is byte-identical to
      before.
- [x] **AC2** — The ingest prompt and reply schema no longer contain `overviewChange`; a reply that
      still carries it is accepted and the field ignored.
- [x] **AC3** — A module with a bullet-list `overview.md` in the old format shows it in the module
      view and finds it through search as before.
- [x] **AC4** — The first condensation of such a module shows the old bullets as removals in the
      diff; after accepting, `.secondbrain/trash/` holds the old file byte-identical.
- [x] **AC5** — The module schema template and its `docs/` mirror describe `overview.md` as the
      condensed artifact that changes only through a confirmed condensation, not through an
      ingest.
- [x] **AC6** — An existing module's `AGENTS.md` is not rewritten by this change.

## Open Questions

~~- **Q1 — Source links in the overview.** `linkIntoOverview()` adds a link per digested source.
Drop it, move those links into `wiki/index.md`, or keep it as the one ingest write the artifact
tolerates?~~ answered → Decisions (Sprint)
~~- **Q2 — Migration** (condensed-layer O10): is "the first condensation shows the old bullets as
removals" enough, or does the user want a one-off migration?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Source links in the overview: drop `linkIntoOverview()` from the overview; the per-source links move into `wiki/index.md`
- **(User)** Migration: no migration code; the first condensation shows the old bullets as removals in the diff
- "Links move into `wiki/index.md`" needs no new writer — `upsertEntries` already writes `- [[slug]] — summary` for the source page and every applied page — but `orphanCheck` ignores the catalog, so a page listed in its module's `index.md` now counts as linked; otherwise every digestion yields orphan findings and 081's first condensation orphans every page the old `## Seiten` list held.
- The orphan fix's fallback target (the overview's "Seiten" section, `fix-orphans.ts`, `orphan-targets.ts`, `OrphanCard.tsx`) stays unchanged in this story: it is a user-confirmed gardener write, not an ingest (CND-35/AC1 do not cover it), and after D3 it only fires for pages missing from the catalog; retargeting it to `index.md` is a follow-up for the sprint review.
- `linkIntoOverview()` is deleted, `overviewEntryLine()` stays in `overview-links.ts`, because the orphan fix preview still uses it.
- `overviewUpdated` leaves `WikiIngestResult`, because no production code reads it and a field that is always `false` would lie about the contract.
- `IngestReply` parsing ignores an `overviewChange` key silently (no warning), because AC2 asks for acceptance and a log line would add noise for every older model reply.
- A module `overview.md` **without `condensed_at`** (legacy bullet list or the creation stub) is replaced whole by its first condensation: neither its preamble nor any foreign `##` section is carried over, only unknown frontmatter keys and a directives section if one exists — because `src/core/condense/artifact.ts` carries preamble and foreign sections verbatim, which would keep `## Seiten`-style bullets forever and contradict the user's "old bullets as removals" decision.
- That exception applies to the module level only; area and project artifacts keep their lossless carry-through, because their files were always written by a condensation and hand-added sections there are the user's.
- The schema template stays German (it is the German source the docs mirror byte-for-byte); the wording change is two lines (tree line + ingest step 6), not a restructure, so existing anchors in `docs/MODULE-SCHEMA.md` survive.
- AC3 and AC4 share one new e2e spec on the seeded `identity-management` module, because the fake provider is a per-spec-file option, no existing spec opens a module overview, and 081's condense flow has no stable name yet to add a step to.

## Plan

Order: D1 → D2 → D3 → D4 are independent of 081 and can build first; D5 → D6 need 081's
`condense-module` run, unit and module-view trigger to exist (build after 081).

1. **Ingest stops writing `overview.md`** (D1) — `finishDigestion()` in
   `src/core/wiki/ingest.ts` loses the `updateOverview()` call and function and the
   `linkIntoOverview()` call; `overviewUpdated` leaves `WikiIngestResult`. The catalog
   (`index.md`) already carries `[[slug]]` for each new page. Header comment step 4 goes.
2. **`overviewChange` leaves the contract** (D2) — prompt text + `WIKI_INGEST_SCHEMA`
   property, `IngestReply` field and parse; an old reply carrying it still parses.
3. **Orphan check honours the catalog** (D3) — `orphanCheck` treats a page whose slug
   `parseIndex()` finds in its module's `wiki/index.md` as linked. Fix target logic untouched.
4. **Module schema says what the overview is now** (D4) — `MODULE_SCHEMA_TEMPLATE` tree
   line + ingest step 6, mirrored byte-exact in `docs/MODULE-SCHEMA.md`. No code path
   rewrites an existing `AGENTS.md`.
5. **Legacy overviews are replaced whole** (D5, after 081) — the module-level proposal
   built from an `overview.md` without `condensed_at` drops preamble + foreign sections, so
   every old bullet is a removal in `diffLines`; trash copy comes from the existing
   `condense:accept` snapshot (no new trash code).
6. **One e2e flow** (D6) — seeded bullet overview reads in the module view, is found by
   search, and its first condensation shows the bullets as removals; the trash copy is
   byte-identical.

No migration code (User). No change to `docs/VAULT-FORMAT.md` (081 owns the artifact
description). CHANGELOG entry in D1.

## Deliverables

- **D1 — The digestion leaves `wiki/overview.md` untouched.**
  In `src/core/wiki/ingest.ts`: remove `updateOverview()` (≈ lines 460-505) and its call in
  `finishDigestion()`, remove the `linkIntoOverview()` call and the `overviewLinked` /
  `overviewUpdated` handling of `touched`; update the file header (drop step 4 "overview.md
  nachziehen", keep steps 1-3) and the "one module at a time" paragraph so it no longer names
  `overview.md` as a shared write. Remove `overviewUpdated` from `WikiIngestResult`
  (`src/core/wiki/types.ts` ≈ :159). In `src/core/wiki/overview-links.ts` delete
  `linkIntoOverview` (and its now-unused helpers) but **keep `overviewEntryLine`** — the
  gardener orphan fix imports it (`src/core/gardener/checks/orphan.ts:28`); adjust the header
  comment and the re-export in `src/core/wiki/index.ts` (≈ :60). `reply.overviewChange` stays
  in the type until D2 — just stop reading it. Do not add any new write to `index.md`:
  `upsertEntries` already lists every source/applied page with `[[slug]]`.
  Tests: `tests/core/wiki/ingest.test.ts` — replace the tests "zieht overview.md nur nach, …"
  (≈ :285), "verlinkt Source-Seite und neue Seiten aus der Overview, …" (≈ :303) and "verlinkt
  die unverdichtete Source-Seite aus der Overview, …" (≈ :370) with: **"a digestion leaves
  overview.md byte-identical even when the model reports an overview change"** (fake gateway
  reply carrying `overviewChange` + one new entity; compare `raw` bytes of overview.md before
  and after; overview.md not in `touchedPages`; `index.md` lists `[[source-slug]]` and the new
  entity) and **"without a model the digestion leaves overview.md byte-identical and lists the
  source in index.md"**. `tests/core/wiki/concurrency.test.ts` — the parallel-ingest test
  (≈ :195-217) asserts overview.md byte-identical instead of both `overviewChange` strings; the
  foreign-overview-writer test (≈ :355-419) becomes **"a foreign edit to overview.md during a
  digestion survives byte-identical"**. These tests change because the behaviour they pinned
  is removed by spec (CND-35), not to make them pass — say so in the commit message. Add a
  CHANGELOG.md entry: imports no longer append to a module's overview.
  Files: `src/core/wiki/ingest.ts`, `src/core/wiki/types.ts`, `src/core/wiki/overview-links.ts`,
  `src/core/wiki/index.ts`, `tests/core/wiki/ingest.test.ts`,
  `tests/core/wiki/concurrency.test.ts`, `CHANGELOG.md`.

- **D2 — `overviewChange` leaves the ingest prompt, schema and reply.**
  `src/core/llm/prompts/wiki-ingest.ts`: delete the `overviewChange` schema property
  (≈ :68-72) and the system-prompt sentence about it (≈ :111), both languages if the prompt is
  bilingual. `src/core/wiki/suggestions.ts`: drop `overviewChange` from `IngestReply` (≈ :33),
  the empty reply (≈ :159) and the parse (≈ :171); `readIngestReply` must ignore an incoming
  `overviewChange` key without error. Remove the two `overviewChange: null` literals in
  `src/core/wiki/ingest.ts` (≈ :126, :264). Update fixtures that build an `IngestReply` object
  with the field (`tests/main/ingest-ipc.test.ts:344`, `tests/main/knowledge-flow.test.ts:85`,
  `tests/core/wiki/concurrency.test.ts` typed literals — JSON reply strings may keep it).
  Tests: `tests/core/wiki/prompts.test.ts` (≈ :161) → **"the ingest prompt and schema no
  longer ask for an overview change"** (neither `WIKI_INGEST_SCHEMA` nor the rendered messages
  contain `overviewChange`); `tests/core/wiki/suggestions.test.ts` (≈ :69-95) → **"a reply that
  still carries overviewChange is read and the field ignored"** (suggestions parsed as usual,
  result has no `overviewChange` key).
  Files: `src/core/llm/prompts/wiki-ingest.ts`, `src/core/wiki/suggestions.ts`,
  `src/core/wiki/ingest.ts`, `tests/core/wiki/prompts.test.ts`,
  `tests/core/wiki/suggestions.test.ts`, `tests/main/ingest-ipc.test.ts`,
  `tests/main/knowledge-flow.test.ts`, `tests/core/wiki/concurrency.test.ts`.

- **D3 — A page listed in its module's catalog is not an orphan.**
  `src/core/gardener/checks/orphan.ts`: per module, read the body of
  `wikiIndexPath(module.slug)` from `ctx.index.index().byPath` (index.md is indexed as a
  `note` doc), take the slugs via `parseIndex()` from `@core/wiki` (`src/core/wiki/index-md.ts:83`
  — reuse, no new link regex), and make `isOrphan` return `false` for a page whose slug is
  listed. Graph semantics in `src/core/index/pages.ts` stay unchanged (backlinks must not
  start showing the catalog). Rewrite the header comment: the catalog now counts as a
  reference (the ingest links new pages there, story 082); a page found only by search or
  hand-made without a catalog entry is still an orphan. Fix target selection
  (`singleMention` → overview fallback) is untouched.
  Tests in `tests/core/gardener/checks-links.test.ts`: **"a page listed in its module's
  index.md is not an orphan"** and **"a page neither linked nor listed in index.md is still an
  orphan"**. Existing tests whose fixture relied on "index-only = orphan" get a page that is
  absent from the catalog instead; their assertions stay.
  Files: `src/core/gardener/checks/orphan.ts`, `tests/core/gardener/checks-links.test.ts`
  (plus `tests/core/gardener/fix-orphans.test.ts` / `orphan-targets.test.ts` only if a fixture
  breaks the same way).

- **D4 — The module schema describes `overview.md` as the condensed artifact.**
  `src/core/wiki/agents-md.ts` `MODULE_SCHEMA_TEMPLATE` (German): tree line ≈ :56 becomes
  e.g. `overview.md      verdichtete Synthese — ändert sich nur durch eine bestätigte
Verdichtung` (keep column alignment), and ingest step 6 (≈ :94) becomes a statement that the
  ingest does **not** touch `wiki/overview.md`; it changes only when the user confirms a
  condensation in the module view. Mirror both lines byte-exact in `docs/MODULE-SCHEMA.md`
  (≈ :36, :74; file is pinned `eol=lf`). Do not add any code that refreshes an existing
  module's `AGENTS.md` — `createModule()` stays write-if-missing (`src/core/wiki/module.ts`
  ≈ :149-154). German quotes follow `„…“` if any are used.
  Tests in `tests/core/wiki/module.test.ts`: existing mirror test (≈ :157,
  `expect(MODULE_SCHEMA_TEMPLATE).toBe(SCHEMA_DOC)`) stays green; add **"the module schema
  tells an agent that ingest never touches overview.md"** (the ingest section of the template
  names `overview.md` only as untouched, and the tree line names the confirmed condensation).
  Files: `src/core/wiki/agents-md.ts`, `docs/MODULE-SCHEMA.md`, `tests/core/wiki/module.test.ts`.

- **D5 — A legacy overview is replaced whole by its first condensation** _(build after 081)_.
  Where 081's `condense-module` run composes the proposal for `wiki/overview.md` (its module
  wrapper around `parseArtifact`/`composeArtifact` in `src/core/condense/artifact.ts`, and the
  module run file 081 adds under `src/core/condense/`): if the current file's frontmatter has
  **no `condensed_at`**, the proposal carries **no preamble and no foreign `##` sections**
  from it — only its unknown frontmatter keys and a directives section if one exists. With
  `condensed_at` present, the normal lossless carry-through applies. Do not change
  `parseArtifact`/`composeArtifact` behaviour for area (`CONDENSED_SECTIONS`) or project
  (`PROJECT_SECTIONS`) callers — implement it as a module-level step (e.g. clear
  `preamble`/`extraSections` on the parsed legacy artifact before composing). If 081 already
  implemented exactly this, D5 only adds the tests. No migration code, no new trash code: the
  trash copy is `store.snapshot()` in the `condense:accept` handler
  (`src/main/ipc/condense.ts` ≈ :217).
  Tests in new `tests/core/condense/module-legacy-overview.test.ts`, fixture = a bullet-list
  overview without `condensed_at` that has a preamble, a `## Was entschieden ist` section, a
  foreign `## Seiten` section with `- [[slug]] — title` bullets and an unknown frontmatter key:
  **"a bullet-list overview without condensed_at is replaced whole — every old bullet is a
  removal"** (every old bullet line is a `removed` row in `diffLines(before, proposal.content)`
  and none survives in the proposal; the unknown frontmatter key does) and **"a condensed
  overview keeps its hand-added sections on the next run"** (same fixture plus `condensed_at`
  → `## Seiten` survives). Existing area/project artifact tests in `tests/core/condense/`
  stay green unchanged.
  Files: 081's module-run file under `src/core/condense/` (and its module artifact wrapper if
  separate), `tests/core/condense/module-legacy-overview.test.ts`.

- **D6 — e2e: the seeded bullet overview reads, is searchable, and its first condensation
  loses nothing** _(build after 081 and D5)_.
  New `tests/e2e/module-legacy-overview.spec.ts`, one test **"a bullet-list overview reads, is
  found, and its first condensation loses nothing"**, using the `fakeProvider` option of
  `tests/e2e/fixtures/app.ts` with a scripted `condense-module` reply valid against 081's
  schema (sections decided/open/contradictions citing seeded wiki paths). Target: the seeded
  `identity-management` module (`scripts/seed/module-identity-pages.mjs` ≈ :250-279 — bullets
  under `## Was entschieden ist` / `## Was offen ist`). Steps: (1) open the module view, open
  `overview`, see the bullet text containing `Unterorganisationen`; (2) search for
  `Unterorganisationen`, the overview is a hit and opens; (3) read the overview file bytes
  from the vault, click "Condense" in the module view, every old bullet line appears as a
  `.sb-condensediff-row--removed` row (`src/renderer/components/CondenseDiff.tsx`); (4) accept,
  then find the snapshot under `<vault>/.secondbrain/trash/` and assert it equals the bytes
  read in (3). Use role/text locators from 081's module view; no sleeps.
  Files: `tests/e2e/module-legacy-overview.spec.ts`.

## Model Hints

- D5 → deliverable-hard — `artifact.ts`'s lossless carry-through (preamble, foreign sections,
  directives) is shared by the area and project levels; the legacy exception must fire only for
  a module overview without `condensed_at` and lands inside 081's freshly built code, so a
  shared-path change silently strips hand-added sections from area/project artifacts.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/wiki/ingest.test.ts` › "a digestion leaves overview.md byte-identical
  even when the model reports an overview change"; also › "without a model the digestion
  leaves overview.md byte-identical and lists the source in index.md" and
  `tests/core/wiki/concurrency.test.ts` › "a foreign edit to overview.md during a digestion
  survives byte-identical" (D1)
- AC2 → unit `tests/core/wiki/prompts.test.ts` › "the ingest prompt and schema no longer ask
  for an overview change"; unit `tests/core/wiki/suggestions.test.ts` › "a reply that still
  carries overviewChange is read and the field ignored" (D2)
- AC3 → e2e `tests/e2e/module-legacy-overview.spec.ts` › "a bullet-list overview reads, is
  found, and its first condensation loses nothing" (D6, steps 1-2)
- AC4 → unit `tests/core/condense/module-legacy-overview.test.ts` › "a bullet-list overview
  without condensed_at is replaced whole — every old bullet is a removal" (D5); e2e
  `tests/e2e/module-legacy-overview.spec.ts` › "a bullet-list overview reads, is found, and
  its first condensation loses nothing" (D6, steps 3-4)
- AC5 → unit `tests/core/wiki/module.test.ts` › "the module schema tells an agent that ingest
  never touches overview.md" plus the existing mirror test in the same file (D4)
- AC6 → unit `tests/core/wiki/module.test.ts` › "laesst ein von Hand bearbeitetes AGENTS.md
  unberuehrt" (existing; D4 adds no refresh path)
- Decision "catalog links count" → unit `tests/core/gardener/checks-links.test.ts` › "a page
  listed in its module's index.md is not an orphan" (D3)

## Done

The digestion no longer writes `wiki/overview.md` (`updateOverview`, `linkIntoOverview`, `overviewUpdated` gone) and
`overviewChange` left the prompt, schema and reply (an old reply carrying it is read and the field ignored). The orphan check
counts a page listed in its module's `index.md` as referenced, the module schema template and its `docs/` mirror describe the
overview as the condensed artifact, and `condense-module` replaces an overview without `condensed_at` whole (no preamble, no
foreign sections; unknown frontmatter keys and directives survive).

**Commit message:** `082: ingest leaves overview.md alone — no overviewChange, catalog counts against orphan, legacy overview replaced whole. Tests changed because CND-35 removes the behaviour they pinned`

**Verification** (narrow gate, run twice: after D6 and after the review fixes; step 6b not run, full gate is the sprint's):

- `npm run lint`, `typecheck`, `build`: green. `npx vitest run --changed HEAD`: 2695/2695 green. `npx playwright test tests/e2e/module-legacy-overview.spec.ts`: 1/1.
- `prettier --check .`: red only for `docs/requirements/087-open-claude-in-the-vault.md`, already red at HEAD (committed by 087's refine; prettier is not idempotent on its continuation lines). Not this story's change; flagged for the sprint gate.
- AC → test, all passed: AC1 `ingest.test.ts` (two byte-identical tests) + `concurrency.test.ts` "a foreign edit to overview.md during a digestion survives byte-identical"; AC2 `prompts.test.ts` + `suggestions.test.ts` named tests; AC3 e2e `module-legacy-overview.spec.ts` (read + search); AC4 `module-legacy-overview.test.ts` + same e2e (removed rows, trash bytes equal); AC5 `module.test.ts` schema test + mirror test; AC6 existing `module.test.ts` AGENTS.md test (no refresh path added); catalog decision `checks-links.test.ts` (two tests). No manual residue.
- Review: default stage PASS, 1 cycle. Fixed: the e2e did not prove the legacy rule (seeded overview has no `## Seiten`), so it now appends a `## Seiten` bullet before condensing and asserts it as a removed row; five stale comments; CHANGELOG wording.

**Decisions:**

- Spec'd the legacy rule in `run-module.ts` (`carriedOver`, module level only); `artifact.ts` untouched, so area/project runs keep their lossless carry-through (pinned by `artifact-project.test.ts`). 081's Done did not implement it; this story owns and tests it. The creation stub (no `condensed_at`) is replaced whole too.
- Seed vault: `scim` and the methodik interview source are now `unlisted` and `EXPECTED_FINDINGS.missingFromIndex` is 3, otherwise the catalog rule would silently remove the seeded orphan findings. `tests/core/gardener/demo-pages.ts` and `report.test.ts` (index-drift 1 → 2) changed alike; existing orphan fixtures pass `{ catalog: null }`, assertions unchanged.
- `docs/VAULT-FORMAT.md` condensed-artifact paragraph now states the legacy exception (it said foreign sections are always carried over).
- CHANGELOG entry sits under `## Unreleased` / `### Added` (no `# Features` heading exists).
- Left as is: the orphan fix still appends `## Seiten` to a condensed overview (becomes a foreign section; follow-up per decisions); an overview whose `condensed_at` was removed by hand counts as legacy and is replaced whole (diff + trash protect it); `checks-links.test.ts` was already over 300 lines.
- 087 file: an attempted scoped `prettier --write` reformatted continuation lines in `docs/requirements/087-open-claude-in-the-vault.md` without making the check green; the revert was denied by the permission system, so that whitespace-only diff is still in the tree for the orchestrator to drop.

tiers: D 6 / hard 1 · review default · cycles 1 · agents 10
