---
id: 063
title: A module can be renamed and deleted
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-5](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: the complete module channel list is
`modules:list|create|pages|page|savePage|sources|graph` (`src/shared/ipc.ts:639`) — create-only;
the slug is embedded in every page's frontmatter (`src/core/wiki/pages.ts:181`), in `AGENTS.md`,
in `.ingest.json.modules` (`src/core/ingest/raw.ts:31`), and in cross-module wikilink targets,
so a manual rename in the file system breaks references.

## Requirement

A knowledge module can only be created. A mis-typed name, a module that turned out to be two
subjects, or one that should be retired — all of that means editing the file system by hand,
where the module's slug is woven into every page's frontmatter, into the ingest protocols under
`raw/`, and into wikilinks from other modules. Renaming a folder by hand silently breaks all of
them, and the app offers no alternative.

The module lifecycle needs at least rename and delete inside the app, done the way this app does
writes: what changes is shown first, the write is hash-aware, and there is a way back. Merging
two modules can stay out for now — it is its own story once rename/delete exist.

## Acceptance Criteria

- [x] A module can be renamed in the app: folder, page frontmatter, `AGENTS.md`, ingest
      protocols under `raw/`, and wikilinks referencing the module are updated consistently;
      what will change is shown before anything is written.
- [x] A module can be deleted in the app: it says what goes (page count, sources affected),
      the delete is undoable through the trash path, and raw sources under `raw/` are never
      deleted with it — they return to "undigested".
- [x] Both operations are hash-aware: concurrent external edits produce a conflict, not a
      broken half-rename.
- [x] The index, search, and ask reflect the change immediately afterwards.
- [x] Both work without a model configured.

## Open Questions

None. Every detail below was decided at sprint refine (2026-09-24) against the criteria, the
roadmap's M17 line, CLAUDE.md and docs/VAULT-FORMAT.md.

## Decisions (Sprint)

Reuse (what "not a fourth write path" concretely means):

- **The undo journal is gardener's `FixJournal` + `undoFix` (`src/core/gardener/undo.ts`), extended,
  not copied.** It already carries hash-checked content steps (`restoreSteps`) plus one nested
  `VaultStore.delete` mark under a single token — exactly the "one mark, one way back" a module
  delete needs; the only addition is an optional `moved: { from, to }` entry for the rename.
- **The apply order is `discardPage`'s (`src/core/gardener/discard-page.ts:152-230`), verbatim:**
  re-plan at click time, read and compute every new content before the first write, write content
  with `expectedHash`, re-hash right before the one structural step (move / delete) and do it last,
  `undoFix` on any mid-way failure — because that order is what already guarantees "conflict,
  never half-done" for discard.
- **The preview is a plan channel like `gardener:discardPlan`** (read-only, recomputed fresh each
  time the dialog opens), so "what changes is shown first" is the same mechanism the user already
  knows from discard.
- **The folder itself moves and trashes through the existing `VaultStore.move` / `VaultStore.delete`**
  (both already handle directories; `delete` of a folder is one manifest entry with `dir: true`),
  so no new trash or copy code.
- **Core code lives in `src/core/wiki/module-lifecycle/`** and imports the leaf
  `@core/gardener/undo` (not the `@core/gardener` barrel), because the gardener barrel imports
  `@core/wiki` and a barrel-to-barrel import would be a cycle.

Rename semantics:

- **Rename takes a new title; the slug is `slugify(title)`, same as `createModule`**, because a
  mis-typed name is the stated case and one naming rule for create and rename avoids a second one.
- **A title change whose slug stays the same is a title-only rename** (no move, only title lines),
  because refusing it would leave the most common typo fix impossible.
- **A new slug that already exists is `blocked: 'target-exists'` in the plan and `conflict` on
  apply**, because merging two modules is explicitly out of scope and `move` already refuses an
  occupied target.
- **What a rename rewrites:** `module.md` (`title`, `slug`, `module`), every page's `module:`
  frontmatter, `AGENTS.md` (`modules/<old>` path occurrences and the headline title), the
  catalog headline of `wiki/index.md` and the overview page title only where they still carry the
  old title verbatim, `.ingest.json.modules` entries under `raw/`, project frontmatter
  `modules: [...]`, dump receipts `filed_into` that start with `modules/<old>/`, and every
  `[[old/…]]` / `[[old/…|label]]` wikilink in Markdown outside `raw/` and `.secondbrain/` —
  because each of these is a pointer the review names or that breaks the same way.
- **`wiki/log.md` files are never rewritten** (their old `[[old/…]]` lines stay), because the
  chronicle is append-only (docs/MODULE-SCHEMA.md) and log links count neither as incoming nor as
  broken; instead a rename appends one `lint` entry to the renamed module's chronicle, as discard does.
- **Wikilink retargeting mirrors `repointLine` (`src/core/gardener/discard.ts:131`) and its
  `WIKILINK` shape**, touching only the link target, never surrounding text or labels.
- **Raw payloads are never touched; only `.ingest.json` bookkeeping** — VAULT-FORMAT's one allowed
  exception under `raw/`.

Delete semantics:

- **The whole `modules/<slug>/` folder goes to the trash under one `VaultStore.delete` mark nested
  in the journal**, because that is 043's and 015's way back and keeps restore byte-identical.
- **A raw source whose `modules` list becomes empty gets `sourcePage: null`** (it is "undigested"
  again, which is what `unprocessed-source` and the ingest queue read); a source still digested into
  another module keeps its `sourcePage` and only loses the slug, because it is still digested there.
- **Project `modules: [...]` entries naming the deleted slug are removed, journalled and named in
  the preview**, because a dangling slug would point the project at a module that no longer exists.
- **Inbound `[[slug/…]]` links from outside the module are not rewritten on delete but listed in
  the preview as links that will break**, because there is no target to repoint to and silently
  deleting user lines is forbidden (VAULT-FORMAT, "What the app never does").
- **Dump `filed_into` receipts pointing into a deleted module stay as they are**, because a receipt
  records where content went, and undo can bring that target back.

Hash-awareness, concurrency, state:

- **The plan carries a `fingerprint`** (sha256 over sorted `path:hash` of every file inside the
  folder plus every outside file the operation rewrites); apply re-plans and refuses with
  `conflict` when it differs, and each write still carries its own `expectedHash` — because a
  folder has no single hash and the renderer must not send N hashes back.
- **Apply runs inside `withModuleLock(slug)` (`src/core/wiki/module-lock.ts:45`)**, and the plan is
  `blocked: 'digestion-pending'` (apply → `conflict`) while the ingest queue holds a non-terminal
  job targeting the module — because the lock only covers a running write phase, and a queued job
  would recreate the old folder after the rename.
- **The remaining TOCTOU window between the final re-hash and the move/delete is the same
  documented window as `condense:accept` / `discardPage`**, accepted for the same reason
  (`VaultStore` has no guarded move/delete).
- **`gardener.json`, chat histories and the index are not rewritten** — they are derived state
  under `.secondbrain/`; the index is settled immediately, the gardener report catches up on the
  next run (same stance as 043's Done note).

Surface and channels:

- **Five channels in the existing `modules:` group: `renamePlan`, `rename`, `deletePlan`, `delete`,
  `undo`**, handled in a new `src/main/ipc/module-lifecycle.ts` so `modules.ts` stays one
  responsibility; `modules:undo` wraps `undoFix` and settles with a full refresh, because a folder
  path has no `.md` extension and a path-scoped `refresh()` would skip it.
- **Every handler derives paths from the slug server-side**, never from a renderer path (057's
  stance, same as `condense:delete`).
- **Actions sit in the module detail header, in a new `ModuleActions.tsx`**, because
  `ModuleDetail.tsx` is at ~275 lines and would cross the soft limit.
- **After success a toast carries an "undo" action** (`pushToast` with `action`, as
  `src/renderer/lib/toast.ts` intends); after rename the route moves to the new slug, after delete
  to the module list — because a way back that is only a trash folder is not visible to the user.
- **No LLM anywhere on this path** (no `createGateway` in the handlers), so guardrail 1 holds by
  construction and is asserted, not assumed.

Acceptance split (`ui-acceptance-required: true`):

- **Rename and delete are user actions → one e2e spec each through the real app** (`npm run
test:e2e`, fresh no-model vault per spec file, seeded `second-brain-methodik`), because the
  preview-then-confirm flow is the criterion; **reference completeness, conflict, rollback and
  index/search/ask effects are proven at core/main level (`npm test`)**, because a concurrent
  external edit mid-apply and a failing write cannot be staged deterministically through the UI.

## Plan

Four layers, in order: read-only plan → apply (rename, then delete) → channels → two dialogs.

1. **Plan (D1, core, read-only).** `src/core/wiki/module-lifecycle/refs.ts`: pure rewriters —
   `retargetModuleLinks(body, from, to)` (mirrors `repointLine`), frontmatter edits for page
   `module:` / project `modules:` / `filed_into`, `.ingest.json` `modules` edit (and `sourcePage:
null` when it empties), AGENTS.md / index headline / overview title substitutions.
   `plan.ts`: `renamePlan(deps, { slug, title })` and `deletePlan(deps, { slug })` read the index
   for candidates, read every file fresh, and return `{ changes: {path, kind, before→after
summary}[], moves|trash, pages, sources, brokenLinks, projects, blocked, fingerprint }`.
2. **Journal (D2).** `FixJournal` gains `moved?: { from, to }` and kinds `module-rename` /
   `module-delete`; `undoFix` moves back first (if `from` is free), then restores steps.
3. **Rename apply (D2).** `rename.ts` — discard's order: re-plan, compare fingerprint, write
   content (outside files and in-folder files at old paths) with `expectedHash`, re-hash the
   folder, `store.move(modules/old, modules/new)`, journal with `moved`, append `lint` log entry.
4. **Delete apply (D3).** `delete.ts` — same order: protocol + project edits, re-hash folder,
   `store.delete(modules/slug)` last, mark nested as `deleted`.
5. **Channels (D4).** `modules:renamePlan|rename|deletePlan|delete|undo` in `src/shared/ipc.ts`;
   `src/main/ipc/module-lifecycle.ts` wraps apply in `withModuleLock`, checks the ingest queue,
   calls `settle()` with every old + new + rewritten path (full refresh for undo).
6. **Rename UI (D5)** and **Delete UI (D6)** — `ModuleActions.tsx` in the detail header, two
   dialogs that fetch the plan on open and confirm with the plan's `fingerprint`; toast with undo.

Affected: `src/core/gardener/undo.ts`, `src/core/wiki/module-lifecycle/*` (new), `src/core/wiki/index.ts`,
`src/shared/ipc.ts`, `src/shared/types/knowledge.ts`, `src/main/ipc/module-lifecycle.ts` (new),
`src/main/ipc/register-all.ts`, `src/main/ipc/ingest.ts` (one pending-job export),
`src/renderer/lib/{api,mock-bridge}.ts`, `src/renderer/lib/queries/modules.ts`,
`src/renderer/screens/modules/{ModuleActions,RenameModuleDialog,DeleteModuleDialog}.tsx` (new),
`ModuleDetail.tsx`, `src/renderer/i18n/{en,de}-wiki.ts`, `scripts/shot.mjs`, tests.

Coverage gate:

| Criterion                                                   | D              |
| ----------------------------------------------------------- | -------------- |
| AC1 rename updates everything consistently; preview first   | D1, D2, D4, D5 |
| AC2 delete names cost, undoable via trash, raw → undigested | D1, D3, D4, D6 |
| AC3 hash-aware: external edit → conflict, never half-done   | D1, D2, D3, D4 |
| AC4 index, search, ask reflect the change immediately       | D4             |
| AC5 both work with no model configured                      | D4, D5, D6     |

## Deliverables

**D1 — Read-only plans for rename and delete, plus the pure reference rewriters**
Files: `src/core/wiki/module-lifecycle/refs.ts` (new), `src/core/wiki/module-lifecycle/plan.ts`
(new), `src/core/wiki/module-lifecycle/types.ts` (new), `src/core/wiki/index.ts` (export),
`tests/core/wiki/module-lifecycle-refs.test.ts` (new), `tests/core/wiki/module-lifecycle-plan.test.ts` (new).
Mirror: `discardPlan` / `repointLine` in `src/core/gardener/discard.ts` (plan shape, WIKILINK
handling, "pure read, nothing written"); `pageRefOf` in `src/core/wiki/pages.ts:48`;
`protocolPaths` / `moduleList` in `src/core/wiki/raw-protocol.ts`; `renderAgentsMd` in
`src/core/wiki/agents-md.ts:161` for what AGENTS.md contains.
Acceptance: the rewriters retarget `[[old/x]]` and `[[old/x|label]]` but not `[[other/x]]`,
`[[x]]` or text around links; a rename plan on a fixture vault lists module.md, every page, AGENTS.md,
each `.ingest.json`, each project, each `filed_into` dump and each outside file with an `[[old/…]]`
link, never a `log.md` and never a raw payload; a delete plan reports page count, affected sources
with "returns to undigested" vs "stays digested in <module>", broken inbound links and projects;
`blocked: 'target-exists'` for an occupied new slug; the fingerprint changes when any listed file
changes; the vault is byte-identical after planning.

**D2 — Rename apply and the journal's `moved` entry**
Files: `src/core/gardener/undo.ts` (optional `moved`, two new kinds, move-back in `undoFix`),
`src/core/wiki/module-lifecycle/rename.ts` (new), `tests/core/wiki/module-rename.test.ts` (new),
`tests/core/gardener/undo.test.ts` (extend if it exists, else covered in `module-rename.test.ts`).
Mirror: `discardPage` / `applyPlan` / `contentChanges` in `src/core/gardener/discard-page.ts`.
Acceptance: after a rename the folder is at `modules/<new>/`, nothing is left at `modules/<old>/`,
and every reference class from D1 points at the new slug; an external edit after the plan →
`conflict` with the vault byte-identical; a store that throws on the Nth write → rolled back
byte-identical and the error rethrown; `undoFix(token)` restores the old folder and every rewritten
outside file byte-for-byte (file round-trip); undo is a no-op the second time; a file edited after
the rename is `kept`, not overwritten; a title-only rename moves nothing; a journal without `moved`
still parses (discard/fix undo unchanged — existing tests green).

**D3 — Delete apply**
Files: `src/core/wiki/module-lifecycle/delete.ts` (new), `tests/core/wiki/module-delete.test.ts` (new).
Mirror: `discardPage` (content first, delete last, nested `deleted` mark).
Acceptance: the module folder is in `.secondbrain/trash/<token>/` under one mark; every raw payload
under `raw/` is byte-identical; each affected `.ingest.json` lost the slug and, where its list
emptied, has `sourcePage: null`; project `modules:` lost the slug; an external edit after the plan →
`conflict`, module untouched; `undoFix(token)` brings the folder, the protocols and the projects
back byte-for-byte.

**D4 — Channels, main handler, index settle**
Files: `src/shared/ipc.ts`, `src/shared/types/knowledge.ts`, `src/main/ipc/module-lifecycle.ts`
(new), `src/main/ipc/register-all.ts`, `src/main/ipc/ingest.ts` (export a "pending job for module"
check off the existing queue holder), `src/renderer/lib/api.ts`, `src/renderer/lib/mock-bridge.ts`,
`tests/main/ipc-coverage.test.ts` (extend), `tests/main/module-lifecycle-ipc.test.ts` (new).
Mirror: `condense:delete` in `src/main/ipc/condense.ts:266-295` (slug-derived paths, settle) and
`gardener:discardPlan` / `gardener:discardPage` / `gardener:undoFix` in `src/main/ipc/gardener.ts:145-180`.
Acceptance: all five channels in the map and `IPC_CHANNELS`, coverage test green unloosened; a stale
fingerprint → `conflict` envelope; a pending digestion into the module → plan `blocked` and apply
`conflict`; after rename `IndexService.search` hits the new path and never the old, and
`askQuestion` with the fake provider (`tests/fakes/`) cites only new paths; after delete search has
no hit and `askQuestion` honestly reports no evidence; after `modules:undo` the old state is
searchable again; every path runs with no model configured and `createGateway` is never called.

**D5 — Rename in the app**
Files: `src/renderer/screens/modules/ModuleActions.tsx` (new),
`src/renderer/screens/modules/RenameModuleDialog.tsx` (new), `src/renderer/screens/modules/ModuleDetail.tsx`,
`src/renderer/lib/queries/modules.ts`, `src/renderer/i18n/en-wiki.ts`, `src/renderer/i18n/de-wiki.ts`,
`tests/renderer/module-lifecycle.test.tsx` (new), `tests/e2e/module-rename.spec.ts` (new).
Mirror: `CreateModuleDialog.tsx` (form, Gaston atoms), `DiscardPageAction.tsx:53-180` (plan fetched on
open, confirm with the plan's hash, conflict wording), `tests/e2e/discard-undo.spec.ts` + `fixtures/vault.ts`.
Acceptance: the dialog takes a new title, shows the plan's changes grouped by kind before the confirm
is enabled, disables confirm with a stated reason when `blocked`; success navigates to the new slug and
toasts with undo; conflict shows the conflict wording and leaves the dialog open; strings in `de`/`en`,
German `„…“`, sentence case; e2e passes on the no-model harness.

**D6 — Delete in the app, and screenshots**
Files: `src/renderer/screens/modules/DeleteModuleDialog.tsx` (new),
`src/renderer/screens/modules/ModuleActions.tsx`, `src/renderer/lib/queries/modules.ts`,
`src/renderer/i18n/en-wiki.ts`, `src/renderer/i18n/de-wiki.ts`, `tests/renderer/module-lifecycle.test.tsx`
(extend), `tests/e2e/module-delete.spec.ts` (new), `scripts/shot.mjs`.
Mirror: `CondenseDeleteDialog.tsx` (danger confirm) and the D5 dialog.
Acceptance: the dialog names page count, each affected source and whether it returns to
"undigested", broken inbound links and projects; confirm deletes, navigates to the module list and
toasts with undo; undo brings the module back into the list; `npm run seed && npm run shot` captures
both dialogs on `second-brain-methodik` without confirming; e2e passes on the no-model harness.

## Model Hints

- D2 → `deliverable-hard`: the folder move is the one step with no hash guard, and the undo must move
  it back _before_ restoring in-folder steps recorded at old paths — getting that order or the
  "skip in-folder steps when move-back is refused" case wrong restores into a foreign folder or loses
  the rename's rewrites.
- D1, D3, D4, D5, D6 → default tier (D3 follows D2's and discard's order one-to-one).
- Review: → `story-review-hard` — a many-file rewrite plus a folder move/trash of user knowledge;
  the conflict-before-write and byte-identical rollback guarantees must be read off the diff.

## Test Plan (manual acceptance)

Not used — acceptance is the test suite (`ac-tests-required: true`); no manual residue.

### Acceptance tests

Renamed to match the tests as actually written (the titles below are the real, current ones —
this story predates none of the mapping, so every line is a real assertion, not a placeholder):

- AC1 → unit `tests/core/wiki/module-lifecycle-plan.test.ts:59` › "listet jede betroffene Datei
  ausser log.md und Rohquellen"; unit `tests/core/wiki/module-rename.test.ts:104` › "moves the
  folder and points every reference class at the new slug"; e2e `tests/e2e/module-rename.spec.ts`
  › "a module is renamed after its changes are shown" (D1, D2, D5).
- AC2 → unit `tests/core/wiki/module-delete.test.ts:92` › "trashes the whole module folder under
  one mark and rewrites every reference"; `:274` › "brings the folder, the protocols and the
  projects back byte for byte"; e2e `tests/e2e/module-delete.spec.ts` › "a module is deleted after
  its cost is shown and comes back through undo" (D1, D3, D6).
- AC3 → unit `tests/core/wiki/module-rename.test.ts:216` › "keeps a foreign write that races a
  rewrite, and rolls back the rest"; `:242` › "does not move a folder that changed after the writes
  (the last look)"; `:269` › "rolls back when the move itself fails"; unit
  `tests/core/wiki/module-delete.test.ts:158` › "refuses with conflict when a page inside the
  module changed after the preview"; `:251` › "refuses with conflict and writes nothing when the
  fingerprint is stale"; main `tests/main/module-lifecycle-ipc.test.ts:146` › "a stale fingerprint
  returns conflict" (D2, D3, D4).
- AC4 → main `tests/main/module-lifecycle-ipc.test.ts:164` › "after a rename search and ask cite
  the new path, never the old one"; `:191` › "after a delete search finds nothing and ask says it
  has no evidence"; `:203` › "after undo the module is searchable again" (D4).
- AC5 → main `tests/main/module-lifecycle-ipc.test.ts:220` › "rename, delete and undo run with no
  model configured and never create a gateway"; both e2e specs above run on the no-model,
  no-network harness (`fixtures/app.ts` `noNetworkCalls`) (D4, D5, D6).

## Done

A module can now be renamed and deleted from inside the app. Both go through the same
preview-then-confirm shape as `discardPage`: a read-only plan (`renamePlan`/`deletePlan`) lists
every file the operation would touch, the folder move/trash is the one hash-guarded structural
step, and one `FixJournal` mark (extended with an optional `moved` entry) undoes the whole thing —
content and folder — through the existing `gardener:undoFix` mechanism. Renaming rewrites
`module.md`, every page's `module:` field, `AGENTS.md`, the catalog headline, ingest protocols,
project frontmatter and dump `filed_into`, and wikilinks, all before the one `store.move`; deleting
rewrites only protocol/project bookkeeping (raw payloads are never touched — an emptied `.ingest.json`
`modules` list gets `sourcePage: null`, i.e. "undigested") before the one `store.delete`. Both
surface as five `modules:` channels wired through `withModuleLock` and settle the index immediately
so search/`askQuestion` reflect the change without a restart; neither path ever calls `createGateway`.

A real, Windows-specific bug was found and fixed along the way: the app's live vault watcher
(chokidar) holds an OS handle that deterministically blocks `fs.rename()` on any directory beneath
it, so the very first end-to-end run of a real folder move failed with `EPERM` even though every
core unit test (no live watcher) was green. Fixed with `Services.withoutWatcher()` (disposes the
watcher for the duration of the apply, always restores it after, serialized against concurrent
calls) wrapping the three folder-touching handlers.

The clean review (`story-review-hard`) came back FAIL on the first pass with one HIGH finding —
`withFrontmatterPatch` (the one place every frontmatter rewrite in this feature went through)
rebuilt YAML from scratch instead of patching in place, so a page with unreadable frontmatter would
have had it silently replaced instead of the operation refusing, and valid frontmatter lost its
formatting. Fixed to mirror `composeContent`'s exact behaviour (throw `VaultFrontmatterError` on
unreadable YAML, patch the raw block in place otherwise). Alongside it: two hardcoded German prose
strings in the rename preview reworded to the same neutral technical notation the rest of the
preview uses; a `String.replace` special-pattern bug and a word-prefix-collision bug in the title
rewriters; the watcher-pause fix hardened against concurrent calls; a silent-undo-failure gap
(no feedback if `undoFix` refuses or only partially restores) closed with error/warning toasts;
and the rename dialog's confirm button disabled for a no-op title and while a re-plan is still
pending for what's currently typed (previously it could submit the title from _before_ the last
keystroke). Full verification (build/test/lint/typecheck/format/e2e) was green both before and
after the fix cycle; the fix cycle needed one round, not the allowed three.

**Deliberately left as found, not fixed** (documented per the review's own severity call, none of
them block a real user today):

- `modules:undo` does not take `withModuleLock` or check the ingest queue for the slug it restores
  — a digestion racing an undo could in theory recreate the folder undo is putting back. Narrow
  window (undo is already a rare, deliberate action) and `undoFix` is shared with gardener's own
  fixes, so hardening it needed more care than a bounded fix cycle allows without risking that
  shared path. Left for a follow-up if it's ever seen in practice.
- Restoring a deleted module's protocols/projects after its slug has since been reused by a
  different module would point them at the wrong module. Same reasoning: narrow, pre-existing class
  of "undo after the world moved on" risk the story's own Decisions section already accepts for
  other steps (the documented TOCTOU window).
- `plan.ts` (357 lines) and `rename.ts` (338 lines) sit over the ~300-line soft limit — both hold
  one cohesive responsibility (the rename/delete plan; the rename apply) and splitting either
  mid-story risked collateral churn across D2–D6's call sites for no behavioural gain. Candidate
  for a future split-only pass.
- A handful of LOW test-hardening suggestions from the review (a stronger "writes nothing" fixture,
  the ask tests using the fixture's `FakeProvider` instead of `createEmptyGateway`, an e2e assertion
  that the folder is untouched between preview and confirm) were not applied — the criteria they'd
  strengthen are already covered by the tests actually in place; these are quality-of-coverage
  improvements, not gaps in what's verified.

**Verification:**

- `npm run build` — green.
- `npm test` — 4194/4203 passed. The 9 failures are all pre-existing and unrelated:
  `tests/renderer/quick-capture.test.tsx` (`window.localStorage.clear is not a function`),
  confirmed by stashing this story's entire diff and re-running — identical 9 failures with none
  of this story's code present.
- `npm run lint`, `npm run typecheck`, `npm run format:check` — green (the only `format:check`
  warnings are in unrelated, pre-existing docs/`.claude` files).
- `npm run test:e2e` — all 73 specs green, including the two new ones
  (`tests/e2e/module-rename.spec.ts`, `tests/e2e/module-delete.spec.ts`).
- Clean-agent review (`story-review-hard`): FAIL → fixed → re-verified green (build/test/
  lint/typecheck/format/e2e all re-run and green after the fix cycle). One review-fix cycle used.
- AC → test, as verified (real names, see `### Acceptance tests` above): AC1
  `module-lifecycle-plan.test.ts:59`, `module-rename.test.ts:104`, `module-rename.spec.ts` — pass.
  AC2 `module-delete.test.ts:92,274`, `module-delete.spec.ts` — pass. AC3
  `module-rename.test.ts:216,242,269`, `module-delete.test.ts:158,251`,
  `module-lifecycle-ipc.test.ts:146` — pass. AC4 `module-lifecycle-ipc.test.ts:164,191,203` —
  pass. AC5 `module-lifecycle-ipc.test.ts:220` plus both e2e specs on the no-network harness —
  pass. No `manual residue`.

**Commit message:**

```
063: a module can be renamed and deleted
```
