---
id: 067
title: A sensitive task's recommendation explains a dead end
status: ready # draft -> ready -> in-progress -> done
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

- [ ] **AC1** — When a task's guided recommendation has no qualifying candidate (`pick === null`),
      the row shows the existing reason **and** a concrete next step (e.g. a pointer to the manual
      assignment table), instead of ending in a bare sentence with no control at all.
- [ ] **AC2** — The manual routing table remains the actual way out: assigning `condense-area` (or
      any sensitive task) a model there works, is saved, and is what the task uses on its next run.
- [ ] **AC3** — The `llm-unavailable` error surfaced when running a task with no assigned model
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

- AC1 → e2e `tests/e2e/settings-models-dead-end.spec.ts` › "a recommendation with nothing to
  propose points at the manual table" (D4), plus renderer
  `tests/renderer/routing-dead-end.test.tsx` › "a no-pick row shows the reason and a way out" (D2)
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
