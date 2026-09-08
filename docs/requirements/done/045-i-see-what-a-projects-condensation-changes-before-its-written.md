---
id: 045
title: I see what a project's condensation changes before it's written
status: done # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M14 (condensed layer, project level). Depends on
[[044-a-project-can-be-condensed-into-one-file]] for the run and the write helper. Mirrors
[[038-i-see-what-a-condensation-changes-before-it-is-written]] for the project level. Concept:
[[../concepts/condensed-layer]] (CND-18 through CND-23, CND-37 through CND-40).

## Requirement

The **Project knowledge** tab — already reserved in [[../systems/navigation]] — is where a
project's condensation is triggered and read. Nothing writes itself: I start the run from inside
the project, I see the diff between what is there now and what the run proposes before anything
changes, and I decide.

Accepting writes the new artifact, hash-guarded against the version the diff was built from, with
an undo copy kept. Rejecting requires a reason — not a bare dismissal — and that reason becomes a
directive the next run reads and never overwrites. Without a model configured for this task, the
tab says so plainly and writes nothing.

## Acceptance Criteria

- [x] The Project knowledge tab shows a diff (old vs. proposed new) before any write, with
      removals as visible as additions and each section's source lines included.
- [x] Accepting writes hash-guarded against the hash the proposal was built from; a stale hash
      reports a conflict instead of merging, and an accepted write leaves an undo copy in
      `.secondbrain/trash/`.
- [x] Rejecting requires a reason; the artifact is left untouched and the reason is appended to
      the artifact's directives section, read by the next run and never rewritten by it.
- [x] Triggering the run, reading the diff, accepting, rejecting-with-reason and the no-model
      state are all drivable through the real UI.
- [x] Without a model configured for `condense-project`, the tab states this plainly, names the
      task kind, and links to the setting; nothing is written.
- [x] The tab can delete an existing project artifact, naming the directives section as the part
      no later run can reproduce, hash-guarded and undoable through `.secondbrain/trash/` — the
      mirror of 043 for the project level, per the binding Q1 decision below.
- [x] All new UI strings exist in German and English.

## Open Questions

- ~~Q1 — Does the project level also get a delete affordance for its condensed artifact,
  mirroring story 043's `condense:delete` for areas — or is delete deferred until a third level
  exists and the pattern can be shared?~~ answered → Decisions (Sprint)
- ~~Q2 — Own IPC channel group (e.g. `condense:project:*`) mirroring the area's, or should 043's
  channel shape be generalised across levels now that a second level exists?~~ answered →
  Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/sprint 12` clarification round, ahead of refine —
not in a later round. Binding.

- **(User)** Q1 — **include delete now, mirroring 043's `condense:delete`.** Low added cost —
  the trash/undo mechanism already exists — and there is no reason to make the user wait for a
  third level to get the same way back that areas already have.
- **(User)** Q2 — **generalise the existing channels with a level discriminator**, rather than a
  new `condense:project:*` family. The existing channel names (`condense:read`, `condense:run`,
  `condense:accept`, `condense:reject`, `condense:delete`) already omit "area" — they were never
  named as area-specific — so add a `unit: 'area' | 'project'` (or equivalent) field to the req
  shapes and branch path resolution (`condensedAreaPath` vs. a new `condensedProjectPath`) on
  it, instead of duplicating five channel definitions and preload entries per level.

Taken at refine (2026-09-02), not by the user — each with its reason:

- **Tab id `knowledge`, always offered**, label "Knowledge" / „Wissen“ (`project.tab.knowledge`),
  deep-linked as `?p=<slug>&tab=knowledge`. Unlike the conditional Sessions tab, every project has
  state, notes and todos to condense, so an unconditional tab keeps the deep link from a
  maintenance finding (046) always valid.
- **`navigation.md` gets corrected, not just extended.** Its "Not part of this" bullet ("Project
  knowledge condensed from agent sessions — needs its own concept") is now wrong: the concept
  exists (`concepts/condensed-layer.md`, CND-37) and this story builds the tab. The bullet moves
  into the Projects paragraph together with the `?tab=knowledge` state, the way 038 did it for the
  area tabs.
- **The discriminator is a required `unit: 'area' | 'project'`** on every condense request and on
  `CondenseProposal`, not an optional field defaulting to `area`. There is exactly one caller (this
  renderer); an optional field would let a forgotten unit silently address the wrong level's file,
  which on `condense:delete` means deleting the wrong artifact.
- **`condense:read` gains `path` in its response.** A project artifact lives under
  `projects/<scope>/<slug>/`, so the renderer cannot compute it from a slug the way it computes
  `condensedAreaPath(slug)` today. Returning the path the handler already derived removes the
  renderer's path arithmetic for both levels and keeps `condensedProjectPath` out of
  `tsconfig.web.json`'s core allowlist.
- **Unit resolution lives in a new `src/main/ipc/condense-unit.ts`**, not inline in each of the
  five handlers: `src/main/ipc/condense.ts` is already 223 lines and five inline branches would
  push it past the 300-line soft limit.
- **The path is still derived server-side from `unit` + `slug`**, never taken from the renderer —
  for a project that means resolving the scope through the project index, exactly as `projects:get`
  does. Same rule the existing accept/reject/delete handlers already follow.
- **One shared level-agnostic panel instead of a second 280-line copy.**
  `AreaCondensedTab.tsx`'s body moves into
  `src/renderer/components/condensed/CondensedUnitPanel.tsx`, parameterised by unit, slug, title,
  task kind and an i18n key prefix; `AreaCondensedTab` and the new `ProjectKnowledgeTab` become
  thin wrappers. CLAUDE.md's "reuse instead of copying", and it makes the four states, the conflict
  path and the reject gate impossible to drift apart.
- **Project strings get their own key prefix `project.condensed.*`** in `en-projects.ts` /
  `de-projects.ts` rather than a shared, unit-interpolated key set — "Condense this project" and
  „Dieses Projekt verdichten“ decline differently in German, and a `{unit}` placeholder would
  produce broken German.
- **Nothing about the artifact format, the run, the prompt, the task kind or
  `condensedProjectPath()` is decided here** — all of that is story 044. This story consumes it and
  adapts at the IPC boundary if 044's shape differs, exactly as 038 adapted 037's.

## Plan

This story is the shell around 044: no new core logic, no new prompt, no new artifact format. It
generalises the five existing `condense:*` channels by one discriminator, mirrors 038 + 043's tab
onto the project, and reuses the area's own component instead of copying it.

Contract, fixed here so 044 and 046 can build against it:

```
type CondenseUnit = 'area' | 'project'
condense:read   { unit, slug }                 -> { content, hash, path, condensedAt, sources } | null
condense:run    { unit, slug }                 -> CondenseProposal   // CondenseProposal gains `unit`
condense:accept { proposal }                                        // the unit rides inside it
condense:reject { unit, slug, reason }
condense:delete { unit, slug, expectedHash }
```

Order of work:

1. **Contract + client plumbing (D1).** `CondenseUnit` in `src/shared/types/condense.ts`, the five
   channel shapes in `src/shared/ipc.ts` (no new channel name, no new preload entry), `api.ts`,
   `mock-bridge.ts`, the five hooks in `queries/condense.ts`, and `AreaCondensedTab` passing
   `'area'`. Main accepts `unit` and answers `'project'` with `invalid` until D2 — a discriminator
   on a shared type cannot compile in halves, so it lands in one D and the behaviour follows.
2. **Main, project branch (D2).** `src/main/ipc/condense-unit.ts` resolves unit + slug to the
   artifact path (project: scope via the project index, then 044's `condensedProjectPath`) and, for
   `run`, to the level's run function and task kind. The five handlers keep their pre-check,
   snapshot, hash-guarded write, `settle()` and trash semantics unchanged.
3. **Shared panel (D3).** `AreaCondensedTab.tsx`'s body becomes
   `components/condensed/CondensedUnitPanel.tsx`; the area tab keeps its behaviour and its tests
   verbatim. Pure refactor, no visible change, no new keys.
4. **The Project knowledge tab (D4).** `ProjectKnowledgeTab.tsx` wraps the panel with
   `unit="project"`, task kind `condense-project` and prefix `project.condensed`; `ProjectDetail`
   gains the tab, `ProjectsScreen` the `knowledge` address state; `project.condensed.*` keys in
   `en` and `de`.
5. **Acceptance surface (D5).** Seed a demo project with an existing artifact plus one directive, a
   `shot.mjs` step, and the `docs/systems/navigation.md` correction.

Affected existing files: `src/shared/ipc.ts`, `src/shared/types/condense.ts`,
`src/main/ipc/condense.ts`, `src/renderer/lib/{api.ts,mock-bridge.ts,queries/condense.ts}`,
`src/renderer/screens/notes/AreaCondensedTab.tsx`,
`src/renderer/screens/projects/{ProjectDetail.tsx,ProjectsScreen.tsx}`,
`src/renderer/i18n/{en,de}-projects.ts`, `scripts/seed*`, `scripts/shot.mjs`,
`docs/systems/navigation.md`, plus tests.

**Coverage gate — every acceptance criterion has a deliverable:**

| Criterion                                                | D          |
| -------------------------------------------------------- | ---------- |
| Diff before any write, removals visible, source lines    | D3, D4     |
| Hash-guarded accept, conflict, undo copy in trash        | D1, D2     |
| Reject requires a reason, lands in directives, preserved | D2, D3, D4 |
| Trigger / diff / accept / reject / no-model via real UI  | D4, D5     |
| No model for `condense-project`: honest, named, linked   | D4         |
| Delete with the directives warning, guarded, undoable    | D2, D4     |
| All new strings in `de` and `en`                         | D4         |

## Deliverables

**D1 — `unit` discriminator: contract and client plumbing**
Files: `src/shared/types/condense.ts`, `src/shared/ipc.ts`, `src/main/ipc/condense.ts`,
`src/renderer/lib/api.ts`, `src/renderer/lib/mock-bridge.ts`,
`src/renderer/lib/queries/condense.ts`, `src/renderer/screens/notes/AreaCondensedTab.tsx`,
`tests/main/ipc-coverage.test.ts` (extend).
Adds `export type CondenseUnit = 'area' | 'project'`, puts `unit` on all five request shapes and on
`CondenseProposal`, and adds `path` to `condense:read`'s response. No new channel name, no new
preload entry (binding Q2 decision). Main routes `unit: 'area'` exactly as today and throws
`invalid` for `'project'` with a comment naming D2 as its filler. The five hooks take the unit at
the call site. Mirror: the existing channel block `src/shared/ipc.ts:462-500`.
Acceptance: the whole area flow (read, run, accept, conflict, reject, delete) behaves exactly as
before through `unit: 'area'`; `condense:read` returns the same path the handler writes to; the
renderer no longer computes an artifact path itself; `unit: 'project'` returns `invalid`; the
coverage test still lists exactly five condense channels.

**D2 — Main: the project branch of every condense handler**
Files: `src/main/ipc/condense-unit.ts` (new), `src/main/ipc/condense.ts`,
`tests/main/condense-ipc.test.ts` (extend).
`resolveCondenseUnit(services, unit, slug)` returns the artifact path (area: `condensedAreaPath`;
project: the project's scope from the project index plus 044's `condensedProjectPath`) and, for
`run`, the level's run function and task kind. A project slug that does not resolve is `invalid` —
never a guessed path. Accept keeps its pre-check-before-snapshot order, reject keeps the directive
splice (never a body recompose), delete keeps `VaultStore.delete()`'s trash move; all three call
`settle(services, [path], 'condense')`. Mirror: `src/main/ipc/condense.ts:135-177` (accept) and
`:200-219` (delete).
Acceptance: a project run returns a proposal whose path is inside that project's own folder; a
fresh-hash accept writes once and leaves an undo copy in `.secondbrain/trash/`; a stale hash
returns `conflict`, leaves the file byte-identical and creates no trash entry; a project reject
appends one directive line and touches no machine section; a project delete removes the artifact,
returns a restorable `undoToken`, and `condense:read` then returns `null`; an unknown project slug
is `invalid`; read, reject and delete all work with no model configured; no path reaches the
network.

**D3 — Extract the level-agnostic condensed panel**
Files: `src/renderer/components/condensed/CondensedUnitPanel.tsx` (new),
`src/renderer/screens/notes/AreaCondensedTab.tsx`, `tests/renderer/condense-area.test.tsx` (extend
only if a selector actually moves).
Pure refactor: the four states (no model / no artifact / artifact / running), the diff, accept, the
reject dialog and the delete dialog move into one component taking
`{ unit, slug, title, task, keyPrefix }`; `AreaCondensedTab` becomes a wrapper passing
`unit="area"`, `task="condense-area"`, `keyPrefix="notes.condensed"`. No new i18n keys, no visual
change, no colour or spacing outside tokens, both files under the 300-line soft limit.
Acceptance: `tests/renderer/condense-area.test.tsx` passes without behavioural edits; the area tab
renders identically (038/043's screenshot unchanged); the panel contains no area-specific string,
path or task kind.

**D4 — The Project knowledge tab**
Files: `src/renderer/screens/projects/ProjectKnowledgeTab.tsx` (new),
`src/renderer/screens/projects/ProjectDetail.tsx`,
`src/renderer/screens/projects/ProjectsScreen.tsx`, `src/renderer/i18n/en-projects.ts`,
`src/renderer/i18n/de-projects.ts`, `tests/renderer/condense-project.test.tsx` (new),
`tests/renderer/projects.test.tsx` (extend).
The wrapper passes `unit="project"`, `task="condense-project"`, `keyPrefix="project.condensed"`.
`ProjectTab` gains `'knowledge'`, the `Tabs` item is unconditional (an icon name already used
elsewhere in the app), and `ProjectsScreen`'s `Tab` union, `tabOf()` and the `view.go` mapping
carry `knowledge` in the address exactly as they carry `sessions` (the list stays lit). New keys
`project.tab.knowledge` and `project.condensed.*`, mirroring `en-notes.ts:53-91`; German quotes
`„…“`; Gaston atoms and tokens only.
Acceptance: `?p=<slug>&tab=knowledge` opens the tab directly; with `condense-project` unrouted the
tab shows `LlmMissing` naming that task kind with the link to model settings and offers no trigger,
while an existing artifact stays readable; trigger → diff → accept, reject-with-reason (confirm
disabled on an empty reason, no bare dismiss) and delete (rendered only when an artifact exists,
confirmation naming the directives section) all work from the tab; a `conflict` shows the conflict
message and leaves the artifact readable; the i18n parity test is green.

**D5 — Acceptance surface: seed, screenshot, navigation doc**
Files: `scripts/seed.mjs` (or the seed source it delegates to), `scripts/shot.mjs`,
`docs/systems/navigation.md`.
Seeds one demo project with an existing condensed artifact carrying one directive line, adds a
`shot.mjs` step that opens `?p=<slug>&tab=knowledge` and captures it, and corrects
`navigation.md`: the "Project knowledge condensed from agent sessions" bullet leaves "Not part of
this", and the Projects paragraph documents `?tab=knowledge` the way the area tabs are documented
at `navigation.md:74-76`.
Acceptance: `npm run seed && npm run shot` produces a screenshot of the Project knowledge tab with
a real artifact; `navigation.md` no longer claims the feature still needs its own concept; the
manual test plan below runs end to end on the seeded vault.

## Model Hints

- D2 → `deliverable-hard` — this is the write path that can delete, and the project path comes from
  a scope lookup rather than a slug template: a wrong resolution snapshots, overwrites or deletes
  another project's file while the hash guard reports nothing wrong.
- D3 → `deliverable-hard` — it refactors the already-accepted area condense UI (038 + 043, reviewed
  twice at hard tier); a silent drift in the four-state priority, the conflict handling or the
  no-bare-dismiss reject gate would regress an accepted guardrail-2 surface.
- D1, D4, D5 → default tier.
- Review: → `story-review-hard` — a delete-capable write path plus a refactor of an accepted
  confirmation surface; the hash guard, the trash copy and the unchanged area behaviour have to be
  read off the diff rather than assumed.

## Test Plan (manual acceptance)

Run `npm run seed`, start the app, go to **Projects** and select the seeded project that carries a
condensed artifact with a directive line.

1. **The tab is there and addressable.** The detail shows a Knowledge tab. Open it; the address
   reads `?p=<slug>&tab=knowledge`. Reload the app on that link — the tab opens directly.
2. **No model.** In settings, leave `condense-project` unrouted. The tab states that a model is
   missing, names `condense-project`, links to the model settings, and offers no trigger. The
   seeded artifact is still readable below it.
3. **Trigger and diff.** Route `condense-project` to a local model, press the trigger. A running
   state appears, then a diff — old against new, removed lines marked and counted, and the source
   lines of each section visible as diff rows. Open the artifact file in an editor: unchanged.
4. **Accept.** Press accept. The artifact shows the new content with an updated `condensed_at`, and
   `.secondbrain/trash/` holds a new token folder with the previous version.
5. **Conflict.** Run again, then edit the artifact in an external editor and save before accepting.
   Accept reports a conflict, discards the proposal and asks for a re-run; your edit is still in
   the file, unmerged.
6. **Reject with a reason.** Run again, press reject. Confirm is disabled while the field is empty,
   and there is no way to dismiss the proposal without a sentence. Enter one and confirm: the
   artifact body is unchanged and its directives section carries the line. Run again — that section
   appears in the diff only as context, and the proposal respects the sentence.
7. **Delete.** Press delete. The confirmation names the file and says the directives section is the
   part no later run can reproduce. Confirm: the tab falls back to its "never condensed" state, the
   file is gone from the project folder, and `.secondbrain/trash/` holds it including the
   directives. Run again — the deleted directive is not back.
8. **The area is untouched.** Go to **Notes**, open the seeded area with an artifact, condensed
   tab: read, trigger, diff, reject and delete behave exactly as before this story.
9. **Language.** Switch the UI language to German and repeat steps 2, 6 and 7: all strings are
   translated and German quotes are `„…“`.

## Done

Generalised the five `condense:*` IPC channels with a required `unit: 'area' | 'project'`
discriminator, added `condense:read`'s `path` field, and moved area path resolution out of the
renderer. `src/main/ipc/condense-unit.ts` resolves both levels server-side (project scope via the
project index, refusing — `invalid` — a project whose frontmatter disagrees with its own folder,
never a guessed path). Extracted the area condensed tab's body into a level-agnostic
`CondensedUnitPanel`, wrapped by a thin `AreaCondensedTab` and a new `ProjectKnowledgeTab`. Added
the unconditional "Knowledge" / „Wissen" tab to the project screen (`?tab=knowledge` deep link),
`project.condensed.*` / `project.tab.knowledge` strings in `de`/`en`, seeded a demo project with a
directive-bearing artifact, added a `shot.mjs` step, and corrected `docs/systems/navigation.md`.

Review findings fixed post-review: (1) condense query cache keys now include `unit`, so an area and
a project sharing a slug no longer share one cached artifact/hash across mutations; (2)
`CondensedUnitPanel` now shows an honest error state (reusing `ErrorState`) instead of silently
falling through to "not condensed yet" when a project's artifact path fails to resolve.

**Decisions (implementation-level, not pre-recorded):**

- `claudeTranscriptTail()` was added to `src/main/ipc/overview-deps.ts` as the missing shell wiring
  for 044's `CondenseProjectSources.readTranscriptTail` (044 shipped backend-only, no shell
  implementation) — otherwise every project run would condense with zero session input despite
  citing sessions in `sources:`. Introduces one undecided policy constant, `CONDENSE_TAIL_BYTES`
  (16 KiB), reusing the same clamp-and-truncate approach 044 already uses elsewhere.
- `src/main/ipc/projects.ts`'s `projectFor` was split to export a null-returning `findProject()` so
  D2 reuses `projects:get`'s exact scope-resolution lookup instead of re-implementing it, per the
  binding Q2 decision's "exactly as `projects:get` does".
- Left unfixed (documented, not blocking): the raw YAML frontmatter renders as a text dump above
  the sections in `CondensedUnitPanel` (visible in `.screenshots/26-project-knowledge.png`).
  Confirmed pre-existing (present identically in the area tab's own screenshots, unchanged by D3's
  refactor) — out of scope for this story, filed as a future finding. Also unfixed: the conflict
  toast message itself is not asserted by either the area's or the project's component test (a
  pre-existing gap the new test faithfully mirrors, not a weakening).

**Verification:** `npm run build` green. `npm test` — 251 files / 3526 tests, all pass (a
full-suite run under load intermittently times out 2 unrelated main-process test files
(`journal-ipc.test.ts`, `gardener-ipc.test.ts`); both pass 100% in isolation and are untouched by
this diff — confirmed flaky, not a regression). `npm run lint`, `npm run typecheck` clean.
`npm run format:check` clean except 3 pre-existing, untouched doc files. Live smoke:
`npm run seed && npm run shot` produced `.screenshots/26-project-knowledge.png` showing the
Knowledge tab, the no-model state naming `condense-project` with a link to model settings, and the
seeded artifact still readable beneath it — no console errors.

Code review (`story-review-hard`, one fix cycle): verdict PASS, all seven acceptance criteria
PASS/covered; two confirmed findings fixed (cache-key collision, silent error fallthrough); no
weakened or deleted tests; no scope creep beyond the two implementation decisions above, both
judged legitimate wiring.

**Commit message:** `045: Project knowledge tab — diff, accept, reject-with-reason, delete`
