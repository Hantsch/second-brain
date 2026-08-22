---
id: 021a
title: A run I can see, from any screen
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

Part of [[021-maintenance-i-can-see-stop-and-continue]]. Delivers the "see where it is"
cluster. No new model call, no new write to the vault — this story changes what the app says
about a run, not what the run does.

## Requirement

Right now I believe a maintenance run is going, and I am not sure. That is the whole problem.
A run that takes minutes and tells me nothing about itself is a run I will stop starting.

Three things are wrong today, and all three are about telling the truth:

1. **The progress bar lives only on the maintenance screen**
   ([RunBar.tsx](../../src/renderer/screens/garden/RunBar.tsx)). I start the run, walk over to
   the journal, and the app is silent. And its state comes from an event subscription that
   starts empty ([gardener.ts:168](../../src/renderer/lib/queries/gardener.ts#L168)) — open the
   maintenance screen mid-run and I see the old report, no bar, no hint, until the next event
   happens to arrive. Main knows the answer and nobody can ask it: `gardenerRunning()`
   ([gardener.ts:65](../../src/main/ipc/gardener.ts#L65)) has no channel and no caller.

2. **The run on opening the vault is invisible.** The autorun calls the run without a progress
   callback ([gardener-autorun.ts:104](../../src/main/gardener-autorun.ts#L104)). The one run I
   did not start is the one I can see least. Press "check now" and I get "there is already a
   maintenance run going" ([gardener.ts:191](../../src/main/ipc/gardener.ts#L191)) — the first
   time anyone tells me.

3. **The bar lies about the shape of the work.** `total` is ten mechanical checks plus at most
   two model stages ([gardener-deps.ts:179](../../src/main/ipc/gardener-deps.ts#L179)). The ten
   checks are milliseconds, so the bar jumps to ~83% instantly and then stands still on one
   opaque step for as long as the model needs. It moves fastest where nothing costs anything
   and freezes where everything does.

And without a model, the display must say what a model stage _would_ have added rather than
pretending to run one.

## Acceptance Criteria

- [x] At any moment I can tell whether a maintenance run is going, from **any** screen — not
      only from the maintenance screen, and not only if I was watching when it started.
- [x] Opening the maintenance screen **during** a run shows the running state right away,
      without waiting for the next progress event.
- [x] The run started on opening the vault is as visible as one I start myself.
- [x] The progress display reflects the real cost of the work: the long model stage is not one
      opaque step, and the display does not sit at a near-finished percentage for most of the
      run.
- [x] While a run is going, the display names what is left, not only what is done.
- [x] Without a model configured, all of this still works, and the display says what a model
      stage would have added instead of pretending to run one.
- [x] Two runs still cannot overlap, and the message about that is not the first thing that
      tells me a run was going.
- [x] No hardcoded string in the renderer; `de-garden.ts` and `en-garden.ts` both carry every
      new key.

## Open Questions

_None. Resolved in [[021-maintenance-i-can-see-stop-and-continue]] — see its
`## Open Questions`._

## Plan

The run already has stages; nothing names them. Everything here follows from giving them a
name, a weight and a single owner in main.

**1. A stage model (`src/core/gardener/progress.ts`, new).** Pure, no Electron. Given
`{ useLlm, useLooseEnds }` it returns the stage plan: `['checks', 'audit', 'loose-ends']` minus
what is not reachable. Each stage carries a weight — the ten mechanical checks together are
**one** unit, each model stage is **six** (seconds vs. minutes). From the plan plus "which
stage is current" it derives `percent` and `remaining`. That is the whole fix for the 83% jump:
with both model stages the checks finish at 1/13 ≈ 8%.

**2. The progress payload grows (`src/shared/ipc.ts`, `src/shared/types/gardener.ts`).**
`event:gardener-progress` gains `stage`, `percent`, `remaining`, `startedAt`, `trigger`
(`'user' | 'auto'`). `phase`/`check`/`done`/`total` stay for now so nothing downstream breaks
mid-story; `phase` gains `'loose-ends'` so the two model stages stop sharing one name. Elapsed
time is **not** a field — the renderer ticks it from `startedAt`, so no event storm.

**3. One owner for "a run is going" (`src/main/gardener-run-state.ts`, new).** Today there are
two truths: the module-local `running: AbortController` in
[ipc/gardener.ts:56](../../src/main/ipc/gardener.ts#L56) and the `busy` flag in
[gardener-autorun.ts](../../src/main/gardener-autorun.ts). Replace both with one module holding
controller + last snapshot + trigger, emitting `event:gardener-progress` on every publish and
handing out the snapshot. `cancelGardenerRun()` (used on vault close and quit) goes through it.
The autorun then simply passes `onProgress` and `signal` — and becomes cancellable, which it is
not today.

**4. Ask instead of wait (`gardener:runStatus`).** New request channel, void → snapshot or
`null`. `useGardenerProgress` seeds itself from it on mount and keeps the subscription for
updates. That is the mid-run mount fix.

**5. Two places show it.** The rail foot gets a `GardenerIndicator` next to `VaultIndicator` —
the app already has that idiom (`sb-dot--busy`, keyed off `status.indexing`). Clicking it goes
to `/garden`. `RunBar` switches to `percent` / `remaining` / elapsed, and when no model stage is
in the plan it names what is therefore not checked.

**Order:** D1 → D2 → D3 → D4 → D5 → D6. D1 and D2 are separable (D1 adds fields, D2 consumes
them), D3 is the one with regression risk, D4–D6 are additive.

## Deliverables

- [x] **D1 — The stage model and the widened payload.** `progress.ts` computes plan, weights,
      `percent` and `remaining` from `{ useLlm, useLooseEnds, current }`; `runWithProgress`
      emits the new fields at every existing emit point and splits `phase: 'loose-ends'` off
      from `'audit'`; the `finally` block in the run handler emits a terminal snapshot in the
      same shape. Old fields keep their old values.
      _Acceptance:_ unit test over the weight math — with both model stages the end of the
      checks is ≤ 10%, with none it is 100%; `remaining` lists exactly the not-yet-started
      stages in order; no renderer file changes and `npm run typecheck` is green.
      _Files:_ `src/core/gardener/progress.ts` (new), `src/core/gardener/index.ts`,
      `src/shared/types/gardener.ts`, `src/shared/ipc.ts`, `src/main/ipc/gardener-deps.ts`,
      `src/main/ipc/gardener.ts`, `tests/core/gardener-progress.test.ts` (new).
      _Mirror:_ `src/core/gardener/health.ts` — the shape of a pure derived-number module.

- [x] **D2 — The bar says how far and what is left.** `RunBar` renders `percent`, names the
      current stage, lists `remaining` ("still to come: contradictions, loose ends") and shows
      elapsed time from `startedAt` via a 1s tick — no invented sub-percentage inside a model
      stage. _Acceptance:_ with a fake progress snapshot the bar shows the named stage, the
      remaining list and a running `m:ss`; `aria-valuenow` equals `percent`.
      _Files:_ `src/renderer/screens/garden/RunBar.tsx`, `src/renderer/lib/useElapsed.ts` (new
      — no equivalent hook exists today), `src/renderer/i18n/de-garden.ts`,
      `src/renderer/i18n/en-garden.ts`, `src/renderer/styles/gaston/components.css` (only if
      `sb-grun-*` needs a row), `tests/renderer/garden.test.tsx`.

- [x] **D3 — One owner for "a run is going".** `src/main/gardener-run-state.ts` holds
      controller, trigger and last snapshot; `ipc/gardener.ts` and `gardener-autorun.ts` both go
      through it; the autorun passes `onProgress` and `signal` and loses its own `busy` flag.
      _Acceptance:_ tests prove (a) a second `gardener:run` while one is going is still refused,
      (b) the snapshot is non-null during a run and `null` after it — including after a cancel
      and after a throw, (c) the autorun's run emits progress events with `trigger: 'auto'`,
      (d) `cancelGardenerRun()` still stops an autorun run.
      _Files:_ `src/main/gardener-run-state.ts` (new), `src/main/ipc/gardener.ts`,
      `src/main/gardener-autorun.ts`, `tests/main/gardener-run-state.test.ts` (new),
      `tests/main/gardener-ipc.test.ts`.

- [x] **D4 — I can ask whether a run is going.** Channel `gardener:runStatus` (void → snapshot
      | null) returning the run state's snapshot; typed through `api.ts`; `useGardenerProgress`
      seeds from it on mount, then lives on the event.
      _Acceptance:_ mounting the maintenance screen mid-run shows the bar without any event
      arriving (stubbed api returning a snapshot); with no run the hook stays `null`;
      `tests/main/ipc-coverage.test.ts` stays green.
      _Files:_ `src/shared/ipc.ts`, `src/main/ipc/gardener.ts`, `src/renderer/lib/api.ts`,
      `src/renderer/lib/queries/gardener.ts`, `src/renderer/lib/queries/keys.ts`,
      `tests/main/gardener-ipc.test.ts`. _Mirror:_ the `gardener:report` channel end to end.

- [x] **D5 — Visible from any screen.** `GardenerIndicator` in the rail foot next to
      `VaultIndicator`: a busy dot plus a short label while a run is going, nothing when none
      is, click → `/garden`. Uses the same hook as the bar, so it too is correct on mount.
      _Acceptance:_ with a run going the indicator is present on a non-garden route and its
      accessible label says a maintenance run is going; with no run it renders nothing.
      _Files:_ `src/renderer/components/GardenerIndicator.tsx` (new),
      `src/renderer/components/Rail.tsx`, `src/renderer/i18n/de-garden.ts`,
      `src/renderer/i18n/en-garden.ts`, `tests/renderer/rail.test.tsx` (new if absent).
      _Mirror:_ `src/renderer/components/VaultIndicator.tsx` — dot + label + click-through.

- [x] **D6 — Honest without a model, and no surprise message.** When the stage plan contains no
      model stage, the bar names what is therefore not checked ("no model stage — contradictions
      and loose ends are not checked"), distinguishing "no model configured" from "model
      switched off for this run". The "check now" control is disabled with the running state as
      its reason instead of letting `gardener:run` throw "there is already a maintenance run
      going". _Acceptance:_ with the fake gateway reporting no route the bar shows the note and
      no `audit`/`loose-ends` entry in `remaining`; during a run the button is disabled and
      labelled, and double-clicking it produces no error.
      _Files:_ `src/renderer/screens/garden/RunBar.tsx`,
      `src/renderer/screens/garden/GardenScreen.tsx`, `src/renderer/i18n/de-garden.ts`,
      `src/renderer/i18n/en-garden.ts`, `tests/renderer/garden.test.tsx`.

**Coverage:** AC1 → D5 · AC2 → D4 · AC3 → D3 · AC4 → D1+D2 · AC5 → D1+D2 · AC6 (no model) →
D6 · AC7 (no overlap) → D3+D6 · AC8 (i18n) → D2, D5, D6.

## Model Hints

- **D3 → `deliverable-hard`.** It replaces the single-run guard that three call paths share
  (`gardener:run`, `cancelGardenerRun()` from vault-close/quit, and the autorun's own `busy`
  flag) with one module — get the lifecycle wrong and the app either allows two overlapping
  runs or gets stuck showing "running" forever on a state no user action resets.
- D1, D2, D4, D5, D6 → default tier. Each is additive and has a named mirror file.
- **Review: → default.** The one risky deliverable already runs on Opus; the rest is a widened
  payload plus two renderer components against an explicit spec.

## Test Plan (manual acceptance)

Prerequisite: a vault with content and `gardener.runOnOpen` on. Steps 1–3 need **no** model;
step 4 needs a configured model for `gardener-audit`.

**1. The autorun is visible** (app freshly started, vault opens)

Watch the rail foot in the first seconds after the vault opens. Expected: the maintenance
indicator appears with a busy dot, on whatever screen you land on — without touching the
maintenance screen. It disappears when the run ends.

**2. Visible from another screen, and correct on arrival**

Go to maintenance, press "check now", then immediately switch to the journal. Expected: the
indicator in the rail stays visible. Click it. Expected: you land on maintenance and the
progress bar is **already** showing — not an old report, and not blank until something happens.

**3. Without a model, and the shape of the bar**

With no model configured, start a run. Expected: the bar names the running check, "still to
come" lists only mechanical checks, and a note says contradictions and loose ends are not
checked because there is no model stage. The percentage reaches 100% and the run ends. Press
"check now" twice fast: the second press does nothing and no error appears.

**4. The bar no longer freezes at 83%** (model configured)

Start a run and watch the bar through the mechanical checks. Expected: the checks end at
roughly 8% (both model stages) or ~14% (one) — **not** at ~83%. During the model stage the bar
stands still by design, but the line names the stage and an elapsed timer counts up.

## Done

**Summary:** `src/core/gardener/progress.ts` weighs the stage plan (checks = 1 unit, each model
stage = 6) so the bar no longer jumps to ~83% and stands still. `event:gardener-progress` gained
`stage`/`percent`/`remaining`/`startedAt`/`trigger`. `src/main/gardener-run-state.ts` is now the
single owner of "a run is going" — `ipc/gardener.ts` and `gardener-autorun.ts` both go through
it, and the autorun is cancellable and finally emits progress (`trigger: 'auto'`). A new
`gardener:runStatus` channel lets `useGardenerProgress` seed itself on mount, so opening the
maintenance screen mid-run shows the bar immediately. `GardenerIndicator` in the rail foot makes
a run visible from any screen. `RunBar` names the current stage, lists what's left, ticks an
elapsed timer, and — with no model stage in the plan — explains what isn't checked; "check now"
disables itself while a run is going instead of letting the user hit the "already running" error.

**Commit message:** `021a: a run I can see, from any screen`

**Verification:**
- `npm run build` — green.
- `npm run typecheck` — green.
- `npm run lint` — green.
- `npm test` — 2567/2568 passing; the one failure (`tests/core/wiki/module.test.ts`, a
  German-docs-template drift check) is pre-existing and unrelated, confirmed unaffected by this
  story via `git stash`.
- Live smoke (Playwright `_electron` against `.demo-vault`, no providers configured): the
  autorun indicator was visible in the rail immediately after vault open, without visiting the
  maintenance screen; the report/health score updated correctly with no console/renderer errors;
  a rapid double-click on "check now" produced no error and no duplicate run. The no-model
  mechanical run completes in well under 100 ms (its stage plan is a single 1-unit stage), so
  the intermediate `percent`/`remaining`/elapsed-timer rendering during a run could not be
  caught live by screenshot polling — that behaviour is covered by `tests/renderer/garden.test.tsx`
  and `tests/core/gardener-progress.test.ts` with fake snapshots instead, per D1/D2/D6's
  acceptance criteria.
- Code review (fresh agent, default tier): found one real issue in D3 — a cancelled/superseded
  run's terminal event could still broadcast `running: false` after a newer run had already
  started, desyncing the rail indicator and bar from the true state. Fixed in
  `src/main/gardener-run-state.ts` (the stale run's `finish()` no longer emits once a newer run
  holds the slot); verification re-run and green. No other findings; no weakened tests, no scope
  creep.
