---
id: 067
title: A sensitive task's recommendation explains a dead end
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

From the user's own feedback (2026-09-07): running "condense-area" failed with
`llm-unavailable: kein Modell für die Aufgabe „condense-area" konfiguriert`, and going into
Settings to fix it found no assignable model at all — no error, no explanation, just nothing to
pick.

Investigated the same day: `condense-area` (and `condense-project`) are fully registered
(`src/core/llm/tasks.ts:126-140`) and render correctly in both Settings mechanisms. The manual
routing table (`src/renderer/screens/settings/RoutingSection.tsx`,
`src/renderer/components/RoutingTable.tsx`) works and is unfiltered. The guided recommendation
(`src/renderer/screens/settings/RecommendationSection.tsx` → `src/core/llm/recommend.ts`) is
where it goes quiet: for a `sensitive: true` task, candidates are filtered to local providers or
an attributed no-training cloud policy (`src/core/llm/sensitive.ts:119-144`), and `condense-area`'s
`suggested: 'strong'` tier has no `minLocalParamsB` override, so it falls back to a 13B+ local
floor (`src/core/llm/tiers.ts:83-87`). When neither survives, `recommendForTask` returns
`pick: null` with a reason key, and `RecommendationRow.tsx:148-166` renders that reason and
**nothing else** — no select, no alternatives, no pointer to the manual table one section down.

## Requirement

When Settings' guided model recommendation has nothing to propose for a task, the user should not
be left staring at a dead end. The row should say why (it already does) and also say what to do
about it — at minimum, that the task can still be assigned manually below. This is a presentation
fix; whether the sensitivity/tier thresholds themselves should change is a separate, harder call
(see Open Questions).

## Acceptance Criteria

- [x] **AC1** — When a task's guided recommendation has no qualifying candidate (`pick === null`),
      the row shows the existing reason **and** a concrete next step (e.g. a pointer to the manual
      assignment table), instead of ending in a bare sentence with no control at all.
- [x] **AC2** — The manual routing table remains the actual way out: assigning `condense-area` (or
      any sensitive task) a model there works, is saved, and is what the task uses on its next run.
- [x] **AC3** — The `llm-unavailable` error surfaced when running a task with no assigned model
      (e.g. from `LlmMissing`) still leads to Settings' Models tab, unchanged from today — this
      story does not touch that link, only what the user finds after following it.

## Open Questions

- ~~Should `condense-area`/`condense-project`'s `minLocalParamsB` be lowered so more local setups
  qualify (a quality/availability trade-off), or should the fix stay presentation-only (explain +
  redirect) and leave the threshold as a deliberate quality floor?~~ answered → Decisions (Sprint)
- ~~Should the manual table warn (not block) when a sensitive task is assigned a model that would
  not have passed the sensitivity filter — a visible trade-off instead of a silent one?~~ answered
  → Decisions (Sprint)
- Noted gap for the sprint review (not a blocker, not a question): AC2's _assignment_ step cannot
  be driven end to end in the e2e harness, because the harness vault has no reachable provider and
  the routing select's model options come from live provider listing (`ProviderDialog` has no
  manual model field). AC2 is therefore proven by a renderer test on the real component plus an
  e2e assertion that the `condense-area` select exists, is enabled and is unfiltered. See
  `## Acceptance Tests`.

## Plan

Presentation-only, three small layers, in this order:

1. **Core (pure, no new IPC):** add one verdict helper to `src/core/llm/sensitive.ts` —
   `judgeRouteForSensitiveTask(task, ref, providers, entries)` → `{ warn: false }` or
   `{ warn: true, reason: SensitiveRefusalReason }`. It holds no rule of its own: non-sensitive
   task → no warning, provider `local === true` → no warning, otherwise it looks the model up in
   the catalogue and delegates to the existing `judgeForSensitiveTask`. A model that is not in the
   catalogue fails closed (`policy-unknown`), matching the module's stated direction of failure.
2. **Recommendation dead end (AC1):** `RecommendationRow` gets, for `pick === null`, a pointer
   sentence plus an "Assign manually" button. The button raises a signal up through
   `RecommendationSection` → `ModelsTab` → `RoutingSection`, which scrolls the matching routing row
   into view and focuses its select. The signal mirrors the existing `proposeSignal` prop
   (`RoutingSection.tsx:43,95-100`); the focus target is a stable `id` on the row's `Select`.
   Note: in `ModelsTab` the routing table sits **above** the recommendation panel, so the copy says
   "above", not "below".
3. **Manual table warning (AC2, user decision):** `RoutingTable` renders, per row, an inline note
   under the select when `judgeRouteForSensitiveTask` warns. Non-blocking: the option stays
   selectable, nothing is filtered. The catalogue comes from `loadCatalogue()` imported
   renderer-side (pure, 3.4 KB bundled JSON; same pattern as `MachineCard.tsx:27` importing
   `@core/llm`).
4. **Tests:** unit for the core helper, renderer tests for both UI changes, and one e2e spec that
   walks the reported journey — Ask screen's `LlmMissing` link → Settings Models tab → get
   recommendations → dead-end row → "Assign manually" → routing select focused.

No new IPC channel, no CSS additions (reuses `sb-routing-fallback` / `sb-routing-hint`), no change
to thresholds, filters or write paths.

## Deliverables

- **D1 — core verdict helper.** `src/core/llm/sensitive.ts` (+ ~30 lines, stays under the 300-line
  soft cap) plus its test in `tests/core/llm/sensitive.test.ts`.
  Acceptance: `judgeRouteForSensitiveTask` returns no warning for a non-sensitive task, no warning
  for a provider with `local === true`, and `{ warn: true, reason }` with the correct
  `SensitiveRefusalReason` for a cloud provider whose catalogue entry `trains` / is `unknown` /
  claims `no-training` without attribution — and for a model id absent from the catalogue
  (`policy-unknown`, fail closed). No rule logic is duplicated: it calls `judgeForSensitiveTask`.
- **D2 — the dead-end row offers a way out (AC1).**
  `src/renderer/screens/settings/RecommendationRow.tsx`, `RecommendationSection.tsx`,
  `ModelsTab.tsx`, `RoutingSection.tsx`, `src/renderer/components/RoutingTable.tsx` (stable `id`
  on the select only), `src/renderer/i18n/en-settings-models.ts`, `de-settings-models.ts`, plus its
  test in `tests/renderer/routing-dead-end.test.tsx`.
  Mirror: the signal prop after `RoutingSection.tsx:43` (`proposeSignal`), the actions block at
  `RecommendationRow.tsx:147-167`.
  Acceptance: for every `pick === null` row (any reason key) the reason sentence is still shown and
  is followed by a pointer sentence and an "Assign manually" button; clicking it focuses the
  routing select of that task; rows with a pick are unchanged.
- **D3 — sensitivity warning in the manual table (AC2).**
  `src/renderer/components/RoutingTable.tsx`, `src/renderer/screens/settings/RoutingSection.tsx`,
  `src/renderer/i18n/en-settings-models.ts`, `de-settings-models.ts`, plus its test in
  `tests/renderer/routing-table.test.tsx`.
  Mirror: the sensitive `Badge` at `RoutingTable.tsx:117-121` and the fallback note at
  `RoutingTable.tsx:104-109`.
  Acceptance: assigning a sensitive task a model that fails the filter shows one inline warning
  sentence naming the reason and still calls `onSetRoute` with that ref (never blocks, never
  filters the options); a passing model or a non-sensitive task shows no warning.
- **D4 — the reported journey as an e2e spec (AC1, AC3, part of AC2).**
  `tests/e2e/settings-models-dead-end.spec.ts`. Mirror: `tests/e2e/smoke.spec.ts:1-11` (fixtures
  from `./fixtures/vault`, `test.use({ specId: … })`, rail navigation via
  `page.locator('.sb-rail a[href="#/settings"]')`).
  Acceptance: from the Ask screen the `LlmMissing` link lands on Settings' Models tab; "Get
  recommendations" produces a dead-end row whose reason plus next-step control are visible;
  clicking "Assign manually" focuses the `condense-area` routing select, which exists and is
  enabled.

## Model Hints

- D1 → default
- D2 → default
- D3 → default
- D4 → `deliverable-hard` — first e2e spec that crosses two screens into a Settings tab with no
  existing settings page object, and it asserts focus after a scroll; a flaky spec here blocks the
  sprint's acceptance gate rather than just failing loudly.
- Review: → default — presentation-only change, no write path, no threshold or filter touched, and
  the one piece of logic is a pure helper with its own unit test.

## Acceptance Tests

- AC1 → renderer `tests/renderer/routing-dead-end.test.tsx` › "a no-pick row shows the reason and
  a way out" (D2) — proves the UI mechanism (reason, pointer, "Assign manually", focus) against
  the real component tree. The e2e half originally planned here could not be written: on the
  harness's actual machine capacity, `condense-area` always gets a pick, never `pick === null` —
  see the second entry under `### Noted gap` above. `tests/e2e/settings-models-dead-end.spec.ts`
  proves AC3 and AC2's reachable half instead, and documents the gap in its own header comment.
- AC2 → renderer `tests/renderer/routing-table.test.tsx` › "a sensitive task can still be assigned
  a model that fails the sensitivity filter, with a warning" (D3), plus unit
  `tests/core/llm/sensitive.test.ts` › "a routed target is judged against the sensitivity rule"
  (D1), plus e2e `tests/e2e/settings-models-dead-end.spec.ts` › "the condense-area routing select
  is present and enabled" (D4)
- AC3 → e2e `tests/e2e/settings-models-dead-end.spec.ts` › "the no-model note leads to the models
  tab" (D4)

### Noted gap

AC2's persistence half ("is saved, and is what the task uses on its next run") is existing,
untouched behaviour of `llm:setRoute` and stays covered by the existing routing tests; the _new_
e2e cannot drive an assignment because the no-model harness offers no model options in the select
(see `## Open Questions`). No manual step is introduced — the gap is reported to the sprint review.

**A second, unanticipated gap surfaced during D4 (build, 2026-09-07):** the story's plan assumed
the e2e harness would produce a `pick === null` row for `condense-area` so AC1's dead end could be
driven through the real surface. It does not, on the harness's actual capacity: the four local
catalogue entries are reachable as `needs-download` on any machine whose capacity verdict carries
them, and they pass the sensitivity rule via their attributed `no-training` policy, so
`recommendModels` always returns a pick for `condense-area` — never the dead end — on the machine
this was built and verified on (12 GB VRAM → ~16 B ceiling, above `condense-area`'s 13 B `strong`
floor). A dead-end row only appears when `judgeCapacity`'s ceiling falls under the task's parameter
floor, i.e. on small-VRAM hardware only; asserting it in e2e would assert the host's GPU size, not
the feature. `tests/e2e/settings-models-dead-end.spec.ts` therefore proves AC3 in full and AC2's
reachable half, and documents this exact limitation in its own header comment, instead of forcing
a hardware-dependent assertion. AC1's UI mechanism (reason sentence, pointer, "Assign manually"
button, focus-on-click) is proven instead by `tests/renderer/routing-dead-end.test.tsx`, which
renders the real component tree (`RecommendationRow` → `RecommendationSection` → `ModelsTab` →
`RoutingSection`) and asserts real DOM focus after a real click — not a faked signal. Reviewed and
accepted (clean-agent code review, story 067 build): PASS, gap treated as harness-bound residue
rather than a blocker, same class as the AC2 gap above. No fix is available inside this story's
scope without adding a deterministic capacity override to the e2e harness (e.g. an `SB_E2E_*`
machine-facts pin) — out of scope for a presentation-only fix; left as a possible follow-up story
if AC1's dead-end path is ever needed as a hardware-independent e2e assertion.

## Decisions (Sprint)

- **(User)** Threshold vs. presentation-only fix: presentation-only. The `minLocalParamsB` floor
  stays a deliberate quality gate; only the dead-end UX is fixed.
- **(User)** Manual table warning: add a small inline warning when a sensitive task is assigned a
  model that would not pass the sensitivity filter; the table stays permissive as the escape hatch.
- The next step is a real control, not only a sentence: an "Assign manually" button that focuses
  the task's routing select, because `ui-acceptance-required` wants the criterion proven as a user
  action through the real surface, and a bare sentence gives an e2e nothing to click.
- The pointer applies to every `pick === null` row, not just sensitive ones: the dead end looks
  identical for `no-reachable-model` and `beyond-this-machine`, and AC1 is phrased on
  `pick === null`.
- The copy says the table is _above_: in `ModelsTab.tsx:219-238` `RoutingSection` renders before
  `RecommendationSection`, so the story text's "one section down" is factually wrong.
- The sensitivity check for the table is a new pure helper in `src/core/llm/sensitive.ts`, not
  inline renderer logic, because that module is declared the single place the rule is decided.
- The catalogue reaches the renderer by importing `loadCatalogue()` from `@core/llm/catalogue`
  rather than through a new IPC channel: it is a pure, bundled 3.4 KB JSON with a type-only import
  graph, and `MachineCard.tsx:27` already imports from `@core/llm` — a channel would be ceremony
  for static data.
- An unknown model id fails closed (warning shown) rather than staying silent, matching the
  direction-of-failure rule stated at the top of `sensitive.ts`.
- The warning is a visible inline note under the select, reusing `sb-routing-fallback`, instead of
  a `title`-only badge: a trade-off the user has to see cannot live in a tooltip, and reusing the
  class keeps the change free of new CSS or raw palette values.
- Both the warning reason sentences and the dead-end copy get new keys in the existing
  `settings.routing.*` namespace in `en-settings-models.ts` / `de-settings-models.ts`, covered by
  the existing parity test `tests/renderer/i18n.test.ts`.
- The e2e spec enters through the Ask screen's `LlmMissing` note (`AskPanel.tsx:220`), because that
  is the reported journey and the cheapest `LlmMissing` surface to reach on an empty vault.

## Done

Added `judgeRouteForSensitiveTask` as a pure delegate to the existing sensitivity rule
(`src/core/llm/sensitive.ts`); the guided recommendation's dead-end row now shows a pointer
sentence plus an "Assign manually" button that scrolls/focuses the matching routing select
(`RecommendationRow.tsx` → `RecommendationSection.tsx` → `ModelsTab.tsx` → `RoutingSection.tsx`);
the manual routing table shows a non-blocking inline warning when a sensitive task is routed to a
model that fails the sensitivity filter (`RoutingTable.tsx`, importing the bundled catalogue
directly, no new IPC). New copy lives in the existing `settings.routing.*` i18n namespace. No
threshold, filter, or write path was touched — presentation-only, as decided.

**Commit message:** `067: sensitive task's dead-end recommendation points at the manual table`

**Verification:**
- `npm run format:check` — clean on all files this story touched (`sensitive.ts`/`index.ts` in
  D1 needed a `prettier --write` pass for CRLF line endings introduced by the delegate agent,
  fixed during story-level verification; the repo-wide 238-file warning list is a pre-existing
  baseline unrelated to this story — none of it is a file this story changed).
- `npm run lint` — clean.
- `npm run typecheck` — clean (`tsconfig.node.json` + `tsconfig.web.json`).
- `npm test` — 3643/3643 passed (258 test files).
- `npm run build` — succeeded.
- `npm run test:e2e` — 13/14 passed; the one failure (`discard-undo.spec.ts`, unrelated journal
  file, not touched by this story) reproduced as a harness flake and passed cleanly on an isolated
  re-run (`electronApplication.evaluate: Resulting promise was garbage collected`). This story's
  own spec, `settings-models-dead-end.spec.ts`, passed.
- Clean-agent code review: **PASS**, no findings (no weakened tests, no scope creep beyond the
  justified `tsconfig.web.json` renderer whitelist for the pure bundled catalogue, no guardrail
  violations). Full verdict text kept in the sprint's build session, not duplicated here.

**AC → test mapping, as verified:**
- AC1 → `tests/renderer/routing-dead-end.test.tsx` › "a no-pick row shows the reason and a way
  out" — passed, proves the real UI mechanism. The originally-planned e2e half for AC1 could not
  be written: see `### Noted gap` above (second entry) — a genuine plan gap discovered in D4, not
  a shortcut, reviewed and accepted as harness-bound residue.
- AC2 → `tests/core/llm/sensitive.test.ts` › "a routed target is judged against the sensitivity
  rule" (passed) + `tests/renderer/routing-table.test.tsx` › "a sensitive task can still be
  assigned a model that fails the sensitivity filter, with a warning" (passed) + e2e "the
  condense-area routing select is present and enabled" assertion inside
  `settings-models-dead-end.spec.ts` (passed). Persistence half is pre-existing, untouched
  behaviour — noted gap, not a blocker (see `### Noted gap`, first entry, unchanged from refine).
- AC3 → `settings-models-dead-end.spec.ts` › "the no-model note lands on the models tab" step —
  passed.

**Open points:** none blocking. Both noted gaps (AC2 persistence, AC1 e2e) are harness
limitations, documented above, and are candidates for a future story only if a deterministic
capacity/provider override is ever added to the e2e harness.
