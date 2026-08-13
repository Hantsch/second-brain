---
id: 014
title: The maintenance run reports findings, not results
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-13
---

## Requirement

The maintenance run produces **findings** — an orphaned page, a near-duplicate, a broken
wikilink. The core has always called them that (`GardenerFinding`, "Ein Befund nennt die
Datei, in der er steht" in
[types.ts](../../src/core/gardener/types.ts)), and so does English throughout the UI:
"finding".

Only the German surface says "Ergebnis". That is the wrong word. An "Ergebnis" is what a
calculation returns — a number, a result. What the maintenance run hands me is an
observation about my vault that may or may not need my attention. "Befund" says that;
"Ergebnis" makes the maintenance screen read like a report card.

So the German UI should say **Befund** everywhere the word refers to something the
maintenance run found: on the maintenance screen, in the health card, in the module view,
on the dashboard tile, in the settings line about interpretation, and in the task label.

This is a rename, not a new capability. Nothing about what the run does changes.

One boundary matters: "Ergebnis" is also the right word in places that have nothing to do
with maintenance — the model routing test says "Kein Ergebnis"
([de-settings-models.ts:114](../../src/renderer/i18n/de-settings-models.ts#L114)) about a
model call, and code comments use it for write results. Those stay.

Related — the German keys that mean a finding:
[de-garden.ts](../../src/renderer/i18n/de-garden.ts) (lines 22, 35–36, 46, 62–69, 73, 124),
[de-wiki.ts](../../src/renderer/i18n/de-wiki.ts) (17–18, 115),
[de-dashboard.ts](../../src/renderer/i18n/de-dashboard.ts) (83, 174–175),
[de-projects.ts:41](../../src/renderer/i18n/de-projects.ts#L41),
[de-settings.ts:129](../../src/renderer/i18n/de-settings.ts#L129),
[de.ts:175](../../src/renderer/i18n/de.ts#L175).

## Acceptance Criteria

- [ ] Every German string that refers to something the maintenance run found says "Befund"
      / "Befunde" — maintenance screen, health card, filter, finding list, dismiss
      confirmation, module view, dashboard tile, settings, task label.
- [ ] The grammar is right in each place, not a blind search-and-replace: "1 Befund",
      "{count} Befunde", "Kein Befund passt zu diesem Filter", "Keine Befunde.", "Befunde
      filtern", "Befunde von einem Modell deuten lassen".
- [ ] "Ergebnis" stays where it is not a finding — the model routing test
      ([de-settings-models.ts:114](../../src/renderer/i18n/de-settings-models.ts#L114))
      keeps its wording.
- [ ] English is untouched: it already says "finding".
- [ ] Nothing but text changes. No key is renamed, no component is restructured, the IPC
      contract is the same.
- [ ] Tests that assert on the German strings are updated with the strings, not deleted or
      loosened.
- [ ] `npm run verify` is green; `npm run shot` shows the maintenance screen with the new
      wording.

## Open Questions

<Filled by `/ai-scrum:refine 014` if anything is unclear. Nothing is expected here — this
is a rename with one documented exception.>

## Plan

<Filled by `/ai-scrum:refine 014`.>

## Deliverables

<Filled by `/ai-scrum:refine 014`.>

## Model Hints

<Filled by `/ai-scrum:refine 014`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 014`.>

## Done

<Filled by `/ai-scrum:build 014`.>
