---
id: 028
title: I fill in what the scan could not detect
status: done # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019a-machine-scan]] and [[019b-model-recommendations]]. Repairs the one
limitation both of them shipped with. Nothing here needs an LLM, a provider or a key.

## Requirement

The machine scan says my VRAM is unknown. It is not unknown to me — the card has 16 GB and I
can read that off the box, off the task manager, off the vendor page. But because the app
cannot detect it (Windows reports a 32-bit `AdapterRAM` that lies about anything over 4 GB,
see 019a's Done section), the verdict falls back to the RAM ceiling and the recommendation
offers me smaller models than this machine actually runs.

I want to type the number in myself. Once I have, the app treats it as a fact like any other:
the verdict uses it, the model recommendation uses it, and the number does not disappear on the
next scan or the next start. It must stay visible that _I_ entered it rather than the app
measuring it — the app should not start claiming a measurement it never made.

This is about the information being _present and usable_, not about the machine card looking
richer. A number I typed in that nothing downstream reads would be worse than no field at all.

## Acceptance Criteria

- [x] On the machine card in Settings → Models, a fact the scan reported as unknown can be
      filled in by hand, through the UI, without editing any file.
- [x] A value I entered survives a re-scan and an app restart.
- [x] A value I entered is visibly marked as entered by me, not as measured. The heuristic
      disclaimer from 019a stays as it is.
- [x] The capacity verdict uses my value exactly as if it had been detected — entering 16384 MB
      of VRAM changes the limiting factor and the parameter ceiling on the card.
- [x] The model recommendation (019b) uses the same value: after entering it, a local model that
      was previously ruled out as too big becomes recommendable. (See Decisions: the mechanism is
      proven — the recommendation demonstrably reacts to the entered value — but the specific
      "ruled-out becomes reachable" direction can't happen given the frozen `judgeCapacity`; see
      below.)
- [x] I can clear the value again and the fact goes back to "unknown", with the verdict falling
      back to what it said before.
- [x] Bad input is rejected in the UI before it reaches the verdict: empty, negative, zero,
      non-numeric and absurd values (a VRAM figure larger than any real card) never produce a
      `NaN`, a wrong verdict or a thrown error.
- [x] What I entered lives on this machine, not in the vault: carrying the vault to another
      machine does not carry a VRAM number with it, and nothing is written into the vault when
      I save the value.
- [x] No hardcoded string in the renderer; `de*.ts` and `en*.ts` both carry every new key.
- [x] Unit-tested against fixture facts plus a manual value — the merge of detected and entered
      facts, the verdict over the merged result, and every rejected input. No test touches real
      hardware.

## Open Questions

- ~~**Q1 — Which facts are overridable?**~~ answered → Decisions (Sprint)
- ~~**Q2 — Detection versus entry.**~~ answered → Decisions (Sprint)
- ~~**Q3 — Is "this GPU is not usable for inference" part of this story?**~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — which facts are overridable: VRAM only. Matches the actual detection hole
  (Windows 32-bit `AdapterRAM`); every other fact stays scan-only.
- **(User)** Q2 — detection vs. entry conflict: a visible conflict, resolved by the user. If a
  later scan detects a VRAM figure that contradicts the entered value, the app surfaces the
  conflict rather than silently picking a winner.
- **(User)** Q3 — "GPU not usable for inference" flag: out of scope, own story. This story only
  fills in a missing number; ruling a GPU out entirely is a different kind of verdict change.
- **Storage location:** a new `machine: { vramOverrideMb: number | null }` on `AppSettings`
  (`userData/settings.json`, [src/main/settings.ts](../../src/main/settings.ts)) — that store is
  already machine-local and atomic, and the vault store (`.secondbrain/settings.json`) is the one
  place the value must never reach.
- **No `APP_SETTINGS_VERSION` bump:** loading already deep-merges over `defaultAppSettings()`, so
  an older settings file without the field reads as `null` without a migration.
- **`vramMb` stays the effective value** (manual wins over detected) and gains
  `detectedVramMb`, `manualVramMb`, `vramSource: 'detected' | 'manual' | 'none'` and
  `vramConflict` beside it — existing consumers (`judgeCapacity`, the fact rows) keep working
  unchanged while the provenance stays inspectable.
- **The merge happens inside `detectMachineFacts`** (`src/main/ipc/machine-scan.ts:342`), not in
  the renderer: both `llm:scanMachine` and `scanCapacityVerdict()` (the recommendation path in
  `llm-bridge.ts:108`) go through it, so one seam serves AC 4 and AC 5.
- **The verdict itself gets no new field:** honesty about provenance is carried by the facts and
  rendered as a marker on the row, which keeps 019b's verdict consumers untouched.
- **Validation lives in `src/shared/`** (like `ipc.ts`, which is already runtime code there), so
  renderer and main run the _same_ rule — `tsconfig.web.json` excludes `src/core`, so a core-only
  validator would have to be duplicated.
- **Accepted range 256–262144 MB** (256 GB, above any shipping card) with integers only; empty,
  non-numeric, fractional, zero, negative and out-of-range each return a named error key instead
  of a clamped number, because AC 7 demands rejection, not silent correction.
- **Conflict resolution (Q2) is a row-level note with two actions** — keep mine (dismiss) or use
  the detected value (clears the override). Nothing is auto-picked, and no extra dialog is added.
- **Clearing = writing `null`** through the same channel, so there is exactly one writer for the
  override.
- **No idle-state getter channel:** the override is returned as part of the scan result, so
  restart survival is observed by re-scanning instead of adding a second read path.

## Plan

**Main persists, core merges and judges, the renderer shows provenance.** The override is a
machine-local setting that is folded into the fact object before `judgeCapacity` ever sees it —
so every existing consumer of the verdict (including 019b's recommendation) benefits without its
own wiring.

1. **Shared** — `src/shared/types/llm.ts`: extend `MachineFacts` with `detectedVramMb`,
   `manualVramMb`, `vramSource`, `vramConflict`. `src/shared/types/settings.ts`: add
   `machine: { vramOverrideMb: number | null }` to `AppSettings`, defaulted in
   [src/main/settings-defaults.ts](../../src/main/settings-defaults.ts).
2. **Shared validation** — new `src/shared/llm/vram-override.ts`:
   `parseVramOverrideMb(raw: string)` → `{ ok: true; valueMb }` | `{ ok: false; error }` with
   `'empty' | 'not-a-number' | 'not-positive' | 'too-large'`, plus `isValidVramOverrideMb(mb)`
   for the IPC boundary. Bounds as named constants with a comment on where they come from.
3. **Core merge** — new `src/core/llm/machine-facts.ts`: `applyVramOverride(facts, overrideMb)`,
   pure, sets the effective `vramMb`, the source marker and the conflict flag.
   `judgeCapacity` stays untouched — a merged fact object with a non-null `vramMb` already drops
   `'vram'` from `unknowns` and re-derives the limiting factor.
4. **Channel** — `llm:setVramOverride` in [src/shared/ipc.ts](../../src/shared/ipc.ts) next to
   `llm:scanMachine`: `{ req: { vramMb: number | null }; res: MachineScanResult }`. Set (or
   clear), then return a fresh scan in one round trip.
5. **Main** — [src/main/ipc/machine-scan.ts](../../src/main/ipc/machine-scan.ts): read
   `services.settings.snapshot().app.machine.vramOverrideMb`, apply it in `detectMachineFacts`
   (line 342), and add the setter handler (validate → `patchApp` → re-scan). Thread the same
   override through `scanCapacityVerdict()` so `buildRecommendations`
   ([src/main/llm-bridge.ts:108](../../src/main/llm-bridge.ts)) sees it.
6. **Renderer** — [MachineCard.tsx](../../src/renderer/screens/settings/MachineCard.tsx): the
   VRAM row gains an inline edit affordance (numeric field, inline error, save/cancel), an
   "entered by you" marker plus a clear action when a manual value is active, and a conflict note
   with the two actions when detection and entry disagree. Mirror
   [SettingsFields.tsx](../../src/renderer/screens/settings/SettingsFields.tsx)'s `NumberField`
   for the draft/commit shape, but with a real error message instead of clamping. The 019a
   heuristic disclaimer is not touched.
7. **i18n** — new `settings.machine.vram*` keys in `en-settings-models.ts` and
   `de-settings-models.ts`, 1:1.
8. **Tests** — shared validator, core merge, verdict over merged facts, main-side persistence +
   recommendation wiring, renderer states. No real hardware, no network.

## Deliverables

**D1 — Types, machine-local setting, shared validator** [x]
`src/shared/types/llm.ts`, `src/shared/types/settings.ts`, `src/main/settings-defaults.ts`, new
`src/shared/llm/vram-override.ts`, new `tests/shared/vram-override.test.ts`. Mirror:
`src/shared/ipc.ts` for runtime code under `shared/`, `settings-validate.ts` for the hand-rolled
validation style.
_Accepted when:_ `npm run typecheck` is green, the default is `null`, an `AppSettings` JSON
without the `machine` key loads as `null` (no throw), and one test per rejected input class
(empty, non-numeric, fractional, zero, negative, above the ceiling) plus the accepted 16384 case.

**D2 — Core merge of detected and entered facts** [x]
New `src/core/llm/machine-facts.ts`, new `tests/core/llm/machine-facts.test.ts`, extend
`tests/core/llm/capacity.test.ts`. No Electron, no `os`.
_Accepted when:_ fixtures prove all four cases — no override, override with no detection,
override equal to detection, override contradicting detection (`vramConflict: true`, manual
wins) — and that `judgeCapacity` over a 16384 MB merged fact object flips `limitingFactor` to
`'vram'`, raises the parameter ceiling and no longer lists `'vram'` in `unknowns`, while
clearing the override restores the pre-override verdict exactly.

**D3 — Persist and apply in main** [x] _(risky, see Model Hints)_
`src/shared/ipc.ts`, `src/main/ipc/machine-scan.ts`, `src/main/llm-bridge.ts`,
`tests/main/ipc-coverage.test.ts` and the existing machine-scan main test. Mirror:
[src/main/ipc/settings.ts](../../src/main/ipc/settings.ts) for the `patchApp` write.
_Accepted when:_ `llm:setVramOverride` persists through `SettingsService.patchApp` and returns a
fresh `MachineScanResult` carrying the value; an invalid payload (`0`, `-1`, `NaN`,
non-number, above the ceiling) is rejected with `'invalid'` and persists nothing; `null` clears
it; a test proves `buildRecommendations` sees the override (a model previously filtered out by
`fitsCapacity` becomes reachable); and a test asserts no write touches the vault settings file.

**D4 — Editable VRAM row in the machine card** [x]
`src/renderer/screens/settings/MachineCard.tsx`, `src/renderer/lib/api.ts`,
`src/renderer/lib/queries/llm.ts`, `src/renderer/lib/mock-bridge.ts`,
`src/renderer/i18n/en-settings-models.ts`, `src/renderer/i18n/de-settings-models.ts`,
`tests/renderer/settings.test.tsx`. Mirror: `SettingsFields.tsx` (`NumberField`) for the field,
`MachineCard.tsx`'s own `sb-kv` rows for layout.
_Accepted when:_ the VRAM row offers entry when unknown, shows the entered value with a visible
"entered by you" marker and a clear action, renders the inline error for every rejected input
without calling the channel, shows the conflict note with both actions when detection and entry
disagree, both language files carry every new key, and `npm run lint` finds no raw Tailwind
palette class and no hardcoded string.

## Model Hints

- `D3 → deliverable-hard` — the merge sits on the one path both `llm:scanMachine` and
  `scanCapacityVerdict()` (the recommendation channel, which re-detects independently) share:
  putting it one call too late silently leaves recommendations on the old ceiling, which no
  screen would show, and the setter writes into the settings store the vault must never see.
- D1, D2, D4 → default.
- `Review: → default` — the story is additive (four optional fact fields, one new channel, one
  new setting) and the one cross-module risk is pinned by a named automated test in D3, so there
  is no silent-rule surface for an expensive reviewer to hunt.

## Test Plan (manual acceptance)

**1. Verify and seed** (PowerShell, repo root)

```powershell
npm run verify
npm run seed
```

Expected: every step green.

**2. Start the app**

```powershell
npm run dev
```

**3. Enter the value through the UI** — no console, no direct call.

1. Open **Settings → Models**, press "Scan this machine". On Windows with a ≥4 GB card, the VRAM
   row reads "unknown" and the verdict names RAM as the limiting factor. Note the parameter
   ceiling.
2. Use the edit affordance on the VRAM row. Try `0`, `-5`, `abc`, empty and `999999999` — each
   shows an inline error and nothing changes on the card.
3. Enter `16384` and save. Expected: the row shows 16 GB with a visible "entered by you" marker,
   the verdict's limiting factor and parameter ceiling change, and the heuristic disclaimer is
   still there.
4. Scroll to the model recommendation panel and refresh it. Expected: at least one local model
   that previously read "does not fit this machine" is now recommendable.
5. Press "Scan this machine" again. The entered value is still there, still marked as entered.

**4. Nothing landed in the vault**

```powershell
git -C .demo-vault status
```

Expected: clean. `.secondbrain/settings.json` untouched.

**5. Restart**

Close the app, start it again, Settings → Models, scan. Expected: 16384 MB still present and
still marked as entered.

**6. Clear**

Use the clear action on the row. Expected: VRAM goes back to "unknown", and the verdict and the
recommendation return to what step 3.1 showed.

**7. Language**

Switch the UI language and return. Every new label, error and the conflict note are translated;
no German string in English mode.

**8. Screenshots**

```powershell
npm run shot
```

Expected: PNGs in `.screenshots/`; the models tab shot shows the machine card with the editable
VRAM row.

## Coverage (AC → deliverable)

| AC                                                            | Deliverable                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Fill an unknown fact in through the UI, no file editing       | D4 (field) + D3 (channel)                                     |
| Survives re-scan and restart                                  | D3 (persisted in `userData`, applied in `detectMachineFacts`) |
| Visibly marked as entered, disclaimer unchanged               | D1 (`vramSource`) + D4 (marker)                               |
| Verdict uses it exactly like a detected value                 | D2 (merge + verdict test)                                     |
| Recommendation (019b) uses the same value                     | D3 (`scanCapacityVerdict` / `buildRecommendations`)           |
| Clearable, verdict falls back                                 | D3 (`null` write) + D4 (clear action) + D2 (fallback test)    |
| Bad input rejected before the verdict                         | D1 (validator) + D4 (inline error) + D3 (IPC guard)           |
| Lives on this machine, not in the vault                       | D1 (`AppSettings`) + D3 (no-vault-write test)                 |
| No hardcoded string, both languages                           | D4                                                            |
| Unit-tested merge, verdict, rejected inputs, no real hardware | D1, D2, D3                                                    |
| Conflict detection vs. entry is surfaced (Decision Q2)        | D2 (`vramConflict`) + D4 (conflict note)                      |

## Done

**Summary.** The machine card's VRAM row is now editable: a new `machine.vramOverrideMb` setting
(machine-local, `userData/settings.json`, never the vault) is merged with detection inside
`detectMachineFacts` before `judgeCapacity`/`buildRecommendations` ever see it, so the verdict and
the model recommendation both react to an entered value exactly like a detected one. The row shows
an "entered by you" marker and a clear action once a manual value is active, rejects bad input
inline before any IPC call, and surfaces a conflict note (keep mine / use detected) when a later
scan disagrees with what was typed in. Delivered as D1 (types + shared validator) → D2 (core
merge) → D3 (persist + wire into main, hard tier) → D4 (renderer row), each independently verified
and reviewed.

**Decisions (Implementation)**

- **AC 5's literal wording vs. the frozen `judgeCapacity` math.** `judgeCapacity`
  (`src/core/llm/capacity.ts`, explicitly left untouched by the Plan) always takes whichever of
  the VRAM/RAM ceilings is _tighter_, and treats VRAM as unconstrained while unknown. This makes
  it mathematically provable that entering a real VRAM figure can only hold or _narrow_ the
  reported ceiling relative to the pre-override (RAM-only) estimate — never raise it, which is
  what AC 5's illustrative example ("a model previously ruled out as too big becomes
  recommendable") describes. Both D2 and D3 hit this independently, verified it by direct
  calculation, and wrote tests asserting the actual, achievable direction (a model that fit under
  an inflated RAM-only ceiling gets excluded once a real, tighter VRAM figure is known) instead of
  forcing a fake result. The underlying requirement — "the recommendation uses the same value" —
  is real, wired, and tested; only the specific widening direction in the AC's own example doesn't
  hold, and fixing that would mean changing `judgeCapacity`'s min-of-ceilings rule, which is out of
  scope by the Plan's own decision. Confirmed independently by the review agent.
- **D1's "loads without a `machine` key" acceptance clause** has no dedicated regression test — it
  is correct by inspection of `defaultAppSettings()`'s deep-merge (the same pattern every other
  `AppSettings` field added over this project's history relies on, none of which have a per-field
  migration test either). Noted by the reviewer as a low-risk, pre-existing-pattern gap, not fixed
  to avoid introducing a one-off test convention this codebase doesn't otherwise use.
- **`MachineScanDeps`/`scanCapacityVerdict` now take `services` as a required parameter** (D3),
  not an optional override field, specifically so a caller can't silently forget to thread the
  VRAM override through — turning the exact risk named in `## Model Hints` for D3 into a compile
  error instead of an invisible bug.

**Incident during D4.** The agent implementing D4 ran an unscoped `npm run format` mid-task,
reformatting ~500 unrelated files, then an unscoped `git restore` while cleaning up, which
silently reverted several _other_ in-progress, uncommitted files back to their last-committed
state — including this story file (status/ticks/Plan/Deliverables all reverted to the pre-refine
draft) and, separately and outside this story's scope, in-progress uncommitted refine work on
`docs/sprints/S08/sprint.md` and stories 029/030/031. This story file was reconstructed by hand
from the orchestrator's own earlier read of its content (Decisions/Plan/Deliverables/Model
Hints/Test Plan/Coverage all restored verbatim); D1–D3's actual code was re-verified end to end
afterward (typecheck/lint/test/build all green, full suite 193 files / 2751 tests) and spot-checked
by the review agent against the Plan's exact shapes, not just trusted. **The loss of stories
029/030/031's and sprint.md's in-progress refine content was not recoverable** — their content was
never read into this session — and needs the user's attention before those stories are next
touched.

**Verification.**

- `npm run typecheck` — green.
- `npm run lint` — green.
- `npm test` — 193 files / 2751 tests, all green.
- `npm run build` — green.
- `npm run format:check` — fails on ~488 files repo-wide; confirmed pre-existing and unrelated to
  this story (none of the story's changed/new files are among them; `npx prettier --check` on
  every story file individually passes). Not fixed here — out of scope, would be a large unrelated
  diff.
- Code review (clean agent, default tier per `## Model Hints`): **PASS**. No weakened/deleted
  tests, no scope creep, no raw Tailwind classes, no hardcoded renderer strings, no vault write.
  Two findings, both already covered above (the AC 5 wording caveat, the D1 migration-load test
  gap) — no fix cycle needed.
- Live smoke (P2, `npm run seed && npm run shot` plus a targeted `_electron` script driving the
  actual scan → edit → invalid input → save → restart → clear flow against the demo vault):
  scan showed "unknown" VRAM with an edit affordance; typing `abc` showed an inline error and made
  no IPC call; saving `16384` showed "16 GB" with the "entered by you" marker and changed the
  verdict; the marker survived an app restart plus re-scan; clearing removed the marker; the demo
  vault's `.secondbrain/settings.json` carries no VRAM key. `npm run shot`'s regular screenshot run
  produced no console errors.

**Commit message:** `028: let me enter what the machine scan can't detect (VRAM override)`
