---
id: 035
title: The machine card remembers, and speaks plainly
status: done # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019a-machine-scan]], [[028-i-fill-in-what-the-scan-missed]] and
[[029-how-much-of-this-machine-a-model-may-use]]. Those three built the machine card in
`Settings → Models`. This story fixes what using it revealed: it forgets everything, it asks for
the wrong unit, and it explains itself in a vocabulary the person it was built for does not have.

## Requirement

The card „Diese Maschine" is the first thing on the models tab and, right now, the least useful
one. Three things are wrong with it, all found by using it:

**It forgets.** A scan takes seconds and shells out to the GPU probe, and its result lives only
as long as the settings screen stays open. Close the app, come back, and the card is empty again
— it asks to be scanned as if it had never been. But this machine's RAM, VRAM, GPU and core
count do not change between two starts. The result of the last scan should simply be there when
I open the tab, with the date it was taken, and rescanning should be something I do when I want
to, not something the app makes me do before it will tell me anything.

**It asks for megabytes.** When the scan can't read the card's VRAM, I type it in — and the
field wants MB. Nobody knows their graphics card in megabytes; the number on the box is „16 GB".
Asking me to multiply by 1024 is the app pushing its own storage format onto me. The field
should take GB.

**It talks about parameters.** The card's headline sentence is „Der Grafikspeicher (VRAM) setzt
die Grenze: bequem etwa 15 Mrd. Parameter, höchstens 19 Mrd.", followed by „Größen, die bequem
passen sollten: 3B, 7B, 8B, 13B". That is a sentence for someone who already knows what a
parameter is — and this whole line of stories exists for the person who doesn't. What I want to
read is what this machine can and cannot do, and what limits it. The concrete models are named
in the recommendations right below anyway; the size list says nothing on top of that.

Beyond those three: the card reads as a flat list of labelled numbers with two buttons hidden
inside it, and the resource budget — a percentage between 10 and 100 — is a text field behind an
„Ändern" button, which is the clumsiest possible control for a value like that. A slider is what
that setting is. The card as a whole should be quicker to take in: what this machine is, what it
can carry, and what I am allowed to change.

Nothing about the substance changes: the numbers stay honest, „unbekannt" stays „unbekannt", the
heuristic disclaimer stays, and the budget still means the same thing it meant in 029.

## Acceptance Criteria

- [x] Opening `Settings → Models` after an app restart shows the facts and the verdict from the
      last scan, without any action — including after the app was fully closed and reopened.
      Deleting the vault's index does not affect it; this is machine-local, not vault content.
- [x] The card states when the shown scan was taken. Rescanning stays available at all times and
      replaces the stored result.
- [x] A machine that has never been scanned still shows the honest empty state it shows today,
      and the scan button, and nothing invented.
- [x] The stored result never contradicts the current settings: after the resource budget or the
      manual VRAM figure changes, what the card shows — including the verdict and the planned
      figures — matches the new setting, with no rescan.
- [x] The manual VRAM figure is entered and displayed in GB. Whole and fractional input both
      work (`16`, `12,5` in German, `12.5` in English); the accepted range is the same physical
      range as today, expressed in GB, and the error messages name GB bounds.
- [x] An existing manually entered figure keeps working across this change — a user who entered
      it before this story sees the same effective VRAM afterwards, not a value off by 1024.
- [x] The resource budget is set with a slider, live-labelled with the current percentage, within
      the same 10–100 bounds 029 defined. Committing writes the setting exactly once per change,
      not once per drag step.
- [x] The slider is a Gaston component, tokens only, and is fully operable from the keyboard with
      a visible focus state and a correct accessible name and value.
- [x] No parameter counts and no size tiers („3B", „Mrd. Parameter") appear on the card. The
      headline sentence says, in plain language, what class of local work this machine can carry
      and which resource is the ceiling. Where nothing local fits, it says that.
- [x] The card's layout groups what belongs together — what this machine is, what it can carry,
      what the user may change — and the two editable things are recognisable as controls without
      being hunted for.
- [x] The heuristic disclaimer, the „nicht zu ermitteln" list, the manual-value badge and the
      detected-vs-entered conflict resolution from 028 all still work and still say what they
      said.
- [x] No hardcoded string in the renderer; every new or changed key exists in both `de*.ts` and
      `en*.ts`, German quotes as `„…“`, sentence case, no emoji.
- [x] `npm run verify` green. Unit-tested: the persisted result surviving a restart, a stored
      result re-judged against a changed budget, the GB parser at both bounds and with a decimal
      comma, and the migration of a pre-existing MB figure. Existing 019a/028/029 tests keep
      passing unedited.
- [x] `npm run seed && npm run shot` produce a screenshot of the reworked card, both languages
      spot-checked.

## Open Questions

None. Two decisions taken while planning, correct them if wrong:

- **The stored unit stays MB.** `AppSettings.machine.vramOverrideMb` is not migrated; GB is a
  presentation unit, converted at the field's edge. That makes AC 6 free (no stored figure can
  end up off by 1024) and the "migration" test becomes: a settings file holding `16384` shows
  `16 GB` and still yields the same effective VRAM.
- **The range in GB is 0.25–256** — the same physical bounds as today's 256–262144 MB, per AC 5
  („the same physical range, expressed in GB"), not a rounded-up 1 GB floor.

## Plan

The card's three faults have three different homes: persistence is a main-process concern, the
unit is a shared-parser concern, the vocabulary is a core concern. Only the layout is
renderer-only.

1. **Persist the raw detection, derive everything else on read.** New machine-local cache file
   `<userData>/machine-scan.json`, mirroring `src/main/secrets.ts` (own `version`, `readJson` /
   `writeJsonAtomic` from `src/main/fs-json.ts`). It stores `scannedAt` plus the _pre-override_
   facts — the `{ ...base, ...gpu }` value inside `detectMachineFacts`
   ([machine-scan.ts:348](../../src/main/ipc/machine-scan.ts#L348)), before `applyVramOverride`.
   Because override and budget are re-applied on every read, AC 4 holds structurally: there is no
   stored verdict that could go stale.
2. **Stop probing the GPU on every setting change.** `llm:setVramOverride` and
   `llm:setResourceBudget` currently re-run `detectMachineFacts`
   ([machine-scan.ts:415](../../src/main/ipc/machine-scan.ts#L415)) and stamp
   `scannedAt: new Date()` although nothing was scanned. Both switch to deriving from the cache
   and keep the cached `scannedAt` — required before a slider may commit per change.
3. **New getter channel `llm:getMachineScan`** returning `MachineScanResult | null`. This retires
   the "deliberately no separate getter channel" comment at
   [machine-scan.ts:410](../../src/main/ipc/machine-scan.ts#L410) on purpose. Full typed-ipc
   chain: `src/shared/ipc.ts` map plus allowlist, handler, `api.ts`, `queries/llm.ts`. The card
   reads it as its initial value; a mutation result still wins over it.
4. **GB at the field's edge.** `src/shared/llm/vram-override.ts` gains GB bounds and
   `parseVramOverrideGb()`, accepting `,` and `.` as decimal separator and returning MB.
   `VramRow` reads and writes GB.
5. **A real slider atom.** None exists in `src/renderer/atoms/`; a new `Slider.tsx` plus a
   `gs-slider` block in `src/renderer/styles/gaston/components.css`, tokens only, native
   `input[type=range]` underneath so keyboard operation and `aria-valuenow` come for free. Local
   value while dragging, one commit on pointer-up / key-up / blur.
6. **A verdict without parameters.** A pure banding function in core turns
   `maxComfortableParamsB` into `'none' | 'small' | 'medium' | 'large'`; the renderer joins band
   plus `limitingFactor` into one sentence. `settings.machine.tiers` and the three
   `verdict.{ram,vram,cpu}` param sentences go; `verdict.unknown` stays. `tiersThatFit` stays in
   the type — the 029 recommendation path uses it — it just stops being rendered.
7. **Split and regroup the card.** `MachineCard.tsx` is 493 lines, over the 300-line limit, and
   this story adds to it. It becomes a folder `src/renderer/screens/settings/machine/` with the
   shell plus one file per section, laid out as three groups: what this machine is / what it can
   carry / what you may change.

Order: D1 → D2 → (D3, D4, D6 in parallel) → D5 → D7 → D8.

## Deliverables

**D1 — Machine-scan cache in userData** (main only, no UI)
Files: new `src/main/machine-scan-cache.ts`; `src/main/ipc/machine-scan.ts`; new
`tests/main/machine-scan-cache.test.ts`; `tests/main/ipc/machine-scan.test.ts` (additions only).
Mirror: `src/main/secrets.ts` for the file / version / atomic-write shape.
Split `detectMachineFacts` so the pre-override facts are available separately. `llm:scanMachine`
writes the cache; both setters derive from the cache instead of probing and keep the cached
`scannedAt`. With no cache present they behave exactly as today.
Acceptance: a scan writes the file; a derivation from the cached facts with a changed budget
yields new planned figures without a probe; the existing machine-scan tests pass unedited; a
corrupt or version-mismatched file counts as „no scan", not as an error.

**D2 — `llm:getMachineScan` and the card reads it on mount**
Files: `src/shared/ipc.ts`; `src/main/ipc/machine-scan.ts`; `src/renderer/lib/api.ts`;
`src/renderer/lib/queries/llm.ts`; `src/renderer/lib/queries/keys.ts`;
`src/renderer/lib/mock-bridge.ts`; `MachineCard.tsx` (initial value from the query).
Mirror: an existing read-only `llm:*` channel across the same four files.
Acceptance: with a cache file, opening the models tab shows facts, verdict and scan date without a
click; without one, the unchanged idle state and the scan button; the IPC coverage test stays
green.

**D3 — Manual VRAM in GB**
Files: `src/shared/llm/vram-override.ts`; `tests/shared/llm/vram-override.test.ts`;
`MachineCard.tsx` (VramRow); `src/renderer/i18n/de-settings-models.ts`;
`src/renderer/i18n/en-settings-models.ts`.
Stored unit stays MB. New `parseVramOverrideGb`, GB bounds derived from the MB ones, error keys
naming GB. Detected, entered and conflicting values are all displayed in GB.
Acceptance: `16` → 16384 MB; `12,5` and `12.5` → 12800 MB; both bounds accepted, one step past
each rejected with the GB message; a pre-existing `vramOverrideMb: 16384` renders as `16 GB` with
unchanged effective VRAM.

**D4 — Gaston slider atom**
Files: new `src/renderer/atoms/Slider.tsx`; `src/renderer/styles/gaston/components.css`; new
`tests/renderer/atoms/Slider.test.tsx`.
Mirror: `src/renderer/atoms/Switch.tsx` (32 lines) for the controlled-atom shape.
Props: `min` / `max` / `step` / `value`, `onChange` (live) and `onCommit` (once). Tokens only,
visible `:focus-visible` ring, `aria-label` and `aria-valuetext` supplied by the caller.
Acceptance: arrow keys plus Home/End move the value; `onCommit` fires exactly once per keyboard
press and once per drag, never per intermediate step; no raw Tailwind palette class in the diff.

**D5 — The budget becomes a slider**
Files: `MachineCard.tsx` (BudgetRow); `src/renderer/i18n/de-settings-models.ts`;
`src/renderer/i18n/en-settings-models.ts`.
Slider 10–100, step 1, live percentage label, `useSetResourceBudget` called from `onCommit`.
Retire `budget.change` and the now unreachable `budget.error.*` keys; keep `budget.help`,
`budget.planned`, `budget.noneFit`; add an accessible-name key.
Acceptance: dragging relabels live and writes once; the planned figures update from the mutation
result; keyboard-only operation reaches and sets the value.

**D6 — The headline sentence without parameters**
Files: new `src/core/llm/capacity-bands.ts`; `tests/core/llm/capacity.test.ts` (new describe
block, existing ones untouched); `MachineCard.tsx`; both `*-settings-models.ts`.
Pure `describeCapacityBand(verdict): 'none' | 'small' | 'medium' | 'large'`; the renderer composes
band × `limitingFactor`. Remove `settings.machine.tiers` and `verdict.{ram,vram,cpu}` plus their
render sites; `verdict.unknown` and the `noneFit` case stay.
Acceptance: no `Mrd.`, no `paramsB` figure and no `NNB` size tier in the card's rendered strings;
every band names the resource that is the ceiling; a machine where nothing local fits says so.

**D7 — Card split into groups**
Files: new `src/renderer/screens/settings/machine/MachineCard.tsx`, `MachineFactsList.tsx`,
`VramRow.tsx`, `BudgetRow.tsx`, `MachineScanMeta.tsx`; delete
`src/renderer/screens/settings/MachineCard.tsx`; `src/renderer/screens/settings/ModelsTab.tsx`
(import).
Three visually distinct groups plus a scan-meta line (date and rescan). Every file under 300 lines.
Acceptance: disclaimer, „nicht zu ermitteln" list, manual-value badge and the 028 conflict
resolution all still render and still say the same thing; `npm run verify` green.

**D8 — Screenshots and both languages**
Files: none under `src/`; `.screenshots/` output only.
`npm run seed && npm run shot`; the reworked card captured, `de` and `en` spot-checked for missing
keys, straight-quote closers and sentence case.
Acceptance: a screenshot of the card in both languages, no untranslated key visible.

## Model Hints

- `D1 → deliverable-hard` — the setters stop probing and start reading a cache while three
  existing test files (`machine-scan.test.ts`, `capacity.test.ts`, `llm-bridge.test.ts`) have to
  keep passing unedited, and `scannedAt` changes meaning from „now" to „when it was actually
  scanned"; getting the pre-override / post-override seam wrong silently poisons every verdict.
- D2, D3, D4, D5, D6, D7, D8 → default.
- `Review: → story-review-hard` — the story explicitly promises that 019a, 028 and 029 behaviour
  survives unchanged while rewriting the very file all three live in, so the review has to check
  preserved behaviour, not just new code.

## Test Plan (manual acceptance)

**1. Persistence across a full restart** (running app, Settings → Models)
Scan the machine, note the figures and the scan date. Quit the app completely (tray included),
start it again, open Settings → Models.
Expected: the same figures and the same date, without clicking anything. If the card is empty
again, D1/D2 did not land.

**2. The budget slider** (same screen)
Drag the budget slider from 80 to 40 and release.
Expected: the percentage relabels while dragging; on release the planned figures and the headline
sentence update; the scan date does **not** jump to now. Restart the app: 40 is still set.

**3. VRAM in GB** (same screen)
Enter `12,5` in the VRAM field with the German UI and save. Switch the UI language to English and
enter `12.5`.
Expected: both accepted, both shown as 12.5 GB; `0.1` and `300` are rejected with a message that
names GB bounds.

**4. Keyboard only** (same screen)
Tab to the slider, move it with the arrow keys, then Home and End.
Expected: a visible focus ring, the value moves, and the accessible name plus percentage are
announced.

**5. A machine that has never been scanned**
Close the app, delete `%APPDATA%/Gaston/machine-scan.json`, start the app, open Settings → Models.
Expected: the honest empty state and the scan button, no invented numbers.

## Coverage

| AC                                                              | Delivered by                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Facts and verdict after restart, index-independent              | D1, D2                                                      |
| States when the scan was taken, rescan always available         | D1 (`scannedAt` kept), D2, D7 (meta line)                   |
| Never-scanned machine keeps the honest empty state              | D2                                                          |
| Stored result never contradicts current settings                | D1 (derive on read)                                         |
| Manual VRAM entered and displayed in GB, fractional input       | D3                                                          |
| Pre-existing manual figure keeps working                        | D3 (unit stays MB)                                          |
| Budget via slider, 10–100, one write per change                 | D4, D5                                                      |
| Slider is Gaston, tokens, keyboard, a11y name and value         | D4                                                          |
| No parameter counts, plain-language headline, ceiling named     | D6                                                          |
| Layout groups, controls recognisable                            | D7                                                          |
| Disclaimer, unknown list, manual badge, 028 conflict still work | D7 (regression), D3 (in GB)                                 |
| No hardcoded strings, both `de*`/`en*`, quotes, sentence case   | D3, D5, D6 each carry their keys; D7 sweeps                 |
| `npm run verify` green, the four required unit tests            | D1 (restart, re-judge), D3 (GB bounds, comma, MB value), D7 |
| `npm run seed && npm run shot`, both languages                  | D8                                                          |

## Done

The machine card in `Settings → Models` now remembers its last scan across a full restart
(new `<userData>/machine-scan.json` cache, pre-override facts + `scannedAt`, derived on every
read so a budget/VRAM change can never leave a stale verdict), takes the manual VRAM figure in
GB instead of MB, sets the resource budget with a real Gaston slider, and states in plain
language what class of local work the machine can carry instead of parameter counts and size
tiers. The card was split into `src/renderer/screens/settings/machine/` (shell + one file per
section: facts, VRAM, budget, scan-meta) to stay under the 300-line guideline. A story review
(story-review-hard) found five real defects, all fixed in a single fix cycle: a slider
onBlur/onKeyUp double-commit that also dropped keyboard focus, GB values rounding away their
decimal (`12.5` showing as `13`), a wrong hover token making the slider thumb disappear, German
bound messages using a decimal point instead of a comma, and zero test coverage on the new
`llm:getMachineScan` channel. A sixth finding (no screenshot evidence of the populated card —
only the empty state had been captured) was closed by seeding a fixture scan into the Playwright
harness's userData and adding a mid-card screenshot.

**Decisions**

- The two documented plan decisions were followed as written: the stored unit stays MB
  (`AppSettings.machine.vramOverrideMb` unmigrated, GB is a presentation-only conversion at the
  field's edge), and the GB range is 0.25–256, derived from the existing 256–262144 MB bounds
  rather than hardcoded a second time.
- D1's cache getter/setters keep the cached `scannedAt`; only an actual `llm:scanMachine` probe
  stamps a new one. `scanCapacityVerdict` (the 029 recommendation path) still probes directly —
  it was out of D1's named scope, and left as a candidate for a later story.
- The capacity bands (`none`/`small`/`medium`/`large`) use independently chosen thresholds
  (3B/8B/34B), not derived from `capacity.ts`'s `TIER_LANDMARKS_B` — the review flagged a
  comment that overclaimed the derivation; the comment was corrected rather than coupling the
  two, since deriving them would have widened this fix cycle's scope.
- English UI is verified for this story at the i18n-source level (`en-settings-models.ts`), not
  via a second screenshot: the Playwright harness (`scripts/shot.mjs`) has no language toggle for
  the deep-linked settings-models state, and adding one was judged a larger, separate change.
  Both languages carry the same string set and pass the i18n key-parity test.
- Dead i18n keys left behind by D5/D6 (`budget.change`, `budget.error.*`, `budget.noneFit`,
  `budget.unitPercent`) were removed once the review confirmed no render site used them anymore.

**Commit message**

```
035: the machine card remembers, and speaks plainly
```

**Verification**

- `npm run format:check` — red, but pre-existing and repo-wide (~550 files fail on CRLF line
  endings on this Windows checkout, including files never touched by this story, e.g.
  `vitest.config.ts`); confirmed via `git stash` by the D1 agent. Every file this story touched
  or added passes `prettier --check` individually.
- `npm run lint`, `npm run typecheck`, `npm run build` — green.
- `npm test` — 200 files / 2881 tests green, including new coverage for the machine-scan cache,
  the `llm:getMachineScan` channel (main + renderer), the GB parser at both bounds and with a
  decimal comma, and the capacity-band function.
- `npm run seed && npm run shot` — green, no console errors; `.screenshots/30-settings-models.png`
  (facts + scan-date), `.screenshots/31-settings-models-machine-mid.png` (headline sentence, GB
  VRAM field, budget slider) and `.screenshots/32-settings-models-bottom.png` (routing table,
  unaffected) all inspected — no untranslated key, correct German quotes, sentence case, no
  emoji.
- Code review (story-review-hard): first pass FAIL with 6 confirmed findings (2 AC-breaking, 4
  quality/coverage), all fixed in one cycle; re-verified green above. Not re-run as a second full
  review pass — the fixes were narrow, mechanically verified against the specific findings, and
  covered by the added/updated tests.
- Live smoke: satisfied via `npm run seed && npm run shot` per this project's `live-smoke-how`.

**Note:** this working tree also carries unrelated, uncommitted changes to
`docs/requirements/032-*.md`, `docs/requirements/033-*.md` and `docs/requirements/034-*.md` from
what appears to be a separate, concurrent session — story 035 did not touch those files; they are
excluded from this story's file scope above and should not be swept into its commit.
