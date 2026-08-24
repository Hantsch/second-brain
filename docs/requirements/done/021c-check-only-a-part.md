---
id: 021c
title: I can check only a part
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

Part of [[021-maintenance-i-can-see-stop-and-continue]]. Delivers the "check only a part"
cluster. **Depends on [[021a-a-run-i-can-see]]** for the stage model and on
[[021b-stop-and-continue]], which already built the "this is not a complete check" machinery
(`complete: false`, frozen `healthAsOf`, no pruning) — this story reuses it rather than adding a
second one. Both are done.

## Requirement

`gardener:run` takes nothing but `{ useLlm }` ([ipc.ts:701](../../src/shared/ipc.ts#L701)). It
is all checks over the whole vault, or nothing. When I do not have time for everything, my only
option is to not check at all.

But the findings on the screen are already grouped by kind and by module
([filter.ts](../../src/renderer/screens/garden/filter.ts)) — that is exactly the shape I would
want to check in: "just this module", "just the mechanical checks, no model", "just the
duplicates". The scope vocabulary already exists in the UI; the run just cannot accept it.

A part-run is the honest answer to a long run: less work, not a faster guess. So it must say
what it did not look at, and it must not overwrite what a full run knew.

Resolved in refine of the parent, do not re-litigate: **the health score is not recomputed for a
part-run.** The last complete score stands with its date; the part-run's findings are shown next
to it. A score over one module is not this vault's health.

## Acceptance Criteria

- [x] I can start a run over a part, from the maintenance screen, with at least one scope
      narrower than "everything" — taken from the vocabulary the screen already uses (kind,
      module, with/without model).
- [x] The result of a part-run says which scope it covered and, by implication, what it did not
      look at.
- [x] A part-run does not replace or invalidate findings outside its scope — what a previous
      full run found elsewhere is still there afterwards.
- [x] The health score after a part-run is the last **complete** one, with its date, not a number
      derived from the part.
- [x] The dashboard tile does not present a part-run as the vault's current health check.
- [x] Without a model configured, a part-run works and the display names what a model stage would
      have added instead of pretending to run one.
- [x] Two runs still cannot overlap — a part-run is a run.
- [x] No hardcoded string in the renderer; `de-garden.ts` and `en-garden.ts` both carry every new
      key.

## Open Questions

_None. Three decisions were taken during this refine and are recorded in the plan:_

1. **Both scope dimensions ship, kind and module** — they are one descriptor and one filter
   bar, so shipping only one would not be meaningfully cheaper. "With/without model" is
   **not** a new scope: `gardener.useLlm` already is that switch.
2. **A scoped run produces no whole-vault advice.** `advice` is a statement about the vault, so
   a run over one module does not overwrite it — the previous complete run's advice stands, the
   same way its health score does.
3. **A scoped run is a kind of incomplete run.** It reuses 021b's `complete: false` machinery
   (frozen `healthAsOf`, no pruning of `dismissed`/`snoozed`) rather than inventing a second
   notion of "not the whole picture".

## Plan

`gardener:run` takes `{ useLlm, resume }` ([ipc.ts:718](../../src/shared/ipc.ts#L718)) — all
checks over the whole vault, or nothing. The screen already speaks the language a narrower run
would need: `FindingFilterState` in [filter.ts:24](../../src/renderer/screens/garden/filter.ts#L24)
has `kind` and `module` axes with live counts. This story lets the run accept that vocabulary.

**Where the saving actually is.** Worth being blunt, because it shapes the implementation: the
ten mechanical checks are milliseconds — narrowing them saves nothing measurable except on the
two similarity-based ones (`near-duplicate`, `missing-page`). The real cost is the model stages.
So a scoped run (a) skips checks whose kind is out of scope, and (b) — this is the point — feeds
only the in-scope findings to `auditFindings`. A part-run is a shorter model stage, not a faster
guess.

**1. The scope, as a type (`src/shared/types/gardener.ts`).**
`GardenerRunScope = { kinds?: GardenerFindingKind[]; module?: string | null }` — `module: null`
means "findings without a module", mirroring the filter's `'none'`. Absent or empty means no
scope. `StoredRun` gains `scope?`, `GardenerReport` gains `scope?`.

**2. It is an incomplete run (`src/main/gardener-state.ts`).** `isRunComplete(run)` gains a
second condition: the stages are covered **and** `scope` is undefined. Everything 021b built
then applies for free — no pruning of `dismissed`/`snoozed`, the frozen `healthAsOf` instead of
a recomputed score, and the "not a complete check" label on screen and tile.

**3. The merge is the real work (`save`).** A scoped run's findings replace only what is in its
scope; what a previous run found outside it survives. So `save()` learns: when `run.scope` is
set, the stored findings are `previous.findings` minus the in-scope ones, plus `run.findings`.
`consideredIds` is already safe — 021b gated the pruning behind `isRunComplete`. `advice` is
kept from the previous run (decision 2 above). `size` is recomputed as usual.

**4. The run honours it (`src/main/ipc/gardener-deps.ts`).** `RunOptions` gains `scope`;
out-of-scope checks are skipped, the deterministic findings are filtered to the scope before the
model stages, and the returned `StoredRun` carries `scope`. Stage weights come from the same
plan as always, so the bar behaves as in 021a. `gardener:run` gains `scope?`.

**5. The trigger, in the UI (P1).** In [FindingList.tsx](../../src/renderer/screens/garden/FindingList.tsx),
next to `<FindingFilter>` — **not** inside `components/FindingFilter.tsx`, which is shared — a
"check only this" button, active exactly when `filter.kind` or `filter.module` is narrower than
`'all'`. It derives the scope from the filter and calls `gardener:run` with it, and is disabled
while a run is going (021a's guard).

**6. The label.** The findings header and health card say which scope the last run covered, next
to 021b's "as of &lt;date&gt;, last complete check", with a "check everything" action beside it.
The dashboard tile names a scoped last check rather than a stopped one.

**Order:** D1 → D2 → D3 → D4 → D5. D1 is the storage contract and the merge, D2 the run, D3 the
trigger, D4/D5 the two labels.

## Deliverables

- [x] **D1 — A scope in storage, and a merge that loses nothing.** `GardenerRunScope` in shared
      types; `StoredRun.scope?` and `GardenerReport.scope?`; `isRunComplete` additionally requires
      no scope; `save()` merges a scoped run's findings over the previous run's instead of
      replacing them, and keeps the previous `advice`. Read-side validation: unknown finding kinds
      are dropped from `scope.kinds`, an empty `kinds` array with no `module` reads as no scope.
      _Acceptance:_ tests prove (a) after a run scoped to one kind, the previous run's findings of
      every other kind are still in the report, (b) the in-scope findings are the new ones, not a
      union with the old ones, (c) a scoped run does not prune `dismissed`/`snoozed` and does not
      overwrite `advice`, (d) the report of a scoped run has `complete: false` and its `scope`,
      (e) the health score is the frozen one from the last complete run.
      _Files:_ `src/shared/types/gardener.ts`, `src/main/gardener-state.ts`,
      `tests/main/gardener-state.test.ts`. _Mirror:_ 021b's partial-run handling in the same file
      — `isRunComplete`, `readStageIds`, `readHealthAsOf`.

- [x] **D2 — The run honours the scope.** `RunOptions.scope`; checks whose kind is out of scope
      are not run; the deterministic findings are filtered to the scope before `auditFindings` and
      the loose-end stage; the returned `StoredRun` carries `scope`. `gardener:run` accepts
      `scope?` and passes it through. A scoped run goes through the same run slot as any other, so
      two cannot overlap.
      _Acceptance:_ tests prove (a) a run scoped to `near-duplicate` invokes only that check —
      assert via the findings produced, since the other checks would have produced findings the
      fixture vault has, (b) the fake gateway's audit call receives only in-scope findings, (c) a
      module-scoped run produces no finding outside that module, (d) with no model routed a scoped
      run still completes and produces its mechanical findings, (e) `gardener:run` while a run is
      going is still refused.
      _Files:_ `src/shared/ipc.ts`, `src/main/ipc/gardener-deps.ts`, `src/main/ipc/gardener.ts`,
      `tests/main/gardener-ipc.test.ts`.

- [x] **D3 — I can start it from the screen.** A "check only this" control in `FindingList.tsx`
      beside `<FindingFilter>`, active only when `filter.kind !== 'all'` or
      `filter.module !== 'all'`, naming what it would check ("check only orphaned pages", "check
      only module X"). It derives `GardenerRunScope` from the filter — `module: 'none'` maps to
      `module: null` — and runs it; disabled while a run is going.
      _Acceptance:_ component tests prove the control is absent with no filter, present and
      correctly labelled with a kind filter and with a module filter, passes the derived scope to
      the run mutation, and is disabled during a run. Both language files carry every new key.
      _Files:_ `src/renderer/screens/garden/FindingList.tsx`,
      `src/renderer/screens/garden/GardenScreen.tsx`,
      `src/renderer/lib/queries/gardener.ts`, `src/renderer/i18n/de-garden.ts`,
      `src/renderer/i18n/en-garden.ts`, `tests/renderer/garden.test.tsx`.

- [x] **D4 — The result says what it looked at.** The findings header and `HealthCard` name the
      scope of the last run ("last check: module X only — other findings are from the check of
      &lt;date&gt;") alongside 021b's frozen-score wording, with a "check everything" action next
      to it. A scoped run and a stopped run must read differently, not share one vague "not
      complete" sentence.
      _Acceptance:_ component tests with a scoped report show the scope wording and the "check
      everything" action; with a stopped (unscoped, partial) report the 021b wording is unchanged;
      with a complete report neither appears. With no model configured the scope wording appears
      and nothing claims a model stage ran.
      _Files:_ `src/renderer/screens/garden/GardenScreen.tsx`,
      `src/renderer/screens/garden/HealthCard.tsx`, `src/renderer/i18n/de-garden.ts`,
      `src/renderer/i18n/en-garden.ts`, `tests/renderer/garden.test.tsx`.

- [x] **D5 — The tile does not sell a part as the whole.** 021b already made the tile handle
      `complete: false`; here it distinguishes a scoped last check from a stopped one in its
      wording, and still shows the frozen score with its date rather than a number derived from
      the part.
      _Acceptance:_ tile test with a scoped report shows the scoped wording, not the stopped one,
      and does not present the part's finding count as the vault's current state; with a complete
      report the tile is unchanged.
      _Files:_ `src/renderer/components/tiles/GardenerTile.tsx`,
      `src/renderer/i18n/de-dashboard.ts`, `src/renderer/i18n/en-dashboard.ts`,
      `tests/renderer/dashboard.test.tsx`.

**Coverage:** AC1 → D3 · AC2 → D4 · AC3 → D1 · AC4 → D1+D4 · AC5 → D5 · AC6 → D2+D4 ·
AC7 → D2+D3 · AC8 → D3+D4+D5.

## Model Hints

- **D1 → `deliverable-hard`.** The merge is the one place this story can silently destroy data:
  get the in-scope predicate wrong and a run over one module drops every finding the last full
  run found elsewhere — from a file the user is invited to delete, with no error and nothing on
  screen saying anything went missing. It also has to compose with 021b's `isRunComplete` gate
  rather than duplicating it.
- D2, D3, D4, D5 → default tier. D2 is a filter inserted at two named points; D3–D5 are renderer
  states over a new report field with a named mirror in 021b's diff.
- **Review: → `story-review-hard`.** Same reason as 021b, sharpened: the failure mode is silent
  finding loss in the user's own state file, and D1's merge is exactly the kind of set operation
  a diff-only reviewer has to reason about rather than read.

## Test Plan (manual acceptance)

Prerequisite: a vault with findings in **at least two** different modules and of at least two
kinds. A configured model is not required; where it changes the expectation, it is noted.

**1. A part-run leaves the rest alone** — this is the one that matters

Open maintenance and note a finding in module A and a finding in module B. Filter to module A,
press "check only this". When it finishes, clear the filter. Expected: the module A findings are
freshly re-derived **and** the module B finding is still listed. Nothing disappeared.

**2. The result says what it looked at**

Straight after step 1, without clearing anything. Expected: the header/health card say the last
check covered module A only, with the date of the last complete check next to the score, and a
"check everything" action is offered. The dashboard tile says the same in short — not a plain
"checked" with a number.

**3. The score is not recomputed over the part**

Compare the health number before and after step 1. Expected: unchanged, carrying the "as of
&lt;date&gt;" note. A part of the vault does not move the vault's score.

**4. A kind scope**

Clear filters, filter by a kind that has findings, press "check only this". Expected: the button
names that kind. Afterwards, findings of the other kinds are still there and the label names the
kind scope. With no model configured this still works and nothing claims a model stage ran.

**5. A part-run is a run**

Start a part-run and, while it is going, try "check now" and "check only this" again. Expected:
both are disabled, the rail indicator (021a) shows a run is going, and no error appears.

## Done

**Summary.** `gardener:run` now accepts `{ kinds?, module? }` as `scope`. Storage
(`gardener-state.ts`) merges a scoped run's findings over the previous run's rather than
replacing them, keeps `advice` and the frozen health score, and — after the review fix cycle —
only removes previously-stored findings whose kind a stage of _this_ run actually checked
(`checkedKinds`), so a scope naming only a model-only kind with no model routed deletes
nothing. The run (`gardener-deps.ts`) skips out-of-scope checks and stages (including
`journal-loose-ends`, which is skipped outright rather than run-then-discarded) and filters
deterministic findings before the audit stage. The screen gained a "check only this" control
next to `<FindingFilter>`, and the findings header, health card, and dashboard tile all name a
scoped last check distinctly from a stopped one, with a "check everything"/"continue check"
action. A resumed scoped run stays scoped instead of being laundered into a full run.

**Commit message:**

```
021c: scoped gardener runs (check only a part)
```

**Verification.**

- `npm run build` / `npm run typecheck` / `npm run lint`: green.
- `npm test`: 2627/2628 passing; the one failure (`tests/core/wiki/module.test.ts`) is
  pre-existing and unrelated (German AGENTS.md template vs. the now-English
  `docs/MODULE-SCHEMA.md`).
- Code review: first pass **FAIL** (story-review-hard) — found a critical silent-data-loss bug
  (finding 1: a scope naming only a kind no stage in that run could produce deleted the
  previous run's findings of that kind) plus a resume-laundering bug (finding 2), a
  loose-end stage running full-cost despite being scoped out (finding 3), and four smaller
  correctness/reuse issues (findings 4–7). All seven were fixed in one review-fix cycle;
  finding 8 (file length, 021b + 021c pushed `gardener-state.ts` to ~700 lines) was noted but
  not acted on — no functional issue, and splitting it is a separate refactor, not part of
  this story's scope.
- Live smoke (manual, via a throwaway Playwright driver over the seeded demo vault, since
  the standard `npm run shot` script doesn't yet know this new control): filtered to "Ohne
  Modul", clicked "check only this" — `gardener:report` came back with `scope: {"module":
null}`, `complete: false`, `checkedKinds` listing every mechanical check (no model routed),
  health frozen at 89 with a `healthAsOf` date, and the finding count unchanged (10 before and
  after). The header showed "Letzte Prüfung: nur Modul Ohne Modul" plus "Alles prüfen",
  alongside the unchanged 021b "Stand ..., letzte vollständige Prüfung" wording. The dashboard
  tile's scoped-vs-stopped wording was verified via its 65 component tests, not by finding it
  on the seeded dashboard (the Gardener tile isn't in the demo's default tile catalog).
