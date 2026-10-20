---
id: 051
title: A video without a transcript is an honest failure
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.1-2](../reviews/2026-09-03-architecture-review.md)),
P0. Evidence: `renderProseTranscript` with zero cues still emits frontmatter plus
`_Kein Transcript verfuegbar._` (`src/core/ingest/youtube/transcript.ts:198`), which becomes
`outcome.text` (`src/core/ingest/youtube/ingestor.ts:144`), so the empty-text guard at
`src/core/ingest/queue.ts:276` never fires and the model condenses a placeholder. The video's
description and chapters in `metadata.md` are never passed to digestion.

## Requirement

When I ingest a YouTube video that has no transcript — a music video, a stream, an uncaptioned
upload — the app today writes a source page anyway: the model condenses the placeholder line
"Kein Transcript verfuegbar" into a hollow page, and later answers can cite it as if it were
knowledge. That is exactly the guessing guardrail 3 forbids, happening at the entrance instead
of the exit.

A transcript-less video should be a visible, honest state on the source: "no transcript, not
digested", with the metadata that does exist (title, description, chapters) preserved in `raw/`
as it already is. Whether the description alone is worth digesting is a decision I want to make
per source, not one the app makes for me by silently treating a placeholder as content.

## Acceptance Criteria

- [x] **AC1** — Ingesting a video without a transcript never produces a source page from placeholder
      text. The job ends in a state that names the reason (no transcript), distinct from "no
      model configured" and from an error.
- [x] **AC2** — The raw folder still keeps everything that was fetched (metadata, description, chapters)
      — nothing already saved is lost.
- [x] **AC3** — The source row offers an explicit choice to digest from the description/metadata anyway,
      and a page created that way says what it was built from.
- [x] **AC4** — The "undigested" filter and the gardener's unprocessed-source check both see such a
      source honestly.
- [x] **AC5** — Existing hollow source pages are not rewritten by this story; only new ingests change
      behaviour.
- [x] **AC6** — Tests cover: no-transcript video with and without a model; the explicit
      digest-from-metadata path.

## Open Questions

_None. Every detail decision taken during refine is recorded under `## Decisions (Sprint)`._

## Decisions (Sprint)

- **A new terminal stage `no-content`, not a reused `awaiting-llm`.** AC1 demands a state
  distinct from "no model configured" and from an error, and `awaiting-llm` already means
  "a model would finish this" — which is false here.
- **The reason travels as an `IngestNoteCode` in `job.message`** (`no-transcript` here, a
  generic `no-content` as fallback), so 064 can name its own three reasons in the same shape
  instead of inventing a second terminal state.
- **Empty text beats "no model".** In the guard at `queue.ts:276` the empty-source branch is
  checked first: a model can never turn an empty source into content, so claiming it waits
  for one would be dishonest.
- **`transcript.md` keeps its `_Kein Transcript verfuegbar._` placeholder file**; only
  `outcome.text` becomes empty. AC2 forbids losing what was written, and the file's frontmatter
  (`cue_count: 0`) is the honest record.
- **The reason is derived from `.ingest.json`, not re-read from the placeholder text.** The log
  already carries `transcript.available` (`youtube/writer.ts:244`), so the index needs no
  content sniffing.
- **`RawSource` gains `blocked: SourceBlockReason | null`** rather than a youtube-specific flag —
  064 fills the same field with its own reason codes.
- **The digest-from-metadata path is an explicit click, never a fallback.** Guardrail 2: the app
  offers the choice on the row and states the basis; it never silently digests a description.
  The gardener's `unprocessed-source` fix therefore stays `open-ingest` with no auto-fix.
- **`ingest:condense` gains `basis?: 'transcript' | 'metadata'` (default `transcript`)** instead
  of a second channel — the duplicate/running-job guards in the existing handler apply unchanged.
- **The basis is written twice on the page**: frontmatter `source_basis: metadata` plus a
  sentence from `wiki/text.ts` `phrases()` in the body, mirroring how `condensed: false` and
  `notCondensed` already pair up.
- **`no-content` is not retryable in the job list.** The raw source is filed and the outcome is
  cached, so a retry would end in the same state; a re-fetch is a fresh ingest from the inbox.
- **AC1's terminal state is not e2e-covered — named gap, not a downgrade.** A real ingest needs
  the network, which the e2e harness forbids by design (`tests/e2e/fixtures/app.ts:46`). What
  the user sees _because of_ that state (AC3, AC4) is e2e-covered through a seeded
  transcript-less video in the demo vault.
- **The transcript-less video is seeded into the demo vault** rather than written by a new e2e
  fixture seam: the seeder already builds `raw/youtube/…` (`scripts/seed/raw-youtube.mjs`) and
  the screenshots gain the state too.
- **The e2e digest-from-description run uses the `fakeProvider` seam** (073, D1) so the created
  page's basis can be asserted on disk; the no-model half of AC6 stays a queue unit test.

## Plan

Root cause first, then the honest state, then the choice, then the surfaces.

1. **Terminal state** — `IngestStage` gains `'no-content'` (`src/shared/types/knowledge.ts:180`),
   added to `TERMINAL_STAGES` (`src/core/ingest/job.ts:12`) and the renderer's `TERMINAL`
   (`src/renderer/lib/jobs.ts:10`). `IngestNoteCode` gains `'no-content'`
   (`src/core/ingest/types.ts:41`). The guard at `src/core/ingest/queue.ts:276` splits: empty
   `outcome.text` → `stage: 'no-content'` with the reason code in `message`; missing
   step/model → `awaiting-llm` as before. Shape needed from 050: a terminal stage that is
   neither `error` nor `awaiting-llm`, carrying a machine-readable reason. **Build order 050 →
   051:** if 050 has already introduced such a stage, reuse it and only add the reason code —
   do not add a second mechanism.
2. **The empty text** — `writeYoutubeSource` returns `text: ''` when there are no cues
   (`youtube/writer.ts:249`); the placeholder file stays written. The two rehydration paths get
   the same truth: `reuseExisting` (`youtube/ingestor.ts:67`) and `readableText`
   (`ingest/existing.ts:31`) return `''` when the log says `transcript.available !== true`.
3. **Honest visibility** — `RawSource.blocked` (`src/shared/types/knowledge.ts:51`), derived in
   `deriveSources` (`src/core/index/pages.ts:238`) from the log. `unprocessedSourceCheck`
   (`src/core/gardener/checks/unprocessed-source.ts:26`) passes the reason to
   `ctx.labels.unprocessedSource(title, reason)` (`core/gardener/labels.ts:54`,
   `src/main/gardener-labels.ts:109`); fix stays `open-ingest`.
4. **The explicit choice** — `loadExistingOutcome(store, rawPath, { basis })`
   (`ingest/existing.ts:39`) reads `metadata.md`'s body for `basis: 'metadata'`.
   `IngestSourceInput.basis` (`core/wiki/ingest.ts:47`) puts `source_basis` into the page's
   frontmatter and a `phrases()` sentence (`core/wiki/text.ts`) into `sourceBody`.
   `ingest:condense` (`src/shared/ipc.ts:706`, handler `src/main/ipc/ingest.ts:385`) carries
   `basis` through to `queue.addExisting`.
5. **The surfaces** — `SourceRow` shows the reason badge and, for a blocked source, a
   "digest from description" button next to the module select
   (`src/renderer/screens/sources/SourceRow.tsx:86`), wired through `SourcesTab.tsx`;
   `JobList` gets a `no-content` block in the spirit of its `awaiting-llm` one
   (`JobList.tsx:132`), `no-content` in `NOTE_CODES`, and no retry. i18n keys in
   `de.ts`/`en.ts` (`ingest.note.*`) and `de-wiki.ts`/`en-wiki.ts` (`sources.stage.*`).
6. **Seed + e2e** — `scripts/seed/raw-youtube.mjs` seeds a second, transcript-less video; the
   new spec drives the row through the real app.

No migration: nothing rewrites existing pages (AC5).

## Deliverables

- **D1 — the honest terminal state in the queue.** `'no-content'` in `IngestStage` +
  `TERMINAL_STAGES` + `IngestNoteCode`, and the split guard in `queue.ts:273-284` (empty text
  before no-model, reason code from `outcome.notes`, preferring `no-transcript`).
  Files: `src/shared/types/knowledge.ts`, `src/core/ingest/types.ts`, `src/core/ingest/job.ts`,
  `src/core/ingest/queue.ts`, `src/renderer/lib/jobs.ts`. Plus its tests in
  `tests/core/ingest/queue.test.ts` (empty text with a model available; empty text with
  `llmAvailable: () => false`; existing `awaiting-llm` cases stay green).
  Acceptance: an outcome with empty text ends `no-content` with `message: 'no-transcript'`,
  never `awaiting-llm`.
- **D2 — a transcript-less video yields no digestible text.** `text: ''` when `cues.length === 0`
  in `writeYoutubeSource`; `reuseExisting` and `readableText` honour `log.transcript.available`.
  Files: `src/core/ingest/youtube/writer.ts`, `src/core/ingest/youtube/ingestor.ts`,
  `src/core/ingest/existing.ts`. Plus its tests in `tests/core/ingest/youtube.test.ts` (mirror
  the existing no-transcript case at line ~194) and `tests/core/ingest/raw.test.ts`/
  `ingestors.test.ts` for the rehydration paths.
  Acceptance: all raw files still written (metadata.md with description + chapters,
  transcript.md with the placeholder), `outcome.text === ''`, and a second run over the existing
  folder returns `''` too.
- **D3 — index and gardener see the reason.** `RawSource.blocked`, derived in `deriveSources`;
  `unprocessedSourceCheck` names it. Files: `src/shared/types/knowledge.ts`,
  `src/core/index/pages.ts`, `src/core/gardener/checks/unprocessed-source.ts`,
  `src/core/gardener/labels.ts`, `src/main/gardener-labels.ts`. Plus its tests in
  `tests/core/index/pages.test.ts` and `tests/core/gardener/checks-vault.test.ts`.
  Acceptance: a log with `transcript.available: false` → `blocked: 'no-transcript'`; a legacy
  log without a `transcript` field → `blocked: null`; the finding's detail names the reason and
  the fix is still `open-ingest`.
- **D4 — digest from description, in core.** `loadExistingOutcome(…, { basis })` reads
  `metadata.md`'s body (frontmatter stripped) for youtube; `IngestSourceInput.basis` writes
  `source_basis` into the frontmatter and the basis sentence into the body.
  Files: `src/core/ingest/existing.ts`, `src/core/wiki/ingest.ts`, `src/core/wiki/text.ts`.
  Mirror: how `condensed: false` and `phrases().notCondensed` pair up (`wiki/ingest.ts:78,168`).
  Plus its tests in `tests/core/wiki/ingest.test.ts` (fake provider: the page says what it was
  built from) and `tests/core/ingest/ingestors.test.ts` (metadata basis text).
  Acceptance: a page condensed with `basis: 'metadata'` carries `source_basis: metadata` and one
  visible sentence naming the basis; `basis: 'transcript'` is byte-identical to today.
- **D5 — the choice reaches the core through IPC.** `basis?: 'transcript' | 'metadata'` on
  `ingest:condense`, passed through the handler; empty metadata text is rejected with `invalid`
  instead of starting a hollow job. Files: `src/shared/ipc.ts`, `src/main/ipc/ingest.ts`,
  `src/renderer/lib/queries/ingest.ts`. Plus its tests in `tests/main/condense-ipc.test.ts`
  (and `ingest-ipc.test.ts` if the channel shape is asserted there).
  Acceptance: the existing duplicate/running-job guards are unchanged; a call without `basis`
  behaves exactly as before.
- **D6 — the row and the job say it.** Reason badge plus "digest from description" button in
  `SourceRow` (only when `blocked !== null`), wiring in `SourcesTab`, the `no-content` block in
  `JobList` (`no-content` in `NOTE_CODES`, no retry), and the keys.
  Files: `src/renderer/screens/sources/SourceRow.tsx`, `SourcesTab.tsx`, `JobList.tsx`,
  `src/renderer/i18n/de.ts`, `en.ts`, `de-wiki.ts`, `en-wiki.ts`. Mirror: the `awaiting-llm`
  block at `JobList.tsx:132-158`. Plus its tests in `tests/renderer/sources.test.tsx`.
  Acceptance: sentence case, tokens only, German quotes `„…“`; a blocked row shows the reason
  and the alternative action, an ordinary uncondensed row is unchanged.
- **D7 — a transcript-less video in the demo vault, and the e2e spec.** Seed a second video with
  `transcript_available: false`, no `transcript.timestamped.md` and the placeholder
  `transcript.md`; then drive it. Files: `scripts/seed/raw-youtube.mjs`, `scripts/seed/check.mjs`
  (if it validates the raw folders), `tests/e2e/source-no-transcript.spec.ts`. Mirror:
  `tests/e2e/gardener-run-cross-screen.spec.ts` (gardener run through the UI) and
  `tests/e2e/import-task.spec.ts` (sources tab navigation); use `test.use({ fakeProvider: … })`
  from `tests/e2e/fixtures/app.ts`.
  Acceptance: `npm run seed` green, the spec green, and `npm run shot` still produces the
  sources screen.

## Model Hints

- D1 → `deliverable-hard` — it changes the queue's terminal-state handling that story 050
  rewrites in the same sprint and 064 reuses afterwards, under existing `queue.test.ts` cases
  that must stay green without being weakened.
- D2–D7 → default tier.
- Review: → `story-review-hard` — the story defines the failure shape 064 inherits and touches
  guardrail 3 at the entrance; a wrong-but-green result here is inherited by two more stories.

## Test Plan (manual acceptance)

### Acceptance tests

- AC1 → unit `tests/core/ingest/queue.test.ts` › "endet eine Quelle ohne Text als no-content,
  nicht als awaiting-llm", "gewinnt no-content gegen ein fehlendes Modell", "nennt ohne jeden
  Hinweis den allgemeinen Grund no-content", and the updated "meldet ohne Text den Hinweis der
  Quelle statt einer Verdichtung" (now asserting `no-content`, message `pdf-not-read`).
  **Named gap (e2e):** the terminal state itself cannot be reached through the real surface —
  a live ingest needs the network, which the e2e harness forbids by design
  (`tests/e2e/fixtures/app.ts:46` fails any non-`file://` request, and CLAUDE.md forbids
  network in tests). What the user sees because of that state is e2e-covered in AC3/AC4.
- AC2 → unit `tests/core/ingest/youtube.test.ts` (no-transcript case, now asserting the
  description/chapters text itself survives in `metadata.md`/`metadata.json`, not just file
  existence) + `tests/core/ingest/raw.test.ts` (rehydration returns `''` for a blocked log).
- AC3 → e2e `tests/e2e/source-no-transcript.spec.ts` › "a video without a transcript is digested
  from its description only on request" — the row offers the action, the click creates the page,
  and `vault.frontmatter(...)` shows `source_basis: metadata` with the basis sentence in the body.
  Unit backing: `tests/core/wiki/ingest.test.ts` › "a page built from metadata says so".
- AC4 → e2e `tests/e2e/source-no-transcript.spec.ts` › "the undigested filter and the maintenance
  run both name the missing transcript". Unit backing:
  `tests/core/gardener/checks-vault.test.ts` › "an unprocessed source names why it is blocked"
  and `tests/core/index/pages.test.ts` › "a log without a transcript is derived as blocked".
- AC5 → unit `tests/core/index/pages.test.ts` › "bleibt bei einem legacy-Protokoll ohne
  transcript-Feld unblockiert" (legacy log → `blocked: null`), plus e2e
  `source-no-transcript.spec.ts` › "the maintenance run does not touch an unrelated,
  already-condensed source page" using `vault.snapshot(...)` before/after.
  **Named gap:** the demo vault seeds no pre-existing *hollow* page (one condensed from the old
  buggy placeholder-text behaviour before this story existed), so the e2e test cannot assert
  byte-identity on that exact artifact — it proves the maintenance run leaves an unrelated,
  already-condensed page untouched instead, plus the structural fact that no deliverable in this
  story writes to `modules/*/wiki/**` at all (verified in code review). The legacy-log half of
  AC5 is fully unit-covered.
- AC6 → covered by the above: with a model = e2e `fakeProvider` run (test 4) +
  `tests/core/wiki/ingest.test.ts` › "a page built from metadata says so"; without a model =
  `tests/core/ingest/queue.test.ts` (no-content wins over a missing model) and the e2e spec's
  "with no model configured, digesting from the description ends honestly as awaiting-llm";
  digest-from-metadata path = `tests/core/ingest/ingestors.test.ts` (metadata basis text) +
  `tests/main/ingest-ipc.test.ts` (IPC `basis` plumbing, empty-metadata `invalid` rejection) +
  AC3's e2e.

### Coverage gate

| AC  | Deliverable    | Proof                                                       |
| --- | -------------- | ----------------------------------------------------------- |
| AC1 | D1, D2         | queue unit tests (e2e gap named above)                      |
| AC2 | D2, D7         | youtube unit test + e2e vault assertion                     |
| AC3 | D4, D5, D6, D7 | e2e spec + wiki ingest unit test                            |
| AC4 | D3, D6, D7     | e2e spec + gardener/index unit tests                        |
| AC5 | (no migration) | index legacy-log unit test + e2e snapshot                   |
| AC6 | D1, D4, D7     | fake-provider e2e, no-model queue test, metadata-basis test |

## Done

A transcript-less YouTube video no longer becomes a hollow condensed page. The queue gained a
new terminal stage `no-content` (checked before "no model configured", so an empty source is
never mistaken for one merely waiting on a model). `writeYoutubeSource`, `reuseExisting` and
`readableText` now return `''` for the source text when there are no cues, while `metadata.md`
(description, chapters), `transcript.md` (the placeholder file) and `.ingest.json`
(`transcript.available: false`) are still written/read unchanged. `RawSource.blocked` surfaces
the reason on the source row and in the gardener's unprocessed-source finding (fix stays
`open-ingest`, no auto-fix). A new, explicit "digest from description" action
(`basis: 'metadata'` on `ingest:condense`) lets the user opt in per source; the resulting page
carries `source_basis: metadata` plus a sentence naming the basis, and is never produced
automatically. A second, transcript-less video was seeded into the demo vault and a new e2e
spec drives the whole surface through the real app.

**Commit message:**

```
051: a video without a transcript is an honest failure
```

**Verification:**

- `npm run format:check` — green.
- `npm run lint` — green.
- `npm run typecheck` — green (node + web).
- `npm test` — green, 3934/3934 (287 files).
- `npm run build` — green.
- `npm run test:e2e` — green, 51/51 (includes the new `tests/e2e/source-no-transcript.spec.ts`,
  4/4).
- `npm run seed` — green (the seeded blocked source shows as the demo vault's 2nd unprocessed
  source, matching `scripts/seed/check.mjs`'s expectation).
- Code review (clean agent, `story-review-hard` tier): **PASS**, with 9 non-blocking findings.
  5 were fixed in review-fix round 1 (see below); 4 were judged acceptable to leave as named,
  low-reach gaps rather than expanding this story's scope into 064's territory:
  - `basis: 'metadata'` is only ever set from the user's click in `SourcesTab.tsx` — never
    defaulted or auto-triggered anywhere in the queue/condense path (guardrail 2 verified by
    the reviewer via a repo-wide grep).
  - A non-youtube source could in principle be condensed with `basis: 'metadata'` and get a
    `source_basis: metadata` frontmatter/sentence pair that doesn't match its real content —
    unreachable today because the UI only offers the button when `blocked !== null`, which only
    a youtube log ever sets. Left for 064, which extends `blocked`/`SourceBlockReason` to other
    reasons and will need to decide the non-youtube shape of this path anyway.
  - A youtube log missing the `transcript` field entirely (hand-edited or foreign log, not
    something any ingestor writes) yields `text: ''` (blocked by the strict check in
    `existing.ts`/`ingestor.ts`) but `blocked: null` (the lenient check in `pages.ts`, correct
    per AC5's "legacy log stays unblocked" requirement) — a low-reach inconsistency between two
    intentionally different strictness levels, not a data-loss or hallucination risk.
  - `noContentReason`'s fallback (`queue.ts`) picks the first note code when there's no
    `no-transcript` note; currently always correct for youtube/PDF sources, a latent honesty
    gap only for a future ingest kind with multiple simultaneous notes.
- Review-fix round 1 (fixed): AC2's unit test now asserts the description/chapters text itself
  survives in `metadata.md`/`metadata.json`, not just file existence; `main/ipc/source-detail.ts`
  reuses the shared `blockedReasonOf` from `core/index/pages.ts` instead of a duplicated
  ternary; `core/index/pages.ts` imports `isTranscriptAvailable` directly from
  `core/ingest/youtube/writer` instead of the whole `@core/ingest` barrel; two German comments
  in `scripts/seed/raw-youtube.mjs` had a straight `"` closer instead of `„…"`, fixed; the AC5
  e2e test was renamed and re-documented to state what it actually proves (see the AC5 named
  gap above) rather than a claim it couldn't back up.

**Decisions (implementation):**

- Story 050's `describeFailure`/error-code mechanism was left untouched — it is for thrown
  errors, not the terminal-*stage* this story adds. `no-content` is a genuinely new addition to
  `IngestStage`/`TERMINAL_STAGES`/`IngestNoteCode`, exactly as the refine plan called for; no
  parallel mechanism was invented.
- `RawSource.blocked` and `SourceBlockReason` were added as a plain extensible string union with
  only `'no-transcript'` as a member for now, per the story's decision that 064 fills the same
  field with its own reason codes.
- `basis` threads through as an optional field on `IngestJob`/`AddJobInput` (not a second IPC
  channel), defaulting to `'transcript'` everywhere, so the existing transcript path stays
  byte-identical.

**Acceptance criteria:** AC1-AC6 all met — see the `## Acceptance Tests` section above for the
exact test names, including the two named gaps (AC1's terminal state itself is not e2e-reachable
without live network; AC5's e2e proof covers the structural guarantee and an unrelated page
rather than a specific old hollow artifact the seed does not carry). Both gaps were called out
in refine before implementation began and are not new.
