---
id: 029
title: I say how much of this machine a model may use
status: done # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019a-machine-scan]] and [[019b-model-recommendations]]. Builds on
[[028-i-fill-in-what-the-scan-missed]] — a budget over a VRAM figure the app does not know is a
percentage of nothing. Nothing here needs an LLM, a provider or a key.

## Requirement

The sizing heuristic plans as if the whole machine were mine to spend. It is not: while a local
model runs I still have a browser, an editor and an agent session open, and a model chosen
against 100% of the box makes the machine unusable while it answers.

I want one number in the settings — the share of this machine's resources the app may plan with
— and everything that picks a model has to size against that number instead of against the raw
hardware. At 60% on a machine with 32 GB of RAM and 16 GB of VRAM, the app plans with 19.2 GB
and 9.6 GB and recommends accordingly. Turning the number down has to visibly change what the
app suggests, or the setting is decoration.

It should be honest about what it is: a planning number for _choosing_ a model, not a throttle
on a running one. The app does not control how much memory Ollama actually takes once a model is
loaded, and it must not pretend it does.

## Acceptance Criteria

- [x] One setting, in percent, reachable in the UI, with a documented default, changeable at any
      time without a restart.
- [x] The setting lives on the machine, not in the vault — the same vault opened on a weaker
      machine does not carry a budget from the stronger one.
- [x] The machine card's verdict is computed against the budget and says so: both the real figure
      and the planned one are visible ("16 GB VRAM · planning with 12.8 GB at 80%").
- [x] The model recommendation (019b) picks its target under the same budget. Lowering the
      percentage far enough visibly changes the recommended local model for at least one task.
- [x] When nothing fits under the chosen budget any more, the app says exactly that — no local
      model fits at this share — instead of recommending something that will not run.
- [x] The existing headroom constants in `src/core/llm/capacity.ts` (OS reserve, VRAM/KV-cache
      headroom, the CPU-only penalty) keep working, and the combination is documented: it must be
      obvious from the code what 100% means and that it is still not "all of it".
- [x] Cloud models are unaffected — the budget is about what runs on this machine.
- [x] The setting's own text says what it does and does not do: it sizes the recommendation, it
      does not limit a running model.
- [x] No hardcoded string in the renderer; `de*.ts` and `en*.ts` both carry every new key.
- [x] Unit-tested: the verdict at 100 / 80 / 50 / 10 percent over the same fixture machine, a
      budget so low that `tiersThatFit` is empty, and a recommendation that changes target when
      the budget changes. The existing 019a/019b tests keep passing.

## Open Questions

- ~~**Q1 — What does the percentage apply to?**~~ answered → Decisions (Sprint)
- ~~**Q2 — Where does the budget sit relative to the existing reserves?**~~ answered → Decisions
  (Sprint)
- ~~**Q3 — One number or two?**~~ answered → Decisions (Sprint)
- ~~**Q4 — What is the default?**~~ answered → Decisions (Sprint)
- ~~**Q5 — Where does it live in the UI?**~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — scope: memory only (RAM and VRAM). The app never starts the runtime itself, so
  a CPU-core budget would influence the verdict without anything downstream acting on it.
- **(User)** Q2 — order: existing reserves (OS reserve, VRAM/KV-cache headroom, CPU-only penalty)
  apply first; the budget percentage is then applied to what is left. The existing headroom
  pipeline in `capacity.ts` stays untouched; the budget is an additional multiplier on top.
- **(User)** Q3 — one global percentage, not separate RAM/VRAM budgets, matching the requirement
  text ("I want one number in the settings").
- **(User)** Q4 — default: a lower default, not 100%. The user chose to have the feature change
  today's recommendation on day one rather than ship as pure opt-in — target 80% unless the
  refine step finds a documented reason to land elsewhere; the exact figure and its rationale
  belong in this story's plan.
- **(User)** Q5 — placement: next to the machine card in Settings → Models, where its effect on
  the verdict is directly visible.
- **Default is 80%** (the figure Q4 left to refine): it is the requirement's own worked example,
  and on the reference machine (16 GB VRAM / 32 GB RAM) it leaves ~3 GB of post-reserve memory to
  the browser, editor and agent session the requirement names while the reachable tiers stay the
  same — so the setting is honest on day one without silently shrinking anyone's recommendation on
  typical hardware.
- **Accepted range 10–100 percent, integers only.** Below 10% nothing of any size is plannable, so
  a lower value would only encode "off", which this setting is explicitly not; and 10% must stay
  reachable because AC 10 requires a budget low enough to empty `tiersThatFit`.
- **`judgeCapacity(facts, budgetPercent = 100)` — a second parameter, not a `MachineFacts`
  field.** `MachineFacts` is what the machine reports; the budget is what the user allows. The
  default of `100` also keeps every existing 019a/019b capacity fixture compiling and green (AC 10).
- **The budget multiplies `usableMb` after the fixed reserve in both ceilings** (`vramBasedCeiling`,
  `ramBasedCeiling` in `capacity.ts`) — the single place Q2's order ("reserves first, budget on
  what is left") is expressible without touching a single constant.
- **`plannedVramMb` / `plannedRamMb` / `budgetPercent` are added to `CapacityVerdict` as optional
  fields**, mirroring 028's additive extension of `MachineFacts`, so verdict fixtures in the
  recommend/reachability tests keep compiling.
- **The card shows the budgeted figure, not raw × percent.** Because reserves apply first, a
  16 GB card at 80% plans with 12 GB, not the AC's illustrative 12.8 GB; the row therefore reads
  "16 GB · planning with 12 GB at 80% after reserve" so the two numbers can never be read as a
  wrong percentage. AC 3's substance (real figure and planned figure both visible, percentage
  named) is met exactly.
- **Both memory rows carry the planned figure** (RAM and VRAM), because one global percentage
  applies to both — showing it on only one would suggest the other is unbudgeted.
- **Own channel `llm:setResourceBudget`, not the generic `settings:setApp`** — like
  `llm:setVramOverride` it writes the setting _and_ returns a fresh `MachineScanResult`, which is
  what makes AC 1's "changeable at any time without a restart" observable in one round trip.
- **AC 5's "no local model fits at this share" is stated on the machine card**, not as a second
  banner in the recommendation section: the card owns the verdict and now also owns the control
  that caused the state, so cause and consequence sit together. The recommendation rows already
  degrade honestly (`row.pick === null` → `settings.routing.noModel`) because `fitsCapacity`
  filters against the same verdict, so nothing unrunnable is ever offered.
- **A percent number field, not a slider.** No range/slider primitive exists in Gaston or
  `src/renderer/atoms/`, and inventing one is a design-system change this story has no mandate for.
- **Cloud is unaffected by construction:** `reachability.ts:116` only consults the verdict inside
  the `isLocalCapable(entry)` branch, so AC 7 needs a regression test, not new code.

## Plan

**One percentage, machine-local, applied inside the capacity math — everything downstream inherits
it.** The budget is not a fact about the machine, so it travels as a second argument to
`judgeCapacity`, applied after the existing reserves. Both the verdict on the machine card and the
model recommendation already read that one function's output, so a single seam serves AC 3 and AC 4.

1. **Shared** — `src/shared/types/settings.ts`: add `resourceBudgetPercent: number` to the existing
   `machine` block; default `80` in `src/main/settings-defaults.ts` (deep-merge on load means no
   `APP_SETTINGS_VERSION` bump, same as 028). `src/shared/types/llm.ts`: `CapacityVerdict` gains
   optional `budgetPercent`, `plannedVramMb`, `plannedRamMb`.
2. **Shared validation** — new `src/shared/llm/resource-budget.ts`, mirroring
   `src/shared/llm/vram-override.ts`: `DEFAULT_RESOURCE_BUDGET_PERCENT = 80`,
   `parseResourceBudgetPercent(raw)` → `{ ok, valuePercent } | { ok: false, error }` with
   `'empty' | 'not-a-number' | 'out-of-range'`, plus `isValidResourceBudgetPercent(n)` for the IPC
   boundary. Bounds 10–100 as named constants with a comment.
3. **Core** — `src/core/llm/capacity.ts`: `judgeCapacity(facts, budgetPercent = 100)`; both
   `vramBasedCeiling` and `ramBasedCeiling` take the budget and multiply `usableMb` _after_ the
   fixed reserve; the verdict reports `budgetPercent` and the two planned figures. Extend the
   file's header comment with the full order (raw → minus fixed reserve → × budget → ÷ GB per
   param → × comfort/CPU penalty) and state that 100% means "all of what is left after the
   reserves", not all of the machine (AC 6). No constant is changed.
4. **Main** — `src/main/ipc/machine-scan.ts`: `budgetOf(services)` beside `vramOverrideOf`, threaded
   into **all three** `judgeCapacity` call sites (lines 375, 382, 395), plus a new
   `llm:setResourceBudget` handler (validate → `patchApp` → re-scan → fresh `MachineScanResult`).
   `src/shared/ipc.ts` gets the channel next to `llm:setVramOverride`. `llm-bridge.ts` needs no
   change — it goes through `scanCapacityVerdict`.
5. **Renderer** — `MachineCard.tsx`: a budget field (draft/commit, `%` suffix, inline error,
   explanatory help text that says it sizes the recommendation and does not throttle a running
   model), the RAM and VRAM rows extended with "· planning with X at N%", and an explicit
   "no local model fits at this share" line when `tiersThatFit` is empty while the verdict is not
   `unknown`. Wired via `api.ts` / `queries/llm.ts` / `mock-bridge.ts` exactly like the VRAM
   override.
6. **i18n** — `settings.machine.budget.*` keys in `en-settings-models.ts` and
   `de-settings-models.ts`, 1:1; German uses `„…“`.
7. **Tests** — validator, capacity at 100/80/50/10 over one fixture, an empty-`tiersThatFit`
   budget, main-side persistence, recommendation target change, cloud unchanged, renderer states.

## Deliverables

**D1 — The setting, its default and a shared validator** [x]
`src/shared/types/settings.ts`, `src/shared/types/llm.ts`, `src/main/settings-defaults.ts`, new
`src/shared/llm/resource-budget.ts`, new `tests/shared/resource-budget.test.ts`. Mirror:
`src/shared/llm/vram-override.ts` and `tests/shared/vram-override.test.ts` 1:1.
_Accepted when:_ `npm run typecheck` is green, `defaultAppSettings().machine.resourceBudgetPercent`
is `80`, an `AppSettings` JSON without the field loads as `80` (no throw, no migration), and there
is one test per rejected input class (empty, non-numeric, fractional, `0`, negative, `9`, `101`)
plus accepted `10`, `80` and `100`.

**D2 — The budget inside the capacity math** [x]
`src/core/llm/capacity.ts`, `tests/core/llm/capacity.test.ts`. No Electron, no `os`, no constant
changed, no new file.
_Accepted when:_ over one fixture machine (16 GB VRAM / 32 GB RAM / 8 cores) the verdict at
100 / 80 / 50 / 10 percent is asserted, `tiersThatFit` is non-empty at 100 and empty at 10, the
ceiling is monotonically non-increasing as the percentage falls, `judgeCapacity(facts)` with no
second argument returns exactly what it returned before (all 7 existing tests unchanged and green),
`plannedVramMb`/`plannedRamMb`/`budgetPercent` are reported and equal `(raw − reserve) × percent`,
and the header comment spells out the order and what 100% does and does not mean.

**D3 — Persist the budget and thread it through every verdict** [x] _(risky, see Model Hints)_
`src/shared/ipc.ts`, `src/main/ipc/machine-scan.ts`, `tests/main/ipc/machine-scan.test.ts`,
`tests/main/ipc-coverage.test.ts`. Mirror: the `llm:setVramOverride` handler in the same file.
_Accepted when:_ `llm:setResourceBudget` persists through `SettingsService.patchApp` and returns a
fresh `MachineScanResult` whose verdict carries the new percentage; an invalid payload (`0`, `-1`,
`101`, `NaN`, non-number, fractional) is rejected with `'invalid'` and persists nothing; a test
proves **`scanCapacityVerdict` (the recommendation path) sees the budget** — the same fixture
catalogue yields a smaller recommended local model for at least one task at 40% than at 100%;
a test proves a cloud recommendation is identical at 100% and at 10%; and a test asserts no write
touches the vault settings file.

**D4 — Budget control and honest planning figures on the machine card** [x]
`src/renderer/screens/settings/MachineCard.tsx`, `src/renderer/lib/api.ts`,
`src/renderer/lib/queries/llm.ts`, `src/renderer/lib/mock-bridge.ts`,
`src/renderer/i18n/en-settings-models.ts`, `src/renderer/i18n/de-settings-models.ts`,
`tests/renderer/settings.test.tsx`. Mirror: `VramRow` in `MachineCard.tsx` (draft/commit,
`sb-numberrow`, inline error) and `useSetVramOverride` in `queries/llm.ts`.
_Accepted when:_ the card shows the current percentage with an editable field and help text that
states it sizes the recommendation and does not limit a running model; every rejected input shows
an inline error without calling the channel; the RAM and VRAM rows show real figure, planned figure
and the percentage; an empty `tiersThatFit` with a known verdict renders the explicit "no local
model fits at this share" line; both language files carry every new key with no English string in
`de*.ts` and no `„` in `en*.ts`; `npm run lint` finds no raw Tailwind palette class and no
hardcoded renderer string.

## Model Hints

- `D3 → deliverable-hard` — `judgeCapacity` has three call sites in `machine-scan.ts` (375, 382, 395) and only one of them (`scanCapacityVerdict`) feeds the recommendation: threading the budget
  into the two handler sites but not that one leaves recommendations silently planning at 100%,
  with no error, no empty state and no screen that would show it — the exact failure shape 028's D3
  hit, now with three seams instead of one.
- D1, D2, D4 → default.
- `Review: → default` — the change is additive (one setting, one channel, three optional verdict
  fields) and the one behavioural change (the arithmetic in `capacity.ts`) is pinned by named
  numeric tests at four percentages plus an unchanged-default regression, so there is no silent
  rule for an expensive reviewer to hunt.

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

**3. The setting exists and explains itself** — through the UI, no console.

1. Open **Settings → Models**, press "Scan this machine". The budget field sits with the machine
   card and reads `80 %`. Its help text says it sizes the recommendation and does not limit a
   running model.
2. Note the verdict sentence, the parameter ceiling and the tier list. The RAM and VRAM rows each
   read the real figure plus "planning with … at 80%".

**4. Turning it down changes what the app suggests**

1. Set the field to `100`. Note the ceiling and the tiers.
2. Set it to `50`. Expected: the planned figures on both rows drop, the ceiling drops, and at least
   one tier disappears from the list.
3. Scroll to the model recommendation and refresh it. Expected: at least one task's recommended
   local model is smaller than at 100%, and a cloud recommendation is unchanged.
4. Set it to `10`. Expected: the card says outright that no local model fits at this share — no
   local model is recommended that could not run.

**5. Bad input**

Try empty, `abc`, `0`, `-5`, `9` and `101`. Each shows an inline error and nothing on the card
changes.

**6. No restart, and it stays**

Set `70`, leave Settings, come back — still `70`, no restart in between. Close the app, start it
again, Settings → Models, scan: still `70` and the verdict still computed against it.

**7. Nothing landed in the vault**

```powershell
git -C .demo-vault status
```

Expected: clean; `.secondbrain/settings.json` carries no budget key.

**8. Language**

Switch the UI language and return. The label, help text, the "planning with …" rows and the "no
local model fits" line are all translated; no German string in English mode.

**9. Screenshots**

```powershell
npm run shot
```

Expected: PNGs in `.screenshots/`; the models tab shot shows the machine card with the budget field
and the planned figures.

## Coverage (AC → deliverable)

| AC                                                                                     | Deliverable                                   |
| -------------------------------------------------------------------------------------- | --------------------------------------------- |
| One setting in percent, in the UI, documented default, no restart                      | D1 (default 80) + D3 (channel) + D4 (field)   |
| Lives on the machine, not in the vault                                                 | D1 (`AppSettings`) + D3 (no-vault-write test) |
| Verdict computed against the budget, both figures visible                              | D2 (planned figures) + D4 (rows)              |
| Recommendation picks under the same budget, changes when lowered                       | D3 (`scanCapacityVerdict` test)               |
| Nothing fits → the app says exactly that                                               | D2 (empty `tiersThatFit`) + D4 (message)      |
| Existing headroom constants keep working, combination documented                       | D2                                            |
| Cloud unaffected                                                                       | D3 (regression test)                          |
| The setting's text says what it does and does not do                                   | D4 (help text, both languages)                |
| No hardcoded string, `de*.ts` and `en*.ts` complete                                    | D4                                            |
| Unit tests at 100/80/50/10, empty tiers, changed recommendation, 019a/019b still green | D2 + D3                                       |

## Done

**Summary.** Added a machine-local "resource budget" percent (10-100, default 80) that scales
what model sizing plans against, applied after the existing fixed reserves in
`src/core/llm/capacity.ts`. `judgeCapacity(facts, budgetPercent = 100)` threads the budget into
both ceilings; all three call sites in `src/main/ipc/machine-scan.ts` (the machine-card scan, the
VRAM-override re-scan, and — critically — the recommendation path `scanCapacityVerdict`) pick it
up via a new `budgetOf(services)` helper. A new IPC channel `llm:setResourceBudget` validates,
persists via `SettingsService.patchApp` (never the vault) and returns a fresh scan. The machine
card gained a draft/commit `BudgetRow` (mirroring the existing VRAM-override row) with inline
validation, help text stating the setting sizes recommendations and does not throttle a running
model, and both RAM/VRAM rows now show "X GB · planning with Y GB at N% after reserve". An explicit
"no local model fits at this share" line appears when `tiersThatFit` is empty at a known verdict.

**Decisions (Implementation).**
- D1 required nine mechanical one-line additions (`resourceBudgetPercent: 80`) to full `AppSettings`
  fixture literals in `src/renderer/lib/mock-settings.ts` and renderer test files, to keep
  `npm run typecheck` green after the field became required on `AppSettings.machine` — no other
  change in those files.
- No dedicated unit test asserts "an `AppSettings` JSON missing `resourceBudgetPercent` loads as
  80" by name; the deep-merge behaviour that provides this (`src/main/settings.ts`) is exercised
  generically and mirrors the same pre-existing gap for `vramOverrideMb` (028). Flagged by the
  reviewer as a minor documentation/traceability gap, not a functional defect — left unfixed by
  agreement with the review verdict (PASS).
- Cloud recommendations are unaffected by construction (`reachability.ts` only consults the
  verdict inside `isLocalCapable`), confirmed by a regression test rather than new guard code.

**Verification.**
- `npm run typecheck`, `npm run lint`, `npm run build` — all green.
- `npm test` — 194 files, 2797 tests, all green (includes new/updated tests in
  `tests/shared/resource-budget.test.ts`, `tests/core/llm/capacity.test.ts`,
  `tests/main/ipc/machine-scan.test.ts`, `tests/renderer/settings.test.tsx`).
- Code review (clean agent, default tier per Model Hints): **PASS**, all ten acceptance criteria
  individually confirmed with file:line evidence; the three-call-site risk named in Model Hints
  verified fixed; no weakened tests, no scope creep beyond the disclosed mechanical fixture
  updates, no hardcoded renderer strings, no raw Tailwind palette classes.
- Live smoke (P2, `npm run seed && npm run shot` plus a scoped ad-hoc Playwright `_electron` script
  to drive the interactive parts the static shot script doesn't reach): scanned the machine,
  confirmed the "Ressourcen-Budget 80 %" row with help text and "Ändern" control; entering `9`
  showed the inline error "Eine Zahl von 10 bis 100 eingeben." without changing the stored value;
  committing `40` updated the verdict live (parameter ceiling halved, 13B dropped from the fit
  list, RAM row read "32 GB · geplant mit 11 GB bei 40 % nach Reserve") with no restart; confirmed
  `.demo-vault/.secondbrain/settings.json` carries no budget/machine key, only `userData`'s
  `settings.json` does. Temporary smoke script and its output screenshots were deleted afterward;
  the regular 61-screenshot `npm run shot` baseline in `.screenshots/` is untouched.
- Open points: none blocking.

**Commit message:** `029: budget how much of this machine a model may use`
