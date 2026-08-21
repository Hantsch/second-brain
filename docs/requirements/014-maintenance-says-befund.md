---
id: 014
title: The maintenance run reports findings, not results
status: ready # draft -> ready -> in-progress -> done
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

None. This is a rename with one documented exception; every detail question was decided in
`## Decisions (Sprint)` below.

## Decisions (Sprint)

- **The exact German wording is fixed here, not left to the build.** AC 2 demands per-place
  grammar, so the plan lists every target string verbatim — a build agent guessing wordings is
  exactly the blind search-and-replace the story rules out.
- **`garden.card.dismissed` becomes "Passt so. Der Befund zählt nicht mehr gegen die
  Gesundheit."** "Befund" is masculine, so the article has to move from "Das" to "Der".
- **`garden.health.perfect` becomes "… Die Prüfung hat keine Befunde ergeben."** Keeps the
  sentence's verb and drops the tautology "Ergebnisse ergeben".
- **`garden.findings.label` and `log.findings` become the bare plural "Befunde".** Both are
  column/section labels, so they follow the plural of the list they head.
- **English strings stay untouched.** The story's rationale ("it already says 'finding'") holds
  for the keys and the core identifiers, but the visible English strings still read "result(s)";
  three normative places in the story nevertheless scope this rename to the German surface, so
  changing `en-*.ts` would be scope creep. Noted as a follow-up candidate, not fixed here.
- **`de-dashboard.ts:90` (`module.gardener.purpose`) and `de-projects.ts:48`
  (`projects.new.stepHint`) are in scope** although the story's line references have drifted:
  both name what the maintenance run found.
- **"Ergebnis" stays everywhere else.** `de-settings-models.ts` (`settings.routing.testFailed`,
  a model call) per AC 3, plus every German code comment and JSDoc outside the German UI strings
  (`src/core/**`, `scripts/**`, `tests/**` prose) — those are results of a call or a write.
- **Two deliverables, cut along surface boundaries, each carrying its own tests.** Strings and
  the assertions on them move together, so `npm run verify` is green at the end of each D
  instead of red in between.
- **No key is added, renamed or removed.** AC 5, and it keeps the de/en key-parity test in
  `tests/renderer/i18n.test.ts` passing by construction.
- **Manual acceptance runs in German without a language switch.** `src/main/settings-defaults.ts`
  sets `languages.ui: 'de'`, so `npm run shot` already photographs the German surface (P1).

## Plan

Replace 20 German string values in six i18n files and the 11 test assertions that quote them.
No key, component, core module or IPC channel is touched.

**Step 1 — the maintenance screen (`src/renderer/i18n/de-garden.ts`), 11 strings:**

| Key                        | New German value                                                 |
| -------------------------- | ---------------------------------------------------------------- |
| `garden.run.audit`         | `Das Modell deutet die Befunde`                                  |
| `garden.health.perfect`    | `Nichts drückt den Wert: Die Prüfung hat keine Befunde ergeben.` |
| `garden.health.lost`       | `{count} von 100 Punkten gehen auf diese Befunde zurück.`        |
| `garden.advice.heuristic`  | `Ohne Modell aus Zahl und Schwere der Befunde abgeleitet.`       |
| `garden.findings.label`    | `Befunde`                                                        |
| `garden.findings.totalOne` | `1 Befund`                                                       |
| `garden.findings.total`    | `{count} Befunde`                                                |
| `garden.findings.none`     | `Keine Befunde.`                                                 |
| `garden.findings.filtered` | `Kein Befund passt zu diesem Filter.`                            |
| `garden.filter.label`      | `Befunde filtern`                                                |
| `garden.card.dismissed`    | `Passt so. Der Befund zählt nicht mehr gegen die Gesundheit.`    |

**Step 2 — the surrounding surfaces, 9 strings:**

| File · key                                               | New German value                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `de-dashboard.ts` · `module.gardener.purpose`            | `Gesundheit und Befunde der letzten Prüfung.`                     |
| `de-dashboard.ts` · `tile.gardener.findingsOne`          | `1 Befund`                                                        |
| `de-dashboard.ts` · `tile.gardener.findingsMany`         | `{count} Befunde`                                                 |
| `de-wiki.ts` · `modules.findings`                        | `{count} Befunde aus der Pflege`                                  |
| `de-wiki.ts` · `modules.findingsOne`                     | `ein Befund aus der Pflege`                                       |
| `de-wiki.ts` · `log.findings`                            | `Befunde`                                                         |
| `de-projects.ts` · `projects.new.stepHint`               | `Freiwillig. Fehlt er, erscheint das in den Befunden der Pflege.` |
| `de-settings.ts` · `settings.behavior.gardenerLlm.label` | `Befunde von einem Modell deuten lassen`                          |
| `de.ts` · `task.gardener-audit.label`                    | `Befunde deuten`                                                  |

**Step 3 — the tests that quote those strings** (update the expected text, never loosen the
matcher): `tests/renderer/garden.test.tsx` (8 assertions: lines 444, 459, 474, 488, 505, 511,
525, 715), `tests/renderer/dashboard.test.tsx:889`, `tests/renderer/modules.test.tsx:214`,
`tests/renderer/settings.test.tsx:739`.

**Out of scope, do not touch:** all `en-*.ts` files, `de-settings-models.ts`, every
`src/core/**` file, `src/shared/**`, `scripts/**`, and all comments/JSDoc containing "Ergebnis".

## Deliverables

**D1 — The maintenance screen says "Befund"**
Files: `src/renderer/i18n/de-garden.ts`, `tests/renderer/garden.test.tsx`.
All 11 strings from step 1 of the plan, plus the eight assertions in `garden.test.tsx` that
quote them.
Acceptance: `npm test` and `npm run typecheck` green; the diff contains only string values in
`de-garden.ts` and expected text in `garden.test.tsx` — no key, no component, no `en-*.ts`;
`grep -n "Ergebnis" src/renderer/i18n/de-garden.ts` returns nothing.

**D2 — Dashboard, module view, projects, settings and the task label say "Befund"**
Files: `src/renderer/i18n/de-dashboard.ts`, `src/renderer/i18n/de-wiki.ts`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/de-settings.ts`,
`src/renderer/i18n/de.ts`, `tests/renderer/dashboard.test.tsx`,
`tests/renderer/modules.test.tsx`, `tests/renderer/settings.test.tsx`.
All 9 strings from step 2 of the plan plus their three test assertions.
Acceptance: `npm run verify` green; `grep -rn "Ergebnis" src/renderer/i18n/` reports exactly
one hit, `settings.routing.testFailed` in `de-settings-models.ts`; no `en-*.ts` file in the
diff; the de/en key sets are unchanged (`tests/renderer/i18n.test.ts` passes untouched).

## Model Hints

- D1 → default
- D2 → default
- Review: → default — a string-only diff in six i18n files plus their assertions; the risk is a
  missed or over-eager replacement, and that is a grep, not an architecture question.

## Test Plan (manual acceptance)

UI language is German by default (`settings-defaults.ts`), so no switch is needed.

1. `npm run seed && npm run shot`.
2. `.screenshots/garden.png` — the findings list heading reads "Befunde", the count above it
   "{n} Befunde" (or "1 Befund"), the filter above the list "Befunde filtern", and the health
   card's reasoning "… gehen auf diese Befunde zurück."
3. `.screenshots/dashboard.png` — the maintenance tile reads "1 Befund" / "{n} Befunde".
4. `.screenshots/settings-behavior.png` — the checkbox reads "Befunde von einem Modell deuten
   lassen".
5. In the running app, open Pflege, click "Passt so" on any finding: the confirmation reads
   "Passt so. Der Befund zählt nicht mehr gegen die Gesundheit."
6. Settings → Sprachen → UI language `English`: the maintenance screen still reads "Results" —
   the English surface is unchanged.

## Done

<Filled by `/ai-scrum:build 014`.>
