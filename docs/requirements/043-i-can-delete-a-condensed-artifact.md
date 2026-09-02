---
id: 043
title: I can delete a condensed artifact
status: in-progress # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. Deliberately out of scope for M12 by user decision (038-Q3, 2026-09-01) and carried
in the roadmap since. Depends on [[037-an-area-can-be-condensed-into-one-file]] and
[[038-i-see-what-a-condensation-changes-before-it-is-written]]. Concept:
[[../concepts/condensed-layer]].

## Requirement

A condensation is regenerable from its sources — except for the directives section, which records
why I rejected earlier runs. That is why deleting one was called a convenience and left out of
M12. But it is now the one thing about an artifact I cannot do from inside the app: my exits are
to reject a proposal, which writes another directive, or to delete `areas/<slug>.condensed.md` in
Explorer behind the app's back and let the watcher find out afterwards.

I want the artifact gone when a condensation went somewhere I do not want it — the whole file, not
a correction on top of it. And I want it to behave like every other write in this app: it tells me
what disappears before it disappears, it has a way back, and it does not quietly take the one part
of the file that cannot be recomputed.

## Acceptance Criteria

- [x] The area's condensed tab can delete an existing artifact. With no artifact there is no dead
      control.
- [x] Before deleting, it says what goes — naming explicitly that the directives section is the
      part no later run can reproduce.
- [x] The delete is undoable through the existing trash path (`.secondbrain/trash/`,
      `VaultStore.snapshot`), like 038's accept.
- [x] It is hash-guarded: a stale hash reports a conflict instead of removing a file that changed
      since it was read.
- [x] Afterwards the tab is honestly back in its "never condensed" state, and 039's
      `condensation-due` check reports the area as having material and no artifact.
- [x] The index drops the document: it stops appearing in search and in the maintenance counts.
- [x] A condensation run started after a delete does not silently resurrect the deleted
      directives.
- [x] Deleting never touches the LLM gateway and works with no model configured.
- [x] All new strings exist in `de` and `en`.

## Open Questions

- ~~Q1 — Do the directives survive the delete, or die with it?~~ answered → Decisions (Sprint)
- ~~Q2 — Own channel (`condense:delete`) or a generic vault delete?~~ answered → Decisions (Sprint)
- ~~Q3 — Build it area-only, or generically for the levels not yet cut?~~
  answered → Decisions (Sprint)
- ~~Q4 — Plain confirm, or a Dialog with a typed reason like 038's reject?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding.

- **(User)** Q1 — **the delete takes everything, directives included.** Delete means start this
  area over; that is the honest reading of "the whole file, not a correction on top of it", and
  the undo copy in `.secondbrain/trash/` is the way back. Keeping directives was rejected because
  it would leave the app holding invisible state about an area the user believes they cleared —
  the kind of second truth this project keeps removing. The confirmation therefore has to name the
  directives as the part no later run can reproduce.
- **(User)** Q3 — **area-only.** The module and project levels are not cut, and the concept's §7
  reversal trigger is only evaluated when the second level lands, so their shape is genuinely
  unsettled. Generalise when there is a second real case, not against a guess.
- **(User)** Q4 — **a plain confirm that names what goes**, not a typed reason. The user has
  already decided against the artifact, so a reason is friction on the way out; and unlike 038's
  reject there is no later run to inform and — given Q1 — no directives section left for a reason
  to live in.

Taken at refine (2026-09-02), not by the user — each with its reason:

- Q2 — **an own channel, `condense:delete`**, added to the existing condense group in
  `src/shared/ipc.ts` next to read/run/accept/reject. `vault:delete` exists but is unguarded
  (`VaultStore.delete(path)` has no `expectedHash`) and does not settle the index; wiring a hash
  guard, the artifact path derivation and the index settle into a generic door would push
  condense-specific rules into a channel every other caller shares.
- **Reuse `VaultStore.delete()`, not `snapshot()` + unlink.** `delete()` already moves the file
  into `.secondbrain/trash/<token>/` and returns an `undoToken`, which is exactly the way back the
  criterion asks for — one trash entry instead of a snapshot plus a removal.
- **The hash guard lives in the handler, not in the store.** The handler compares
  `store.hash(path)` against the `expectedHash` the renderer got from `condense:read` and throws
  `VaultConflictError` before deleting — the same pre-check pattern (and the same documented TOCTOU
  window) as `condense:accept`, and it keeps the shared `VaultStore` interface untouched.
- **The handler calls `settle(services, [path], 'condense')` after the delete**, like accept and
  reject do, instead of leaving it to the watcher as `vault:delete` does — the criteria demand the
  document is gone from search and the maintenance counts right afterwards, not eventually.
- **The confirmation text is static, no second "what will be lost" fetch.** Unlike
  `DiscardPageAction`'s plan call there is nothing to compute: the whole file goes, and the one
  sentence that matters (the directives section is the part no later run can reproduce) is known
  without reading anything.
- **No undo button in the UI.** Parity with 038's accept: the trash copy is the way back, and an
  undo affordance for condensed artifacts is its own story, not a rider on this one.
- **Delete clears any open proposal in the tab** and invalidates `qk.condense.read(slug)` plus
  `qk.gardener.report()`. A proposal built before the delete would otherwise sit there offering to
  write the old directives back; accepting it is already refused (its `baseHash` no longer matches
  a missing file → `conflict`), but showing it at all is a lie about the area's state.
- **No new core module.** Deriving the path (`condensedAreaPath`), the trash move and the index
  settle are all existing pieces; a `src/core/condense/delete.ts` would only forward calls.

## Plan

Small story: one channel, one button, one confirm. No core logic is added — `condensedAreaPath()`,
`VaultStore.delete()` (trash + `undoToken`) and `settle()` already exist; this story only composes
them behind a hash guard and puts a door on the condensed tab.

Order of work:

1. **Contract + main (D1).** `condense:delete` `{ slug, expectedHash } → { path, undoToken }` in
   `src/shared/ipc.ts` (map entry + `IPC_CHANNELS` array). Handler in the existing
   `src/main/ipc/condense.ts`: derive the path from `slug` (never trust a renderer path, as the
   other three handlers do), pre-check `store.hash(path)` against `expectedHash` →
   `VaultConflictError` on a mismatch and `invalid` when there is nothing to delete, then
   `store.delete(path)` and `settle(...)`. Renderer client entry in `src/renderer/lib/api.ts`,
   stub in `src/renderer/lib/mock-bridge.ts`, coverage test extended.
2. **Renderer (D2).** A `variant="danger"` delete button in the condensed tab's artifact block —
   rendered only when `artifact.data` exists, so there is no dead control on a never-condensed
   area — opening a `Dialog`-based confirm that names the file and the directives section. On
   success: clear `proposal`, invalidate `qk.condense.read(slug)` and `qk.gardener.report()`, toast.
   On `conflict`: the existing conflict toast, and the artifact stays readable.
3. **Acceptance surface (D3).** Screenshot step for the confirm dialog on the seeded area that
   already carries an artifact plus a directive, and the manual test plan below.

Affected files: `src/shared/ipc.ts`, `src/main/ipc/condense.ts`, `src/renderer/lib/api.ts`,
`src/renderer/lib/mock-bridge.ts`, `src/renderer/lib/queries/condense.ts`,
`src/renderer/screens/notes/AreaCondensedTab.tsx`,
`src/renderer/components/CondenseDeleteDialog.tsx` (new),
`src/renderer/i18n/{en,de}-notes.ts`, `scripts/shot.mjs`, plus tests.

The LLM gateway is not touched anywhere on this path — `createGateway` is not called in the new
handler, and the delete button is rendered inside the artifact block, which state 1 of the tab
already shows without a routed model.

**Coverage gate — every acceptance criterion has a deliverable:**

| Criterion                                                     | D      |
| ------------------------------------------------------------- | ------ |
| Condensed tab can delete; no dead control without an artifact | D2     |
| Confirmation names what goes, incl. the directives section    | D2     |
| Undoable through `.secondbrain/trash/`                        | D1     |
| Hash-guarded; stale hash → conflict, file untouched           | D1, D2 |
| Tab back in its "never condensed" state; 039 reports missing  | D1, D2 |
| Index drops the document (search, maintenance counts)         | D1     |
| A later run does not resurrect the deleted directives         | D1, D2 |
| Never touches the LLM gateway; works with no model            | D1, D2 |
| All new strings in `de` and `en`                              | D2     |

## Deliverables

**D1 — `condense:delete`: contract, handler, index settle** [x]
Files: `src/shared/ipc.ts`, `src/main/ipc/condense.ts`, `src/renderer/lib/api.ts`,
`src/renderer/lib/mock-bridge.ts`, `tests/main/ipc-coverage.test.ts` (extend),
`tests/main/condense-ipc.test.ts` (extend).
Channel `condense:delete` `{ slug: string; expectedHash: string } → { path: string; undoToken:
string }`. Mirror: the `condense:accept` handler's pre-check block
(`src/main/ipc/condense.ts:135-177`) for the hash guard and the `settle()` call; `vault:delete`
(`src/main/ipc/vault.ts:58-61`) for the `store.delete()` call itself. Missing file → `invalid`
(there is nothing to delete), hash mismatch → `VaultConflictError`, which the registry turns into
a `conflict` envelope. No `createGateway`, no prompt, no new core file.
Acceptance: a fresh-hash delete removes `areas/<slug>.condensed.md`, returns an `undoToken`, and
`undo(token)` restores the file byte-identical; a stale hash returns `conflict` and leaves the file
byte-identical with no new trash entry; deleting a non-existent artifact returns `invalid`; after a
delete `condense:read` returns `null`, the index no longer contains the document, and 039's
`condensation-due` check reports the area as material-without-artifact; a `condense:run` after a
delete produces a proposal with no directives section; every path passes with no model configured
and every new channel is in the coverage test.

**D2 — Delete button, confirmation dialog, i18n** [x]
Files: `src/renderer/components/CondenseDeleteDialog.tsx` (new),
`src/renderer/screens/notes/AreaCondensedTab.tsx`, `src/renderer/lib/queries/condense.ts`,
`src/renderer/i18n/en-notes.ts`, `src/renderer/i18n/de-notes.ts`,
`tests/renderer/condense-area.test.tsx` (extend), `tests/renderer/condense-delete-dialog.test.tsx`
(new).
`useCondenseDelete()` mirroring `useCondenseReject()` (`src/renderer/lib/queries/condense.ts:64`),
invalidating `qk.condense.read(slug)` and `qk.gardener.report()`. Button inside `artifactBlock()`,
`variant="danger"`, passing `artifact.data.hash` as `expectedHash`. Dialog mirrors
`CondenseRejectDialog` in shape (`open`/`busy`/`error`/`onClose`/`onSubmit`) and
`DiscardPageAction.tsx:53-180` in tone: it names the file path, says the sections and sources are
regenerable from the sources, and says in its own sentence that the directives section is the part
no later run can reproduce. New keys under `notes.condensed.delete.*` in both `en-notes.ts` and
`de-notes.ts`; German quotes `„…“`; Gaston atoms and tokens only.
Acceptance: with no artifact no delete control is rendered at all (not merely disabled); the
confirm names the directives section; confirming removes the artifact and the tab shows the
"never condensed" empty state with an open proposal cleared; a `conflict` shows the existing
conflict toast and leaves the artifact readable; the delete control is present and usable in the
no-model state; the i18n parity test is green.

**D3 — Acceptance surface: screenshot and test plan** [x]
Files: `scripts/shot.mjs`, and `scripts/seed*` only if the seeded area with an artifact plus a
directive from 038's D9 is no longer there.
Adds a step that opens the condensed tab of the seeded area and captures the delete confirmation,
so the sentence about the directives is visible in a real screenshot.
Acceptance: `npm run seed && npm run shot` produces a screenshot of the delete confirmation on an
area that has an artifact; the manual test plan below runs end to end on the seeded vault.

## Model Hints

- D1, D2, D3 → default tier. Each is a small composition of existing primitives inside one layer;
  no new core logic, no interface change.
- Review: → `story-review-hard` — this is an irreversible-looking delete of user knowledge, and the
  three things that make it safe (the hash guard firing before anything moves, the trash copy
  actually being restorable, the index really dropping the doc) have to be read off the diff rather
  than assumed.

## Test Plan (manual acceptance)

Run `npm run seed`, start the app, go to **Notes** and open the seeded area that has a condensed
artifact with a directive line (`areas/gesundheit.condensed.md`), condensed tab.

1. **No dead control.** Open an area that was never condensed. The condensed tab shows its empty
   state and offers no delete control at all.
2. **The confirmation says what goes.** On the seeded area, press delete. The dialog names the file
   and states that the sections and sources can be regenerated from the sources but the directives
   section cannot be reproduced by any later run. Cancel: the artifact is still there and the file
   on disk is unchanged.
3. **Delete and undo.** Press delete and confirm. The tab falls back to its "never condensed"
   empty state; `areas/<slug>.condensed.md` is gone from the vault folder and a new token folder
   under `.secondbrain/trash/` holds the file including its directives section.
4. **The index dropped it.** Search for a phrase that only occurs in the deleted artifact — no
   hit. Open **Garden**: the maintenance report now lists the area as needing a condensation
   (material present, no artifact), and its condensed counts no longer include the deleted file.
5. **No resurrection.** With `condense-area` routed to a local model, trigger a run in that tab.
   The proposal contains no directives section — the rejected sentence from before the delete is
   not back.
6. **Conflict.** Reopen an area with an artifact. Edit `areas/<slug>.condensed.md` in an external
   editor and save. Press delete and confirm: the app reports a conflict, the file is still on
   disk with your edit, and nothing landed in the trash.
7. **Without a model.** In settings, unroute `condense-area`. Open the condensed tab of an area
   with an artifact: the honest no-model note appears, the artifact is readable, and delete still
   works end to end.
8. **Language.** Switch the UI language to German and repeat steps 2 and 3: all strings are
   translated and German quotes are `„…“`.

## Done

Built D1–D3: a new `condense:delete` IPC channel derives the artifact path server-side from `slug`,
hash-guards against `expectedHash` (mirroring `condense:accept`'s pre-check/TOCTOU pattern), reuses
`VaultStore.delete()` for the trash move + `undoToken`, and calls `settle()` so the index drops the
document immediately. The condensed tab gained a `variant="danger"` delete button (rendered only when
an artifact exists), a static-text `CondenseDeleteDialog` naming the file and the directives section
explicitly, and new `notes.condensed.delete.*` keys in `en`/`de`. `scripts/shot.mjs` gained a step that
opens the seeded `gesundheit` area's condensed tab and screenshots the open confirmation without
confirming.

A clean `story-review-hard` review (data-loss-risk path) returned PASS with 4 findings; 2 were fixed
(wrong "run the condensation again" text on the delete-conflict toast, replaced with a delete-specific
key; a renderer test whose name claimed the tab falls back to the empty state but never asserted it,
now made stateful and actually asserting it). The other 2 were reviewed and left as-is with reasons
below.

**Decisions:**

- The `tsconfig.web.json` widening (flagged by review as out-of-plan) adds `src/core/vault/paths.ts`,
  `slug.ts`, `types.ts` and `src/core/condense/paths.ts` to the renderer's explicit core allowlist so
  `CondenseDeleteDialog` can reuse `condensedAreaPath(slug)` instead of duplicating the
  `areas/<slug>.condensed.md` naming convention in the renderer. Verified Node/Electron-free (pure
  string/type logic only) — kept as the smaller duplication-avoiding change rather than reverted.
- `qk.gardener.report()` invalidation (mirroring accept/reject) triggers a refetch, but
  `gardener:report` reads the last stored maintenance run rather than recomputing
  (`src/main/ipc/gardener.ts:8`, pre-existing, documented app behavior) — so the Garden screen's
  displayed counts update on the next maintenance run, not instantly on delete. The underlying
  `condensation-due` check itself is verified correct immediately after a delete
  (`tests/main/condense-ipc.test.ts`). Not a regression from this story; parity with how accept/reject
  already behave. Left unchanged.
- No undo button in the UI (per Q1/refine decision) — the trash copy is the way back, same parity as
  038's accept.

**Verification:** `npm run build`, `npm test` (244 files / 3404 tests), `npm run lint`,
`npm run typecheck` all green after the fix cycle. (`format:check` is not yet in this sprint's gate per
041.) One `overview-flow.test.ts` timeout observed on the first full-suite run was confirmed a
pre-existing flake unrelated to this diff (passes in isolation; file untouched by this story).

**Live smoke:** `npm run seed && npm run shot` (via a D3 agent, and again manually) produced a real
screenshot of the delete confirmation dialog on the seeded `gesundheit` area
(`.screenshots/notes-condensed-delete.png`), showing the correct file name, the "regenerable from
sources" line, and the directives-not-reproducible sentence. This exercises the UI-rendering half of
the flow live, but the full manual test plan (confirm-and-delete, undo inspection in
`.secondbrain/trash/`, index/search drop, conflict, no-model, German) was not driven end-to-end through
a live interactive session in this build — per the project profile's P2 fallback, status is left
`in-progress` rather than `done`, and the story is handed over as **built, acceptance pending**: a
human (or a future live-smoke session) should run the 8-step manual test plan above once, most
importantly steps 3 (undo), 5 (no resurrection with a routed model) and 6 (conflict).

**Commit message:**

```
043: delete a condensed artifact
```
