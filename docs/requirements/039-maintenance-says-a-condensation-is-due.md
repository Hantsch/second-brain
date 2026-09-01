---
id: 039
title: Maintenance says a condensation is due
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). The pull side: nothing condenses on its own, so
something has to tell me it is worth doing. Depends on
[[037-an-area-can-be-condensed-into-one-file]] and
[[038-i-see-what-a-condensation-changes-before-it-is-written]]. Concept:
[[../concepts/condensed-layer]] (CND-7, 8, 12, 24, 25, 26, 27, 38).

## Requirement

The condensation is pulled, never pushed — I trigger it when I am in the area anyway. That only
works if something reminds me. The maintenance run should report, deterministically and without a
model, that an area's condensed file is older than the material it was written from, or that an
area has material and no condensed file at all.

It is not an error. Nothing in my vault is broken because I have not gathered an area yet, so it
is informational, not a warning, and the finding's way out is to open the area — it writes
nothing itself. Same shape as the existing "unprocessed source" finding, for the same reason:
condensing needs a model and a target, and that is not the maintenance run's job.

And the artifact has to stop tripping the checks that punish restatement: a synthesis restates its
own sources by design, so it must not be reported as a near-duplicate or as an orphan, exactly as
the module overview already is not.

## Acceptance Criteria

- [ ] A deterministic check reports a condensation as due when an input is newer than
      `condensed_at`, or when an area has inputs and no artifact.
- [ ] The check runs with no model configured and produces the same result.
- [ ] Its severity is informational, not a warning, and the health score treats it accordingly.
- [ ] The finding's exit opens the area; it writes nothing to the vault.
- [ ] The finding is reported in the maintenance surface and links to the area; the diff is never
      confirmed there.
- [ ] The check participates correctly in a scoped run (021c) and in stop/continue (021b).
- [ ] Artifacts are exempt from the orphan and near-duplicate checks.
- [ ] An artifact is a normal indexed document: findable in search, filterable by type, and not
      counted as a module page.
- [ ] No condensation starts without an explicit human action — no schedule, no threshold-triggered
      write, no background run.
- [ ] All new UI strings exist in `de` and `en`.

## Open Questions

- ~~Q1 — Is "newer" file mtime, the indexed `updated` frontmatter, or the content hash?...~~
  answered → Decisions (Sprint)
- ~~Q2 — Should the check debounce...~~ answered → Decisions (Sprint)
- ~~Q3 — Does this milestone already add the module and project variants of the check?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 (O1) — "newer" is decided by content hash of the inputs, not mtime or the indexed
  `updated` field. Matches the vault's own truth model (files are truth, hash-based conflict
  detection) and is robust to touch-without-change.
- **(User)** Q2 — no debounce for v1. Simplest, deterministic, matches "no threshold-triggered
  write"; revisit only if it proves noisy in practice.
- Q3 is already settled by `sprint.md`'s Notes ("M12 is deliberately the area level only") — the
  check stays area-only this sprint; module/project variants are out of scope.
- **Recording the hash.** Each `sources:` entry of the artifact carries the input's content hash
  (`IndexedDoc.hash`, sha256 of the whole file) as of the run — without a recorded hash the user's
  hash-based answer to Q1 is unimplementable, and a second hash scheme would be a second truth.
- **`condensed_at` is not the comparison basis.** It stays in the artifact and is shown in the
  finding's text ("last condensed on …"), but due-ness is decided only by hashes — a timestamp
  comparison is exactly the mtime-shaped answer Q1 rejected.
- **Inputs = the area file plus its tagged day entries.** The area's notes and todos live inside
  `areas/<slug>.md`, so one document hash covers both; day entries come from the last ~90 days
  carrying the slug (037-Q4's bound). One selector, shared with 037, so run and check can never
  disagree about what an input is.
- **Due = an input was added or changed; a vanished input is not due.** Day entries slide out of
  the 90-day window by themselves, so counting removals would make every artifact permanently due.
- **A source entry without a hash counts as changed.** Honest ("I cannot tell it is current")
  instead of assuming freshness for a hand-edited or pre-contract artifact.
- **No `GardenerFix`; the finding uses the existing `open` exit** (`fix: null`, like the orphan
  check without a target). CND-26 demands a fix that writes nothing — the cheapest proof is that
  no fix action exists at all.
- **The `open` exit routes in-app** via a new area case in `targets.ts` (`/notes?a=<slug>` plus
  038's condensed-tab parameter); today an `areas/…` path falls through to "open in OS editor",
  which would not be "opens the area".
- **Severity `info`** — the existing weight table (`SEVERITY_WEIGHT.info = 1`) is what "the health
  score treats it accordingly" means; no new weighting mechanism.
- **The kind stays out of `LLM_ONLY_KINDS`** — the check runs modelless, so a modelless run's
  silence about it is a real all-clear, which is precisely what that list encodes.
- **Scope participation is inherited, not re-built:** `report.ts` runs all checks and filters
  afterwards via `scopeAdmits`, so the work is registering the kind and emitting `module: null`;
  an area belongs to no module and is correctly absent from a module-scoped run.
- **Exemption from orphan/near-duplicate is structural, not a new branch:** `isWikiPage()` only
  admits `modules/*/wiki/**`, so `areas/<slug>.condensed.md` never enters the page graph or the
  module page counts. This story locks that in with tests rather than adding a predicate.
- **Generic `FindingCard`, no per-kind card** — the finding carries title, detail and a path and
  has nothing extra to render; a new card would be markup without content.
- **The finding id keys on the current input inventory** (area slug + digest of paths and hashes),
  so "fits as is" acknowledges *this* state and new material raises it again — the deliberate
  consequence of the user's no-debounce decision.

## Plan

The check is a deterministic gardener check over the already-built index; it opens no file, calls
no model, and offers no fix. Order follows the dependency chain (037 → contract, then check, then
surface).

1. **Contract with 037** — `src/core/condensed/`: one index-only selector `areaInputs(index, slug,
   today)` returning `{ path, hash }[]` (area file + day entries with the slug, last 90 days), and
   `recordedSources(doc)` reading the artifact's `sources:` entries as `{ path, hash | null }`.
   037's writer records the hash it read; `docs/VAULT-FORMAT.md` documents the entry shape.
2. **The check** — `src/core/gardener/checks/condensation-due.ts`, kind `condensation-due`,
   severity `info`, `module: null`, `fix: null`. Due when a current input is missing from the
   recorded sources, or its hash differs (or is absent); also due when an area has inputs and no
   artifact at all. `paths` lists the area file first, then the artifact if it exists. Registered
   in `checks/index.ts`; the kind is added to `GardenerFindingKind` / `GARDENER_FINDING_KINDS`.
   `GardenerIndexView` gains `areas()` (already on `IndexService`).
3. **Sentences** — `condensationDue` / `condensationMissing` on `GardenerLabels`, German in
   `src/core/gardener/labels.ts`, English in `src/main/gardener-labels.ts`; the text names the
   area, `condensed_at` and how many inputs changed. Nothing beyond what the check computed.
4. **Conformance** — tests that pin severity/health weight, exclusion from `LLM_ONLY_KINDS`,
   behaviour in a kinds-scoped and a module-scoped run, and behaviour across a stopped run.
5. **Exemptions and normal-document behaviour** — tests proving the artifact is not an orphan, not
   a near-duplicate candidate, not counted as a module page, present in the search index and
   reachable via the `types` filter.
6. **Surface** — `targets.ts` gains the area route so the `open` exit lands on the area's condensed
   tab; `de-garden.ts` / `en-garden.ts` gain `garden.kind.*`, `garden.countOne/countMany.*` and
   `garden.advice.*` for the new kind. No new card, no diff in the maintenance screen.
7. **Seed + manual acceptance** — the demo vault gets an area with a stale artifact and an area
   with material and none, so the finding is visible in `npm run shot`.

Affected files, in order: `src/core/condensed/inputs.ts`, `src/core/condensed/sources.ts`,
`docs/VAULT-FORMAT.md` · `src/shared/types/gardener.ts`, `src/core/gardener/types.ts`,
`src/core/gardener/checks/condensation-due.ts`, `src/core/gardener/checks/index.ts`,
`src/core/gardener/labels.ts`, `src/main/gardener-labels.ts` ·
`src/renderer/screens/garden/targets.ts`, `src/renderer/i18n/de-garden.ts`, `en-garden.ts` ·
`scripts/seed*`, `tests/core/…`.

## Deliverables

**D1 — The input inventory and the hash contract** _(core)_
`src/core/condensed/inputs.ts` (new), `src/core/condensed/sources.ts` (new or extend 037's
artifact module), 037's artifact writer, `docs/VAULT-FORMAT.md`,
`tests/core/condensed/inputs.test.ts` (new).
Mirror: `src/core/index/areas.ts` (index-only derivation, no file access).
Accepted when: `areaInputs()` returns the area file plus every day entry carrying the slug within
the last 90 days of `today`, each with its `IndexedDoc.hash`, deterministically ordered; a run
writes those hashes into the artifact's `sources:` entries; `recordedSources()` reads them back and
yields `hash: null` for a legacy or hand-edited entry; the format is documented.

**D2 — The check** _(core)_
`src/core/gardener/checks/condensation-due.ts` (new), `src/core/gardener/checks/index.ts`,
`src/core/gardener/types.ts` (`GardenerIndexView.areas()`), `src/shared/types/gardener.ts`,
`tests/core/gardener/checks-condensed.test.ts` (new).
Mirror: `src/core/gardener/checks/unprocessed-source.ts` (shape), `checks/stale-page.ts` (staleness).
Accepted when: an area whose input hash changed yields exactly one `info` finding with
`fix === null`, `module: null` and the area path first; an area with inputs and no artifact yields
the missing-artifact variant; an unchanged area and an empty area yield nothing; a vanished input
alone yields nothing; a `sources:` entry without a hash yields a finding; the finding id changes
when the input inventory changes and is stable when it does not. _(AC1, AC4-writes-nothing, AC9)_

**D3 — Sentences in both languages** _(core + main)_
`src/core/gardener/labels.ts`, `src/main/gardener-labels.ts`, `tests/core/gardener/` label test.
Accepted when: both variants have a German and an English sentence naming the area, `condensed_at`
and the number of changed inputs; German uses `„…“`; English contains no U+201E. _(AC10, core half)_

**D4 — Conformance: no model, severity, scope, stop/continue** _(core, tests-led)_
`tests/core/gardener/checks-condensed.test.ts`, `tests/core/gardener/health.test.ts`,
`tests/core/gardener/report.test.ts`, `src/core/gardener/types.ts` if a fix is needed.
Accepted when: a report run with no gateway configured produces the identical findings; the kind is
absent from `LLM_ONLY_KINDS`; the health penalty for one finding equals `SEVERITY_WEIGHT.info`; a
run scoped to `kinds: ['condensation-due']` keeps the finding and drops the others, a run scoped to
a module drops it; a run stopped after the `checks` stage still reports it and `missingStages` is
unaffected; a test asserts the run performs no vault write. _(AC2, AC3, AC6, AC9)_

**D5 — Exemptions and normal-document behaviour** _(core, tests-led)_
`tests/core/gardener/checks-similarity.test.ts`, `tests/core/gardener/checks-links.test.ts`,
`tests/core/index/` (pages + search tests).
Accepted when: an artifact whose body restates its sources produces neither an `orphan` nor a
`near-duplicate` finding; it does not appear in `pages()` and does not raise a module's page count;
it is in the search index and returned by a query with `types: ['condensed']`. Add an explicit
guard only if a test proves one is needed. _(AC7, AC8)_

**D6 — The maintenance surface** _(renderer)_
`src/renderer/screens/garden/targets.ts`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`, `tests/renderer/` targets test.
Mirror: the wiki-page case in `targets.ts:33-40`.
Accepted when: the `open` exit of the finding resolves to `{ kind: 'route', to: '/notes?a=<slug>…' }`
with 038's condensed-tab parameter (follow 038's actual parameter name); the generic card renders
title, detail and the exit; no accept/diff control appears in the maintenance screen;
`garden.kind.*`, `garden.countOne/countMany.*` and `garden.advice.*` exist in `de` and `en`.
_(AC4, AC5, AC10, renderer half)_

**D7 — Seed and live smoke** _(scripts)_
`scripts/seed*`, `.screenshots/` via `npm run shot`.
Accepted when: the demo vault contains one area with a stale artifact and one with material and no
artifact; the maintenance screen screenshot shows both findings as informational.

## Model Hints

- `D1 → deliverable-hard` — it edits 037's freshly built write path and defines the hash semantics
  the whole check rests on; getting the recorded/current hash pairing wrong silently makes every
  artifact permanently due or permanently fresh, and neither fails a test that does not exist yet.
- D2, D3, D4, D5, D6, D7 → default.
- `Review: → story-review-hard` — one deliverable modifies a confirming write path and the story
  carries guardrail 2 ("no condensation without human action"), which a diff-only reviewer can only
  judge with the full context of the run.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app.
2. Maintenance screen → run a full maintenance run. Expect two informational findings for the
   condensation kind: one "artifact is older than its material", one "area has material and no
   artifact". Neither is styled as a warning; the health score moves by the informational weight.
3. Open one finding's exit. Expect to land in `Notes` on that area, on the condensation tab (038),
   with the diff **not** pre-confirmed and nothing written. Check the vault: no file changed,
   no `.secondbrain/trash/` entry.
4. Go back, run a maintenance run scoped to this kind only. Expect the same two findings and no
   others. Run one scoped to a module. Expect neither finding.
5. Start a run and stop it. Expect the findings from the completed `checks` stage to be shown and
   the run to be marked incomplete, not failed.
6. Settings → remove the model for `condense-area` (and any provider). Run maintenance again.
   Expect the identical two findings — the check does not depend on a model.
7. Edit one tagged day entry in an external editor, save, let the watcher pick it up, run
   maintenance. Expect that area's finding to appear/return. Then `touch` a day entry without
   changing content and run again — expect **no** new finding (hash, not mtime).
8. Condense that area through the UI (037/038) and accept. Run maintenance. Expect its finding to
   be gone.
9. `Ctrl+K` → search for a phrase that only exists in the artifact. Expect the artifact in the
   results. Open the module the area's material relates to and confirm its page count did not grow.
10. Switch the UI language to English and back. Expect both findings' texts and the kind label to
    be present and correct in both.

## Done
