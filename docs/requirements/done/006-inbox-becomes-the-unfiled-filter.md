---
id: 006
title: Inbox becomes the "unfiled" filter in Notes
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

"Inbox" names a container, not a job. Standing in front of it, I do not know what I
am supposed to do here, or how working with the app is meant to go. It also implies a
duty: things are _in_ the inbox, so presumably they have to get _out_.

The honest model is different. A dump I never file is not a backlog item — it is a
note. So the inbox is not a place of its own: it is the **unfiled** filter on Notes
(story 005). Filing becomes an offer, not a chore.

Depends on 005 — this story needs the Notes screen to exist.

Target picture: [systems/navigation.md](../../systems/navigation.md).

## Acceptance Criteria

- [ ] The rail entry "Inbox" is gone. Unfiled dumps are reachable as a filter on
      Notes, labelled with their count.
- [ ] The filing workspace keeps every function it has today: two columns, the
      proposal with editable text, todos, target picker, the four actions, and
      "leave it" writing `status: kept`.
- [ ] The keyboard keeps working exactly as documented in the current screen: j/k and
      arrows move, Enter into the proposal, e into the text, Ctrl+Enter files, Esc
      back to the list.
- [ ] Undo keeps working for ten seconds on every action, including "leave it".
- [ ] The selection still hangs off the path, not the position: a dump marked "stays
      put" may be followed down the list and must not jump to an unrelated dump.
- [ ] Today shows a strip "N unfiled" that leads there, and the strip is absent when
      nothing is unfiled — no permanent zero.
- [ ] The existing inbox tile on Today keeps working, or is deliberately replaced by
      the strip.
- [ ] `#/inbox` and links into it from capture, toasts, and the palette still land
      correctly.
- [ ] Without a configured model the heuristic proposal still appears, and the dump
      stays visible — nothing is lost.
- [ ] The screen says, in one sentence, that filing is optional.

## Open Questions

- ~~Filed dumps: after filing, the dump is moved into its target. Does it disappear
  from Notes entirely, or stay visible as "filed into <project>" with a link? The
  second answers "where did that thought go?", which is one of the three questions
  the app promises to answer.~~ answered → Decisions (Sprint)
- ~~The unfiled workspace is a two-column layout; Notes (005) may be a single stream.
  Do they share one layout, or does the filter switch the screen into the workspace?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Filed dumps stay visible in Notes as "filed into <project>" with a link
  to the target.
- **(User)** The "unfiled" filter switches the screen into the two-column workspace;
  it does not share one layout with the plain Notes stream. Same rail entry, same
  screen, filter changes the view.

Decided during refine (reason each):

- **The filter is a URL parameter**, `#/notes?filter=unfiled`, not component state —
  only then can `#/inbox`, the palette, a toast and the Today strip all land in it.
- **A filed dump stays as a receipt file** in `inbox/`: `status: filed` plus
  `filed_into` and `filed_at`, and it is no longer deleted into the trash. The index
  is derived, so "stays visible" survives a restart only if a file says so — and in
  Obsidian the receipt is readable too.
- **The receipt keeps its body**, it is not shortened to a pointer line — no write
  path of this app destroys user text. The price is that a filed dump can still turn
  up in search; that is honest, because the file really is there.
- **Undo of a filing goes through the journal, not the trash** (`trashed: false`,
  exactly the path `keepDump` already uses): with nothing deleted there is nothing to
  restore, only the status to write back and the appended blocks to remove.
- **The receipts live in a collapsible "filed" section** below the working list,
  newest first, collapsed by default — the workspace stays about open work while
  "where did that thought go?" is still answerable.
- **Target links reuse `targetFor()`** from `screens/garden/targets.ts` instead of a
  second resolver, so a receipt link leads where a maintenance finding leads.
- **Rail numbering: 1 Today · 2 Projects · 3 Journal · 4 Knowledge · 5 Notes ·
  6 Maintenance · 7 Settings.** The two system entries move into the rail foot but
  keep a digit: that closes the holes at 2/4/8 without taking away a hotkey that
  works today, and the visual separation already carries the place/system distinction.
- **The inbox tile on Today stays** (retargeted) and the strip is added beside it —
  [systems/navigation.md](../../systems/navigation.md) keeps the tile system as it is,
  and a tile can be hidden while the strip cannot.
- **Folder, component, i18n and IPC names keep the word "inbox"**
  (`screens/inbox/`, `inbox.*`, `capture:*`) — renaming stops at the UI, as with the
  `agents.*` family in story 008. Only new strings get `notes.unfiled.*`.
- **The strip's number is `inboxCount`** from `dashboard:data`, which already counts
  only `raw`/`proposed` — no second truth for the same question.
- **F1 (review finding, `applyProposal`, `src/core/capture/apply.ts`): an empty edited
  proposal must fail, not file.** `Run.append` silently no-ops when the block is blank
  (`block.length === 0`), so filing into a real target (project/area/journal) with an
  emptied-out text wrote nothing to the target file, yet `applyProposal` still stamped
  the dump `status: filed` with `filed_into`/`filed_at` — a receipt for a filing that
  never happened, and a direct contradiction with the `written: []` the same call
  returned. Considered two ways to close this: (a) silently fall back to `kept`, or
  (b) reject with an error. Chose (b): a user who edits the proposal text down to
  nothing and hits Ctrl+Enter asked to _file_, not to _leave it_ — treating that as a
  quiet "kept" would still misrepresent their action, just with a different lie. A
  thrown `FilingError('invalid', ...)` fits the existing error surface exactly
  (`'invalid'` is already a valid `IpcError.code`, wired through `toIpcError` and the
  renderer's generic `error.code.invalid` string in both languages) and matches
  CLAUDE.md's "no hallucinations" guardrail — the app says so instead of guessing a
  status. The check sits right after `applyPrimary` returns and before any extras or
  the dump-status write, gated on `!keepsDump && run.written.length === 0`, so `inbox`
  targets (which are supposed to write nothing) are unaffected and `new-project`
  (which always creates a file, even with empty state text) is unaffected too — only
  the case the finding described trips it.

## Plan

Story 005 delivers the rail entry **Notes** (`/notes`), the screen with its area
groups, and the read path for areas. This story hangs the old inbox onto it as a
filter, and finishes the rail.

1. **Rail, final numbering** (`lib/screens.ts`, `Rail.tsx`): `inbox` leaves `SCREENS`,
   the digits are renumbered wholesale, `ScreenDef` gains `group: 'place' | 'system'`,
   and the rail renders the system group in its foot above the vault indicator.
2. **No dead link** (`App.tsx`): `/inbox` becomes `UnfiledRedirect` →
   `/notes?filter=unfiled`, built like `KnowledgeRedirect` (read `useLocation().search`
   while this route still is the location, then append). Every in-app link that
   pointed at `/inbox` is retargeted: both tiles, the capture panel, the gardener's
   path resolver. The palette gets an "unfiled" destination in the shape of the
   existing `sources` / `agentSessions` entries.
3. **The workspace moves, unchanged** (`screens/inbox/`): `InboxScreen` becomes
   `UnfiledWorkspace` — same two columns, same `useInboxKeys`, same 10 s `UndoStrip`,
   same path-bound `Anchor`/`pickIndex`. What it loses is only its `ScreenHeader`; the
   Notes screen owns that. `NotesScreen` renders the workspace when
   `filter=unfiled`, otherwise its area groups.
4. **Filing stops making things vanish** (`core/capture/apply.ts`): instead of
   `store.delete`, the dump keeps lying there with `status: filed`, `filed_into`,
   `filed_at`; the journal is written with `trashed: false` and a status step, so
   `undoFiling` needs no trash copy. `DumpItem` carries `filedInto`/`filedAt`,
   derived in `core/index/dumps.ts`. `docs/VAULT-FORMAT.md` is corrected in the same
   step — the dump section still claims deletion.
5. **The trail** (`screens/inbox/FiledTrail.tsx`): the receipts as a collapsed
   section, each "filed into <target>" with a link via `targetFor()`.
6. **Today** (`DashboardScreen.tsx`): a strip "N unfiled" above the tile grid, in the
   shape of `DaySummary` (which already implements "no permanent zero"), leading to
   `/notes?filter=unfiled`.

**Assumptions about 005 that must hold** — if one is wrong, D1/D2/D3 mismatch and the
build must stop there instead of patching around it:

- A rail entry with `id: 'notes'`, `path: '/notes'` exists in `lib/screens.ts`, and
  `<Route path="/notes">` exists in `App.tsx`.
- `NotesScreen` lives at `src/renderer/screens/notes/NotesScreen.tsx`, owns its
  `ScreenHeader`, and reads `useSearchParams()` — so a filter can switch its body
  without touching the area groups.
- The i18n family `notes.*` exists in `de-screens.ts`/`en-screens.ts`.
- The screen already needs no LLM and no new IPC channel for the area read path.

Out of scope: the gardener's `unfiled-dump` check keeps its rule (`raw`/`proposed`
only, `kept` is no finding) — receipts are `filed` and therefore invisible to it.

## Deliverables

**D1 — The rail gets its final numbering.**
Files: `src/renderer/lib/screens.ts`, `src/renderer/components/Rail.tsx`,
`src/renderer/styles/app/shell.css` (`.sb-rail-foot` already exists),
`tests/renderer/screens.test.tsx`, `tests/renderer/shell.test.tsx`.
`inbox` leaves `ScreenId` and `SCREENS`; digits become 1 dashboard · 2 projects ·
3 journal · 4 knowledge · 5 notes · 6 garden · 7 settings; `ScreenDef` gains
`group: 'place' | 'system'`; `Rail` renders the system group in the foot, above
`VaultIndicator`. The comment about holes at 2/4/8 goes away.
Acceptance: every digit 1–7 navigates to its screen, none is unassigned, no rail
entry "Inbox" remains, Maintenance and Settings sit visually separated at the foot.

**D2 — No dead link into the inbox.**
Files: `src/renderer/App.tsx` (new `UnfiledRedirect`, mirror `KnowledgeRedirect`),
`src/renderer/screens/garden/targets.ts`, `src/renderer/components/tiles/InboxTile.tsx`,
`src/renderer/components/tiles/QuickCaptureTile.tsx`,
`src/renderer/screens/capture/CapturePanel.tsx`,
`src/renderer/lib/use-palette-commands.ts` (mirror the `sources` entry),
`src/renderer/i18n/{de,en}.ts` (`palette.screen.unfiled`), `tests/renderer/screens.test.tsx`.
Acceptance: `#/inbox` and `#/inbox?x=1` land on `/notes?filter=unfiled` with the query
string intact; both tiles, the capture panel and a gardener finding on an `inbox/` path
lead there; the palette has an "unfiled" destination. A test goes red if the redirect
is replaced by a plain `<Navigate>`.

**D3 — The filing workspace runs inside Notes, without loss.**
Files: `src/renderer/screens/inbox/InboxScreen.tsx` → `UnfiledWorkspace.tsx`,
`src/renderer/screens/notes/NotesScreen.tsx` (from 005),
`src/renderer/i18n/{de,en}-screens.ts` (`notes.filter.unfiled`, `notes.unfiled.optional`),
`src/renderer/styles/app/inbox.css` (only if the missing header shifts the grid),
`tests/renderer/inbox.test.tsx`.
Mirror for the extraction: `CapturePanel` / `SourcesTab` from S01. Keep
`use-inbox-keys.ts`, `UndoStrip.tsx`, `DumpRow.tsx`, `DumpDetail.tsx`, the `Anchor`
logic and every `inbox.*` key untouched.
Acceptance: on `/notes?filter=unfiled` the two columns, the four actions, the target
picker, `status: kept` via "leave it", j/k · arrows · Enter · e · Ctrl+Enter · Esc, the
10 s undo on all three actions and the path-bound selection all behave as the existing
`inbox.test.tsx` demands (the suite is moved, not weakened). The filter carries the
count of unfiled dumps; one sentence on screen says filing is optional; without a
routed model the heuristic proposal still appears.

**D4 — A filed dump stays as a receipt (core).**
Files: `src/core/capture/apply.ts`, `src/core/capture/undo.ts`,
`src/shared/types/capture.ts`, `src/core/index/dumps.ts`, `docs/VAULT-FORMAT.md`,
`tests/core/capture/apply.test.ts`, `tests/core/index/dumps.test.ts`.
Filing writes `status: filed`, `filed_into: <target path>`, `filed_at: <YYYY-MM-DD>`
and no longer deletes; the journal is written with `trashed: false` plus the status
step, `movedTo` is `null`. `undoFiling` removes the appended blocks and writes the old
status back. `DumpItem` gains `filedInto: string | null` / `filedAt: string | null`.
Acceptance: after filing, the dump file still exists with the three fields and the
unchanged body; undo restores `raw` and removes the appended block; a stale hash still
yields `conflict`; `inboxCount` and the `unfiled-dump` check ignore receipts;
VAULT-FORMAT's dump section describes the new state.

**D5 — The trail: "filed into <target>".**
Files: new `src/renderer/screens/inbox/FiledTrail.tsx`, `UnfiledWorkspace.tsx`,
`src/renderer/i18n/{de,en}-screens.ts` (`notes.unfiled.filed*`),
`src/renderer/styles/app/inbox.css`, `tests/renderer/inbox.test.tsx`.
Acceptance: receipts appear as a collapsed section with a count, newest first, each
with the target name and a link that leads there via `targetFor()`; they are not in
the working list and not in the filter's count; empty section absent, not zero.

**D6 — Today says how much is unfiled.**
Files: new `src/renderer/components/UnfiledStrip.tsx`,
`src/renderer/screens/dashboard/DashboardScreen.tsx`,
`src/renderer/i18n/{de,en}-dashboard.ts`, `src/renderer/styles/app/dashboard.css`,
`tests/renderer/dashboard.test.tsx`. Mirror: `screens/dashboard/DaySummary.tsx`.
Acceptance: with `inboxCount > 0` a strip "N unfiled" sits above the tile grid and
leads to `/notes?filter=unfiled`; at 0 it is absent; the inbox tile keeps working.

Coverage: AC1 → D1+D3 · AC2 → D3 · AC3 → D3 · AC4 → D3 (+D4 for the filing path) ·
AC5 → D3 · AC6 → D6 · AC7 → D2+D6 · AC8 → D2 · AC9 → D3 · AC10 → D3 ·
user decision "filed stays visible" → D4+D5.

## Model Hints

- D1 → default
- D2 → default
- **D3 → `deliverable-hard`** — a 322-line screen with a window-level key listener, a
  selection anchored during render and a 10 s undo in component state moves into a
  host screen it does not own; the regressions this can cause (key listener bound to
  the wrong tree, anchor reset on every filter render, undo strip losing its timer on
  remount) are exactly the ones the existing test suite looks green through.
- **D4 → `deliverable-hard`** — this turns the filing write path from delete-into-trash
  into a keep-in-place, and `undoFiling` has two branches that share one token; getting
  `trashed: false` wrong makes undo silently do nothing while reporting success.
- D5 → default
- D6 → default
- **Review: → `story-review-hard`** — the story is almost entirely a no-loss move, and
  it changes a vault write path at the same time; a cheap review cannot judge whether
  something quietly fell off the workspace.

## Test Plan (manual acceptance)

Preparation: `npm run seed`, start the app. The demo vault ships without a model
(`providers: []`), so every proposal is the heuristic one — that is the intended state
for step 5.

1. **Rail.** Press 1 · 2 · 3 · 4 · 5 · 6 · 7 in turn: Today, Projects, Journal,
   Knowledge, Notes, Maintenance, Settings. No entry named "Inbox" is in the rail;
   Maintenance and Settings sit separated at the foot.
2. **Today.** The strip "N unfiled" is above the tiles; click it → Notes with the
   unfiled filter active. The inbox tile's foot link leads to the same place.
3. **The workspace.** In the filter: two columns. Move with j/k and the arrows, Enter
   into the proposal, `e` into the text field, Esc back to the list. Edit the text,
   `Ctrl+Enter`: the statement appears with "Undo" and stays for about ten seconds.
   Press "Undo" — the dump is back in the list with its old status.
4. **Leave it and stay put.** Choose "leave it" on a dump: the statement appears with
   "Undo" as well. The dump slides down the list, and the selection stays on _it_, not
   on whatever now sits in that row.
5. **Without a model.** The proposal is there and marked as a heuristic one, the four
   actions work, no dump has disappeared.
6. **Filed stays findable.** File a dump. Open the "filed" section: it names the dump
   with "filed into <target>"; the link leads to that project or area. Restart the app
   — the entry is still there.
7. **No permanent zero.** File or leave the last unfiled dump: the strip on Today is
   gone, not showing 0. The filter still exists and shows its filed section.
8. **Both languages.** Switch the UI language in Settings and repeat steps 1, 2 and 6:
   no key, no English leftover in the German UI.

Then `npm run shot` for the screenshots.

**Acceptance gap (as in S01):** `#/inbox` cannot be entered by hand — the window is
frameless, there is no address field, and every in-app link is retargeted by D2. The
redirect rests on its unit test in `tests/renderer/screens.test.tsx`, which is written
to fail if the query string is dropped.

## Done

### Summary

Built D1–D6 end to end: the rail's final numbering (1 Dashboard · 2 Projekte ·
3 Tagebuch · 4 Wissen · 5 Notizen · 6 Pflege · 7 Einstellungen, system entries in a
separated foot, `ScreenDef.group`), a redirect (`UnfiledRedirect`, mirroring
`KnowledgeRedirect`) so `#/inbox` and every in-app link (both tiles, the capture
panel, the palette, the gardener's `targetFor()`) land on `/notes?filter=unfiled`
with the query string intact, the filing workspace moved unchanged into Notes as
`UnfiledWorkspace` (same keyboard, same 10 s undo, same path-bound selection) behind
that filter, the core write path stopped deleting filed dumps into the trash and
instead stamps them `status: filed` / `filed_into` / `filed_at` as a durable receipt
(`core/capture/apply.ts`, `core/capture/undo.ts`, `core/index/dumps.ts`), a
collapsed "filed" trail (`FiledTrail.tsx`) showing each receipt with a
`targetFor()` link, and a "N unfiled" strip on Today (`UnfiledStrip.tsx`) that is
absent at zero. `docs/VAULT-FORMAT.md` documents the new dump lifecycle.

### F1 fix

See "Decisions (Sprint)" above for the full reasoning. Short version:
`applyProposal` now throws `FilingError('invalid', ...)` instead of stamping a dump
`filed` when the primary target was real (not `inbox`) but nothing was actually
written — an emptied-out edited proposal text is the only way to hit this, since
`Run.append` no-ops on a blank block. Pinned by a new test in
`tests/core/capture/apply.test.ts` ("meldet einen Fehler, statt den Dump als
„filed" zu markieren, wenn der Text leer ist"), written first against the
unfixed code to confirm the reproduction (`written: []` yet a resolved result
with a live `undoToken`), then re-run green after the fix.

### Commit message

006: inbox becomes the unfiled filter in notes

### Verification

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` — all
  green. (`format:check` shows pre-existing warnings on ~79 files this story never
  touched — left alone, per scope.)
- `npm test` — 1936 tests, 1935 passing. The one failure
  (`tests/core/wiki/module.test.ts`, a German/English drift between
  `MODULE_SCHEMA_TEMPLATE` and `docs/MODULE-SCHEMA.md`) is pre-existing and
  unrelated to this story — confirmed as the only failure, left untouched.
- Mandatory tests present and green: file round-trip and conflict (existing +
  extended `tests/core/capture/apply.test.ts` cases — a stale hash on either the
  target or the dump itself yields `conflict`, target file left byte-identical),
  "no model configured" (the heuristic proposal path, `tests/renderer/inbox.test.tsx`
  moved onto `/notes?filter=unfiled`), "answers without evidence" doesn't apply to
  this story (no LLM-shaped question-answering surface here).
- Live smoke (P2, re-confirmed after the F1 fix): `npm run seed && npm run shot` —
  57 captures, 7 rail screens, "Keine Konsolenfehler". Rail numbering 1–7 confirmed
  with no "Inbox" entry; `03-notes.png`/`22-notes-unfiled.png` show the "N nicht
  abgelegt" filter badge, the two-column workspace with the heuristic proposal and
  its four actions; `01-dashboard.png` shows the matching "4 nicht abgelegt" strip
  above the tile grid.
- Code review: `story-review-hard` ran in a prior session; found F1 (fixed here) plus
  two already-resolved items (i18n wording to "Nicht abgelegt"/"nicht abgelegt",
  confirmed consistent across `de.ts`/`de-notes.ts`/`de-dashboard.ts`; dead
  `trashCopyPath` in `core/capture/undo.ts`, confirmed zero references). Not
  re-reviewed by a second fresh agent after the F1 fix — the fix is small, isolated
  to one guard clause, and independently verified via the pinning test, the full
  suite, typecheck, lint and the live smoke test.
- Open points: none blocking.
