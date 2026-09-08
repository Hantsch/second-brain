---
id: 050
title: A digestion completes whole or leaves no trace
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-03
sprint: S16
risk: high # sprint.md: the riskiest story of S16 — five existing test suites must stay green
---

From the 2026-09-03 architecture review ([finding 3.1-1](../reviews/2026-09-03-architecture-review.md)),
P0. Evidence: `markRawProtocol` runs last (`src/core/wiki/ingest.ts:238`); retry re-enters with
`sourcePage: null` and `freeSlug` writes a `…-2` page (`src/core/wiki/pages.ts:239`);
`wiki/log.md` is appended without `expectedHash` (`src/core/wiki/ingest.ts:217`); concurrency is
2 (`src/main/ipc/ingest.ts:62`) with no per-module serialization; `close-guard.ts` only protects
gardener runs; chunk-merge input is clamped at 12,000 chars with no notice to the user
(`src/core/llm/prompts/summarize-source.ts:166`).

## Requirement

When I take a source into a knowledge module, one of two things must be true afterwards: the
digestion happened completely — source page, entity pages, index, chronicle, protocol — or it
did not happen at all and the app says why. Today a failure halfway through (a hash conflict,
a disk error, quitting the app mid-run) leaves wiki pages written while the protocol still calls
the source undigested, and retrying writes a second source page next to the first. Two sources
digesting into the same module at the same time can also lose a chronicle entry or trip each
other into that same half-state.

I never look at `wiki/` internals — I trust the "Unverdichtet" badge. If that badge can lie
after a failure, the knowledge pillar cannot be trusted, and every answer that later cites a
duplicated or orphaned page inherits the lie. Also, when a very long source had to be cut down
to fit the model, I want the artifact to say so, the way condensation runs already do — not
pretend it read everything.

## Acceptance Criteria

- [ ] **AC1** — A digestion that fails at any step leaves the vault in a state where retrying produces
      exactly one source page — no `…-2` duplicates, no orphaned entity pages the protocol
      knows nothing about.
- [ ] **AC2** — Two sources digested into the same module concurrently both complete, and both of their
      chronicle entries are in `wiki/log.md` afterwards.
- [ ] **AC3** — Quitting the app while a digestion runs is handled the way a running maintenance run is:
      a warning, a way to let it finish or stop it — not a silent kill into a half-state.
- [ ] **AC4** — When chunk summaries were truncated to fit the merge prompt, the source page states that,
      the way condensation artifacts mark truncation.
- [ ] **AC5** — A digestion that takes many model calls reports progress; the bar does not sit at one
      value for minutes.
- [ ] **AC6** — A failed digestion says what failed on the job, distinguishable from "no model
      configured".
- [ ] **AC7** — Tests cover: failure after the source page is written + retry; two concurrent digestions
      into one module; the no-model path unchanged.

## Open Questions

None. Every detail decision is recorded under `## Decisions (Sprint)`.

## Decisions (Sprint)

- **D-a — Rollback, not "claim first".** The digestion keeps its current order (protocol
  last) and gets an in-process transaction that undoes what it wrote when a step throws;
  reason: "leaves no trace" is literally a rollback, and writing the protocol before the
  pages would make the badge lie in the opposite direction.
- **D-b — Rollback reuses `VaultStore.delete` + the gardener's undo step shape**
  (`src/core/gardener/undo.ts:49` `FixStep`, `:186` restore-if-hash-matches), extracted to
  `src/core/vault/rollback.ts`; reason: CLAUDE.md's "reuse instead of copying", and the
  "never rewrite a foreign line" rule is already solved there.
- **D-c — Belt and braces for a hard kill.** Besides the rollback, a retry reuses an
  existing _undigested_ source page whose frontmatter `raw` equals this raw path instead of
  letting `freeSlug` mint `…-2`; reason: a `SIGKILL` or power loss cannot run a rollback, and
  AC1 says "fails at any step".
- **D-d — Serialization is per module and covers only the write phase**, not the model
  calls; reason: AC2 requires both digestions to _complete_, so the expensive part must stay
  concurrent — only `index.md`, `log.md` and the protocol are serialized.
- **D-e — The chronicle keeps `expectedHash` plus a bounded retry (3 attempts)** even though
  the module lock already prevents the collision; reason: the gardener and a hand edit write
  the same file, and the lock is process-local.
- **D-f — `WikiStore` is widened to require `delete`** (`WikiTxStore`, mirroring
  `UndoStore extends WikiStore` at `src/core/gardener/undo.ts:40`); reason: `VaultStore` and
  `MemoryVaultStore` both satisfy it structurally, so no production caller and no fixture
  changes.
- **D-g — The truncation sentence is not re-worded.** `promptClampNotice()` is added to
  `src/core/condense/notice.ts` and used by both `projectTruncationNotice()` and the source
  page, keeping the marker `<!-- condense:truncation -->` and the existing wording
  ("… characters trimmed from what was shown to the model, to fit its input budget"); reason:
  sprint.md's "follow that wording" (stories 037/045) and one sentence, one place.
- **D-h — Progress moves the existing `IngestJob.progress` only.** No new field on the IPC
  wire, no "part 3 of 7" text; reason: AC5 asks that the bar not sit still, and a new job
  field would drag the typed-IPC contract and the renderer into a core story for no
  additional user-visible truth.
- **D-i — AC3 reuses `WorkRegistry` + `QuitDuringRunDialog` unchanged.** Nothing new is
  built; the story only closes the harness gap named in `tests/e2e/quit-during-run.spec.ts:5`
  with an env-gated delay seam, exactly the shape of `SB_E2E_STAGE_DELAY_MS`; reason:
  sprint.md's "not a third mechanism".
- **D-j — AC5 is proven one level down** (unit test on the progress callbacks) with the gap
  named in `### Acceptance tests`; reason: AC5 describes what the app _shows_, not a user
  action, and sprint.md grants the S14/S15 harness limit for held `running` states.
- **D-k — Failure reporting is generalized for 051/064.** `describeFailure` learns to read a
  `code` off any error that carries one, so `WikiError('conflict')` arrives on the job as
  `conflict` instead of `unknown`; reason: sprint.md — 051 and 064 build their honest-failure
  shape on this same terminal-state path.

## Plan

Six moves, in this order. Everything but the last touches `src/core/` only; `src/main/ipc/ingest.ts`,
the renderer's i18n and the e2e suite come in at the end (D7–D9).

1. **Undo step, shared** (`src/core/vault/rollback.ts`, new): the `{ path, before, hashAfter }`
   step type and `restoreSteps(store, steps)` — lifted out of `src/core/gardener/undo.ts:49,186`,
   which keeps its `FixStep` name as an alias and calls the shared helper.
2. **The transaction** (`src/core/wiki/transaction.ts`, new): a recorder wrapping the store.
   `create`/`write`/`writeText`/`append` delegate and record — created paths, and for existing
   files the content before plus the hash written. `rollback()` deletes what it created
   (`VaultStore.delete` → trash, undo token) and restores the rest in reverse, skipping any
   file whose hash moved on. `commit()` forgets. `WikiStore` gains `delete` as `WikiTxStore`
   (`src/core/wiki/types.ts`).
3. **`ingestSource` becomes a transaction** (`src/core/wiki/ingest.ts`): source page, entity
   pages (`apply-suggestions.ts`), `index.md`, `log.md`, `overview.md`, protocol — all through
   the recorder; any throw rolls back and rethrows. `markRawProtocol` stays last and gains
   `expectedHash` (`src/core/wiki/raw-protocol.ts`).
4. **Idempotent re-entry** (`src/core/wiki/ingest.ts`, `pages.ts`): before `createPage`, look
   for a source page in the module carrying `raw: <this rawPath>`; found → rewrite it in place
   with its hash, not `freeSlug`'s `…-2`. `freeSlug` itself is untouched.
5. **Serialization** (`src/core/wiki/module-lock.ts`, new): `withModuleLock(module, fn)`, a
   promise chain per module slug, wrapped around the write phase only (step 3, not
   `condenseSource`). `appendLog` gets `expectedHash` + a bounded re-read/retry
   (`src/core/wiki/log-md.ts`); the catalog's existing hash guard gets the same retry.
6. **Truncation, progress, failure**: `mergeSummariesClampedChars()` next to the 12k clamp
   (`src/core/llm/prompts/summarize-source.ts:166`, mirroring `promptItemsClampedChars` at
   `src/core/llm/prompts/condense-project.ts:132`) → `condenseSource` returns `clampedChars`
   → the notice line goes into the source page body. `WikiDeps.onProgress` is threaded from
   `condenseSource`'s chunk loop through `src/main/ipc/ingest.ts:202` into the queue's existing
   `onProgress`. `describeFailure` (`src/core/ingest/job.ts:63`) reads a `code` off any error
   that carries one.

Order matters: 1 → 2 → 3 → 4 → 5 are one dependency chain on `ingest.ts`; 6's three parts are
independent of each other and of 1–5.

## Deliverables

- **D1 — the shared undo step.** `src/core/vault/rollback.ts` (new) with `RollbackStep` and
  `restoreSteps(store, steps)`; re-export from `src/core/vault/index.ts`;
  `src/core/gardener/undo.ts` keeps `FixStep` as an alias and calls `restoreSteps`.
  Mirror: the existing loop at `src/core/gardener/undo.ts:186`.
  _Acceptance:_ `tests/core/gardener/undo.test.ts` passes unchanged; a new
  `tests/core/vault/rollback.test.ts` proves a step is restored on a matching hash and kept on
  a changed one.
- **D2 — `WikiTransaction`.** `src/core/wiki/transaction.ts` (new), `WikiTxStore` in
  `src/core/wiki/types.ts`, exports in `src/core/wiki/index.ts`. Plus its test in
  `tests/core/wiki/transaction.test.ts`.
  Mirror: `src/core/gardener/undo.ts:40` for the widened-store pattern.
  _Acceptance:_ recorded creates are gone after `rollback()`, recorded modifications are back
  to their old content, a file changed by someone else in between is left alone, `commit()`
  makes `rollback()` a no-op.
- **D3 — `ingestSource` runs inside the transaction.** `src/core/wiki/ingest.ts`,
  `src/core/wiki/apply-suggestions.ts`, `src/core/wiki/raw-protocol.ts` (`expectedHash`).
  Plus its test in `tests/core/wiki/ingest.test.ts`.
  _Acceptance:_ a store that throws on the `log.md` write leaves no source page, no entity
  page and no catalog entry behind; the protocol still says undigested; the thrown error
  reaches the caller.
- **D4 — retry writes exactly one source page.** `src/core/wiki/ingest.ts`,
  `src/core/wiki/pages.ts` (a `findSourcePageForRaw` helper next to `findPage`).
  Plus its test in `tests/core/wiki/ingest.test.ts`.
  _Acceptance:_ with a leftover source page for the same `raw` path (the hard-kill case), a
  second digestion rewrites that page — `…-2` never appears; `tests/core/wiki/pages.test.ts`
  passes unchanged.
- **D5 — one module at a time, no lost chronicle entry.** `src/core/wiki/module-lock.ts`
  (new), `src/core/wiki/ingest.ts`, `src/core/wiki/log-md.ts`, `src/core/wiki/index.ts`.
  Plus its test in `tests/core/wiki/concurrency.test.ts` (new).
  _Acceptance:_ two `ingestSource` calls into one module started without awaiting the first
  both resolve, and `wiki/log.md` holds both `## [<day>] ingest | …` headings; both catalog
  entries are present.
- **D6 — the source page says it was cut.** `src/core/llm/prompts/summarize-source.ts`
  (`MERGE_SUMMARIES_CHARS`, `mergeSummariesClampedChars`), `src/core/llm/prompts/index.ts`,
  `src/core/condense/notice.ts` (`promptClampNotice`), `src/core/condense/index.ts`,
  `src/core/wiki/summarize.ts` (`clampedChars` on the result), `src/core/wiki/ingest.ts`.
  Mirror: `promptItemsClampedChars` at `src/core/llm/prompts/condense-project.ts:132` and
  `projectTruncationNotice` at `src/core/condense/notice.ts:77`.
  Plus its tests in `tests/core/wiki/summarize.test.ts` (new) and
  `tests/core/wiki/prompts.test.ts`.
  _Acceptance:_ chunk summaries longer than 12,000 chars put one
  `<!-- condense:truncation -->` line with the existing sentence into the source page body;
  under the limit there is no line; `projectTruncationNotice`'s output is byte-identical to
  before.
- **D7 — the bar moves.** `src/core/wiki/types.ts` (`WikiDeps.onProgress`),
  `src/core/wiki/summarize.ts`, `src/core/wiki/ingest.ts`, `src/main/ipc/ingest.ts` (forward
  the queue's `onProgress` into `wikiDeps`). Plus its tests in
  `tests/core/wiki/summarize.test.ts` and `tests/main/ipc/ingest*.test.ts`.
  _Acceptance:_ a five-chunk source produces strictly increasing `progress` values across the
  summarizing phase and one more on the write phase; with one chunk nothing regresses.
- **D8 — a failed digestion names its failure.** `src/core/ingest/job.ts`
  (`describeFailure` reads a `code` off any carrier), `src/renderer/i18n/en.ts` +
  `src/renderer/i18n/de.ts` (any missing `error.code.*` key). Plus its tests in
  `tests/core/ingest/queue.test.ts` and `tests/renderer/i18n*.test.ts`.
  _Acceptance:_ a digestion failing with `WikiError('conflict')` puts `error: 'conflict'` and
  its message on the job, `awaiting-llm` is still its own non-error stage, and both German and
  English have a sentence for every code the job can carry.
- **D9 — quitting mid-digestion, through the real app.** `src/main/ipc/ingest.ts`
  (`SB_E2E_INGEST_DELAY_MS`, an env-gated pause between digestion phases — same shape and
  same guard as `SB_E2E_STAGE_DELAY_MS` in `src/main/ipc/gardener-run.ts`),
  `tests/e2e/fixtures/app.ts` (the option), `tests/e2e/quit-during-digestion.spec.ts` (new).
  Mirror: `tests/e2e/quit-during-run.spec.ts` verbatim in structure.
  _Acceptance:_ with the fake provider pinned, a text source is imported into a module, the
  window is closed while the digestion runs, `QuitDuringRunDialog` appears naming the import,
  "Cancel" leaves the digestion running and the window open, and "Stop and close" leaves no
  source page in the vault. The comment at `tests/e2e/quit-during-run.spec.ts:5` is updated —
  the import half of that gap is closed here.

## Model Hints

- `D2 → deliverable-hard` — the rollback has to distinguish "I created this" from "I changed
  this" from "someone else changed this since", across four different write methods; getting
  the last case wrong overwrites a user's own edit, the one thing CLAUDE.md forbids outright.
- `D3 → deliverable-hard` — `ingest.ts` writes through five collaborators
  (`apply-suggestions`, `index-md`, `log-md`, `pages`, `raw-protocol`); missing one write leaves
  exactly the half-state this story exists to remove, and 17 tests in
  `tests/core/wiki/ingest.test.ts` must stay green untouched.
- `D4 → deliverable-hard` — re-entry sits directly on `createPage`/`freeSlug`, whose collision
  behaviour 16 tests in `tests/core/wiki/pages.test.ts` pin down; the regression risk is
  silently reusing a _different_ source's page.
- `D5 → deliverable-hard` — a promise-chain lock around a phase that also throws and rolls
  back is where a deadlock or a lock never released would come from, and the queue runs at
  concurrency 2 in production.
- `D9 → deliverable-hard` — an env-gated timing seam plus a real close event in a Playwright
  `_electron` spec; the failure mode is a flaky gate for the next three sprints.
- D1, D6, D7, D8 → default. Each is a small, local change with an existing file to mirror.
- `Review: → story-review-hard` — the story rewrites the write path of the knowledge pillar
  under five existing suites; a reviewer that only reads the diff needs to reason about
  ordering and failure paths, not just style.

## Test Plan (manual acceptance)

No manual steps. Acceptance is the test suite (`.claude/ai-scrum.md`).

### Acceptance tests

- AC1 → unit `tests/core/wiki/transaction.test.ts` › "a digestion that fails after the source
  page leaves no page, no catalog entry and no chronicle line" (D2/D3) **and** unit
  `tests/core/wiki/ingest.test.ts` › "a retry after a failed digestion writes exactly one
  source page, never a …-2" (D4)
- AC2 → unit `tests/core/wiki/concurrency.test.ts` › "two sources digested into one module
  both complete and both chronicle entries survive" (D5)
- AC3 → e2e `tests/e2e/quit-during-digestion.spec.ts` › "closing the window during a digestion
  asks first, and stopping leaves no source page behind" (D9)
- AC4 → unit `tests/core/wiki/summarize.test.ts` › "a merge that had to be clamped says so on
  the source page" (D6), plus unit `tests/core/wiki/prompts.test.ts` › "mergeSummariesClampedChars
  counts only what the clamp actually dropped" (D6)
- AC5 → unit `tests/core/wiki/summarize.test.ts` › "a multi-chunk digestion reports progress
  on every model call" **and** `tests/main/ipc/ingest.test.ts` › "the queue's onProgress
  reaches the wiki digestion" (D7).
  _Named gap:_ no e2e assertion on the moving bar. The e2e vault's fake provider answers
  instantly, so holding a digestion at two distinct progress values long enough for a
  Playwright poll would need a second timing seam per phase — the S14/S15 harness limit
  sprint.md records. D9's spec observes the running import, not its percentage. Listed in the
  sprint review.
- AC6 → unit `tests/core/ingest/queue.test.ts` › "a digestion that fails with a conflict
  reports conflict, not unknown" **and** `tests/core/ingest/queue.test.ts` › "without a model
  the job still ends as awaiting-llm, not as an error" (D8)
- AC7 → covered by the tests above: failure-after-source-page + retry (AC1's two lines), two
  concurrent digestions (AC2's line), and the no-model path (AC6's second line, plus
  `tests/core/wiki/ingest.test.ts`'s existing "ohne Modell" cases, which stay green unchanged).

## Done
