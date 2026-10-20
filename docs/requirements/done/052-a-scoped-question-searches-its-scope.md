---
id: 052
title: A scoped question searches its scope
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.3-1](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: `scope` and `project` filters are applied after the top-24 candidate cut
(`src/core/wiki/ask.ts:82` vs `:69`); only the `module` filter reaches the search itself. The
fixture vaults are too small for any test to notice.

## Requirement

When I ask a question scoped to one project or one scope (work/private), the app today searches
the whole vault, takes the best 24 hits, and only then throws away everything outside my scope.
In a vault where the project is a small minority of the content — which is every real vault —
the relevant project files sit below rank 24, the scope filter empties the candidate list, and I
get two weak excerpts or an honest-sounding "nothing found" that is actually wrong. The feature
breaks exactly when the vault becomes big enough to need it, and it breaks silently.

A scoped question must run the scope inside retrieval: the candidates competing for the answer
are the scope's documents, not the whole vault's. While in there: a follow-up question in a
thread currently retrieves on its raw words alone ("and what about the deadline?"), which is
the same class of problem — the retrieval not seeing what the question is actually about.

## Acceptance Criteria

- [x] With a project filter set, retrieval candidates come from that project's documents; a
      question whose answer is in the project is answered even when the vault is large and the
      project is small.
- [x] Same for the scope filter (work/private).
- [x] "Nothing found" under a scope means the scope has nothing — verified by a test with a
      vault where the answer exists outside the scope only.
- [x] The no-model excerpt path honours the same scoping.
- [x] A test with a deliberately large fixture (relevant docs beyond the old candidate cut)
      pins the fix.
- [ ] Optional, refine decides: a follow-up turn's retrieval query is built from the thread's
      context, not the follow-up words alone — or this is split into its own story.
      → **split out** (see Decisions (Sprint)); not built in 052.

(The criteria above are referred to as AC1–AC6, top to bottom.)

## Open Questions

## Decisions (Sprint)

- **The fix goes into the search predicate, not into a bigger over-fetch in `ask.ts`.**
  `SearchEngine.filterFor` (`src/core/index/search.ts:88`) already applies `scope` before the
  limit cut since story 059; adding `project` there and passing both from `retrieve` makes the
  24 candidates all in-scope, whereas raising `MAX_CANDIDATES` only moves the cliff.
- **`project` becomes an optional field of `SearchQuery`** (`src/shared/types/knowledge.ts`),
  because the filter must run inside the engine and `WikiIndexView.search` only takes a
  `SearchQuery`; optional means no existing caller (search screen, coach, capture) changes.
- **`retrieve`'s signature and `WikiExcerpt[]` return shape stay unchanged**, so 053 can split
  exactly this (now scope-correct) candidate set into passages and inherits the scoping through
  the same `filterFor` predicate.
- **The no-model path needs no code of its own**: `askQuestion`'s fallback uses the same
  `retrieve`, so AC4 is proven by a test with `emptyGateway()` on the large fixture, not by a
  second implementation.
- **AC6 (follow-up retrieval from thread context) is split out, not built here**: merging prior
  turns into the query needs a design call on topic changes ("now what about project Y?") and
  ranking under AND→OR fallback, it touches the same query text 053 reshapes, and 052 stays the
  small scope change the sprint order assumes; the sprint review files it as a new story.
- **The large-fixture tests are generated in code, not added to `tests/fixtures/vault/`**,
  because that vault's content is pinned by counts and gardener findings in other tests.
- **Acceptance is at core level, no new e2e**: no user action changes (the project/scope choice
  in the ask panel and its `chat:ask` forwarding at `src/main/ipc/chat.ts:78` already exist); the
  defect needs a controlled rank distribution — many strong out-of-scope hits above weak in-scope
  ones — which the e2e harness's fixed seeded demo vault cannot produce.
- **A structural test pins the fix against the "over-fetch then filter" variant**: a recording
  `WikiIndexView` asserts the `SearchQuery` itself carries `scope`/`project`, since a fixture of
  any fixed size could be beaten by a large enough post-filter over-fetch.

## Plan

1. **Search predicate (core/index).** Add `project?: string` to `SearchQuery`; in
   `filterFor` reject `doc.project !== query.project` when set — the same place and order as
   `scope`, so MiniSearch hits, the substring fallback and the empty-query "recent" path all
   honour it before `slice(0, limit)`.
2. **Retrieval (core/wiki).** In `retrieve` (`src/core/wiki/ask.ts`) pass `scope` and
   `project` into `index.search(...)` next to `module` (omit when `null`/`undefined`, same
   spread pattern as `module`), and delete the post-hit `scope`/`project` `continue` checks
   (lines 82–91). Update the file header comment's step 1 to say filters run inside the search.
   `askQuestion` needs no change: it already forwards `input.scope`/`input.project`.
3. **Tests.** Extend `tests/core/index/search-scope.test.ts` with a project case. New file
   `tests/core/wiki/ask-scope-large.test.ts` (existing `ask.test.ts` is already 444 lines)
   with a generated large vault on top of `wikiFixture(...)`: 30 private, non-project notes
   whose _titles_ contain the question terms (strong hits), plus the answer in 1 note under
   `projects/work/<slug>/` with the terms only in the body (weak hit, rank > 24 unscoped).
4. Existing `tests/core/wiki/ask.test.ts` scope/project cases must stay green unchanged.

Order: D1 → D2. No IPC, preload or renderer change.

## Deliverables

- [x] **D1 — `SearchQuery.project` filters before the limit cut.** Add optional
      `project?: string` (doc comment: "Restrict to one project slug from
      `projects/<scope>/<slug>/`.") to `SearchQuery` in `src/shared/types/knowledge.ts`. In
      `src/core/index/search.ts` `filterFor`, add
      `if (query.project !== undefined && doc.project !== query.project) return false;` right
      after the `scope` line, and extend the function's doc comment to name `project`.
      `IndexedDoc.project` (`src/core/index/types.ts:49`) is already derived from the path.
      Test: add a `describe('SearchEngine: project', …)` to
      `tests/core/index/search-scope.test.ts`, mirroring its existing scope case (several
      strong-title docs in another project/no project, one weak body-only doc in the wanted
      project, `limit` smaller than the strong set) — test name
      "a project filter keeps the weak in-project hit that the limit would have cut".
      Files: `src/shared/types/knowledge.ts`, `src/core/index/search.ts`,
      `tests/core/index/search-scope.test.ts`.
- [x] **D2 — `retrieve` scopes inside the search.** In `src/core/wiki/ask.ts` `retrieve`:
      pass `scope` and `project` into the `index.search({...})` call with the same
      null/undefined-omitting spread already used for `module`; remove the two post-hit
      `continue` checks on `doc.scope`/`doc.project`; keep signature, `RetrieveOptions`,
      `MAX_CANDIDATES`, and the `WikiExcerpt` shape unchanged. Update the header comment step 1
      ("Kandidaten aus der Volltextsuche" → candidates come from the search _inside_ the
      module/scope/project filter), in English. `askQuestion` stays as is.
      Tests in the new file `tests/core/wiki/ask-scope-large.test.ts`, using `wikiFixture`
      from `tests/core/wiki/fixtures.ts` plus a local generator `largeVault()` that returns
      extra files: 30 notes `areas/filler-NN.md` with frontmatter `scope: private` (see
      `docs/VAULT-FORMAT.md`) whose titles contain the question's terms, and one note under
      `projects/work/<slug>/` (scope `work`) carrying the answer sentence with the terms only
      in the body; plus an "outside only" variant where the answer note lives in a private
      area instead. Use `gatewayWithReplies` / `emptyGateway` from `tests/helpers/llm.ts`
      (mirror `tests/core/wiki/ask.test.ts`). Tests: - "a project-scoped question finds the answer below the old candidate cut" — sanity:
      unscoped `retrieve(..., { limit: 24 })` does _not_ contain the project note; with
      `{ project: <slug> }` `askQuestion` (fake model answering with a citation of the
      project note) returns that path in `citations`, and every excerpt path starts with
      `projects/work/<slug>/`. - "a scope-filtered question finds the answer below the old candidate cut" — same with
      `{ scope: 'work' }`; every excerpt is a `work` document. - "nothing found under a scope means the scope has nothing" — outside-only variant,
      `{ scope: 'work' }` and `{ project: <slug> }`: `unsupported: true`, `excerpts: []`,
      answer is the `noEvidence` phrase, and the fake provider recorded no call. - "without a model the excerpts honour the same scope" — `emptyGateway()`, project and
      scope filter: `usedLlm: false`, the project note is among `excerpts`, none outside. - "the search query itself carries scope and project" — wrap `fixture.index` in a
      recording `WikiIndexView` (delegate all methods, push each `SearchQuery`), call
      `retrieve` with both filters, assert every recorded query has `scope` and `project`
      set.
      Files: `src/core/wiki/ask.ts`, `tests/core/wiki/ask-scope-large.test.ts`.

## Model Hints

- D1, D2 → default tier.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/wiki/ask-scope-large.test.ts` › "a project-scoped question finds the
  answer below the old candidate cut" (plus `tests/core/index/search-scope.test.ts` › "a project
  filter keeps the weak in-project hit that the limit would have cut")
- AC2 → unit `tests/core/wiki/ask-scope-large.test.ts` › "a scope-filtered question finds the
  answer below the old candidate cut"
- AC3 → unit `tests/core/wiki/ask-scope-large.test.ts` › "nothing found under a scope means the
  scope has nothing"
- AC4 → unit `tests/core/wiki/ask-scope-large.test.ts` › "without a model the excerpts honour
  the same scope"
- AC5 → unit `tests/core/wiki/ask-scope-large.test.ts` › "the search query itself carries scope
  and project" (together with the two "below the old candidate cut" tests, whose sanity step
  proves the fixture really puts the answer beyond rank 24)
- AC6 → split out by decision (see Decisions (Sprint)); no test in this story.
- No e2e: no user action changes; reason in Decisions (Sprint).

## Done

Summary: `SearchQuery` gained an optional `project` field; `SearchEngine.filterFor`
(`src/core/index/search.ts`) now rejects a non-matching `project` in the same place and order as
`scope`, before the limit cut. `retrieve` (`src/core/wiki/ask.ts`) now passes `scope`/`project`
into `index.search(...)` instead of filtering hits after the fact; the two dead post-hit `continue`
checks were removed. No IPC/renderer change — `askQuestion` already forwarded both fields.

Commit message: `052: scope and project filter candidates before the limit cut, not after`

Verification — narrow gate (no `--full`): `npm run build` green, `npm run lint` green,
`npm run typecheck` green, `npx vitest run --changed HEAD` green (189 files, 2666 tests). No e2e
run — no user-facing surface changed (see Decisions (Sprint)). `npm run format:check` red on 3
files, none of them touched by this story (`docs/requirements/061-*.md`,
`tests/main/services.test.ts`, and this story file itself — reformatted below) — pre-existing,
not fixed here.

AC → test, as verified: AC1 → `tests/core/wiki/ask-scope-large.test.ts` › "a project-scoped
question finds the answer below the old candidate cut" + `tests/core/index/search-scope.test.ts`
› "a project filter keeps the weak in-project hit that the limit would have cut" (both pass).
AC2 → `ask-scope-large.test.ts` › "a scope-filtered question finds the answer below the old
candidate cut" (pass). AC3 → `ask-scope-large.test.ts` › "nothing found under a scope means the
scope has nothing" (pass). AC4 → `ask-scope-large.test.ts` › "without a model the excerpts honour
the same scope" (pass). AC5 → `ask-scope-large.test.ts` › "the search query itself carries scope
and project" (pass). AC6 split out, no test here, no open point.

Review: stage 1 only (default tier per Model Hints) — PASS, no findings; a mutation check
(re-running the new tests against the pre-fix code via `git stash`) confirmed 4 of them fail
without the fix, so they exercise the bug, not a tautology.

tiers: D 2 / hard 0 · review default · cycles 0 · agents 4
