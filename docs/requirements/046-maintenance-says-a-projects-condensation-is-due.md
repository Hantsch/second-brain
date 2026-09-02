---
id: 046
title: Maintenance says a project's condensation is due
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M14 (condensed layer, project level). Depends on
[[044-a-project-can-be-condensed-into-one-file]] for the `condensed` `DocType` and the project
artifact's path. Mirrors [[039-maintenance-says-a-condensation-is-due]] for the project level.
Concept: [[../concepts/condensed-layer]] (CND-7, CND-8, CND-24 through CND-27).

## Requirement

A project's condensation should never surprise me by being silently stale, and it should never
nag either. Maintenance should notice, deterministically and without a model, when a project's
inputs have moved on since its artifact was last written — or when a project has inputs but has
never been condensed at all — and say so as an informational finding, not a warning. Opening the
finding takes me to the project's knowledge tab; nothing is written by the check itself.

## Acceptance Criteria

- [ ] A new deterministic check reports "condensation due" for a project whose newest input is
      newer than its artifact's `condensed_at`, and "condensation missing" for a project that has
      inputs but no artifact at all.
- [ ] The check runs without a model, and its severity is informational — an un-condensed
      project is not reported as an error.
- [ ] Its fix action writes nothing; it opens the project's knowledge tab.
- [ ] The maintenance screen names a due or missing project condensation distinctly from other
      finding kinds.
- [ ] The project's condensed artifact is exempt from the orphan and near-duplicate checks.
- [ ] The artifact is a normal indexed document: searchable and type-filterable.

## Open Questions

- ~~Q1 — Where does the due-ness finding surface beyond Maintenance — only there, or also as a
  badge on the project overview (mirroring story 004's "possibly outdated" badge on project
  status)?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/sprint 12` clarification round, ahead of refine — not
in a later round. Binding.

- **(User)** Q1 — **Maintenance only, this sprint.** Matches the sprint's scoped stories
  (044–046 don't include overview badge work); a project overview badge mirroring story 004 can
  be a follow-up story if wanted later.

Taken during `/refine 046` (not user decisions), each with its reason:

- **Reuse the existing `condensation-due` kind, extended over projects** — mirrors 045's user
  decision to generalise by level instead of duplicating per level; AC4 asks for distinctness from
  _other kinds_, which the shared kind plus a unit-naming title already gives.
- **Due-ness is decided by input content hashes**, compared against the artifact's recorded
  `source_hashes:` (039's mechanism), not by comparing timestamps to `condensed_at` — one truth for
  "newer" across levels; `condensed_at` only appears in the sentence.
- **Inputs come from 044's project input selector**, never a second one — check and run must never
  give two answers to "what is an input".
- **`done` and `dropped` projects are skipped, `paused` is not** — precedent
  `project-without-next-step` (a finished project is over), while a paused project is exactly the
  one whose condensation helps on return.
- **The finding key is prefixed with `project`** before the slug — an area and a project may share
  a slug, and a "fits as is" dismissal must not carry across levels.
- **Both variants list the condensed artifact path first** (the intended path in the missing case),
  because the `open` exit resolves `paths[0]`; naming a not-yet-existing file is established here
  (`index-drift`'s `no-catalog` finding names the missing `wiki/index.md`).
- **`fix: null`, no fix action at all** — mirrors 039: the cheapest proof that the fix writes
  nothing is that there is nothing that could write.
- **Routing gets its own pattern for the condensed project path**; the plain
  `projects/**/project.md` route stays on the project overview, so `project-without-next-step` and
  the other project findings are unaffected.
- **Severity `info`, kind stays out of `LLM_ONLY_KINDS`, scope participation is inherited** —
  `report.ts` runs all checks and filters afterwards, so nothing new is registered.
- **Extend the labels' two existing sentences with a unit word** instead of adding a second
  sentence pair — one sentence pair, two levels, no divergence in wording.
- **`docType: 'condensed'` for the project artifact belongs to 044's write path**; this story only
  pins it with tests and, if `build.ts`'s area-only regex is still area-only by then, replaces it
  with a shared `isCondensedPath()` predicate.
- **Build order: 044 → 045 → 046** — the check needs 044's selector and path helper and 045's
  knowledge-tab route parameter; follow the parameter name 045 actually ships.

## Plan

The check is deterministic, index-only, model-free, and offers no fix. It is the project arm of
the existing area check, not a new check.

1. **Generalise the check** — `src/core/gardener/checks/condensation-due.ts` keeps its area loop
   and gains a project loop: for every project that is not `done`/`dropped`, take 044's
   `projectInputs(docs, project, { now: ctx.today })`; skip when empty; compare against
   `recordedSources(artifact.frontmatter)` with the existing `changedInputs()` helper. No artifact
   plus inputs → the "missing" variant; a changed input → the "due" variant. `severity: 'info'`,
   `module: null`, `fix: null`, `paths: [condensedProjectPath(project), project.path]`,
   `key: ['project', slug, ...path:hash]`.
2. **Sentences** — `condensationDue` / `condensationMissing` in `src/core/gardener/labels.ts` and
   `src/main/gardener-labels.ts` gain a unit word, so a project finding reads as a project's.
3. **Conformance tests** — modelless run identical, kind absent from `LLM_ONLY_KINDS`, health
   penalty = `SEVERITY_WEIGHT.info`, kinds-scoped run keeps it, module-scoped run drops it,
   stopped run still reports it, no vault write.
4. **Exemptions and normal-document behaviour** — the project artifact is neither an `orphan` nor a
   `near-duplicate` candidate, is not counted as a module page, is in the search index and returned
   by `types: ['condensed']`. Tests first; a predicate only if a test proves one is needed.
5. **Surface** — `src/renderer/screens/garden/targets.ts` gains the condensed project path pattern
   → `/projects?p=<slug>&tab=knowledge` (045's parameter); `de-garden.ts` / `en-garden.ts`
   generalise `garden.advice.condensation-due` from "areas" to areas and projects. No new card.
6. **Seed + smoke** — the demo vault gets one project with a stale artifact and one with inputs and
   no artifact, so both findings are visible in `npm run shot`.

Files, in order: `src/core/gardener/checks/condensation-due.ts`, `src/core/gardener/labels.ts`,
`src/main/gardener-labels.ts` · `tests/core/gardener/checks-condensed.test.ts`,
`tests/core/gardener/health.test.ts`, `tests/core/gardener/report.test.ts`,
`tests/core/gardener/checks-similarity.test.ts`, `tests/core/index/*` ·
`src/core/index/build.ts`, `src/core/condense/paths.ts` (only if 044 left the gap) ·
`src/renderer/screens/garden/targets.ts`, `src/renderer/i18n/de-garden.ts`, `en-garden.ts` ·
`scripts/seed*`.

## Deliverables

**D1 — The project arm of the check, with its sentences** _(core + main)_
`src/core/gardener/checks/condensation-due.ts`, `src/core/gardener/labels.ts`,
`src/main/gardener-labels.ts`, `tests/core/gardener/checks-condensed.test.ts` (extend).
Mirror: the area loop in the same file; `checks/project-without-next-step.ts` for the project
iteration and status filter; `checks/unprocessed-source.ts` for the no-fix shape.
Accepted when: a project whose input hash changed yields exactly one `info` finding with
`fix === null`, `module: null` and the condensed artifact path first; a project with inputs and no
artifact yields the missing variant; an unchanged project, a project without inputs and a
`done`/`dropped` project yield nothing; a vanished input alone yields nothing; a `sources:` entry
without a hash yields a finding; the key changes with the inventory and never collides with an
area of the same slug; both sentences exist in German (`„…“`) and English (no U+201E) and name the
project, `condensed_at` and the number of changed inputs; every existing area test still passes
unchanged. _(AC1, AC2 severity half, AC3 writes-nothing half, AC4 core half)_

**D2 — Conformance: no model, severity, scope, stop/continue** _(core, tests-led)_
`tests/core/gardener/checks-condensed.test.ts`, `tests/core/gardener/health.test.ts`,
`tests/core/gardener/report.test.ts`.
Mirror: the same assertions story 039 added for the area variant.
Accepted when: a report run with no gateway configured produces identical project findings; the
kind stays out of `LLM_ONLY_KINDS`; one finding costs `SEVERITY_WEIGHT.info`; a run scoped to
`kinds: ['condensation-due']` keeps the project finding while a module-scoped run drops it; a run
stopped after `checks` still reports it; a test proves the run performs no vault write. _(AC2, AC3)_

**D3 — Exemptions and normal-document behaviour** _(core, tests-led)_
`tests/core/gardener/checks-similarity.test.ts`, `tests/core/gardener/checks-links.test.ts`,
`tests/core/index/` (docType, pages, search), plus `src/core/index/build.ts` and
`src/core/condense/paths.ts` only if 044 left the project path unclassified.
Accepted when: a project artifact restating its sources produces neither an `orphan` nor a
`near-duplicate` finding; it is not in `pages()` and raises no module page count; it is indexed as
`docType: 'condensed'`, present in the search index and returned by a query with
`types: ['condensed']`. _(AC5, AC6)_

**D4 — The maintenance surface** _(renderer)_
`src/renderer/screens/garden/targets.ts`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`, `tests/renderer/` targets test.
Mirror: the `AREA` case in `targets.ts:33-40`.
Accepted when: the condensed project path resolves to
`{ kind: 'route', to: '/projects?p=<slug>&tab=knowledge' }` with 045's actual tab parameter; the
plain `projects/**/project.md` route is unchanged; the generic card renders title, detail and the
`open` exit with no accept/diff control; `garden.advice.condensation-due` reads correctly for
areas _and_ projects in `de` and `en`. _(AC3, AC4 renderer half)_

**D5 — Seed and live smoke** _(scripts)_
`scripts/seed*`, `.screenshots/` via `npm run shot`.
Accepted when: the demo vault has one project with a stale artifact and one with inputs and no
artifact, and the maintenance screenshot shows both as informational findings.

## Model Hints

- `D1 → deliverable-hard` — it edits the live area check and both label signatures: a wrong key
  composition silently invalidates every existing "fits as is" dismissal of an area finding, and
  the area and project loops share `changedInputs()`.
- D2, D3, D4, D5 → default.
- `Review: → default` — small, mirrored surface; the regression risk sits in D1, which already
  carries the higher tier.

## Test Plan (manual acceptance)

1. `npm run seed`, then start the app (`npm run shot`, or the launcher for a live look).
2. Maintenance → start a run. Two informational findings appear naming a project: one
   "condensation due", one "condensation missing".
3. On the due finding, use `open`: the app lands on that project's knowledge tab (045).
4. Check the vault: nothing changed by the run — in particular no artifact was written or touched.
5. Switch the UI language, reopen Maintenance: both sentences and the kind's advice line read
   correctly in German and English.

## Done

<Leave empty. Filled by `/build 046`.>
