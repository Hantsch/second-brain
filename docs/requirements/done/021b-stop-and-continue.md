---
id: 021b
title: Stopping keeps what was found, and I can continue
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

Part of [[021-maintenance-i-can-see-stop-and-continue]]. Delivers the "stop it and continue
later" cluster. **Depends on [[021a-a-run-i-can-see]]** — it persists the stage model 021a
introduces.

## Requirement

"Cancel" today aborts and keeps nothing. The report is written only after the whole run
finishes ([gardener.ts:204](../../src/main/ipc/gardener.ts#L204)), so a run I interrupt after
two minutes of model work costs me those two minutes. That makes cancel a punishment, so I sit
and wait instead of stopping.

I want the opposite. Stop it, keep what was already found, and continue where it left off when
I have time again. And whatever I look at afterwards has to tell me it is half a check — a
partial run must never be presented as a full one.

Resolved in refine of the parent, do not re-litigate:

- **Continuing works at stage granularity.** The stopped run keeps the findings of the stages
  that finished; continuing restarts only the stage that was cut, from its beginning. The ten
  mechanical checks are milliseconds, so in practice: checks kept, one model stage redone. No
  mid-request state is persisted.
- **The paused run lives in `.secondbrain/gardener.json`**, in `StoredRun`
  ([gardener-state.ts:37](../../src/main/gardener-state.ts#L37)), extended by which stages
  finished. Deletable by contract: a lost pause degrades to "not checked yet", never to a wrong
  report.
- **The health score is not recomputed** for a stopped run. The last complete score stands,
  labelled with its date, with the partial findings shown next to it. A score over half a run
  is not this vault's health.

## Acceptance Criteria

- [x] I can stop a run and the findings already computed are kept — stopping does not throw the
      run away.
- [x] After stopping I can continue, and continuing does not redo the stages that were already
      finished.
- [x] A stopped or partial run is labelled as such wherever its result is shown — findings list,
      health card, dashboard tile. No partial run appears as a complete check.
- [x] The health score shown after a stopped run is the last **complete** one, with its date,
      not a number derived from the partial findings.
- [x] A deleted or unreadable `.secondbrain/gardener.json` degrades to "not checked yet", never
      to a report that claims to be complete.
- [x] Without a model configured, stopping and continuing still work, and the partial label says
      which stages are missing rather than implying a model stage ran.
- [x] No hardcoded string in the renderer; `de-garden.ts` and `en-garden.ts` both carry every new
      key.

## Open Questions

_None. The three decisions above were resolved in
[[021-maintenance-i-can-see-stop-and-continue]]. One further decision was taken during this
refine and is recorded in the plan: a **shutdown** cancel (closing the vault, quitting) does
**not** leave a partial run behind — only a cancel the user asked for does._

## Plan

The blocker is a single sentence in the code, and it is right:
[gardener-state.ts:save](../../src/main/gardener-state.ts) prunes `dismissed`/`snoozed` against
what the run re-derived, and its comment says that is only valid for a **completed** run — "a
cancelled run throws before `save`, and its partial list must never be read as 'everything else
is gone'". So a partial run may be stored, but it must not prune. Everything else follows.

**1. A run knows which stages it did (`src/main/gardener-state.ts`).** `StoredRun` gains
`plan: GardenerStageId[]` and `completed: GardenerStageId[]` (021a's stage ids, already in
`@shared/types`). Complete ⟺ `completed` covers `plan`. Both optional: a file written before
this field reads as complete, which is what it was. `save()` prunes only when the run is
complete — the invariant above, now enforced instead of relied upon.

**2. The frozen score travels with the partial run.** `StoredRun` gains
`healthAsOf?: { ranAt, score, contributions }`, copied from the report that was current at the
moment of the stop. `present()` uses it instead of `healthScore(...)` when the run is partial —
so no number is ever derived from half a check — and puts `complete`, `missingStages` and
`healthAsOf.ranAt` into `GardenerReport`. One field, one place; a complete run overwrites it and
it is gone.

**3. Cancelling returns instead of throwing (`src/main/ipc/gardener-deps.ts`).** Today
`stopIfCancelled` throws out of `runWithProgress`, past the `save`. Invert it: the throw becomes
internal control flow, caught inside `runWithProgress`, which then returns
`{ run: StoredRun, complete: boolean }` with whatever the finished stages produced. The two
callers decide what to do with a partial.

**4. A shutdown cancel keeps nothing.** `cancelGardenerRun()` gains a reason
(`'user' | 'shutdown'`). `gardener:cancel` passes `'user'` and the run is persisted as partial;
[index.ts:125](../../src/main/index.ts#L125) (vault close / quit) passes `'shutdown'` and nothing
is written — a vault being closed must not leave half a report behind, and on quit the atomic
write cannot be reliably awaited anyway.

**5. Continuing (`gardener:run` gains `resume?: boolean`).** With `resume`, `runWithProgress`
loads the stored partial run, skips every stage in its `completed`, and uses the stored
`findings` as the deterministic base for the model stages. That base is exact: after the checks
stage and before any audit, `findings` _is_ the deterministic list minus answered loose ends —
which is precisely what `auditFindings` should see. Stage weights and percent come from the full
`plan`, so the bar continues where it stood rather than restarting at 0.

**6. The label, twice.** Maintenance screen: the header says the run was stopped and names the
missing stages, the health card shows the frozen score with "as of &lt;date&gt;, last complete
check", and a "continue" button appears next to "check now" — only while `missingStages` is
non-empty. Dashboard tile: a partial run is not presented as the vault's current check.

**Order:** D1 → D2 → D3 → D4 → D5. D1 is the storage contract, D2 the control-flow inversion
(the risky one), D3 resume, D4/D5 the two surfaces.

## Deliverables

- [x] **D1 — A stored run knows what it did, and a partial one prunes nothing.** `StoredRun`
      gains optional `plan`/`completed`/`healthAsOf`; a helper decides complete vs. partial;
      `save()` skips the `dismissed`/`snoozed` pruning for a partial run; `present()` returns
      `complete`, `missingStages` and `healthAsOf` in `GardenerReport` and uses the frozen score
      when partial. Read-side validation: unknown stage ids are dropped, a missing `plan` reads
      as complete, an unreadable file still yields "not checked yet".
      _Acceptance:_ tests prove (a) a partial run round-trips and keeps a `dismissed` id whose
      finding it never re-derived, (b) a complete run still prunes exactly as before, (c) the
      report of a partial run carries the frozen score and its date, not one computed from the
      partial findings, (d) a legacy run without `plan` reads as complete, (e) a corrupt file
      yields `null` (not checked yet).
      _Files:_ `src/main/gardener-state.ts`, `src/shared/types/gardener.ts`,
      `tests/main/gardener-state.test.ts`.

- [x] **D2 — Stopping keeps what was found.** `runWithProgress` returns
      `{ run, complete }` and catches its own cancellation instead of throwing past the caller;
      `gardener:run` persists a partial run and returns its report rather than surfacing an
      error; `cancelGardenerRun(reason)` distinguishes `'user'` from `'shutdown'`, and only a
      user stop leaves anything behind. The `finally` in the handler still ends the run visibly
      (021a).
      _Acceptance:_ tests prove (a) cancelling during the audit stage leaves a stored run whose
      findings are the ones the checks produced, marked partial with `missingStages` naming the
      model stages, (b) `gardener:cancel` no longer makes `gardener:run` reject, (c) a
      `'shutdown'` cancel writes nothing at all, (d) the run slot is free afterwards and the
      snapshot is `null`, (e) an autorun cancelled by vault close persists nothing.
      _Files:_ `src/main/ipc/gardener-deps.ts`, `src/main/ipc/gardener.ts`,
      `src/main/gardener-run-state.ts`, `src/main/index.ts`, `src/main/gardener-autorun.ts`,
      `tests/main/gardener-ipc.test.ts`, `tests/main/gardener-run-state.test.ts`.

- [x] **D3 — Continuing does not redo finished stages.** `gardener:run` accepts
      `resume?: boolean`; `runWithProgress` accepts the stored partial run, skips the stages in
      its `completed`, feeds its `findings` to the model stages as the deterministic base, and
      merges `completed`, `advice` and `usedLlm` with the stages it now runs. `size` is
      recomputed. Progress percent is computed against the **full** `plan`, so the bar resumes
      rather than restarting.
      _Acceptance:_ tests prove (a) resuming a run stopped after the checks runs the audit and
      loose-end stages and no check twice — the fake gateway records exactly one audit call and
      the check functions are not re-invoked, (b) the resulting run is complete and `save()` then
      prunes normally, (c) resuming with nothing missing is a no-op that does not clear
      decisions, (d) the first progress event of a resumed run has a percent above 0.
      _Files:_ `src/shared/ipc.ts`, `src/main/ipc/gardener-deps.ts`, `src/main/ipc/gardener.ts`,
      `tests/main/gardener-ipc.test.ts`.

- [x] **D4 — The maintenance screen says it is half a check, and offers the other half.**
      Header/findings area names the stopped state and the missing stages; `HealthCard` shows the
      frozen score with "as of &lt;date&gt;, last complete check" instead of a live number; a
      "continue" button next to "check now" calls `gardener:run` with `resume: true` and is
      absent when `missingStages` is empty (so a no-model run, whose plan is just `checks`, never
      offers it).
      _Acceptance:_ component tests with a partial report show the stopped label, the named
      missing stages, the "as of" wording on the score and a present "continue" button; with a
      complete report none of the four appear. Both language files carry every new key.
      _Files:_ `src/renderer/screens/garden/GardenScreen.tsx`,
      `src/renderer/screens/garden/HealthCard.tsx`, `src/renderer/lib/queries/gardener.ts`,
      `src/renderer/i18n/de-garden.ts`, `src/renderer/i18n/en-garden.ts`,
      `tests/renderer/garden.test.tsx`.

- [x] **D5 — The dashboard tile does not sell a partial run as a check.** With a partial stored
      run the tile shows the frozen score with its date and says the last check was stopped, with
      the action leading to `/garden`; it does not present the partial finding count as the
      current state of the vault.
      _Acceptance:_ tile test with a partial report shows the stopped wording and does not show
      the number as current; with a complete report the tile is unchanged from today.
      _Files:_ `src/renderer/components/tiles/GardenerTile.tsx`,
      `src/renderer/i18n/de-dashboard.ts`, `src/renderer/i18n/en-dashboard.ts`,
      `tests/renderer/dashboard.test.tsx` (or the existing tile test — check first).

**Coverage:** AC1 → D2 · AC2 → D3 · AC3 → D4+D5 · AC4 → D1+D4 · AC5 → D1 · AC6 → D4 ·
AC7 → D4+D5.

## Model Hints

- **D2 → `deliverable-hard`.** It inverts the cancellation control flow that four call sites
  depend on (`gardener:cancel`, vault close/quit in `index.ts`, the autorun, and 021a's run-slot
  `finally`) and adds the first-ever write of an incomplete run — get it wrong and either a
  cancel silently persists a half report as if it were whole, or the quit path writes to a vault
  that is being closed.
- D1, D3, D4, D5 → default tier. D1 and D3 are tightly specified against an existing invariant
  and existing test files; D4 and D5 are renderer states over a new report field.
- **Review: → `story-review-hard`.** The failure this story can produce is a wrong report that
  looks right — a partial run whose score or pruning is treated as complete corrupts the user's
  own dismissals, which no test the story writes would necessarily notice. That is worth a
  reviewer that reads the `save`/`present` invariant properly.

## Test Plan (manual acceptance)

Prerequisite: a vault with content **and a configured model** for `gardener-audit` — without a
model stage the run is over in milliseconds and there is nothing to stop.

**1. Stopping keeps the findings**

Open maintenance, press "check now", wait until the bar names the model stage, then press
"stop". Expected: no error appears. The findings list fills with what the mechanical checks
found, and the header says the run was stopped and names what is missing (contradictions, loose
ends).

**2. The score is the last complete one, not a new one**

Look at the health card after step 1. Expected: the number is the one from the last complete
check with an "as of &lt;date&gt;" note — not a fresh number derived from the partial findings.
Check the dashboard too: the tile says the last check was stopped.

**3. A dismissal survives the stop**

Before step 1, dismiss one finding ("fine as is"). Then do step 1. Expected: the dismissal is
still in effect afterwards — the finding is in the hidden list, not back in the open list.

**4. Continuing does not start over**

After step 1, press "continue". Expected: the bar starts at the percentage the stop left it at,
not at 0, and it goes straight to the model stage — the mechanical checks do not run again. When
it finishes, the stopped label and the "continue" button are gone and the health card shows a
live score again.

**5. Closing the vault leaves nothing half-written**

Start a run, and while the model stage is going close the vault (or quit the app). Reopen it.
Expected: the report is the last **complete** one, unchanged — not a partial run from the
interrupted attempt, and no stopped label.

## Done

**Summary.** `StoredRun` now knows its `plan`/`completed`/`healthAsOf` (D1); a cancel is caught
inside `runWithProgress` and stored as a partial run instead of throwing past `save()`, and only
a user-initiated cancel persists anything — a `'shutdown'` cancel (vault close, quit) keeps
nothing (D2); `gardener:run` accepts `resume: true` and skips finished stages, feeding the stored
findings back in as the deterministic base for the model stages (D3); the maintenance screen
names the stopped state and its missing stages, freezes the health card on the last complete
score, and offers "continue" only while something is missing (D4); the dashboard tile shows the
frozen score and "last check was stopped" instead of presenting a partial finding count as
current (D5).

Code review (story-review-hard) found 3 confirmed bugs, since fixed and re-verified:
- A first-ever partial run (no earlier complete report to freeze) showed a score computed from
  the half-finished findings instead of "unknown" — fixed in `present()`
  ([gardener-state.ts](../../src/main/gardener-state.ts)); the renderer now shows "no complete
  check yet" instead of a blank date.
- `services.closeVault()` never cancelled a running check — only `app.on('will-quit')` did, so
  closing or switching a vault left a check writing into a vault that was gone. Fixed:
  `closeVault()` now calls `cancelGardenerRun('shutdown')` first.
- Resuming a stopped run unconditionally cleared `data.fixed`, un-hiding a finding the user had
  already marked fixed, because a resumed run's findings are inherited from the earlier stop, not
  freshly re-derived. Fixed: `fixed` is now only cleared when the `checks` stage genuinely reran
  in that call.

Three further review findings were left unfixed, as plausible edge cases rather than confirmed
defects, none of which the acceptance criteria exercise:
- Resuming a run after the model became unreachable in between could store a "complete" run that
  never actually reran a check. Narrow window (model must disappear mid-pause), no reproduction.
- `readStageIds` drops unknown stage ids from `plan` as well as from `completed` — only matters
  once a future build renames a stage while a partial run from an older build is still paused.
- `cancelGardenerRun` frees the run slot before the cancelled run's own `saveRun` has finished
  writing; a new run could start in that window. The renderer's `running` guard closes this in
  practice; the main process has no independent guard. Pre-existing pattern from 021a's run-slot
  model, not introduced by this story.

**Commit message:** `021b: stop keeps findings, continue skips finished stages`

**Verification:** `npm run lint` / `npm run typecheck` / `npm run build` green. `npm test` —
2592/2593 passing; the one failure (`tests/core/wiki/module.test.ts:150`, German/English drift
between `MODULE_SCHEMA_TEMPLATE` and `docs/MODULE-SCHEMA.md`) is unrelated to this story and
pre-exists on `dev` untouched. `npm run format:check` is red repo-wide (~450-460 files, mostly
untouched by this story) due to CRLF/LF churn from the Windows checkout — confirmed pre-existing
on a clean `dev` tree via `git stash`, not introduced here. Review verdict after the fix cycle:
the 3 confirmed findings are resolved; no weakened tests, no scope creep.

**Manual acceptance:** confirmed by the user against the "Test Plan (manual acceptance)" steps
above.
