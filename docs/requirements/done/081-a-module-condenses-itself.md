---
id: 081
title: A module condenses itself
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

The area (M12) and project (M14) levels of the condensed layer exist; the module level does not.
Today `modules/<slug>/wiki/overview.md` is a bullet list the ingest appends to, which is exactly
the mechanism the concept retires ([concepts/condensed-layer.md](../concepts/condensed-layer.md),
CND-2). This story makes `overview.md` the module's condensed artifact, written by a
`condense-module` run the user starts in the module view, confirmed as a diff like the other two
levels.

Inputs are all wiki pages of the module except `index.md`, `log.md` and the artifact itself
(concept §11). Sections are _decided_, _open_, _contradictions_ plus the directives section, each
section ending with the source paths it was written from (concept §7, §8). Reuse the existing
machinery in `src/core/condense/` and the `condense:*` channels with their `unit` discriminator —
a third level, not a third copy.

Retiring the ingest's own writes to `overview.md` is [[082]]. Handing the condensation to the
vault agent instead of a model is [[092]].

## Acceptance Criteria

- [x] **AC1** — The module view offers "Condense"; a `condense-module` run starts only on that
      click, never on a schedule or after an ingest.
- [x] **AC2** — Before anything is written, the module view shows the proposed `overview.md` as a
      diff in which removals are as visible as additions.
- [x] **AC3** — Accepting writes `wiki/overview.md` with `condensed_at`, a `sources:` list of every
      page the run read, and the sections _decided_, _open_, _contradictions_, each ending with its
      source paths; an undo copy of the previous file lies in `.secondbrain/trash/`.
- [x] **AC4** — Accepting after `overview.md` changed on disk since the run read it reports a
      conflict and leaves the file unchanged.
- [x] **AC5** — Rejecting requires a reason; the reason is appended to the directives section and
      nothing else in the file changes.
- [x] **AC6** — The next run's prompt contains the directives section, and the accepted result
      keeps it and every unknown frontmatter key unchanged.
- [x] **AC7** — Section headings follow the document language, not the UI language.
- [x] **AC8** — Maintenance shows an informational "condensation due" finding for a module with a
      page newer than `condensed_at`, or with pages and no condensation yet; its fix opens the
      module view and writes nothing.
- [x] **AC9** — `condense-module` is assignable to a provider and model in the Models settings like
      `condense-area` and `condense-project`.
- [x] **AC10** — Without a model configured for `condense-module`, the module view says so, names
      the task kind, links to the setting, and writes nothing.

## Open Questions

~~- **Q1 — Input bound.** A module can hold hundreds of pages. Reuse the project level's bound, or a
module-specific ceiling (and how the artifact states a partial read, CND-14)?~~ answered → Decisions (Sprint)
~~- **Q2 — Empty module.** CND-4 says a unit without inputs has no artifact, but module creation
(`overviewBody()` in `src/core/wiki/module.ts`) writes an `overview.md` stub today. Keep the stub,
or stop writing it for new modules?~~ answered → Decisions (Sprint)
~~- **Q3 — `log.md` line per run** (condensed-layer O5): does an accepted module condensation append
one entry to `wiki/log.md`?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Input bound: reuse the project level's bound; a partial read is stated in the artifact (CND-14)
- **(User)** Empty module: keep the `overview.md` stub written at module creation; the first condensation replaces it
- **(User)** `log.md` line per run: no log line for an accepted module condensation
- Bound, concretely: the module run reuses `condense-project`'s task budget (`{in: 8000, out: 1200}`)
  and per-item prompt clamp (`CONDENSE_ITEM_CHARS`, 1500), with the clamped characters stated in the
  artifact via the existing `promptClampNotice()` — no page-count ceiling, because a module-specific
  ceiling was the alternative the user did not pick; a module too large for the routed model's
  context fails visibly (CND-13), it is never cut silently.
- Headings: new section kinds `decided` (`Entschieden` / `Decided`) and `contradictions`
  (`Widersprüche` / `Contradictions`); `open` reuses `Offen` / `Open` — the short-noun style of the
  area and project levels, and the stub's `phrases()` headings (`Was entschieden ist` /
  `What is settled`, `Was offen ist` / `What is open`) become read aliases so a legacy overview's
  bullets parse as machine sections and show as removals (082 AC4) while the stub stays unchanged.
- The module artifact keeps `type: overview`, because orphan, near-duplicate, `countPage`,
  `docTypeFromPath` and the orphan fix already treat that type as the module synthesis (CND-2);
  `composeArtifact()` gets the type as a parameter instead of hard-coding `condensed`.
- `sources:` holds vault paths like the other two levels (the shared hash and attribution checks are
  path-keyed); page derivation maps a same-module wiki path back to its slug, so `PageView` and the
  orphan check's "cited by a page" rule keep working on the overview.
- A condensed overview is excluded from answer evidence (`EVIDENCE_EXCLUDED_TYPES` gains `overview`),
  because story 040 settled that an answer cites the source, never the condensation, and
  `evidence.ts` names itself as the place to add the next machine-written type. Search is unaffected.
- "A page newer than `condensed_at`" is measured the way the area and project levels already measure
  it — a page whose content hash differs from or is missing in the artifact's `source_hashes` —
  because G7 asks for one freshness rule and mtimes are unreliable on a copied or USB vault; an
  overview without `condensed_at` (stub or legacy) counts as "no condensation yet".
- The finding mirrors 039/046: `fix: null`, the generic open exit on `paths[0]` = the overview, and
  the maintenance screen's own target table routes that path to the module's condensed tab;
  search's `doc-home` routing stays untouched so 082 AC3 ("as before") holds.
- UI location: a new module tab `condensed`, addressable as `?tab=condensed`, hosting the shared
  `CondensedUnitPanel` — the same shape as the area's condensed tab and the project's knowledge tab.
- `condense:read` answers `null` for a module overview without `condensed_at`, so the panel shows
  its honest not-yet-condensed state instead of presenting the stub or legacy bullets as a
  condensation; the run still reads the real file as its base.
- No delete at the module level (`condense:delete` refuses `unit: 'module'`, the panel hides the
  action): `overview.md` is the module's catalog entry (`[[overview]]` in `index.md`) and the user
  decided the stub stays, so "back to never condensed" has no module equivalent.
- `condense-module` is `strong`, `structured`, **not** `sensitive`: the concept routes it apart from
  `condense-area` precisely because module content is not journal content.
- A section with empty text carries no source line (the existing `sourceLineFor()` rule — a bare
  "From:" is a claim without content); AC3's "each ending with its source paths" holds for every
  section that has text.
- The partial-read statement lives in the artifact preamble only; a module proposal reports
  `partialInputs` as absent, because `partialInputsNote()` speaks of day entries.
- A legacy overview's `## Seiten` / `## Pages` section is a foreign section and carried through
  verbatim, like any unknown section; whether it goes is 082's call (its links move to `index.md`).
- The artifact keeps the overview's existing `title`; only an overview without one gets
  `<module title> — <synthesis phrase>`.
- `sectionSchema()` exists twice (`condense-area.ts`, `condense-project.ts`); the module prompt
  extracts it to `prompts/shared.ts` first instead of making a third copy.
- e2e: one new spec file with two tests (one launch); the no-model step joins the existing no-model
  spec, so the story adds exactly one launch.

## Plan

Third level of the existing condensation, not a third copy: the module artifact is
`modules/<slug>/wiki/overview.md`, parsed and composed by `src/core/condense/artifact.ts` with a
module section set, written through the existing `condense:*` channels with `unit: 'module'`, shown
in the shared `CondensedUnitPanel`.

1. **Format (D1).** Section kinds `decided` + `contradictions` (+ legacy aliases), `MODULE_SECTIONS`,
   `composeArtifact(..., type)` so the overview keeps `type: overview`, overview field order with
   `condensed_at`/`source_hashes`, `moduleOverviewPath()`; page derivation reads path-shaped
   `sources:` as slugs; overview leaves answer evidence; VAULT-FORMAT.md section.
2. **Task kind (D2).** `condense-module` in `TaskKind`, `TASK_KINDS`, `TASK_DEFINITIONS` and its
   de/en labels, so Models settings lists it.
3. **Prompt + run (D3).** Extract `sectionSchema()`; new `condense-module` prompt/schema;
   `moduleInputs()` selector (all module wiki pages except index/log/overview); `condenseModule()`
   returning proposal / no-model / no-inputs / attribution-failure / failed — writes nothing.
4. **IPC (D4).** `CondenseUnit` gains `module`; `condense-unit.ts` resolves the module through the
   module list, never a guessed path; read returns `null` before the first condensation; delete
   refuses the module level; reject keeps `type: overview` on a missing file.
5. **Maintenance (D5).** Third arm in `condensation-due.ts` using the same `moduleInputs()`
   selector the run records; module-scoped findings; de/en labels.
6. **Module view (D6).** `condensed` tab + `ModuleCondensedTab` wrapper, `canDelete` prop on the
   panel, `modules.condensed.*` strings, navigation doc; no-model e2e step.
7. **Routes + flow (D7).** Task-result route and maintenance target for the module; the module
   condensation e2e flow; CHANGELOG entry.

Order: D1 → D2 → D3 → D4 → D5 → D6 → D7 (D5 may run after D3, parallel to D4).

Out of scope: retiring the ingest's overview writes (082), the agent path (092), any migration
(082's decision), a `log.md` line (user decision).

## Deliverables

- [x] **D1 — The module overview as a condensed artifact (format).** Core only, plus one doc.
      Files: `src/core/vault/section-names.ts`, `src/core/condense/artifact.ts`,
      `src/core/vault/frontmatter-order.ts`, `src/core/condense/paths.ts`,
      `src/core/condense/index.ts`, `src/core/index/pages.ts`, `src/core/wiki/evidence.ts`,
      `docs/VAULT-FORMAT.md`. Tests: new `tests/core/condense/artifact-module.test.ts`, plus cases
      in the existing `tests/core/index/pages.test.ts` and `tests/core/wiki/evidence.test.ts`.
  - `section-names.ts`: add `SectionKind` values `decided` (de `Entschieden`, en `Decided`) and
    `contradictions` (de `Widersprüche`, en `Contradictions`) to the union, `NAMES.de`, `NAMES.en`
    and `ALIASES` (folded, like the existing entries). Add the legacy headings the module stub and
    `phrases()` in `src/core/wiki/text.ts` write as aliases: `Was entschieden ist` /
    `What is settled` → `decided`, `Was offen ist` / `What is open` → `open`. Do not touch
    `phrases()` or the stub (`overviewBody()` in `src/core/wiki/module.ts`).
  - `artifact.ts`: `MODULE_SECTIONS = ['decided', 'open', 'contradictions']`,
    `CondensedModuleSectionKind`, `CondensedModuleArtifact`. `composeArtifact()` takes the document
    `type` as a trailing parameter defaulting to `CONDENSED_TYPE`; `frontmatterOf()` writes it and
    `orderFields()` calls `canonicalOrder(type)`. Area and project callers stay byte-identical.
  - `frontmatter-order.ts`: a dedicated order for `overview` — `type, title, module, condensed_at,
created, updated, reviewed, tags, sources, source_hashes`; the other wiki types keep `WIKI`.
  - `condense/paths.ts`: `moduleOverviewPath(slug)` (delegate to `modulePagePath(slug, 'overview')`
    in `src/core/vault/paths.ts`) and `moduleSlugFromOverviewPath(path)`; export both from
    `condense/index.ts` together with the new artifact names.
  - `index/pages.ts`: where `WikiPage.sources` is read (`asStringList(doc.frontmatter['sources'])`,
    ~l.140), map an entry shaped `modules/<same module>/wiki/**/<slug>.md` to `<slug>`; leave every
    other entry unchanged.
  - `evidence.ts`: `EVIDENCE_EXCLUDED_TYPES` gains `'overview'` (its header comment names this as
    the extension point; story 040's rule).
  - `VAULT-FORMAT.md`: a "Condensed module overview" section next to "Condensed project" /
    "Condensed area": path, `type: overview`, `condensed_at`, `sources:` as vault paths,
    `source_hashes`, the three sections + directives, source line per section, legacy headings read
    as aliases, foreign sections kept.
  - Tests (`artifact-module.test.ts`): "a legacy overview's bullets parse as the decided section"
    (stub/legacy headings `Was entschieden ist`, `Was offen ist`, plus a `## Seiten` section and
    `module:`/`created:` keys → decided/open filled, `Seiten` in `extraSections`, keys in
    `extraFrontmatter`); "a composed module artifact keeps type overview and every unknown key";
    "compose of parse of a module artifact loses nothing"; "module headings follow the document
    language". Existing `artifact.test.ts` / `artifact-project.test.ts` must stay green unchanged.
    `pages.test.ts`: "an overview citing a page by path lists it by slug". `evidence.test.ts`:
    "a module overview is never offered as evidence".

- [x] **D2 — `condense-module` is a task kind.** Files: `src/shared/types/llm.ts` (`TaskKind` union
      with a doc comment, after `condense-project`), `src/core/llm/tasks.ts` (`TASK_KINDS` after
      `condense-project`; `definition('condense-module', 'strong', { in: 8000, out: 1200 },
  { structured: true })` — deliberately **not** `sensitive`), `src/renderer/i18n/de.ts` +
      `en.ts` (`task.condense-module.label` / `.hint`, next to `task.condense-project.*`),
      `src/renderer/i18n/de-settings-models.ts` + `en-settings-models.ts`
      (`settings.fallback.condense-module`, next to `condense-project`). German strings use „…“.
  - Update the hard-coded kind lists the new kind breaks: `tests/core/llm/tasks.test.ts` (structured
    list; not the sensitive list), `tests/core/llm/weak-machine.test.ts` (`BEYOND_THIS_MACHINE`,
    strong-tier floor), `tests/renderer/settings.test.tsx` (local `TASK_KINDS`, l.~49). Check
    `tests/core/llm/sensitive.test.ts` stays green unchanged (the kind is not sensitive).
  - Test: in `tasks.test.ts`, "condense-module is a strong structured task and not sensitive".

- [x] **D3 — The module run: prompt, input selection, proposal.** Core only, writes nothing. Files:
      `src/core/llm/prompts/shared.ts`, `src/core/llm/prompts/condense-area.ts`,
      `src/core/llm/prompts/condense-project.ts`, new `src/core/llm/prompts/condense-module.ts`,
      `src/core/llm/prompts/index.ts`, new `src/core/condense/inputs-module.ts`, new
      `src/core/condense/run-module.ts`, `src/core/condense/index.ts`.
  - First extract the duplicated `sectionSchema(description)` (`condense-area.ts:62`,
    `condense-project.ts:64`) into `shared.ts` as `condenseSectionSchema(description,
sourcesDescription)`; both existing prompts call it with their current strings (their schemas
    must stay deep-equal — existing prompt tests prove it).
  - `condense-module.ts`: mirror `condense-project.ts`'s structure (rules, current sections,
    directives block clamped like there, items clamped with `CONDENSE_ITEM_CHARS`) for keys
    `decided`, `open`, `contradictions`; `CONDENSE_MODULE_SCHEMA`, `condenseModulePrompt(input,
docLanguage)`, `CondenseModuleInput`. Rules: no sentence without a listed input; `sources` only
    the listed vault paths; contradictions between pages go into `contradictions`, named, never
    resolved; compress the current artifact rather than append (soft cap
    `CONDENSE_SOFT_CAP_WORDS`/`_CHARS`); the directives section is context, never edited. Reuse
    `promptItemsClampedChars()` from `condense-project.ts` for the clamp count. Export from
    `prompts/index.ts`.
  - `inputs-module.ts`: `moduleInputs(docs, slug): CondenseInput[]` (path + hash, the shape
    `inputs.ts` defines) = every indexed doc that is a wiki page of module `slug` (`isWikiPage` /
    `NON_PAGES` in `src/core/index/pages.ts`) except the overview itself, sorted by path. This one
    selector is used by the run **and** by D5's due check — never a second list.
  - `run-module.ts`: `CONDENSE_MODULE_TASK = 'condense-module'`; `condenseModule(deps, slug)` with
    `deps = { docs, gateway, existing?, docLanguage?, now?, signal? }`, the shape of `condenseArea()`
    in `run.ts`: gateway guard first (`no-model` naming the task), `no-inputs` when
    `moduleInputs()` is empty (a stub-only module), prompt items `{ path, text: doc.body }`,
    `readReplySections(reply, MODULE_SECTIONS)`, `attributionProblems(...)` against the input paths,
    then `parseArtifact(existing, MODULE_SECTIONS)` spread with new `title` (keep the existing one;
    only if empty use `<module title> — <synthesis phrase>`), `condensedAt` (`isoStamp`),
    `sources` = `moduleInputs()` paths, `sourceHashes` = `sourceHashesOf(inputs)`, sections, and a
    preamble of `promptClampNotice(clampedChars, docLanguage)` + `preambleWithoutNotice(...)`;
    `content = composeArtifact(artifact, MODULE_SECTIONS, docLanguage, 'overview')`, `path =
moduleOverviewPath(slug)`, `baseHash = sha256(existing)` or `null`. Result union mirrors
    `CondenseProjectResult` (proposal / no-model / no-inputs / attribution-failure / failed).
  - Tests (fake gateway from `tests/fakes/llm.ts`): new `tests/core/condense/run-module.test.ts` —
    "without a model for condense-module the run names the task and reads nothing", "a module with
    only its stub has nothing to condense", "a proposal records every page read in sources and
    source_hashes", "a section citing a page that was not read fails the whole run", "the next
    run's prompt carries the directives a rejection left", "a proposal keeps the directives section
    and every unknown frontmatter key verbatim", "a page clamped for the prompt is stated in the
    artifact". New `tests/core/llm/prompts/condense-module.test.ts` — "the module prompt lists
    every page by path and asks for decided, open and contradictions".

- [x] **D4 — The `condense:*` channels serve the module level.** Files:
      `src/shared/types/condense.ts`, `src/main/ipc/condense-unit.ts`, `src/main/ipc/condense.ts`,
      `src/core/condense/directives.ts`; channel doc comments in `src/shared/ipc.ts` if they name
      the levels. Test: new `tests/main/condense-module-ipc.test.ts` (harness, fetch fake and vault
      helpers exactly as `tests/main/condense-ipc.test.ts` uses them; seed a module with
      `module.md`, `wiki/index.md`, `wiki/log.md`, an `overview.md` stub and two pages).
  - `CondenseUnit = 'area' | 'project' | 'module'`.
  - `resolveCondenseUnit()`: a `module` branch that looks the slug up in the module list (the same
    `listModules(wikiIndex(services))` lookup `modules:list` uses in `src/main/ipc/modules.ts`);
    unknown or empty slug → `invalid`, never a guessed path; `path = moduleOverviewPath(slug)` and
    refuse unless it lies under that module's own `modules/<slug>/wiki/`; `task:
CONDENSE_MODULE_TASK`; carry the module title so the work-queue subject label reads it.
  - `artifactHeader()` parses a module with `MODULE_SECTIONS`; `runLevel()` calls
    `condenseModule()`; `outcomeOf()` maps a module proposal to `truncatedCount: null` (the partial
    read is stated in the artifact, and `partialInputsNote()` speaks of day entries).
  - `condense:read`: for `unit: 'module'`, answer `null` when the overview carries no
    `condensed_at`. `condense:delete`: refuse `unit: 'module'` with `invalid`, touching nothing.
  - `appendDirective()`: an optional `type` for the "file does not exist" case (today it writes
    `type: condensed`); the module reject passes `'overview'`.
  - Tests: "accepting writes overview.md and leaves the previous file in .secondbrain/trash/",
    "accepting after overview.md changed on disk is a conflict and leaves it byte-identical",
    "rejecting a module proposal appends the reason to its directives and changes nothing else",
    "a module condensation writes its headings in the document language, not the UI language",
    "without a model for condense-module the run names the task and writes nothing",
    "an unknown module is refused", "a module overview cannot be deleted through condense",
    "an overview never condensed reads as not condensed".

- [x] **D5 — Maintenance says a module's condensation is due.** Files:
      `src/core/gardener/checks/condensation-due.ts` (third arm `moduleFindings`, reusing its local
      `changedInputs`, `condensedAtOf`, `findingKey`), `src/core/gardener/labels.ts` and
      `src/main/gardener-labels.ts` (module variants of `condensationMissing` /
      `condensationDue`, de with „…“ and en), `src/shared/types/gardener.ts` (doc comment of
      `condensation-due` names all three levels). Test: new
      `tests/core/gardener/checks-condensed-module.test.ts` (hand-built context like
      `checks-condensed.test.ts`), plus module cases in `tests/core/gardener/labels-condensation.test.ts`.
  - For each module in `ctx.modules` (honouring a module-scoped run): inputs = D3's
    `moduleInputs(docs, slug)`; artifact = the doc at `moduleOverviewPath(slug)`. No inputs → no
    finding. Inputs and no `condensed_at` → "missing" finding. Otherwise a finding when
    `changedInputs()` against `recordedSources()` is non-empty. Severity `info`, `fix: null`,
    `module: slug`, `paths: [overviewPath, ...changed]` (overview first — the open exit uses
    `paths[0]`). Keep the file under ~300 lines; if it would exceed, move the module arm to
    `condensation-due-module.ts` and register it from the same check.
  - Tests: "a page changed after the last condensation makes the module due", "a page added after
    the last condensation makes the module due", "a module with pages and no condensation yet is
    due", "a module with only its stub is not due", "a module right after its condensation is not
    due" (build the docs from a `condenseModule()` proposal — the same-selector guard),
    "the finding is informational, carries the module and offers no fix".

- [x] **D6 — The module view has a condensed tab.** Renderer + one doc. Files:
      `src/renderer/screens/modules/ModuleDetail.tsx` (`MODULE_TABS` gains `condensed`, an icon in
      `TAB_ICONS`, render the new tab), new `src/renderer/screens/modules/ModuleCondensedTab.tsx`
      (mirror `src/renderer/screens/projects/ProjectKnowledgeTab.tsx`: `unit="module"`,
      `task="condense-module"`, `keyPrefix="modules.condensed"`, `canDelete={false}`),
      `src/renderer/components/condensed/CondensedUnitPanel.tsx` (optional `canDelete` prop,
      default `true`; when `false` the delete action is not rendered), the modules i18n de/en files
      (find them via `'modules.tab.` in `src/renderer/i18n/`: `modules.tab.condensed` and every
      `modules.condensed.*` key the panel reads through `keyPrefix` — mirror the
      `project.condensed.*` block in `en-projects.ts` / `de-projects.ts` with module wording; de
      „…“, sentence case, no emoji), `docs/systems/navigation.md` (a paragraph like the 038/045 ones:
      an opened module carries a condensed tab, `?tab=condensed` rides along with `?m=<slug>`).
      Gaston atoms and tokens only; read `src/renderer/styles/gaston/README.md`.
  - e2e (existing no-model vault, no new launch): add to `tests/e2e/task-no-model.spec.ts` the test
    "with no model configured the module view names condense-module and links to its model
    setting" — open Knowledge → module "Second-Brain-Methodik" → condensed tab
    (`#/knowledge?m=second-brain-methodik&tab=condensed`); no Condense button, the no-model note
    names the task; `overview.md` unchanged on disk; following the link lands on the Models tab
    where `#routing-select-condense-module` is visible and enabled.

- [x] **D7 — Routes and the module condensation flow.** Files:
      `src/renderer/lib/task-result-route.ts` (`condense` subject `module:<slug>` →
      `/knowledge?m=<slug>&tab=condensed`), `src/renderer/screens/garden/targets.ts` (a
      `modules/<slug>/wiki/overview.md` path → `/knowledge?m=<slug>&tab=condensed`, like the area
      branch there; `src/renderer/lib/doc-home.ts` stays untouched), `CHANGELOG.md` (user-facing
      entry), new `tests/e2e/module-condense.spec.ts` (`test.use({ specId: 'module-condense',
  fakeProvider: { replies: { 'condense-module': <JSON> } } })` per `tests/e2e/fixtures/app.ts`;
      the reply cites real seeded page paths of `second-brain-methodik` from
      `scripts/seed/module-methodik-pages.mjs` and gives all three sections text + sources), plus a
      case in `tests/renderer/screens/garden/targets.test.ts` — "a module overview opens the
      module's condensed tab".
  - e2e test 1, "maintenance says a module's condensation is due and opens its module view": run
    maintenance (deterministic run as `gardener-run-cross-screen.spec.ts` does), the
    condensation-due finding for Second-Brain-Methodik is visible, Open lands on
    `#/knowledge?m=second-brain-methodik&tab=condensed`, `overview.md` byte-identical.
  - e2e test 2, "a module condensation is proposed as a diff, rejected with a reason, refused on a
    stale file and accepted": (a) no condensation task exists before the click; Condense → one
    task; (b) the diff shows removal rows (the seeded overview's content) and addition rows; (c)
    Reject cannot submit without a reason; with one, `overview.md` differs from before only by the
    directive line; (d) Condense again, edit `overview.md` on disk, Accept → conflict shown, file
    equals the external edit; (e) Condense again, Accept → `overview.md` has `condensed_at`,
    `sources:` listing the module's pages, the three headings each followed by a source line, the
    directive and the `module:` key still there, and `.secondbrain/trash/` holds the previous file;
    no delete action is offered.

## Model Hints

- D1 → deliverable-hard: it changes the parse/compose round trip shared by the area and project
  artifacts and the global section-name aliases that area notes, project and journal parsing also
  read — a wrong alias or a leaked `type` silently reclassifies headings or rewrites `type:` in
  existing condensed files without any module test noticing.
- Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/module-condense.spec.ts` › "a module condensation is proposed as a diff,
  rejected with a reason, refused on a stale file and accepted" (step a: no task before the click,
  one after). The "never after an ingest" half is additionally proven by 082 AC1's test (the
  overview is byte-identical after a digestion); nothing in this story schedules a run.
- AC2 → e2e `tests/e2e/module-condense.spec.ts` › "a module condensation is proposed as a diff,
  rejected with a reason, refused on a stale file and accepted" (step b).
- AC3 → e2e same test (step e); unit `tests/main/condense-module-ipc.test.ts` › "accepting writes
  overview.md and leaves the previous file in .secondbrain/trash/"; unit
  `tests/core/condense/run-module.test.ts` › "a proposal records every page read in sources and
  source_hashes".
- AC4 → e2e same test (step d); unit `tests/main/condense-module-ipc.test.ts` › "accepting after
  overview.md changed on disk is a conflict and leaves it byte-identical".
- AC5 → e2e same test (step c); unit `tests/main/condense-module-ipc.test.ts` › "rejecting a module
  proposal appends the reason to its directives and changes nothing else".
- AC6 → unit `tests/core/condense/run-module.test.ts` › "the next run's prompt carries the
  directives a rejection left" and › "a proposal keeps the directives section and every unknown
  frontmatter key verbatim"; e2e same flow (step e keeps directive and `module:` key).
- AC7 → unit `tests/main/condense-module-ipc.test.ts` › "a module condensation writes its headings in
  the document language, not the UI language".
- AC8 → e2e `tests/e2e/module-condense.spec.ts` › "maintenance says a module's condensation is due
  and opens its module view"; unit `tests/core/gardener/checks-condensed-module.test.ts` › "a page
  changed after the last condensation makes the module due" and › "a module with pages and no
  condensation yet is due".
- AC9 → e2e `tests/e2e/task-no-model.spec.ts` › "with no model configured the module view names
  condense-module and links to its model setting" (lands on a usable
  `#routing-select-condense-module`); unit `tests/core/llm/tasks.test.ts` › "condense-module is a
  strong structured task and not sensitive"; renderer `tests/renderer/i18n.test.ts` (task label,
  hint and `settings.fallback.condense-module` in de and en). `settings.test.tsx` renders from a
  mock catalogue without the condense kinds, so it proves nothing for this kind.
- AC10 → e2e `tests/e2e/task-no-model.spec.ts` › "with no model configured the module view names
  condense-module and links to its model setting"; unit `tests/main/condense-module-ipc.test.ts` ›
  "without a model for condense-module the run names the task and writes nothing".

Coverage gate: AC1 D3/D4/D6/D7 · AC2 D6/D7 · AC3 D1/D3/D4 · AC4 D4 · AC5 D4 · AC6 D1/D3 · AC7 D1/D4 ·
AC8 D5/D7 · AC9 D2/D6 · AC10 D3/D4/D6 — every criterion has a deliverable and a test.

## Done

The module level of the condensed layer: `modules/<slug>/wiki/overview.md` is now a condensed artifact
(`type: overview`, `condensed_at`, `sources`, `source_hashes`; sections decided / open / contradictions
plus directives, each with a source line). A `condense-module` run starts only on the click in the new
module `condensed` tab, is confirmed as a diff through the shared `condense:*` channels and
`CondensedUnitPanel`, and maintenance reports a due condensation without writing anything.

**Commit message:** `081: module condenses itself — condense-module task, overview artifact, module condensed tab, due finding`

**Verification** (narrow gate, run twice: after D7 and after the review fixes):

- `npm run build`, `lint`, `typecheck`, prettier on the changed code files: green. `npx vitest run --changed HEAD`:
  4000/4000 green on the second run. The first run had one red, `tests/core/ingest/queue.test.ts`
  (scanned-PDF `vi.waitFor` timing under load); it passed in isolation (27/27) and in the second full run.
  Ingest code is untouched by this story.
- `e2e-story`: `npx playwright test tests/e2e/module-condense.spec.ts tests/e2e/task-no-model.spec.ts`: 5/5.
- AC → test as verified, all passed: AC1/2 e2e diff flow (steps a, b); AC3 e2e (e) + `condense-module-ipc` "accepting writes…" +
  `run-module` "a proposal records every page read…"; AC4 e2e (d) + ipc conflict test; AC5 e2e (c) + ipc reject test; AC6 two
  `run-module` tests; AC7 ipc language test; AC8 e2e maintenance test + `checks-condensed-module`; AC9 task-no-model e2e +
  `tasks.test.ts` + `i18n.test.ts` (mapping corrected: `settings.test.tsx` renders from a mock catalogue and cannot see this kind);
  AC10 ipc no-model test + task-no-model e2e. No manual residue. Step 6b not run (sprint gate); full gate pending.
- Review: default stage PASS, 1 cycle; findings fixed: section migration no longer renames user `## Decided` / `## Contradictions`
  headings (guard + test), i18n coverage for the new kind, a duplicate renderer test removed, stale area/project-only copy, an
  overclaiming empty-state text, a reflowed header comment.

**Decisions:**

- D1 touched three existing `evidence.test.ts` assertions and `report.test.ts` (pinned `condensation-due` count 3 → 5, now split by
  `module === null`) because overview is excluded from evidence and the demo vault holds two uncondensed modules; both follow the plan.
- `moduleInputs()` filters on `moduleOfPath(doc.path) === slug` in addition to `isWikiPage`, which accepts any module's pages.
- Module title comes from `module.md`, falling back to the slug; `moduleTarget()` split into `src/main/ipc/condense-module-target.ts` to keep `condense-unit.ts` under 300 lines.
- Seeded overview has no `condensed_at`, so maintenance reads "No condensation yet" rather than "due"; the e2e asserts that.
- Left unfixed on purpose: `src/main/ipc/condense.ts` is 312 lines (comments, soft limit); `reasonOf` is a third copy (run.ts, run-project.ts —
  extraction is a refine item); `moduleSlugFromOverviewPath` is exported per plan but unused in src; `pages.ts` maps a cited path to its file
  basename, which differs from a page that declares a different `slug:`.

tiers: D 7 / hard 1 · review default · cycles 1 · agents 11
