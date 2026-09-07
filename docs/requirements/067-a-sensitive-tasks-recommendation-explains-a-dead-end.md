---
id: 067
title: A sensitive task's recommendation explains a dead end
status: draft # draft -> ready -> in-progress -> done
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

- Should `condense-area`/`condense-project`'s `minLocalParamsB` be lowered so more local setups
  qualify (a quality/availability trade-off), or should the fix stay presentation-only (explain +
  redirect) and leave the threshold as a deliberate quality floor? Recommendation: presentation-only
  for this story — tuning the threshold is a model-quality judgement call that deserves its own
  look, not a side effect of a UX fix.
- Should the manual table warn (not block) when a sensitive task is assigned a model that would not
  have passed the sensitivity filter — a visible trade-off instead of a silent one? Recommendation:
  yes, a small inline note; the manual table should stay permissive as the escape hatch it already
  is.
