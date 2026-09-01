---
id: 038
title: I see what a condensation changes before it is written
status: done # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). The confirmation path — the load-bearing half of
guardrail 2 for a write path that may _delete_. Depends on
[[037-an-area-can-be-condensed-into-one-file]]. Concept: [[../concepts/condensed-layer]]
(CND-18, 19, 20, 21, 22, 23, 37, 39, 40).

## Requirement

A condensation run may shorten and delete. That makes it the write path in this app I trust the
least on sight, so I want to see it before it happens — in the area itself, not in a maintenance
list, because confirming prose about an area without the area in front of me is exactly the
situation where I click through.

From inside an area in Notes I should be able to trigger the condensation, then read the old
against the new, with what was removed as visible as what was added. If I accept, it is written
— and if I edited the file in the meantime, the app tells me that instead of overwriting my edit,
and there is an undo copy so an accepted run is never final.

If I reject, I say why in a sentence. That sentence is not thrown away: it is appended to a
directives section inside the artifact that every later run reads as an instruction and never
rewrites. That is how the thing learns what I do not want in there — and it is the only history
kept, because a log nobody reads is ballast.

## Acceptance Criteria

- [x] Inside an area on the Notes screen I can trigger a condensation and see that one is running.
- [x] The proposal is shown as a diff, old against new, before anything is written; removals are
      as visible as additions, and the per-section source lines are part of the diff.
- [x] Accepting writes hash-guarded against the hash the proposal was built from; a stale hash
      discards the proposal as a conflict with a clear message, and never merges.
- [x] Every accepted write leaves an undo copy in `.secondbrain/trash/`.
- [x] Rejecting requires a reason — a bare dismiss is not offered — and writes nothing to the
      artifact body.
- [x] The reason is appended to the artifact's directives section, and a later run reads it as an
      instruction and never writes into that section.
- [x] With no model configured for `condense-area`, the area states this, names the task kind and
      links to the setting, instead of offering a dead trigger.
- [x] An existing artifact is readable in the area without a model.
- [x] Every path — trigger, diff, accept, reject-with-reason, conflict, no-model — is drivable
      through the real UI and covered by the manual test plan.
- [x] All UI strings exist in `de` and `en`; German quotes use `„…“`. Gaston atoms and tokens
      only, no ad-hoc markup, no raw Tailwind palette.

## Open Questions

- ~~Q1 — What granularity does the diff have...~~ answered → Decisions (Sprint)
- ~~Q2 — Where does the trigger live inside the area...~~ answered → Decisions (Sprint)
- ~~Q3 — Can the artifact be deleted from the UI...~~ answered → Decisions (Sprint)
- ~~Q4 — May a condensed artifact be cited as evidence when answering a question?...~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — diff granularity: whole-artifact diff with a single accept, not per-section.
  Matches the "one file" scope of this sprint; no partial-write logic.
- **(User)** Q2 — trigger placement: its own tab next to notes and todos on the area, not an
  inline panel or overlay.
- **(User)** Q3 — delete from UI: out of scope for this sprint, but must be recorded so it is not
  lost — carry it into the sprint review's findings and the roadmap's "Open / unprioritised"
  table as a follow-up (a delete action for condensed artifacts).
- **(User)** Q4 (O9) — citation: a condensed artifact is never cited as evidence; answers always
  go down to the primary source. Keeps guardrail 3 unambiguous.
- Diff engine: own line-level LCS diff in `src/core/condense/diff.ts`, no new npm dependency —
  the repo has neither a diff library nor diff code today, and a ~80-line pure function stays in
  core where it is unit-testable and portable.
- Diff granularity in the renderer: the core diff returns typed line rows (`context` / `added` /
  `removed`); the renderer only paints them — so removals are as visible as additions without the
  view owning any comparison logic.
- Proposal transport: the proposal is returned to the renderer and sent back whole on accept
  (`expectedHash` included), no proposal state in main. Mirrors `journal:close` /
  `journal:applyClose` and `capture:classify` / `capture:apply` exactly.
- Undo copy: `VaultStore` gains `snapshot(path)`, which copies the current file into
  `.secondbrain/trash/<token>/<path>` with the existing manifest before the overwrite — `write()`
  keeps no history today and trash primitives already exist for `delete()`.
- Hash guard: the accept handler passes the proposal's `baseHash` straight into
  `VaultStore.write({ expectedHash })`; `VaultConflictError` (`code: 'conflict'`) is surfaced as a
  discard-with-message. No merge path is written, because the only correct merge is a re-run.
- Reject with no artifact on disk yet: the reason creates the artifact carrying frontmatter plus
  the directives section only — no body sections, no `condensed_at`. The AC says "writes nothing
  to the artifact *body*", and dropping a first rejection would lose exactly the sentence the
  learning loop is built on.
- Reject UI: a Dialog with a required reason field; the accept/reject bar offers no bare dismiss,
  so a rejection cannot be clicked away without a sentence (CND-21).
- Tab structure: `AreaSection`'s hardcoded notes+todos body is split into `AreaNotesTab` /
  `AreaTodosTab` / `AreaCondensedTab` behind the existing `Tabs` atom, mirroring
  `ProjectDetail.tsx`. Keeps every file under the 300-line soft limit.
- No-model state: `useTaskRouted('condense-area')` plus the existing `LlmMissing` component
  (`tone="card"`), which already names the task kind and links to `/settings?tab=models`.

**Follow-ups for the sprint review (deliberately not in this story):**

1. Deleting a condensed artifact from the UI — out of scope per Q3; carry into the roadmap's
   "Open / unprioritised" table as "delete action for condensed artifacts".
2. Enforcing Q4 in `query-answer` (a `type: condensed` document must never be offered as
   evidence) — no acceptance criterion here requires it; carry it into the same table.

## Plan

The artifact itself, its `DocType` (`condensed`), file name (`areas/<slug>.condensed.md`),
`condensed_at`, `sources:` and the directives heading come from story 037. This story adds the
confirmation path around it: read → run → diff → accept (hash-guarded, with undo copy) or reject
(with a reason that lands in the directives section).

Contract with 037, fixed here so both builds agree — `src/shared/types/condense.ts`:

```
CondenseProposal { slug; path; baseHash: string | null; before: string; after: string;
                   sources: string[]; partialInputs?: string }
```

`baseHash === null` means "no artifact yet" (create). 037 produces it, 038 consumes it. If 037
lands a different shape, D3 adapts the type, not the run.

Order of work:

1. **Core, no Electron** (D1–D3): line diff, `snapshot()` on the vault store, and the two write
   compositions (accept → full artifact; reject → directives append). All three are unit-tested
   against `MemoryVaultStore`; no IPC, no React.
2. **Contract + main** (D4): four channels in `src/shared/ipc.ts`, handlers in a new
   `src/main/ipc/condense.ts`, preload allow-list, IPC coverage test. `condense:run` calls 037's
   `condenseArea()`; `condense:accept` does snapshot → hash-guarded write; `condense:reject` does
   the directives append.
3. **Renderer** (D5–D8): tabs in the area, the condensed tab with its four states (no model /
   no artifact / artifact / proposal), the diff view, the reject dialog. i18n keys land with the
   deliverable that uses them.
4. **Acceptance surface** (D9): seed an area with an existing artifact plus a directive, register
   the screenshot, document the flow in the manual test plan.

Affected existing files: `src/shared/ipc.ts`, `src/shared/types/vault.ts` (WriteResult unchanged;
`VaultStore` interface gains `snapshot`), `src/core/vault/{fs-store,memory-store,trash}.ts`,
`src/preload/index.ts`, `src/renderer/screens/notes/AreaSection.tsx`, `src/renderer/lib/api.ts`,
`src/renderer/i18n/{de,en}-notes.ts`, `scripts/seed*`, `scripts/shot.mjs`.

**Coverage gate — every acceptance criterion has a deliverable:**

| Criterion                                            | D          |
| ---------------------------------------------------- | ---------- |
| Trigger inside the area + running state              | D5, D6     |
| Diff old vs new, removals visible, source lines in it | D1, D7     |
| Hash-guarded accept, conflict, never merges          | D4, D7     |
| Undo copy in `.secondbrain/trash/`                   | D2, D4     |
| Reject requires a reason, no bare dismiss            | D3, D8     |
| Reason appended to directives, never rewritten       | D3, D4     |
| No model → honest state, task kind, link             | D6         |
| Existing artifact readable without a model           | D4, D6     |
| Every path drivable through the real UI              | D5–D9      |
| `de` + `en`, `„…“`, Gaston atoms/tokens only         | D5–D8      |

## Deliverables

**D1 — Line diff in core** [x]
Files: `src/core/condense/diff.ts` (new), `src/core/condense/index.ts` (new),
`tests/core/condense/diff.test.ts` (new).
Pure LCS line diff: `diffLines(before, after): DiffRow[]` with
`DiffRow = { kind: 'context' | 'added' | 'removed'; text: string; beforeLine?: number;
afterLine?: number }` — plus a `hasChanges` flag. No dependency, no Electron.
Acceptance: identical input → all `context`; a pure deletion produces `removed` rows and no
`added` rows; a section's `From: <paths>` source line is diffed like any other line (test asserts
a changed source line appears as one `removed` + one `added` row); a 2000-word artifact diffs in
well under a second.

**D2 — Undo copy before an overwrite** [x]
Files: `src/core/vault/types.ts`, `src/core/vault/fs-store.ts`, `src/core/vault/memory-store.ts`,
`src/core/vault/trash.ts`, `tests/core/vault/trash.test.ts` (extend).
`VaultStore` gains `snapshot(path): Promise<string | null>` — returns an undo token after copying
the current file to `.secondbrain/trash/<token>/<path>` with the existing manifest, or `null` when
the file does not exist. Reuses `createUndoToken`, `trashPath`, `trashManifestPath`. `undo(token)`
must restore a snapshot **over** an existing file (today's delete-undo path only moves back into an
empty slot) — extend it and mark the manifest kind so the two cases stay distinguishable.
Mirror: `FsVaultStore.delete()` (`src/core/vault/fs-store.ts:167-181`).
Acceptance: write → snapshot → overwrite → `undo(token)` restores byte-identical previous content;
snapshot of a missing file returns `null` and creates nothing; `MemoryVaultStore` implements the
same contract and the existing store tests still pass.

**D3 — Accept and reject compositions** [x]
Files: `src/core/condense/apply.ts` (new), `src/core/condense/directives.ts` (new),
`tests/core/condense/apply.test.ts` (new), `tests/core/condense/directives.test.ts` (new).
`buildAcceptedDocument(proposal, currentContent)` → the artifact text to write: body sections from
the proposal, `condensed_at` + `sources:` updated, **unknown frontmatter keys merged, directives
section carried over verbatim**. `appendDirective(currentContent | null, reason, language)` →
appends one line under the document-language directives heading (reuse 037's heading helper, not a
literal string); when `currentContent` is `null` it produces a frontmatter + directives-only
artifact with no body sections and no `condensed_at`.
Acceptance: an unknown frontmatter key and an existing directives line survive an accept
untouched; two rejections produce two directive lines in order; rejecting with no artifact yet
yields a directives-only file whose body sections are absent; a reason containing Markdown control
characters is stored as one line and cannot break the section.

**D4 — IPC contract and main handlers** [x]
Files: `src/shared/ipc.ts`, `src/shared/types/condense.ts` (new), `src/main/ipc/condense.ts`
(new), `src/main/ipc/index.ts` (registration), `src/preload/index.ts` (allow-list is derived —
verify), `src/renderer/lib/api.ts`, `tests/main/ipc-coverage.test.ts` (extend).
Channels: `condense:read` `{ slug } → { content, hash, condensedAt, sources } | null`;
`condense:run` `{ slug } → CondenseProposal`; `condense:accept`
`{ proposal } → { path, hash, undoToken }`; `condense:reject` `{ slug, reason } → { path }`.
`accept` = `snapshot()` then `write({ expectedHash: proposal.baseHash })`; a `VaultConflictError`
comes back as `code: 'conflict'` and writes nothing. `run` propagates `LlmUnavailableError`
unchanged. Mirror: `src/main/ipc/journal.ts:321,333`.
Acceptance: accept with a stale hash returns `conflict`, leaves the file byte-identical and creates
no trash entry; accept with a fresh hash writes once and returns an undo token; `read` works with
no model configured; every new channel is in the coverage test.

**D5 — Tabs inside the area** [x]
Files: `src/renderer/screens/notes/AreaSection.tsx`, `src/renderer/screens/notes/AreaNotesTab.tsx`
(new), `src/renderer/screens/notes/AreaTodosTab.tsx` (new),
`src/renderer/i18n/{en,de}-notes.ts`, `tests/renderer/notes/AreaSection.test.tsx` (extend).
The panel body becomes a `Tabs` atom (`src/renderer/atoms/Tabs.tsx:18`) with notes, todos and
condensed; the existing notes and todos markup moves out verbatim into the two new tab components.
Mirror: `src/renderer/screens/projects/ProjectDetail.tsx:151-163`. Tab selection is local state,
seeded from a `?tab=` search param so a maintenance finding can deep-link into the condensed tab.
Acceptance: notes and todos behave exactly as before (counts, add note, move note, todo toggle);
no new colour or spacing outside tokens; keys exist in `de` and `en` and the i18n parity test is
green.

**D6 — The condensed tab: read, no-model, trigger, running** [x]
Files: `src/renderer/screens/notes/AreaCondensedTab.tsx` (new),
`src/renderer/lib/queries/condense.ts` (new), `src/renderer/i18n/{en,de}-notes.ts`,
`tests/renderer/notes/AreaCondensedTab.test.tsx` (new).
Four states: no model routed for `condense-area` → `LlmMissing task="condense-area" tone="card"`
and no trigger at all; no artifact and a model → an empty state plus the trigger; an artifact →
its rendered content with `condensed_at` and `sources`, plus the trigger; running → `Spinner` and
a disabled trigger. Mirror: `src/renderer/screens/garden/GardenScreen.tsx:73,261` for
`useTaskRouted`.
Acceptance: with routing removed the trigger is not rendered (not merely disabled) and an existing
artifact is still readable; a run that fails shows the failure and leaves the tab in its previous
state.

**D7 — Diff view and accept** [x]
Files: `src/renderer/components/CondenseDiff.tsx` (new),
`src/renderer/screens/notes/AreaCondensedTab.tsx`, `src/renderer/i18n/{en,de}-notes.ts`,
`tests/renderer/components/CondenseDiff.test.tsx` (new).
Renders `DiffRow[]` from D1 with removals and additions equally prominent (a marker glyph plus a
token-based surface, never colour alone), a mono gutter, and a removed/added count line. Accept
button posts the whole proposal; on `conflict` the proposal is discarded with a message saying the
file changed and the run has to be repeated. Nothing is written until accept.
Acceptance: a proposal that only deletes still shows a visibly non-empty diff; a stale-hash accept
shows the conflict message and leaves the artifact readable; the diff view uses `gs-*` atoms and
tokens only.

**D8 — Reject with a reason** [x]
Files: `src/renderer/components/CondenseRejectDialog.tsx` (new),
`src/renderer/screens/notes/AreaCondensedTab.tsx`, `src/renderer/i18n/{en,de}-notes.ts`,
`tests/renderer/components/CondenseRejectDialog.test.tsx` (new).
`Dialog` atom with a required multi-line reason; confirm is disabled while the field is empty or
whitespace; there is no dismiss-without-reason affordance on the proposal bar (closing the dialog
returns to the still-open proposal, it does not discard it).
Acceptance: an empty reason cannot be submitted; a submitted reason appears in the artifact's
directives section after reload; the proposal is gone and the artifact body is unchanged.

**D9 — Acceptance surface: seed, screenshot, docs** [x]
Files: `scripts/seed.mjs` (or the seed source it delegates to), `scripts/shot.mjs`,
`docs/VAULT-FORMAT.md` (only if 037 has not already documented the artifact),
`docs/systems/navigation.md` (the new area tab).
Seeds one demo area with an existing `areas/<slug>.condensed.md` including one directive line, so
`npm run shot` captures the condensed tab in a realistic state.
Acceptance: `npm run seed && npm run shot` produces a screenshot of the condensed tab with content;
the manual test plan below runs end to end on the seeded vault.

## Model Hints

- D2 → `deliverable-hard` — it changes the shared `VaultStore` interface and the trash/undo
  semantics that every existing delete test depends on; an undo that restores over an existing
  file is a new path where a mistake destroys the user's data silently.
- D3 → `deliverable-hard` — merging unknown frontmatter keys and carrying the directives section
  through a full-body rewrite is the subtle cross-module rule (VAULT-FORMAT merge semantics +
  037's heading helper) where a quiet loss of a human-written directive would go unnoticed.
- D1, D4, D5, D6, D7, D8, D9 → default tier.
- Review: → `story-review-hard` — this is the confirmation gate for a write path that may delete
  the user's condensed knowledge; guardrail 2, the hash guard and the undo copy all have to be
  checked against the diff rather than assumed.

## Test Plan (manual acceptance)

Run `npm run seed`, start the app, go to **Notes**.

1. **No model.** In settings, leave `condense-area` unrouted. Open a seeded area, switch to the
   condensed tab: it states that a model is missing, names `condense-area`, and links to the model
   settings. No trigger is offered. The existing artifact of the seeded area is still readable
   below/next to that note.
2. **Trigger and diff.** Route `condense-area` to a local model. In the same tab, press the
   trigger — a running state appears. When it finishes, a diff is shown, old against new, with
   removed lines marked and counted, and the `From: …` source lines visible as diff rows. Nothing
   has been written yet: open `areas/<slug>.condensed.md` in an editor and confirm it is unchanged.
3. **Accept.** Press accept. The artifact shows the new content, `condensed_at` is updated. Check
   `.secondbrain/trash/` — a new token folder holds the previous version of the file.
4. **Conflict.** Trigger a run again. Before accepting, edit `areas/<slug>.condensed.md` in an
   external editor and save. Press accept: the app reports a conflict, discards the proposal and
   asks for a re-run. Your external edit is still in the file, unmerged.
5. **Reject with a reason.** Trigger a run, press reject. The dialog demands a sentence — confirm
   is disabled while it is empty, and there is no way to dismiss the proposal without one. Enter
   "Do not put open todos in here." and confirm. The artifact body is unchanged; its directives
   section now carries that line.
6. **Directive is honoured and preserved.** Trigger another run. The directives section is
   untouched in the diff (it appears only as context, never as removed), and the new proposal
   respects the sentence.
7. **Language.** Switch the UI language to German and repeat step 1 and step 5: all strings are
   translated and German quotes are `„…“`.

## Done

**Summary.** Built the confirmation path around 037's condensed artifact: a line-level LCS diff
in core (`src/core/condense/diff.ts`), an undo-copy primitive on `VaultStore` (`snapshot()`,
`.secondbrain/trash/` with `undo()` able to restore over an existing file), the accept/reject
compositions (`apply.ts`, `directives.ts`), four new IPC channels
(`condense:read/run/accept/reject`) with hash-guarded, never-merging writes, and the renderer:
the area panel is now a three-tab layout (notes/todos/condensed), with the condensed tab covering
all four states (no model / no artifact / artifact / running), a diff view where removals are as
visible as additions (marker glyph + token surface, not colour alone, with an accessible label for
each row kind), an accept flow, and a reject dialog that requires a sentence before anything is
written. `npm run seed && npm run shot` was run against the real built app and produced
`.screenshots/25-notes-condensed.png`, showing the seeded `areas/gesundheit.condensed.md` artifact
(with an existing directive) rendered in the condensed tab.

**Decisions.**
- 037's real `CondenseAreaProposal` (`content`, no separate `before`) differs from the plan's
  hoped-for `CondenseProposal` shape; the adaptation happens entirely in `condense:run`'s IPC
  handler (`src/main/ipc/condense.ts`), which reads the existing file itself and builds the wire
  `CondenseProposal` (`before`/`after`/`partialInputs`) from 037's result — `run.ts` itself is
  untouched, per the plan's own instruction ("D3 adapts the type, not the run").
- `buildAcceptedDocument()` (`src/core/condense/apply.ts`) stayed a documented passthrough rather
  than a real seam: 037's `run.ts` already merges unknown frontmatter/directives via its `...current`
  spread, so there was nothing left to rebuild at accept time. `condense:accept` writes
  `proposal.after` directly; the function's doc comment says so honestly rather than claiming to be
  on the call path.
- Reject on an existing artifact splices the sanitized reason line directly into the raw text's
  directives section (or appends a new directives section with a heading inferred from the
  artifact's own existing language) instead of a full parse→compose round-trip — a full recompose
  would have silently rewritten the three machine section headings and every `Aus:`/`From:` line
  into whatever document language happened to be configured at reject time, which would have been
  a body rewrite the acceptance criteria explicitly forbid on a reject.
- `condense:accept` pre-checks the file's current hash/existence against `proposal.baseHash` and
  throws the conflict itself *before* calling `snapshot()` — a stale-hash accept must create no
  trash entry, and snapshotting unconditionally would have left an orphaned undo copy on every
  conflict.
- Reason validation for reject (`reason.trim().length === 0` → `invalid`) is enforced in the IPC
  handler as well as the dialog — the UI is not the only gate against a bare rejection.
- Out of scope, as decided in the story: deleting a condensed artifact from the UI, and enforcing
  that a `condensed` document is never cited as evidence in query-answer. Both carried into the
  sprint review's findings / the roadmap's "Open / unprioritised" table as follow-ups, not built here.

**Verification.**
- `npm run typecheck`, `npm run lint`, `npm test` (235 files / 3288 tests), `npm run build` — all
  green, run once after the review-fix cycle.
- `npm run seed && npm run shot` — run for real against the built app; produced
  `.screenshots/25-notes-condensed.png` (condensed tab, seeded artifact with an existing directive,
  honest "no model configured" state — the demo vault deliberately carries no LLM provider, the
  same convention every other model-gated screen's screenshot already follows). The
  trigger→diff→accept→reject round trip itself is covered by the fake-gateway IPC tests
  (`tests/main/condense-ipc.test.ts`) and the renderer component/integration tests
  (`tests/renderer/condense-*.test.tsx`), not by a live model call — this repo's QA rule forbids
  tests (and, in this sandboxed environment, the seed harness) from touching a real LLM.
- Code review (`story-review-hard`, per Model Hints): first pass **FAIL** with 9 findings, all on
  the write path (orphaned trash entry on a conflicting accept; a TOCTOU gap in reject's hash
  guard; reject silently rewriting section headings/source lines via a language-forced recompose;
  no server-side reason validation; accept trusting the renderer-supplied `path` instead of
  deriving it from `slug`; a hash returned from a second, independent read in both `condense:read`
  and the original reject guard; a straight `"` instead of `„…"` in two German error strings; diff
  row markers with no accessible label; the reject dialog's textarea staying pre-filled after a
  successful submit) plus one doc-comment inaccuracy. All 9 + the doc comment were fixed in one
  cycle; a second `story-review-hard` pass verified each fix individually (including probing the
  new directive-splice logic's edge cases: last section in file, no trailing newline, no existing
  directives section, directives-first, no frontmatter, a heading-like string inside a code fence)
  and returned **PASS**.

**Commit message:** `038: I see what a condensation changes before it is written`
