---
id: 027
title: The maintenance run state stops being one big file
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

This story has no visible effect. It exists because the two files that carry the maintenance
run have grown past the point where the next change to them is safe:

- [src/main/gardener-state.ts](../../src/main/gardener-state.ts) — 788 lines
- [src/main/ipc/gardener.ts](../../src/main/ipc/gardener.ts) — 409 lines

The soft limit in CLAUDE.md is ~300. Both were already flagged as over it under M4, reviewed as
"still single-responsibility", and then grew further through M7 (021a progress ownership, 021b
stop/continue persistence, 021c scoped runs). Three of the four bugs a review found in 021b and
021c were in exactly this state handling — a partial run reporting a computed score, `closeVault()`
not cancelling, resume clearing a fixed finding, and a scope naming only an unmodeled kind
deleting prior findings. That is the signature of a file that holds more state than one reader
can keep in their head.

The reason this matters to me and not only to the code: the maintenance run is the one place in
the app that writes findings, freezes a health score and survives being stopped. When that state
is wrong, I lose findings — silently. The last two stories in that file each shipped a
silent-data-loss bug that review caught. I would rather the next one be harder to write.

Nothing about how a run behaves may change. This is a split, not a redesign.

## Acceptance Criteria

- [x] A maintenance run behaves exactly as it does today: start, progress from any screen, stop
      and keep findings, continue, scope to a kind or module, autorun, cancel on vault close.
- [x] No file involved is over the ~300-line soft limit afterwards, and each one can be named in
      a single sentence.
- [x] The existing tests for 021a/021b/021c pass unchanged — they are the specification of the
      behaviour being preserved. No test is rewritten to fit a new structure.
- [x] The IPC contract is untouched: same channels, same payloads, same events.
- [x] What each new file owns is written down, so the next feature knows where it goes.

## Open Questions

1. ~~**Where do the seams actually run?**~~ answered → Decisions (Sprint)
2. ~~**Does any of this belong in `src/core/` instead of `src/main/`?**~~ answered → Decisions (Sprint)
3. ~~**Is a behaviour-preservation guard needed before the split?**~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Does any of this belong in `src/core/` instead of `src/main/`: yes. Pure run-state
  logic (no Electron dependency) moves to `src/core/gardener/`; only the Electron-facing glue
  stays in `src/main/`. Larger diff accepted in exchange for testability and matching CLAUDE.md's
  "core knows nothing about Electron" guardrail.
- **Seams in `gardener-state.ts` (Q1): five, read off the code** — the scope and completeness
  predicates (`narrowedScope`/`inScope`/`scopeAdmits`/`isRunComplete`), the stored shapes, JSON
  reading and validation, the save-time merge and pruning (`mergeScoped`/`keptFixed`/
  `outlivesRun`/`rederivedBy`/`consideredBy`), and `present()`. Reason: those five groups already
  reference each other in one direction only, so every cut is an extraction, not a redesign.
- **Seams in `ipc/gardener.ts` (Q1): two** — the run-lifecycle flow (slot, cancel reason, save,
  report) and the fix/orphan action helpers. Reason: they are the only two blocks in the file
  longer than a handler body, and each is already reachable through a single entry point.
- **No characterisation test before the split (Q3).** Reason: `tests/main/gardener-state.test.ts`
  (27 cases over save/present/scope/merge, all through `GardenerState`'s public surface) plus
  `tests/main/gardener-ipc.test.ts` already are that guard, and the split keeps that surface.
- **`gardener-state.ts` keeps its exported names** (`GardenerState`, `GARDENER_STATE_FILE`,
  `GARDENER_STATE_VERSION`, and `type StoredRun` re-exported from core). Reason: AC 3 forbids
  rewriting a test to fit the new structure, and an import-path edit in the test files would be
  exactly that.
- **`ipc/gardener.ts` keeps one handler map**; only handler bodies move to sibling files. Reason:
  the project's own precedent (`journal.ts`/`journal-day.ts`, `areas.ts`/`area-note.ts`), and it
  leaves `register-all.ts` and the IPC coverage test untouched — AC 4.
- **`ipc/gardener-deps.ts` (635 lines) is out of scope**, apart from the import lines it has to
  follow. Reason: the Requirement names two files and their sizes; `runWithProgress` is run
  orchestration, not run state, and folding it in would double the sprint's largest diff (worth a
  follow-up story).
- **Ownership is written down in the files plus `docs/ARCHITECTURE.md`** (AC 5). Reason: a header
  comment is where the next feature actually looks, the core responsibility table is where someone
  looking for the layer looks; both are existing conventions here.

## Plan

Pure logic out of `src/main/gardener-state.ts` into `src/core/gardener/`, behaviour identical, the
existing tests as the only spec. Then the two long blocks out of `ipc/gardener.ts`.

1. **Core, five new files** (`src/core/gardener/`), exported through `index.ts`:
   - `run-record.ts` — `StoredRun`, `FixedFinding`, `StoredGardener`, `empty()`
   - `run-scope.ts` — `narrowedScope`, `inScope`, `scopeAdmits`, `isRunComplete`
   - `run-read.ts` — `readStoredGardener()` and every validator below it
   - `run-merge.ts` — `applySavedRun()` over `mergeScoped`/`keptFixed`/`outlivesRun`
   - `run-present.ts` — `presentRun()` (today's `present()` body)
2. **`src/main/gardener-state.ts` shrinks to the glue**: file path, `readJson`/`writeJsonAtomic`,
   the per-vault instance cache, the small mutators (`dismiss`, `snooze`, `markFixed`, …), and
   delegation into the core functions. It keeps its exported names.
3. **Call sites follow**: `ipc/gardener-deps.ts` and `ipc/gardener.ts` import the predicates from
   `@core/gardener` instead of `../gardener-state` (import lines only).
4. **`src/main/ipc/gardener.ts` splits**: `ipc/gardener-run.ts` (the `gardener:run` flow) and
   `ipc/gardener-actions.ts` (`findingOf`, `recordedHash`, `assertActionable`, `orphanPick`, the
   `linkOrphan` apply). The handler map itself stays in `gardener.ts`.
5. **Write down who owns what**: header comment per new file, the `gardener/` row in
   `docs/ARCHITECTURE.md`, the module list in `src/core/gardener/index.ts`.

Order matters: every step ends with `npm test` green and no test file edited. Steps 1-2 run in four
passes (D1-D4) so a regression is bisectable to one seam.

## Deliverables

- [x] **D1 — scope predicates and stored shapes to core.** New `src/core/gardener/run-record.ts` and
  `run-scope.ts` (moved verbatim from `gardener-state.ts`, comments included), exported from
  `src/core/gardener/index.ts`. `src/main/gardener-state.ts` imports them and re-exports
  `type StoredRun`; `src/main/ipc/gardener-deps.ts` and `src/main/ipc/gardener.ts` take
  `narrowedScope`/`inScope`/`scopeAdmits`/`isRunComplete` from `@core/gardener`.
  _Accept:_ `npm run typecheck && npm test` green, nothing under `tests/` changed.
  _Files:_ 5. _Mirror:_ `src/core/gardener/progress.ts` (pure, `@shared/types` only).
- [x] **D2 — JSON reading to core.** New `src/core/gardener/run-read.ts` with
  `readStoredGardener(value): StoredGardener` plus every validator (`isFinding`, `readDays`,
  `readStageIds`, `readHealthAsOf`, `readScope`, `readCheckedKinds`, `readFixed`, `readRun`).
  `GardenerState.load` keeps only: read the file, hand the parsed value over, prune snoozes.
  _Accept:_ the "unreadable file → null", "file without `snoozed`", "unknown kinds dropped" and
  "scope that narrows nothing" tests pass unchanged. _Files:_ 3.
- [x] **D3 — save-time merge and pruning to core.** New `src/core/gardener/run-merge.ts` with
  `applySavedRun(data, run, options): StoredGardener` over `mergeScoped`, `keptFixed`,
  `outlivesRun`, `rederivedBy`, `consideredBy`. `GardenerState.save` becomes: apply, then write.
  _Accept:_ every 021b/021c merge test passes unchanged, including "deletes no kind no stage of
  this run looked for" and "keeps a fixed finding outside the scope". _Files:_ 3.
- [x] **D4 — `present()` to core.** New `src/core/gardener/run-present.ts` with
  `presentRun(data, today, resolved): GardenerReport | null`; the method delegates.
  _Accept:_ frozen-score, `healthKnown: false` and scope/`checkedKinds` tests pass unchanged;
  `src/main/gardener-state.ts` is under 300 lines. _Files:_ 3.
- [x] **D5 — run flow out of the channel file.** New `src/main/ipc/gardener-run.ts` holding the
  `gardener:run` body (slot claim, resume/scope inheritance, cancel reason, save, report) as one
  exported function; the handler in `ipc/gardener.ts` calls it.
  _Accept:_ `tests/main/gardener-ipc.test.ts` passes unchanged, the `IPC_CHANNELS` coverage test
  is green. _Files:_ 2. _Mirror:_ `src/main/ipc/journal-day.ts`.
- [x] **D6 — fix and orphan helpers out of the channel file.** New `src/main/ipc/gardener-actions.ts`
  with `findingOf`, `recordedHash`, `assertActionable`, `orphanPick` and the `linkOrphan` apply
  step. _Accept:_ tests unchanged and green; `src/main/ipc/gardener.ts` under 300 lines.
  _Files:_ 2. _Mirror:_ `src/main/ipc/area-note.ts`.
- [x] **D7 — ownership written down.** A one-sentence header per new file, the `gardener/` row in
  `docs/ARCHITECTURE.md` extended by the five run-state modules and the two new main-side files,
  the module list in `src/core/gardener/index.ts` extended. _Accept:_ `wc -l` over every file this
  story created or touched is ≤ 300 (`ipc/gardener-deps.ts` excepted, see Decisions) and
  `npm run verify` is green. _Files:_ ~3.

Coverage: AC 1 → D1-D6 (behaviour carried by the unchanged 021 tests, confirmed by the manual run
below), AC 2 → D4, D6, D7, AC 3 → every D (its acceptance is "tests unchanged and green"),
AC 4 → D5 (handler map and `register-all.ts` untouched, coverage test green), AC 5 → D7.

## Model Hints

- D3 → `deliverable-hard` — the merge and pruning code is where 021b and 021c each shipped a
  silent-data-loss bug (`rederivedBy` vs. the raw scope, `keptFixed`); folding five interdependent
  predicates into one reducer without changing which finding survives is the story's one real
  regression risk.
- D1, D2, D4, D5, D6, D7 → default.
- Review: → `story-review-hard` — the whole story is "prove nothing changed" over the app's most
  bug-prone state; the reviewer has to compare semantics across a moved diff, not read prose.

## Test Plan (manual acceptance)

The story has no UI of its own; the run has to look identical from the screen (sprint S07 note).
After `npm run verify` and `npm run seed`:

1. Open the demo vault, go to maintenance, start a run — progress appears and stays visible when
   switching to another screen and back.
2. Stop mid-run: the findings so far are kept, the report says it is incomplete, and the health
   score shown is the frozen one with its own date, not a number from the part-run.
3. Continue: it finishes without redoing the stages already done, and no dismissal or snooze
   disappears.
4. Scope a run to one finding kind, then to one module: only that slice changes, the advice text
   stays, findings outside it survive.
5. Close the vault while a run is going: the run ends and the report on file is the one from
   before — unchanged.

## Done

**Summary.** Split `src/main/gardener-state.ts` (788 → 226 lines) and `src/main/ipc/gardener.ts`
(409 → 200 lines) along the seams the story named. Five pure modules moved into
`src/core/gardener/`: `run-record.ts`, `run-scope.ts`, `run-read.ts`, `run-merge.ts`,
`run-present.ts`. Two Electron-facing files moved into `src/main/ipc/`: `gardener-run.ts`,
`gardener-actions.ts`. `gardener-state.ts` and `ipc/gardener.ts` keep their exported names and
their handler map respectively, now delegating into the new modules. Ownership written down in
each new file's header, in `docs/ARCHITECTURE.md`, and in `src/core/gardener/index.ts`'s module
list.

**Decisions.**
- D3 (save-time merge/pruning) was built and reviewed line-by-line against the pre-diff code —
  `mergeScoped`/`keptFixed`/`outlivesRun`/`rederivedBy`/`consideredBy` behind `applySavedRun` are
  verbatim, including the exact order (`previous` captured before `run` replaces it, `fixed`
  gated on `checksReran !== false`, pruning only on `isRunComplete`).
- `docs/ARCHITECTURE.md`'s `gardener/` responsibility table needed re-padding after the new,
  much longer cell — the table itself, not just line endings, was genuinely un-prettified
  (`npx prettier --write` on just that file; diff confirms only whitespace re-padding, no
  content change beyond the intended addition).
- The new comment block added to `src/core/gardener/index.ts`'s module list is in German, to
  match this file's own pre-existing all-German header. This one file already carried a German
  overview comment before this story touched it; matching it beats mixing languages inside one
  block. A full translation of this file's header is out of scope here (touches lines this story
  has no reason to touch) and belongs with the German→English docs migration `.claude/ai-scrum.md`
  already tracks as future work.
- **Out-of-scope finding, not fixed here:** the manual acceptance run surfaced a real, reproducible
  bug — after starting a run, navigating away from `garden` and back makes the progress bar
  disappear even though the run is still going. Isolated by querying `gardener:runStatus` directly
  at the exact moment: the backend (`src/main/gardener-run-state.ts`, untouched by this story)
  correctly answers `running: true`; the gap is in the renderer
  (`src/renderer/lib/queries/gardener.ts`'s `useGardenerProgress`, also untouched by this story —
  likely the `staleTime: Infinity, gcTime: 0` query losing its cached answer across an unmount).
  Neither file is part of this story's diff, and a worktree check plus the direct backend query
  both point at this predating the split. Not fixed here — fixing renderer query lifecycle is
  outside this story's named files and would be scope creep; recommend a follow-up story for
  `useGardenerProgress`'s remount behaviour.

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (190 files / 2707 tests) and
`npm run build` all green. `npm run format:check` still fails project-wide on the pre-existing
Windows CRLF issue (documented in earlier sprints); the files this story touched were confirmed
individually clean via `npx prettier --check`. No file under `tests/` was touched. Code review
(hard tier) returned PASS with one real defect (the ARCHITECTURE.md table padding above, fixed)
and the out-of-scope finding above (left as a follow-up, not a defect in this story's diff).
Manual acceptance: start, stop-mid-run (findings kept, "vorzeitig gestoppt", frozen health score
with its own date), continue (no dismissal lost), scope-to-one-kind (other kinds unaffected), and
close-vault-mid-run (pre-run report on disk untouched) all directly driven through the built app
and confirmed PASS.

**Commit message:** `027: split the gardener run state into core and main glue`
