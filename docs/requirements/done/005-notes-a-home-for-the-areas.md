---
id: 005
title: Notes — a home for the areas
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I want a place for thoughts that belong neither to a project nor to a day. Random
notes, speak your mind — the stuff that has no home and therefore currently does not
get written down at all.

That place half exists already, and only in one direction: the vault has `areas/`
("ongoing responsibilities without an end"), and "note into an area" is a valid
filing target. But **no screen reads it.** Anything filed into an area is written and
then invisible in the app forever. That is a write path without a read path, and it
means the app can decide to put my thought somewhere I can never look at it.

So: a rail entry **Notes** that shows the areas and their notes, and lets me write
one directly, without picking a folder first.

Target picture: [systems/navigation.md](../../systems/navigation.md).

## Acceptance Criteria

- [x] A rail entry "Notes" (de: "Notizen") shows the areas from `areas/` with their
      dated note entries, newest first.
- [x] I can write a note and save it without choosing a target first. Nothing about
      the flow asks me for structure — that is the app's job (principle 1 in
      [CONCEPT.md](../CONCEPT.md)).
- [x] I can move a note into a specific area afterwards, and I can create an area.
- [x] Notes written here are indistinguishable in the file from notes the filing path
      writes into an area — same section, same dated format.
- [x] Todos inside an area (`## Todos`) are visible and behave like project todos:
      check off, edit, and they count towards the todo tiles on Today.
- [x] External edits are picked up: a note added in Obsidian shows up here.
- [x] Writes are hash-guarded — a stale hash yields `conflict`, not an overwrite.
- [x] The empty state says what belongs in here and offers the first step, rather
      than being blank.
- [x] Everything on this screen works without a configured model.
- [x] Search finds notes in areas, and a citation can point at one.

## Open Questions

- ~~Where does a note with no chosen target land? A default area (e.g. `areas/notes.md`),
  a new area per note, or the inbox with a proposal like every other dump? A default
  area is the only option that keeps "dumping costs nothing" without also creating an
  inbox item I then have to file.~~ answered → Decisions (Sprint)
- ~~Are areas a visible concept on this screen (grouped by area, with area names), or
  is it one flat stream of notes with the area as a quiet label? Flat is simpler to
  use; grouped matches what the vault actually is.~~ answered → Decisions (Sprint)
- ~~Does an area need its own detail view (like a project), or is a section on the
  Notes screen enough?~~ answered → Decisions (Sprint)
- ~~Overlap with the journal: a thought I have today could go into the day entry
  instead. What is the rule that tells them apart, in one sentence, on screen?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Note with no chosen target: lands in a default area (`areas/notes.md`),
  created on first use.
- **(User)** Areas on the Notes screen: shown grouped by area, not a flat stream.
- **(User)** Area detail view: no separate detail view — a section (collapsible) on
  the Notes screen is enough for this sprint.
- **(User)** Notes vs. journal, the one-sentence rule shown on screen: "Journal is
  reflection on the day, a note is a thought that stands on its own."

Decided while refining (session, not user):

- **Vault names stay in the code.** Types, core module and IPC channels are called
  `Area` / `src/core/areas/` / `areas:*`; only the label says "Notes". Reason:
  [systems/navigation.md](../../systems/navigation.md) rules that renaming stops at
  the UI.
- **Section headings are resolved like journal sections, not hardcoded.** A new
  `src/core/areas/sections.ts` mirrors `src/core/journal/sections.ts`: an existing
  heading in the file wins, otherwise the document language decides
  (`Notizen`/`Todos` for `de`, `Notes`/`Todos` for `en`), matched folded so
  `Notizen` and `Notes` are the same section. Reason: the vault today is written by
  `SECTION_NOTES = 'Notizen'` in `core/capture/actions.ts` while
  [VAULT-FORMAT.md](../VAULT-FORMAT.md) shows `## Notes` — reading must tolerate
  both, and appending under the file's own heading is what makes AC 4 true.
- **A note is written with the filing path's own building blocks**, `filingBlock()`
  from `core/capture/filing.ts` plus `store.append()`, not with a second writer.
  Reason: "indistinguishable in the file" is only guaranteed by one code path.
- **The index carries area metadata plus parsed note entries, not note bodies.**
  `deriveAreas` puts slug, title, scope, counts and the entry list (day, line,
  excerpt) into `VaultIndex`; the full text of an entry comes from `areas:notes`
  when a section is expanded. Reason: `.secondbrain/index/index.json` must not grow
  into a copy of the vault.
- **Notes are sorted by their `### YYYY-MM-DD` heading, descending; entries without
  a parsable date keep file order at the end.** Reason: AC 1 asks for newest first
  and a hand-edited file must not be silently reordered or dropped.
- **Areas are sorted by their newest entry, descending; the default area is always
  first.** Reason: the screen answers "what did I think lately", not "the alphabet".
- **Sections start collapsed except the default area and any area named by `?a=`.**
  Reason: a grouped overview has to be scannable in one screen; deep links must
  still land open.
- **`?a=<slug>` is the deep link into an area**, following the `?p=` / `?d=`
  convention of the other screens — no route of its own, since the user ruled out a
  detail view.
- **A palette search hit whose path starts with `areas/` navigates to
  `#/notes?a=<slug>` instead of opening the external editor.** Reason: AC 10 needs a
  real in-app path from search to the note; every other hit keeps today's behaviour.
- **Area todos get `Todo.area` and a `todos:list` filter, and `todos:create` with an
  `area` writes into that area's todo section.** Reason: `todos:toggle`/`update` are
  already path-based and work unchanged, but a project-less created todo currently
  lands in the journal.
- **`todos:reorder` stays refused for area todos.** Reason: no ordering handle is
  planned on this screen, so the existing rejection is correct, not a gap.
- **The rule sentence is permanent screen furniture, not empty-state text** — it
  sits under the screen title. Reason: it separates notes from the journal even once
  the screen is full.
- **The composer is always visible at the top of the screen with an optional target
  select that defaults to "no target".** Reason: AC 2 forbids asking for structure
  first; the header's single primary action stays "New area".
- **Moving a note = remove the block from the source, append it to the target, both
  hash-guarded**, using `removeBlock` from `core/capture/filing.ts`; if the second
  write fails the first is rolled back. Reason: no `store.move` semantics fit a
  block inside a file, and a half-moved note would lose content.
- **The rail entry takes the free digit `4`.** Reason: the wholesale rail renumber
  is assigned to `/refine 006` by [ROADMAP.md](../ROADMAP.md) — this story must not
  pre-empt it.

## Plan

The vault half of this already exists: `docTypeFromPath` returns `'area'`,
`areaPath(slug)` is there, `areaCandidates`/`filingAction('area', …)` write dated
blocks, and area checkboxes are already in `index.todos()`. What is missing is a
derivation, an IPC surface, and a screen.

1. **Core read path.** New `src/core/areas/sections.ts` (heading resolution, journal
   pattern) and `src/core/index/areas.ts` (`deriveAreas`, `parseAreaNotes`). Extend
   `index/types.ts` (`VaultIndex.areas`, `emptyIndex`), `index/build.ts`
   (`deriveIndex`), `index/persist.ts`, `index/service.ts` (`areas()`), and
   `shared/types/domain.ts` (`Area`, `AreaNote`).
2. **Core todo scoping.** `Todo.area` in `index/todos.ts` (`areaOfPath`, mirroring
   `projectOfPath`); verify in `core/overview/dashboard.ts` that area todos count.
3. **Core write helpers.** `src/core/areas/write.ts`: `newAreaDocument(title, lang)`,
   `areaNoteBlock` (delegating to `filingBlock`), `moveNoteBlock` — pure, no store.
4. **IPC.** `shared/ipc.ts` + `IPC_CHANNELS`: `areas:list`, `areas:notes`,
   `areas:createNote`, `areas:create`, `areas:moveNote`. Handlers in new
   `src/main/ipc/areas.ts` (mirror `main/ipc/projects.ts`: `store()`,
   `expectedHash`, `settle`, `fail`), registered in `register-all.ts`; area branch in
   `main/ipc/todos.ts`.
5. **Renderer plumbing.** `lib/api.ts` namespace `areas`, `lib/queries/areas.ts`,
   keys + `VAULT_DEPENDENT_ROOTS` in `lib/queries/keys.ts`, mocks in
   `lib/mock-bridge.ts` / `mock-fixtures.ts`.
6. **Screen.** `lib/screens.ts` entry (`notes`, `/notes`, `sticky-note`, hotkey `4`),
   route in `App.tsx`, `screens/notes/{NotesScreen,NoteComposer,AreaSection}.tsx` +
   `notes.css`, i18n pair `de-notes.ts`/`en-notes.ts`, then the two dialogs
   (new area, move note) and the palette hit routing.
7. **Acceptance.** Seed already writes two areas with `## Notizen`; add `notes` to
   `scripts/lib/screens.mjs`, document the area file in `docs/VAULT-FORMAT.md`, and
   cover round-trip + conflict + no-model in tests.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Nothing in this story calls an LLM channel.

## Deliverables

**D1 — Areas derived from the vault**
Files: `src/core/areas/sections.ts` (new), `src/core/areas/index.ts` (new),
`src/core/index/areas.ts` (new), `src/core/index/types.ts`, `src/core/index/build.ts`,
`src/core/index/persist.ts`, `src/core/index/service.ts`,
`src/shared/types/domain.ts`. Mirror: `src/core/index/modules.ts` (derivation shape),
`src/core/journal/sections.ts` (heading aliases), `src/core/index/projects.ts`
(counts).
Tests: `tests/core/index/areas.test.ts`, `tests/core/areas/sections.test.ts`; add a
`## Notizen` section with two dated entries to `tests/fixtures/vault/areas/gesundheit.md`
and the doc map in `tests/core/index/fixtures.ts`.
Acceptance: `IndexService.areas()` returns `Area[]` with slug, title, path, hash,
scope, `noteCount`, `openTodoCount` and `notes: AreaNote[]` sorted newest first;
`Notizen` and `Notes` headings both parse; entries without a parsable date survive at
the end; the persisted index round-trips areas; `npm run typecheck` green. → AC 1, 4

**D2 — Area todos are addressable and count on Today**
Files: `src/core/index/todos.ts`, `src/shared/types/domain.ts`,
`src/core/index/build.ts` (wire `area` through), `src/core/overview/dashboard.ts` (only
if a check shows area todos are excluded).
Tests: `tests/core/index/todos.test.ts`, `tests/core/overview/dashboard.test.ts`.
Acceptance: a checkbox in `areas/gesundheit.md` yields `todo.area === 'gesundheit'`,
`project === null`, scope from frontmatter/tag per VAULT-FORMAT; the dashboard's open
todo list and counts include it. → AC 5

**D3 — Pure write helpers for areas**
Files: `src/core/areas/write.ts` (new), `src/core/areas/index.ts`.
Mirror: `src/core/capture/filing.ts` (`filingBlock`, `removeBlock`).
Tests: `tests/core/areas/write.test.ts`.
Acceptance: `newAreaDocument(title, docLanguage)` produces frontmatter `type: area`
plus empty notes/todos sections with slugified path via `areaPath`; `areaNoteBlock`
output is byte-identical to `filingBlock` for the same text and date; `moveNoteBlock`
removes exactly the one block and leaves the rest of the body untouched. → AC 2, 3, 4

**D4 — IPC: read, write, create, move (hash-guarded)**
Files: `src/shared/ipc.ts`, `src/main/ipc/areas.ts` (new),
`src/main/ipc/register-all.ts`, `src/main/contracts.ts` (if `VaultStoreLike` needs
`append`/`create`).
Mirror: `src/main/ipc/projects.ts`.
Tests: `tests/main/areas-ipc.test.ts` — round trip (write a note, edit the file
externally, re-read: nothing lost), conflict (stale `expectedHash` → `conflict`,
file unchanged), `areas:createNote` without a target creating `areas/notes.md` on
first use and appending to it on second use, `areas:create` refusing a duplicate slug,
`areas:moveNote` leaving no copy behind and rolling back if the append fails.
Acceptance: the five channels exist in `IpcRoutes` **and** `IPC_CHANNELS`,
`tests/main/ipc-coverage.test.ts` stays green, every write carries `expectedHash`,
and the index settles after each write. → AC 2, 3, 4, 6, 7

**D5 — `todos:list` filter and `todos:create` for areas**
Files: `src/main/ipc/todos.ts`, `src/shared/ipc.ts` (`todos:list` req gains `area`,
`todos:create` req gains `area`).
Tests: `tests/main/todos-ipc.test.ts` (or the existing todo IPC test file).
Acceptance: `todos:list({ area })` returns only that area's todos; `todos:create`
with an `area` writes the checkbox into that area's todo section, not the journal;
toggle and update on an area todo work unchanged and return the new hash;
`todos:reorder` keeps refusing them with a clear message. → AC 5

**D6 — Renderer plumbing and invalidation**
Files: `src/renderer/lib/api.ts`, `src/renderer/lib/queries/areas.ts` (new),
`src/renderer/lib/queries/keys.ts`, `src/renderer/lib/mock-bridge.ts`,
`src/renderer/lib/mock-fixtures.ts`.
Mirror: `src/renderer/lib/queries/todos.ts` (hooks + `refresh(client)`).
Tests: `tests/renderer/queries.test.ts` if it exists, otherwise covered by D8's screen
test.
Acceptance: `useAreas()`/`useAreaNotes(slug)` gate on `useVaultReady()`;
`useAreaMutations()` invalidates the areas, todos and dashboard roots; the `areas`
root is in `VAULT_DEPENDENT_ROOTS` so `event:vault-changed` refreshes the screen. → AC 6

**D7 — i18n for the Notes screen**
Files: `src/renderer/i18n/de-notes.ts` (new), `src/renderer/i18n/en-notes.ts` (new),
`src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts`,
`tests/renderer/i18n.test.ts` (add `notes` to the screen list).
Acceptance: `rail.notes`, `screen.notes.overline|title|empty.title|empty.body|empty.action`,
the rule sentence, composer, per-area empty text, dialog and error strings exist in
both languages; sentence case, no emoji; the parity test is green. → AC 8

**D8 — The Notes screen**
Files: `src/renderer/lib/screens.ts`, `src/renderer/App.tsx`,
`src/renderer/screens/notes/NotesScreen.tsx` (new),
`src/renderer/screens/notes/NoteComposer.tsx` (new),
`src/renderer/screens/notes/AreaSection.tsx` (new),
`src/renderer/styles/app/notes.css` (new), `src/renderer/index.css`.
Mirror: `src/renderer/screens/projects/ProjectList.tsx` (collapsible section
pattern), `ProjectOverviewTab.tsx` (`TodoList` wiring), `components/EmptyState.tsx`,
`components/ScreenHeader.tsx`.
Tests: `tests/renderer/notes.test.tsx` — renders areas from the mock bridge, expands a
section, saves a note without touching the target select, no axe violation, and no LLM
channel is invoked.
Acceptance: rail entry "Notes"/"Notizen" with hotkey `4` reaches `#/notes`; areas as
collapsible sections, entries newest first, area todos via the shared `TodoList`
(toggle + inline edit); composer saves with the button and `Ctrl+Enter`; the rule
sentence is visible under the title; the empty state names what belongs in here and
offers the first step; `?a=<slug>` opens that section; gs tokens only, every string
through `t()`. → AC 1, 2, 5, 8, 9

**D9 — New area and move a note**
Files: `src/renderer/screens/notes/NewAreaDialog.tsx` (new),
`src/renderer/screens/notes/MoveNoteDialog.tsx` (new),
`src/renderer/screens/notes/NotesScreen.tsx`, `src/renderer/screens/notes/AreaSection.tsx`,
`src/renderer/i18n/de-notes.ts`, `src/renderer/i18n/en-notes.ts`.
Mirror: `src/renderer/screens/projects/NewProjectDialog.tsx`.
Tests: `tests/renderer/notes.test.tsx` (extend).
Acceptance: the header's primary action creates an area (title → slug preview,
duplicate refused with a readable message, new section appears); every note row has a
"move to area" action listing the other areas; a `conflict` from either write surfaces
as a toast that says the file changed, and the note stays visible. → AC 3, 7

**D10 — Search and citation reach a note**
Files: `src/renderer/components/CommandPalette.tsx`,
`src/renderer/lib/queries/keys.ts` (only if a helper lands there).
Tests: `tests/core/index/search.test.ts` (a note in an area is found),
`tests/renderer/palette.test.tsx` or `notes.test.tsx` (an `areas/…` hit navigates to
`#/notes?a=<slug>`).
Acceptance: searching a phrase that only exists in an area note returns that file;
selecting the hit lands on the Notes screen with the area open; the citation panel
already resolves any path and is verified once for an area file. → AC 10

**D11 — Acceptance surface and docs**
Files: `scripts/lib/screens.mjs` (add `notes`; `checkScreenList()` compares it with
`screens.ts`), `scripts/seed/projects.mjs` (only if the seeded areas need a third one
without notes, for the per-area empty state), `docs/VAULT-FORMAT.md` (an "Area
(`areas/<slug>.md`)" block with frontmatter, notes and todos sections),
`docs/systems/navigation.md` (tick Notes off in the target picture if it tracks
state).
Acceptance: `npm run seed && npm run shot` produces a `notes` screenshot, wide and
narrow, without a Playwright error; `npm run verify` green. → acceptance for AC 1-10

## Model Hints

- `D1 → deliverable-hard` — extending `VaultIndex` plus `persist.ts` touches every
  index consumer, and the folded German/English heading resolution is the subtle part
  that silently drops entries when it is wrong.
- `D4 → deliverable-hard` — the story's only new write path into the user's files:
  create-on-first-use, hash guard, and a two-step move that must roll back rather
  than lose a note.
- All other deliverables → default.
- `Review: → story-review-hard` — a new write path into user files plus ten
  acceptance criteria spread over three layers; a silently uncovered one here is the
  expensive failure.

## Test Plan (manual acceptance)

Prerequisite: `npm run seed`, then start the app on the demo vault
(`.demo-vault/`). No model configured — leave the LLM settings empty on purpose.

1. **Rail and screen.** Press `4` (or click "Notizen"). The screen shows the seeded
   areas as collapsible sections with their counts, and the sentence "Tagebuch ist
   Rückblick auf den Tag, eine Notiz ist ein Gedanke, der für sich steht." under the
   title. → AC 1, 9
2. **Entries.** Expand "Gesundheit": the dated entries stand newest first, the todos
   below them. → AC 1
3. **Write without a target.** Type into the composer, do not touch the target
   select, save with `Ctrl+Enter`. The note appears under a section "Notizen"; open
   `.demo-vault/areas/notes.md` in an editor — the file exists, `type: area`, and the
   text sits under `### <today>`. → AC 2
4. **Same format as filing.** Capture a dump (`Ctrl+Shift+Space`), file it into the
   area "Gesundheit", then compare the two blocks in the editor: same heading level,
   same date format, same blank lines. → AC 4
5. **Todos.** Check off an open todo in an area, then edit its text inline. Go to
   Today: the todo tiles have changed by one. → AC 5
6. **External edit.** With the app running, add `### <today>` plus a line under
   `## Notizen` in `.demo-vault/areas/kunden-und-team.md` from an editor and save.
   Within a few seconds the entry appears on the Notes screen without a restart. → AC 6
7. **Conflict.** Expand an area, then change the same file in the editor and save.
   Now move one of its notes into another area in the app: a message says the file
   changed; the editor's version is intact. Reload (`Ctrl+R`) and repeat the move —
   it works. → AC 7
8. **Create an area and move.** Create the area "Haus" via the header action, then
   move a note from "Gesundheit" into it. The note is gone on one side, present on the
   other, exactly once. → AC 3
9. **Empty state.** Open the freshly created "Haus" — it says what belongs in here and
   offers the first step, rather than being blank. → AC 8
10. **Search.** `Ctrl+K`, search a phrase that only appears in an area note. The hit
    leads to the Notes screen with that area open. Then ask a question in the Ask
    overlay whose answer needs that note and open the citation — it shows the spot in
    the area file. (Without a model, step 10's second half is skipped and the search
    half is what counts.) → AC 10
11. **Both languages.** Switch the UI language in the settings to English and walk
    over the screen: no German string, label "Notes". → AC 8, 9

## Done

### Summary

Built areas end to end: a core read path (`Area`/`AreaNote` derivation, tolerant
`Notizen`/`Notes` heading resolution), pure write helpers reusing the filing path's own
`filingBlock`/`removeBlock`, five hash-guarded IPC channels (`areas:list|notes|createNote|
create|moveNote`, the two-step move rolling back on a failed target write), area-scoped
todos (`Todo.area`, `todos:list`/`todos:create` filters), and a new **Notes** rail screen
(hotkey `4`) with an always-visible composer (no target required), collapsible per-area
sections, the shared `TodoList`, a "new area" and a "move note" dialog, and in-app routing
from search hits and citations into `#/notes?a=<slug>`. Seed gained a third, notes-free
area (`areas/finanzen.md`) to exercise the per-area empty state; `docs/VAULT-FORMAT.md`
documents the Area file shape.

### Commit message

005: notes — a home for the areas

### Decisions

- **Fixed a pre-existing repo bug found while building D1**: `.gitignore`'s bare `vault/`
  pattern silently excluded `tests/core/vault/` (10 test files) and `tests/fixtures/vault/`
  (15 fixture files, including the physical area fixture this story's tests depend on) from
  git entirely, on every machine, since before this story. Added narrow negations plus a
  `.gitattributes` (`eol=lf`) for both paths — needed because this Windows machine's
  `core.autocrlf=true` had already re-introduced CRLF into the newly-tracked files, which
  broke real test logic (frontmatter/section-heading regexes anchored on bare `\n`) across
  ~16 unrelated core suites (journal, wiki, capture, dashboard, gardener). Normalized back to
  LF; `.gitattributes` prevents recurrence for these two paths specifically.
- **The review (story-review-hard, one cycle) found two blocking items, both fixed and
  re-verified before closing:**
  1. `AreaSection.tsx`'s move-note flow only surfaced a `conflict` (as a toast); every other
     error code (target area gone, note no longer at that line, an unreachable store) failed
     completely silently — the dialog just sat there. Fixed: `MoveNoteDialog` gained an
     `error` prop rendering the same inline `ErrorState` pattern `NewAreaDialog`/`NotesScreen`
     already use for their own non-conflict errors; `conflict` still stays toast-only. Covered
     by a new test (`tests/renderer/notes.test.tsx`, "zeigt bei einem Nicht-Konflikt-Fehler
     eine Karte im Dialog, nicht nur Stille").
  2. `npm run verify` was not actually reproducible on a fresh clone: six files under the
     newly-tracked `tests/core/vault/` failed `prettier --check` for genuine formatting
     reasons (not the CRLF artifact above — these were never linted before because they were
     invisible to tooling while gitignored). Ran `prettier --write` on exactly those six files
     (formatting only, no logic change) and re-verified lint/typecheck/tests/build all stay
     green.
- **Known, pre-existing, out-of-scope limitation surfaced by the review, not fixed here**:
  `src/main/ipc/capture-proposal.ts`/`core/capture/actions.ts` hardcode the German
  `SECTION_NOTES` ("Notizen") as the filing section for every target regardless of the
  vault's document language — this affects projects exactly the same way it affects areas,
  predates this story, and fixing it is a cross-cutting change to the whole filing system,
  not an areas-specific one. For a `documents: 'en'` vault, a dump filed via the classify/dump
  path into an area that already has an English "## Notes" heading would create a second,
  German "## Notizen" section instead of tolerantly matching the existing one (the tolerant
  match this story built, `areaSectionIn`, is only used by the areas-specific write path in
  `src/core/areas/write.ts` and the `areas:*`/`todos:*` handlers — `capture-proposal.ts`'s
  general filing path was never changed to use it, on purpose, to keep this story's diff
  scoped to areas). Worth its own story if `documents: 'en'` vaults become common.
- **`.gitignore`/`.gitattributes` are the only files touched outside the story's own plan** —
  both explained above, both necessary for the story's own new tests to be trustworthy and
  reproducible.

### Verification

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` — all green.
- `npm test` — 1921/1922 passing. The one failure (`tests/core/wiki/module.test.ts`, a
  template/doc-drift check between `MODULE_SCHEMA_TEMPLATE` and `docs/MODULE-SCHEMA.md`) is
  pre-existing, unrelated to this story (no file it touches was changed here), present since
  commit `e8959d1`.
- Mandatory tests present and green: file round-trip (`tests/main/areas-ipc.test.ts`, write →
  external edit → re-read), conflict (stale `expectedHash` → `conflict`, file byte-identical
  afterward, same file plus `tests/main/ipc/area-note.test.ts` for the move's rollback), "no
  model configured" (`tests/renderer/notes.test.tsx`'s no-LLM-channel test), "answers without
  evidence" doesn't apply here (no LLM-shaped feature on this screen at all — by design).
- Live smoke (P2): `npm run seed && npm run shot` produced `04-notes.png` (wide) and
  `notes-narrow.png` (1152px) with "Keine Konsolenfehler" — visually confirmed the rail entry,
  rule sentence, composer, three seeded areas (two with notes, one empty), and no layout
  overflow at narrow width.
- Code review: `story-review-hard`, one cycle. Verdict FAIL → two blocking items fixed as
  described above → re-verified all green. Not re-reviewed by a second fresh agent after the
  fix (the fixes were small, mechanical, and independently verified via the new/existing
  tests, typecheck, lint, and a full suite run) — flagged here for transparency rather than
  silently treated as a second passed review.
- Open points: none blocking. The `capture-proposal.ts` language-hardcoding limitation above
  is deliberately left for a future story.
