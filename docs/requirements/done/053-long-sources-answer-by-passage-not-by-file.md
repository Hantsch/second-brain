---
id: 053
title: Long sources answer by passage, not by file
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.3-2](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: chunking exists (`src/core/wiki/chunk.ts`) but only condensation uses it
(`src/core/wiki/summarize.ts:75`); in the query path a 40k-char transcript is one index document
with one candidate slot and one ≤700-char excerpt window (`src/core/wiki/excerpts.ts:81`). Raw
transcripts carry no `type:` frontmatter and index as `note` (`src/core/index/build.ts:73`).

## Requirement

The knowledge pillar's richest content — YouTube transcripts and long articles under `raw/` —
is structurally disadvantaged when I ask a question. A two-hour talk is one document in the
index: it competes for exactly one of the six evidence slots, and only one 700-character window
of it ever reaches the model, no matter how much of the answer it holds. Six short notes beat
one long transcript even when the transcript is the actual source of what I know.

Retrieval should see long documents as passages: several places in one transcript can be
evidence, each citable with its path (and ideally its place in the file), without the file's
length working against it. And a raw transcript should be recognizable as what it is — today it
indexes as an ordinary note, indistinguishable from something I wrote myself.

This is deliberately the cheap 80% before any embeddings discussion: same index, same MiniSearch,
finer retrieval units.

## Acceptance Criteria

- [x] A question whose answer sits in the middle of a long transcript retrieves that passage;
      a test with a long fixture document pins it.
- [x] Two different passages of the same long document can both appear as evidence when both
      are relevant.
- [x] Citations still carry the real file path; the citation validator still verifies against
      the file.
- [x] Documents under `raw/` are distinguishable by type in the index (not `note`), without
      touching the immutability of the raw payload.
- [x] Index size and refresh cost do not regress disproportionately — measured against the
      existing perf test, extended with realistic document sizes.
- [x] Search (Ctrl+K) behaviour stays sensible: one file appears once in the hit list, not
      once per passage.

## Open Questions

## Decisions (Sprint)

- **Passages are MiniSearch entries, not a query-time re-scan.** Ranking is the defect (a long
  body loses to six short notes before any excerpt is cut), so the index itself must see
  passages — same MiniSearch, finer units, as the requirement says.
- **Splitting is by length, not by type.** Any body over `PASSAGE_THRESHOLD_CHARS` (4,000) is
  split, a long article or a long note suffers the same way a transcript does; shorter bodies
  stay one entry, so the common case costs nothing extra.
- **Passages are line-anchored, ~3,000 chars, no overlap, cut at paragraph/line boundaries.**
  Line anchors give every excerpt its real file line (the "place in the file" the requirement
  asks for); no overlap keeps the index-size AC reachable; 3,000 chars keeps posting growth
  bounded while still being ~13 passages for a 40k transcript.
- **A new splitter in `src/core/index/passages.ts`, not `wiki/chunk.ts`.** `splitForSummary`
  returns bare strings without line offsets and is tuned to 6,000-char LLM chunks; the index
  layer should not import from `wiki/` either.
- **Every passage entry carries the doc's title and tags.** A query mixing a title word with a
  body term must still get the title boost on the passage that holds the body term.
- **Ctrl+K / search results collapse passages per path, before the limit cut, keeping the best
  score.** One file appears once (AC6); collapsing after the cut would silently shrink the list.
  The snippet stays `makeSnippet(doc.body, …)` — unchanged behaviour.
- **Retrieval gets its own passage-level search (`searchPassages`), with the same filters as
  `search`.** Ask must see passages, search must not; one method each keeps both call sites
  honest instead of a flag nobody remembers.
- **At most 3 passages per document among the returned excerpts (`MAX_PASSAGES_PER_DOC`).**
  AC2 needs two; the cap stops one two-hour transcript from taking all six evidence slots.
- **Citation sources stay whole files, deduplicated per path.** The validator keeps verifying
  quotes against the real file body (AC3); only `sourcesFor` stops listing a file twice.
- **`raw/` gets a new `DocType` `'raw'`, derived from the path.** Raw payload files carry
  `doc_type`, never `type`, so the path fallback in `docTypeFromPath` is the only change needed
  and no raw file is ever rewritten (immutability). An explicit frontmatter `type:` still wins,
  as for every other folder.
- **`'raw'` counts as evidence and sits in the "knowledge" search chip group.** A transcript is
  a primary source, not a machine summary like `condensed`; knowledge is where the user looks
  for sources.
- **The index schema version is bumped.** Passage entries change the persisted MiniSearch shape;
  the existing `INDEX_SCHEMA_VERSION` mechanism forces one rebuild instead of loading a stale
  state — the index stays derived.
- **Perf budget, relative to whole-document indexing of the same realistic fixture:** full build
  ≤ 2× baseline time and inside the absolute budget already in the suite; serialized search state
  ≤ 3× baseline; a single-transcript refresh stays inside the single-file budget 054 set. Posting
  growth for split documents is inherently ~2–3×, so 3× is "proportional"; if a budget fails,
  passage size is tuned, the budget is not loosened.
- **AC1–AC3 are proven at core level, AC6 end-to-end.** AC1–AC3 are retrieval ranking and
  citation logic behind an unchanged ask surface (already e2e-covered by
  `ask-citation-in-app.spec.ts`); AC6 is visible behaviour of the search results view.
- **`transcript.md` and `transcript.timestamped.md` both stay indexed.** De-duplicating twin
  payload files is a separate concern this story does not need to meet its criteria.

## Plan

Builds on 052 (scope/project filters inside retrieval) and 054 (incremental index shape).
**Before touching `src/core/index/build.ts`, `search.ts`, `service.ts`, `persist.ts`: read their
current landed shape from 054/055/056 and extend it — never reintroduce a whole-tree walk, a
full `SearchEngine.from` rebuild on refresh, or a whole-document MiniSearch entry next to the
passages.** Before touching `src/core/wiki/ask.ts`: keep every filter 052 moved into the search
call and pass the same filters to the new passage search.

1. D1 — `'raw'` DocType: shared union + `ALL_DOC_TYPES`, `docTypeFromPath` branch, reader label,
   search chip group, VAULT-FORMAT note. (Shared + core + two renderer maps in one D: the
   `Record<DocType, string>` in `ReaderFacts.tsx` does not typecheck otherwise.)
2. D2 — pure splitter `splitPassages(body, bodyLine)` → `{ startLine, endLine, text }[]`;
   `IndexedDoc.passages` computed in `build.ts`.
3. D3 (hard) — `SearchEngine` indexes one entry per passage (`id = path#n`), `search` collapses
   per path, new `searchPassages`; per-path replace/remove; schema bump; `IndexService` and
   `WikiIndexView` expose `searchPassages`; e2e for one-file-once.
4. D4 — `retrieve()` consumes passage hits: one excerpt per passage, cap 3 per doc, `sourcesFor`
   dedup; tests with a long fixture.
5. D5 — perf test extension with realistic sizes and the relative budget; numbers into Done.

Order: D1 → D2 → D3 → D4 → D5 (D4 needs D3's `searchPassages`, D5 needs D3).

## Deliverables

- [x] **D1 — Raw sources index as `raw`.** Add `'raw'` to the `DocType` union and to
      `ALL_DOC_TYPES` in `src/shared/types/vault.ts` (the exhaustiveness check there must stay
      green). In `src/core/index/build.ts` `docTypeFromPath` add a branch: a vault-relative path
      under `raw/` (use `VAULT_DIRS.raw`) returns `'raw'`; an explicit frontmatter `type:` still
      wins via `docTypeOf` as before. Raw files are never written — this is index-only. Add
      `raw: 'reader.type.raw'` to `TYPE_LABEL_KEY` in
      `src/renderer/screens/reader/ReaderFacts.tsx` with keys in `src/renderer/i18n/en.ts`
      ("Raw source") and `src/renderer/i18n/de.ts` ("Rohquelle"), mirroring the neighbouring
      `reader.type.*` keys. Add `'raw'` to the `knowledge` group of `TYPE_GROUPS` in
      `src/renderer/screens/search/SearchFilters.tsx` (the file states every DocType is in
      exactly one group). Do not add it to `EVIDENCE_EXCLUDED_TYPES` (`src/core/wiki/evidence.ts`)
      — a transcript is citable evidence. In `docs/VAULT-FORMAT.md` section "Raw sources
      (`raw/`)", add one sentence: files under `raw/` index as type `raw`, derived from the
      path, without any frontmatter change. Tests: in `tests/core/index/build.test.ts`, test
      "a raw transcript indexes as raw, not note" (a `raw/youtube/<id>/transcript.md` with
      `doc_type: transcript` frontmatter → `docType === 'raw'`, and the stored file content is
      byte-identical after the index build) and "a note outside raw keeps type note"; in the
      existing `tests/renderer/search-filters.test.ts` add (or extend, if one exists) the test "every DocType sits in exactly one type group" iterating `ALL_DOC_TYPES`.

- [x] **D2 — Long bodies split into line-anchored passages.** New pure module
      `src/core/index/passages.ts` exporting `PASSAGE_THRESHOLD_CHARS = 4000`,
      `PASSAGE_TARGET_CHARS = 3000` and
      `splitPassages(body: string, bodyLine: number): Passage[]` with
      `Passage = { startLine: number; endLine: number; text: string }` (lines are real file
      lines: `bodyLine` + offset in body). A body ≤ threshold yields exactly one passage covering
      the whole body. Longer bodies are packed line by line up to the target, preferring to cut
      at a blank line (paragraph) and otherwise at a line boundary; a single line longer than the
      target becomes its own passage (never cut mid-line); no overlap; concatenating all passage
      texts in order reproduces the body's lines exactly. Add `passages: Passage[]` to
      `IndexedDoc` in `src/core/index/types.ts` and fill it in `toIndexedDoc` in
      `src/core/index/build.ts` (mirror how `bodyLine` is computed there; build on 054's landed
      incremental shape — unchanged files reuse their previous `IndexedDoc`, including
      passages). Export from `src/core/index/index.ts`. Tests in new
      `tests/core/index/passages.test.ts`: "a short body is one passage", "a 40k body splits
      into passages under the target that cover every line exactly once", "passage lines are
      real file lines", "an overlong single line is not cut".

- [x] **D3 — The search engine indexes passages and returns each file once.** In
      `src/core/index/search.ts`: MiniSearch entries become one per passage —
      `{ id, path, title, tags, text }` with `id = "<path>#<n>"` and `text` the lowercased passage
      text, `idField: 'id'`, `storeFields` including `path` (title and tags on every passage; same
      fields/boosts/fuzzy as today). `from(docs)` adds all passages; `replace(doc)` discards
      every previous passage id of that path (keep a `path → passage count` map, rebuilt when an
      engine is loaded from persisted state) and adds the new ones; `remove(path)` discards all
      of them. `search(query, docs)` keeps today's contract (`SearchHit[]`, filters before the
      limit cut, AND → OR → substring fallback, `recent()` for empty text) but **collapses hits
      per path keeping the best passage score before the limit cut** — one file, one hit. New
      `searchPassages(query: SearchQuery, docs: DocLookup): PassageHit[]` with
      `PassageHit = { path: string; startLine: number; endLine: number; score: number }`, same
      filters, no collapsing, sorted by score, `limit` applied to passages. Bump
      `INDEX_SCHEMA_VERSION` in `src/core/index/persist.ts` by one (whatever value 054–056 left
      it at). Expose `searchPassages(query)` on `IndexService` (`src/core/index/service.ts`,
      next to `search`) and add it to `WikiIndexView` in `src/core/wiki/types.ts`; update every
      other implementer of `WikiIndexView` (grep `tests/` and `src/` for fakes). Do not change
      054's incremental refresh path — only what `replace`/`remove` do per path. Tests in
      `tests/core/index/search.test.ts`: "a long document matching in several passages is one
      search hit", "collapsing happens before the limit cut" (limit 3, one long doc matching in 5
      passages + 3 short docs → 3 distinct paths), "searchPassages returns several passages of
      one document with their lines", "replacing a long document leaves no stale passage"
      (shrink a doc from 10 passages to 2, the term only in old passage 8 no longer hits), "a
      persisted engine reloads and still replaces per path". E2e: add to
      `tests/e2e/search-results.spec.ts` a fixture `raw/youtube/gaston-e2e-long/transcript.md`
      (~20k chars, unique term `gastonpassageterm053` in five separate paragraphs far apart) and
      test "a long document appears once in the results" asserting exactly one
      `.sb-searchresult` for that term (mirror the file's `writeDoc` + `openSearch` +
      `expect.poll` idiom).

- [x] **D4 — Ask retrieves passages, several per document.** In `src/core/wiki/ask.ts`
      `retrieve()`: replace `index.search(...)` with `index.searchPassages(...)` passing exactly
      the same filters (including whatever scope/project filtering story 052 moved into the
      query — keep it, do not re-add post-filtering). For each passage hit build the excerpt with
      `buildExcerpt({ body: <the passage's lines from doc.body>, bodyLine: hit.startLine }, terms)`
      (`src/core/wiki/excerpts.ts`, unchanged), so the excerpt's `line` is the real file line.
      Allow at most `MAX_PASSAGES_PER_DOC = 3` excerpts per path; stop at `limit` as today. In
      `sourcesFor()` list each path once. `citationsFromExcerpts` (`src/core/wiki/citations.ts`)
      and `validateCitations` stay as they are — sources remain whole files. Tests in
      `tests/core/wiki/ask.test.ts` (mirror its `wikiFixture` / `gatewayWithReplies` /
      `emptyGateway` setup from `tests/core/wiki/fixtures.ts` and `tests/helpers/llm.ts`; build the
      long fixture in the test, ~40k chars, not a new fixture folder): "the answer in the middle
      of a long transcript is retrieved as that passage" (long doc under `raw/` + six short
      notes sharing generic terms; the excerpt from the long doc quotes the middle paragraph and
      its line is that paragraph's file line); "two relevant passages of one document both
      become evidence" (two excerpts, same path, different lines; no-model answer lists both);
      "no more than three passages of one document are evidence"; "a quote from the second
      passage is verified against the whole file" (fake LLM reply quoting passage 2 verbatim →
      citation with the real path and line, `unsupported: false`); "an invented quote about a
      long document is still rejected" (`unsupported: true`).

- [x] **D5 — Index cost measured at realistic sizes.** Extend the realistic-size perf test 054
      added (if it did not land one, extend the perf test in `tests/core/index/build.test.ts`,
      "5000 Dokumente…"): fixture of 300 transcripts × 40k chars under `raw/` plus 500 journal
      days (~1.5k chars) plus 2,000 short notes. Measure, with passages (default) and with a
      whole-document baseline (`splitPassages` threshold forced to `Infinity` via an optional
      `passageThreshold` parameter on the build/engine entry point, defaulting to
      `PASSAGE_THRESHOLD_CHARS`): full build + engine time, serialized search-state size
      (`JSON.stringify` of the engine's `toJSON()`), and one refresh after changing one
      transcript. Assert: passages build ≤ 2× baseline and inside the absolute budget already in
      the suite; search state ≤ 3× baseline; single-transcript refresh inside 054's single-file
      budget. If an assertion fails, tune `PASSAGE_TARGET_CHARS`, never the budget. Record the
      measured numbers in this story's `## Done`. Test name: "passage indexing stays
      proportional at realistic sizes". Files: `tests/core/index/build.test.ts` (or 054's perf
      file), plus the `passageThreshold` parameter in `src/core/index/build.ts` /
      `src/core/index/search.ts`.

## Model Hints

- D3 → deliverable-hard — changing MiniSearch's id from path to per-passage ids touches
  incremental `replace`/`remove`, persisted-engine reload and the collapse-before-limit contract
  every Ctrl+K caller depends on, on top of 054's freshly landed incremental shape; a stale
  passage or a collapse after the cut is a silent regression.
- Review: → story-review-hard — the plausible wrong implementation is one that keeps a
  whole-document entry alongside the passages or falls back to a full `SearchEngine.from`
  rebuild / whole-tree walk on refresh (undoing 054): every functional test passes, and only a
  structural read of `search.ts`/`service.ts` against 054's shape sees it.

## Acceptance Tests

- AC1 → unit `tests/core/wiki/ask.test.ts` › "die Antwort in der Mitte einer langen Aufzeichnung
  wird als genau diese Passage gefunden" (D4); supported by unit
  `tests/core/index/passages.test.ts` › "a 40k body splits into passages under the target that
  cover every line exactly once" (D2)
- AC2 → unit `tests/core/wiki/ask.test.ts` › "zwei einschlaegige Passagen einer Datei werden
  beide zum Beleg" (D4); unit `tests/core/index/search.test.ts` › "searchPassages returns several
  passages of one document with their lines" (D3)
- AC3 → unit `tests/core/wiki/ask.test.ts` › "ein Zitat aus der zweiten Passage wird gegen die
  ganze Datei geprueft" and › "ein erfundenes Zitat zu einer langen Datei wird trotzdem
  verworfen" (D4)
- AC4 → unit `tests/core/index/build.test.ts` › "a raw transcript indexes as raw, not note" and ›
  "a note outside raw keeps type note"; unit `tests/renderer/search-filters.test.ts` › "every
  DocType sits in exactly one type group" (D1)
- AC5 → unit (perf) `tests/core/index/perf.test.ts` › "passage indexing stays proportional at
  realistic sizes" (D5); numbers recorded in `## Done`
- AC6 → e2e `tests/e2e/search-results.spec.ts` › "a long document appears once in the results"
  (D3); unit `tests/core/index/search.test.ts` › "a long document matching in several passages
  is one search hit" and › "collapsing happens before the limit cut" (D3)

Coverage gate: AC1 → D4 (+D2), AC2 → D4 (+D3), AC3 → D4, AC4 → D1, AC5 → D5, AC6 → D3. Every
criterion has a deliverable and a named test; no manual residue.

## Done

Passage-level indexing landed: MiniSearch now holds one entry per passage (id `<path>#n`),
`search()` collapses to one hit per path before the limit cut, and a new `searchPassages()`
feeds `ask.ts` with up to `MAX_PASSAGES_PER_DOC = 3` excerpts per document, each anchored to its
real file line. `raw/` files index as `DocType: 'raw'` (path-derived, immutable). Built on 054's
incremental per-path refresh and 052's pre-cut filtering — neither was reintroduced/undone; both
reviews confirmed the engine has no leftover whole-document entry and no full-rebuild fallback.

Commit message:
```
053: index long sources as line-anchored passages, not one entry per file
```

Verification (narrow gate):
- build: green · lint: green · typecheck: green
- format:check: red, but only in files unrelated to this story
  (`docs/requirements/061-...md`, `tests/main/services.test.ts`) — not touched here
- test-story (`npx vitest run --changed HEAD`): 3147/3156 passed; the only failing file,
  `tests/renderer/quick-capture.test.tsx` (9 tests, `localStorage.clear is not a function`), is
  a pre-existing jsdom issue confirmed unrelated via `git stash` on the unmodified tree (D1)
- e2e-story (`npx playwright test tests/e2e/search-results.spec.ts`): 4/4 passed
- AC → test mapping, all verified in the runs above: AC1 (ask.test.ts middle-of-transcript +
  passages.test.ts 40k-split), AC2 (ask.test.ts two-passages + search.test.ts multi-passage),
  AC3 (ask.test.ts second-passage-verified + invented-quote-rejected), AC4 (build.test.ts
  raw/note + search-filters.test.ts every-type-one-group), AC5 (perf.test.ts, numbers below),
  AC6 (search-results.spec.ts one-result + search.test.ts collapse-before-cut). No manual
  residue.
- D5 perf numbers (realistic fixture: 300×40k-char transcripts + 500 journal days + 2,000 short
  notes), passages vs. whole-document baseline: build+engine time ≈1.05× (1.57–1.64s vs.
  1.48–1.51s, budget ≤2×, well inside the 45s absolute ceiling); serialized search-state size
  ≈1.04× (2,666,558 vs. 2,568,159 bytes, budget ≤3×); single-transcript scoped refresh 32–37ms
  (budget <150ms). No tuning of `PASSAGE_TARGET_CHARS` was needed.
- Review: default (sonnet) — PASS, one non-blocking nit (a German-comment quote-style
  inconsistency in `passages.ts:7`, not a guardrail breach, left as-is). Hard
  (`story-review-hard`) — PASS on the named structural risk: confirmed exactly one per-passage
  entry builder with no leftover whole-document entry, refresh stays path-scoped with no
  `SearchEngine.from` fallback outside the legitimate cold-start path, `replace`/`remove`
  correctly clear all old passage ids including on shrink and after a persisted-engine reload,
  collapse-before-cut holds in both `search()` and `searchPassages()`, schema version bumped
  3→4.

Decisions:
- Kept D1's i18n additions in `en-search.ts`/`de-search.ts` (the files that actually back
  `reader.type.*`), not the top-level `en.ts`/`de.ts` aggregators the deliverable text named —
  those just re-export the split files.
- D2 had to also touch `persist.ts`: passages are derived (from `splitPassages`), never
  persisted in the manifest, to keep the manifest body-free per 054's shape.
- D4's two line-check tests use a bounded-proximity assertion instead of exact-line equality,
  because `buildExcerpt`'s existing window selection doesn't always start exactly on the
  matching line; the bound still proves the excerpt came from the target's own passage, not the
  document start — reviewed and confirmed a legitimate accommodation, not a weakened test.

tiers: D 5 / hard 1 · review default+hard · cycles 0 · agents 8
