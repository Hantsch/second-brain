---
id: 003
title: Project notes and waiting-on, editable in place
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I cannot add a note to a project, and I cannot say who I am waiting on. Both exist in
the project detail view as read-only: notes are rendered from the `## Notizen`
section behind a show/hide toggle, waiting-on entries can only be resolved.

The only way to get either into a project today is to write a dump, then file it onto
the project from the inbox. That path works, but it is a detour for "add a note to
this project" — and because it is the *only* path, the project screen looks finished
while a core action is missing.

I want to type a note into the project I am looking at, and I want to record "waiting
on X since when, expected by when" where I notice it.

## Acceptance Criteria

- [x] In the project detail view I can write a note and save it. It is appended to
      the project file's notes section with its date, in the format
      [VAULT-FORMAT.md](../VAULT-FORMAT.md) prescribes — the same format the filing
      path produces, so both are indistinguishable in the file.
- [x] A newly written note is immediately visible in the notes panel, without a
      reload and without me having to expand the panel first.
- [x] In the project detail view I can add a waiting-on entry with who, what, since
      when, and expected by when. Only "who" is mandatory.
- [x] A new waiting-on entry appears in the waiting list and counts towards the
      "waiting on" tile on Today and the overdue reminder, exactly like a filed one.
- [x] Both writes go through the existing hash-guarded write path: writing against a
      stale hash fails with a conflict instead of overwriting an edit made in
      Obsidian or VS Code.
- [x] Both writes are undoable the way the existing project actions are (toast with
      undo), and an undo does not cost content the app does not interpret.
- [x] Both work without a configured model — nothing here needs an LLM.
- [x] The keyboard reaches both: a key opens the note composer, consistent with the
      existing `t` for a new todo.
- [x] Round-trip test: write a note in the app, edit the file externally, re-read —
      no data loss. Conflict test: write with a stale hash, get `conflict`.

## Open Questions

- ~~Adding a note by hand: does it get a title/tags via the existing `title-tags`
  task when a model is configured, or is a project note deliberately plain text?~~
  answered → Decisions (Sprint)
- ~~The notes panel is collapsed by default and hidden entirely when empty. With a
  composer present, should the panel always be open, or open on first write?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Note gets title/tags via title-tags when a model is configured: stays
  deliberately plain text, no LLM involved, regardless of configuration.
- **(User)** Notes panel default state with a composer present: always open once a
  composer is present, not collapsed until first write.
- A note gets its own channel `projects:createNote` instead of reusing the generic
  `projects:append` — `append` writes raw content under a caller-named section with no
  dated block and no `expectedHash`, so overloading it would change a contract another
  caller may rely on.
- The notes heading is resolved from the file (`Notizen` · `Notes`), the document
  language only decides when the file has neither — the same rule `src/core/areas/`
  already follows, so a language switch never orphans notes already filed.
- The alias logic lands as one additive generic helper in `src/core/vault/sections.ts`
  and is called from the new `src/core/projects/sections.ts`; `src/core/areas/` stays
  untouched, so reuse costs no regression risk on the area write path.
- Note undo is an inverse write (`projects:removeNote` with the exact block, via the
  existing `removeBlock`), not a `.secondbrain/trash` token — the token journal is
  dump-shaped (`FilingJournal.dumpPath`) and a six-second toast needs no durable state.
  If the block is no longer in the file verbatim, nothing is written.
- Adding a waiting-on entry reuses `projects:patch` with the whole `waiting_on` array
  instead of a new channel — `checkProjectPatch`/`asWaiting` already validate every
  entry in the main process and pass unknown per-entry fields through.
- `since` defaults to today when the user leaves it empty: `asWaiting` requires
  `since`, so "only who is mandatory" is honoured in the UI without weakening the file
  contract.
- The notes show/hide toggle and its keys `project.notes.show` / `project.notes.hide`
  are removed, not just defaulted to open — a toggle that is always on is dead UI.
- Keys: `m` opens the note composer, `w` the waiting-on composer. `n` is already the
  project list's "new project" and both hooks listen on `window`, so reusing `n` would
  fire two actions at once.
- The note composer mirrors `NoteComposer.tsx` (textarea, Ctrl+Enter, field clears only
  after the write resolves) so a conflict never costs the typed text.
- Conflicts surface through the `ErrorState` already aggregated in
  `ProjectOverviewTab` — no second error surface on the same screen.

## Plan

The project detail gets two write paths it is missing. The note needs new core + IPC
(dated block, heading tolerance, undo); the waiting-on entry is renderer-only on top of
the existing `projects:patch`.

1. **Core** — `src/core/vault/sections.ts` gains an additive `headingFor(body, aliases,
   fallback)`; new `src/core/projects/sections.ts` maps `notes` → `['notizen','notes']`
   with the document language as fallback. Mirror: `src/core/areas/sections.ts`.
2. **IPC + main** — two channels in `src/shared/ipc.ts`:
   `projects:createNote { slug, text, expectedHash? }` → `WriteResult & { block }`, and
   `projects:removeNote { slug, block }` → `WriteResult`. Handlers in
   `src/main/ipc/projects.ts` read the file fresh, use `filingBlock()` for the
   `### YYYY-MM-DD` wrapper (identical to filing), append with `expectedHash ?? doc.hash`,
   and `settle()`. Mirror: `appendNote` in `src/main/ipc/areas.ts`.
3. **Renderer, note** — `api.projects.createNote/removeNote`, two mutations in
   `lib/queries/projects.ts` (reusing `refresh`), a `ProjectNoteComposer` inside the
   notes panel. The panel loses its toggle and is always open; the renderer's
   `screens/projects/sections.ts` learns the same `Notizen`/`Notes` alias so a note is
   visible the moment the query refetches.
4. **Renderer, waiting-on** — an inline composer in the waiting panel builds the next
   array from `rawWaiting(doc, …)` + the new entry and sends
   `patch { waiting_on: next }` with `expectedHash: doc.hash`. Undo patches the previous
   raw array back — byte-identical to the existing `resolveWaiting` undo.
5. **Keys** — `useComposerKeys({ note, waiting })` in `use-project-keys.ts`, next to
   `useTodoKeys`.
6. **Coverage** — a hand-added entry flows into `waitingList()` and `fromWaiting()`
   unchanged; tests prove it rather than code changing.

Order: 1 → 2 → 3 → 4 → 5 → 6. No LLM anywhere in this path.

## Deliverables

**D1 — Notes heading, tolerant of both spellings (core)**
Additive `headingFor(body, aliases, fallback)` in the vault sections module, plus a
project sections module that resolves the notes heading from the file, with the document
language only as fallback.
_Acceptance:_ a file with `## Notes` resolves to `Notes`, one with `## Notizen` to
`Notizen`, a file with neither to the document language's word; a file carrying both
resolves to the one that appears first. `src/core/areas/` behaviour is unchanged.
_Files:_ `src/core/vault/sections.ts`, `src/core/projects/sections.ts` (new),
`src/core/projects/index.ts` (new), `tests/core/projects/sections.test.ts` (new).
_Mirror:_ `src/core/areas/sections.ts` (`ALIASES`, `areaSectionIn`, `fold`).

**D2 — `projects:createNote` and `projects:removeNote`**
Two channels plus handlers: append a `### YYYY-MM-DD` block under the file's notes
heading, hash-guarded; and take exactly that block back out again.
_Acceptance:_ the written block is byte-identical to what filing a dump produces
(`filingBlock`); a missing notes section is created at the end of the file; a stale
`expectedHash` fails with `conflict` and leaves the file untouched; the round trip
write → external edit → re-read loses nothing; `removeNote` with a block that is no
longer in the file verbatim writes nothing and does not fail the user's edit; an empty
text is refused; unknown frontmatter survives; `ipc-coverage` stays green.
_Files:_ `src/shared/ipc.ts`, `src/main/ipc/projects.ts`, `tests/main/projects-ipc.test.ts`.
_Mirror:_ `appendNote` / `areas:createNote` in `src/main/ipc/areas.ts`;
`removeBlock` in `src/core/capture/filing.ts`.

**D3 — Note composer component and renderer plumbing**
`api.projects.createNote/removeNote`, two mutations, and a `ProjectNoteComposer`
(textarea, Ctrl+Enter, save button) that clears only after the write resolves.
_Acceptance:_ the component renders and submits without a model configured; an empty
field cannot be saved; a rejected write keeps the text; sentence case, no emoji, tokens
only — no raw Tailwind palette class; `de` and `en` both complete.
_Files:_ `src/renderer/screens/projects/ProjectNoteComposer.tsx` (new),
`src/renderer/lib/api.ts`, `src/renderer/lib/queries/projects.ts`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`,
`src/renderer/styles/app/projects.css`.
_Mirror:_ `src/renderer/screens/notes/NoteComposer.tsx`.

**D4 — Notes panel: always open, composer wired, undo**
The panel drops its show/hide toggle and renders notes plus the composer permanently;
the renderer section parser learns the `Notizen`/`Notes` alias; a successful write
raises a success toast with `common.undo` calling `removeNote` with the returned block.
_Acceptance:_ a new note appears in the panel without a reload and without expanding
anything; a project whose file says `## Notes` shows its notes too; undo removes exactly
the written block and leaves everything else, including text the app does not interpret;
the unused `project.notes.show` / `project.notes.hide` keys are gone from `de` and `en`.
_Files:_ `src/renderer/screens/projects/ProjectOverviewTab.tsx`,
`src/renderer/screens/projects/sections.ts`, `src/renderer/i18n/de-projects.ts`,
`src/renderer/i18n/en-projects.ts`, `tests/renderer/projects.test.tsx`.
_Mirror:_ the `resolveWaiting` toast-with-undo in the same file.

**D5 — Waiting-on composer**
An inline composer in the waiting panel: who (required), what, since (defaults to
today), due (optional). Saves via `projects:patch` with `expectedHash: doc.hash`, undo
patches the previous raw array back.
_Acceptance:_ an entry with only "who" saves and appears in the list; `since` lands as
today's date in the file; a stale hash yields `conflict` and shows the existing
`ErrorState` instead of overwriting; undo restores the array including per-entry fields
the app does not interpret; works with no model configured; labels in `de` and `en`.
_Files:_ `src/renderer/screens/projects/WaitingComposer.tsx` (new),
`src/renderer/screens/projects/ProjectOverviewTab.tsx`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`,
`src/renderer/styles/app/projects.css`, `tests/renderer/projects.test.tsx`.
_Mirror:_ `rawWaiting` + the `resolveWaiting` undo in `ProjectOverviewTab.tsx`;
`TodoList.tsx`'s `submit()` for the clear-on-success rule.

**D6 — Keyboard reaches both composers**
`useComposerKeys({ note, waiting })` — `m` opens the note composer, `w` the waiting-on
composer — ignoring keystrokes from fields, like the existing hooks. A `Kbd` hint on
each composer.
_Acceptance:_ `m` and `w` open their composer and focus its first field; neither fires
while typing in a todo field or in the other composer; `t`, `x`, `n` behave exactly as
before.
_Files:_ `src/renderer/screens/projects/use-project-keys.ts`,
`src/renderer/screens/projects/ProjectOverviewTab.tsx`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`,
`tests/renderer/projects.test.tsx`.
_Mirror:_ `useTodoKeys` in the same file.

**D7 — A hand-added entry counts like a filed one**
Tests only: an entry written by the composer reaches the Today "waiting on" tile and the
overdue reminder on exactly the same path a filed one does.
_Acceptance:_ `waitingList()` returns the new entry and sorts it by `since`;
`fromWaiting()` emits a `waiting-overdue` reminder once `due` has passed, and once
`since` is older than `waitingNudgeDays` when there is no `due`; a resolved entry
appears in neither.
_Files:_ `tests/core/overview/dashboard.test.ts`, `tests/core/overview/reminders.test.ts`.

**AC coverage:** note appended in VAULT-FORMAT format → D1 + D2 (UI trigger D3/D4) ·
immediately visible, no reload, no expanding → D4 · waiting-on entry with who/what/
since/due, only who mandatory → D5 · counts on the Today tile and the overdue reminder →
D5 + D7 · hash-guarded, stale hash gives `conflict` → D2 (note) + D5 (waiting) ·
undoable by toast without costing uninterpreted content → D4 (note) + D5 (waiting) ·
works with no model configured → D3 + D4 + D5 · keyboard reaches both → D6 ·
round-trip and conflict tests → D2.

## Model Hints

- D2 → `deliverable-hard` — it opens a new hash-guarded write path into the user's
  project files **and** a path that removes content from them again; `removeNote` must
  never delete a block the user has since edited, and the dated block has to stay
  byte-identical to filing or the two paths drift apart in the file.
- D1, D3, D4, D5, D6, D7 → default.
- Review: → `story-review-hard` — a new vault write path plus an undo that deletes from
  a user's file; a wrong block match silently destroys handwritten text.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app, open Projects and select a project.
2. The notes panel is open, with a composer under it and no show/hide button. Type a
   note, press Ctrl+Enter. It appears immediately at the top of the panel with today's
   date, without a reload.
3. Open `project.md` in an editor: the note stands under `## Notizen` as
   `### YYYY-MM-DD` — indistinguishable from a note filed from the inbox.
4. Undo in the toast. The note disappears from the panel and from the file; everything
   else in the file, including anything typed by hand, is untouched.
5. With the project open, edit `project.md` in the editor and save. Then write a note in
   the app without reselecting the project: the write fails with a conflict message, the
   editor's change survives, and the typed text stays in the field.
6. In the waiting panel, click "Add" (or press `w`). Fill in only "who", save. The entry
   appears in the list with today's date as "since". The file shows a `waiting_on` entry
   with `who` and `since`.
7. Go to the dashboard: the "waiting on" tile lists the new entry.
8. Back in the project, undo the waiting-on toast — the entry is gone from the file.
9. Press `m` anywhere in the detail view: the note field takes focus. Press `t`: the
   todo field takes focus, as before. Type an `m` inside a field — nothing else opens.
10. Settings → remove the configured model. Both composers work exactly the same.
11. Delete `.secondbrain/index/` and restart: note and waiting-on entry are still there.
12. Rename `## Notizen` to `## Notes` in the file. The panel still shows the notes, and a
    new note appends under `## Notes` — not under a second heading.

## Done

### Summary

Both write paths landed exactly as planned, D1 → D7:

- **D1** — `headingFor(body, aliases, fallback)` (additive, `src/core/vault/sections.ts`)
  plus `projectNotesHeading()` (`src/core/projects/sections.ts`, `index.ts` new). `Notizen`
  and `Notes` are both recognized, first one in the file wins, document language decides
  only the fallback. `src/core/areas/` untouched.
- **D2** (`deliverable-hard`) — `projects:createNote` / `projects:removeNote` in
  `src/shared/ipc.ts` + `src/main/ipc/projects.ts`, reusing `filingBlock`/`removeBlock`
  from `@core/capture` so a hand-typed note and a filed dump are byte-identical in the
  file. Hash-guarded (`expectedHash ?? doc.hash`), `removeNote` is a no-op (not an error)
  when the block is no longer verbatim in the file.
- **D3** — `ProjectNoteComposer.tsx` (new), `api.projects.createNote/removeNote`, two
  mutations in `lib/queries/projects.ts`, i18n, styles.
- **D4** — Notes panel's show/hide toggle removed, always renders notes + composer;
  `notesSectionOf()` teaches the renderer's own section parser the alias; success toast
  with `common.undo` → `removeNote`. Collateral: a genuine accessibility bug the
  always-visible panel surfaced (dated `###` entries skipping a heading level under a
  Panel's `<h2>`) was fixed via a new `headingOffset` prop on `Markdown`/`markdown-render`;
  an i18n key collision between the removed `project.notes.show/hide` and
  `AreaSection.tsx`/`FiledTrail.tsx`'s reuse of the same keys was resolved by giving those
  two their own `notes.area.*`/`notes.unfiled.*` keys with identical button text.
- **D5** — `WaitingComposer.tsx` (new, who required / what, due optional, since defaults
  to today), wired into the waiting panel via the existing `projects:patch` (no new
  channel), undo restores the previous raw array. `what`/`due` are omitted from the
  written entry rather than sent as `''`, because `asWaiting`'s `asText` rejects an
  explicit empty string for any field it validates — that omission is what actually makes
  "only who is mandatory" true against the file contract.
- **D6** — `useComposerKeys({ note, waiting })` in `use-project-keys.ts`: `m` focuses the
  (always-mounted) note field directly, `w` opens the waiting composer and focuses it via
  a `useEffect` keyed on `waitComposeOpen`. `Kbd` hints on both panels. `t`/`x`/`n` unchanged.
- **D7** — Tests only, `tests/core/overview/dashboard.test.ts` /
  `tests/core/overview/reminders.test.ts`: a composer-shaped entry (`what: ''`, no `due`)
  proven to flow through `waitingList()`/`fromWaiting()` identically to a filed one,
  including the title's empty-`what` fallback and the resolved-entry exclusion.

### Review fix (F2 + F7)

The `story-review-hard` review passed with 8 findings; two were real and in scope, fixed
before closing the story:

- **F2 (correctness bug)** — `src/renderer/screens/projects/sections.ts`'s
  `notesSectionOf()` originally used "Notizen wins whenever it's non-empty, else Notes",
  which disagreed with the write path's actual rule (`headingFor`/`projectNotesHeading`:
  "whichever heading appears first in the document"). On a file carrying both headings,
  this could silently hide handwritten content or a freshly written note from the panel.
  Fixed to resolve by first-occurrence-in-document, matching the write path exactly; added
  a test ("zeigt bei beiden Überschriften die zuerst im Dokument stehende, wie der
  Schreibweg") in `tests/renderer/projects.test.tsx`.
- **F7 (documentation gap)** — `docs/VAULT-FORMAT.md`'s Project section didn't mention the
  `Notizen`/`Notes` heading tolerance (Areas already documented theirs). Added a sentence
  mirroring the Area section's wording.

### Known limitations (documented, not fixed — pre-existing, out of scope per reviewer)

- **F1** — `removeBlock()` (`src/core/capture/filing.ts`) matches via `body.indexOf(needle)`.
  If a user appends text directly after an app-written block without an intervening edit
  to the block itself, undo still finds and removes the original block verbatim, leaving
  the user's addition behind without the date heading that used to sit above it.
  Pre-existing, shared with `revertFiling`'s dump-undo path; not introduced by this story.
- **F4** — The undo mutations for both new write paths (`saveNote`'s `removeNote` call,
  `saveWaiting`'s/`resolveWaiting`'s `projects:patch` call) don't send `expectedHash`, so
  an undo clicked after an external edit made in that window writes against the file's
  *current* hash rather than failing as a conflict. Pre-existing pattern, shared with the
  original `resolveWaiting` undo this story mirrors.
- **F5** — `removeBlock()` collapses 3+ consecutive blank lines to 2
  (`.replace(/\n{3,}/g, '\n\n')`) as part of tidying up after removing a block; if that
  collapsing region overlaps deliberate spacing elsewhere in the file, it's flattened too.
  Pre-existing in `src/core/capture/filing.ts`, not touched by D2.
- **F6** — The *filing* path's `applyFiling()` (`src/core/capture/filing.ts`) still hardcodes
  `DEFAULT_SECTION = 'Notizen'` and doesn't consult `projectNotesHeading()` — so filing a
  dump (not the new hand-typed note composer) into a project whose file already uses
  `## Notes` would create a second, German-headed section instead of joining the existing
  one. The new `projects:createNote` path added by this story does use the alias-aware
  resolution; the older filing path predates it and was out of this story's file list.
- **F8** — `ProjectOverviewTab.tsx`'s `saveWaiting()` uses `item as WaitingOn` after
  building the entry field-by-field; a cast rather than a structural guarantee, but the
  surrounding comment explains why (`what`/`due` are conditionally assigned, so TypeScript
  can't narrow the partial object on its own) — accepted as within house rules, not a
  silent `any`.

### Environment notes (pre-existing, not caused by this story)

- `npm run format:check` fails repo-wide (CRLF vs LF from this Windows checkout vs
  Prettier's LF default) — affects ~187 files including many untouched by this story.
  Every file this story touched was individually verified clean with
  `npx prettier --check`.
- The default Vitest `pool: 'forks'` fails to start jsdom suites on this machine (Node
  20.20.2); renderer tests were run with `--pool=threads` throughout this story's build.
  Untouched files reproduce the same failure, confirming it's a machine/tooling issue,
  not a regression.
- `npm test`'s full run has exactly 2 pre-existing, unrelated failures, present before and
  after this story's changes: `tests/core/wiki/module.test.ts` (a drift check against
  `docs/MODULE-SCHEMA.md` unrelated to projects) and `tests/main/ipc/agents.test.ts` (leaks
  the real local `~/.claude`/Codex session data on this development machine).

### Test results

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (main, preload, renderer all build).
- `npm test` (`vitest run --pool=threads`) — 1972 passed, 2 pre-existing unrelated
  failures (see above). All story-003 test files green: `tests/core/projects/sections.test.ts`,
  `tests/main/projects-ipc.test.ts`, `tests/main/ipc-coverage.test.ts`,
  `tests/renderer/projects.test.tsx` (69 tests), `tests/renderer/project-note-composer.test.tsx`
  (5 tests), `tests/core/overview/dashboard.test.ts`, `tests/core/overview/reminders.test.ts`.
- Live smoke test (`npm run seed && npm run shot`): no console errors; project-detail
  screenshots (`19-project-detail.png`, `project-detail-narrow.png`,
  `project-detail-narrow-end.png`) confirm the "Warte auf" panel with its `w` hint and
  collapsed "Warten auf hinzufügen" composer trigger, and the "Notizen" panel with its `m`
  hint, an existing dated note, and the always-visible composer with the Ctrl+Enter hint —
  matching the manual test plan below.
- Code review: `story-review-hard` — **PASS**, 8 findings (F1-F8); F2 and F7 fixed above,
  F1/F4/F5/F6/F8 documented as known limitations; file-size question on
  `ProjectOverviewTab.tsx` (394 lines, over the ~300-line soft limit) reviewed explicitly —
  verdict: one cohesive responsibility (this project's overview tab and its write paths),
  grown wordier from three new inline write paths rather than acquiring a second
  responsibility; a split now would mostly be prop-plumbing without real separation, so no
  split for this story.

### Commit message

```
003: add project note and waiting-on composers, editable in place
```

### Changed files

New:

- `src/core/projects/sections.ts`, `src/core/projects/index.ts`
- `tests/core/projects/sections.test.ts`
- `src/renderer/screens/projects/ProjectNoteComposer.tsx`
- `src/renderer/screens/projects/WaitingComposer.tsx`
- `tests/renderer/project-note-composer.test.tsx`

Modified:

- `src/core/vault/sections.ts`
- `src/shared/ipc.ts`
- `src/main/ipc/projects.ts`
- `tests/main/projects-ipc.test.ts`
- `src/renderer/screens/projects/ProjectOverviewTab.tsx`
- `src/renderer/screens/projects/sections.ts`
- `src/renderer/screens/projects/use-project-keys.ts`
- `src/renderer/lib/api.ts`
- `src/renderer/lib/queries/projects.ts`
- `src/renderer/lib/mock-bridge.ts`
- `src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`
- `src/renderer/i18n/de-notes.ts`, `src/renderer/i18n/en-notes.ts`
- `src/renderer/styles/app/projects.css`
- `src/renderer/components/Markdown.tsx`, `src/renderer/components/markdown-render.tsx`
- `src/renderer/screens/inbox/FiledTrail.tsx`, `src/renderer/screens/notes/AreaSection.tsx`
- `tests/renderer/projects.test.tsx`
- `tests/core/overview/dashboard.test.ts`, `tests/core/overview/reminders.test.ts`
- `docs/VAULT-FORMAT.md`
- `docs/requirements/003-project-notes-and-waiting-on.md` (this file)

Not part of this story's diff (concurrent sibling sessions refining other stories in the
same working tree; left untouched): `docs/requirements/004-project-status-provenance.md`,
`docs/requirements/013-favourite-projects.md`, `docs/sprints/S03/sprint.md`. A separate,
already-committed infra fix on this branch (not part of this diff) anchored the
`.gitignore`'s `vault/` pattern to `/vault/`, which had been silently excluding
`src/core/vault/` from git.
