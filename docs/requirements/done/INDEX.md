# Story history

One line per finished story, appended by `/ai-scrum:build` when it moves the file here.
Format: `- NNN — <title> · <sprint or —> · <one-sentence result>`.

The full texts live next to this file. This index is the fast overview — do not turn it into a
second roadmap.

- 001 — Agent session browser (Claude & Codex) · — · New three-level screen (sources → projects
  → sessions/transcript) reading both Claude Code and Codex CLI session trails, read-only, with
  project linking and honest empty/off/misconfigured states; passed clean-agent review after one
  fix cycle.
- 002 — Knowledge absorbs sources · S01 · Modules screen became Knowledge (`#/knowledge`), Sources
  left the rail and moved in as its input tab with an `into=` module prefill; old `#/modules` and
  `#/sources` deep links redirect with the query string intact.
- 007 — Capture and ask become actions, not places · S01 · Both left the rail and became shell
  overlays: capture from a title-bar button, ask from `Ctrl+K`'s second mode with the scope
  prefilled from the current module or project; `#/capture` and `#/ask?q=…` survive as opener
  routes and `chat:ask` gained a real `project` filter.
- 008 — Agent sessions move inside projects · S01 · The agents rail entry is gone: the
  all-sessions view moved to `#/projects/sessions` (with a query-preserving `#/agents`
  redirect) and every project detail gained an `Overview | Sessions` tab that absorbed the
  work trace and now reads both CLIs, with dismissable unmapped directories and a global
  "show empty tab" switch — both persisted through the existing `settings:setVault`.
- 005 — Notes, a home for the areas · S02 · New rail entry "Notizen"/"Notes" (hotkey `4`)
  reads `areas/` as collapsible sections with dated notes and area-scoped todos; an
  always-visible composer files a note with no target chosen (default `areas/notes.md`,
  created on first use), a header action creates an area, and a per-note action moves it
  between areas — five new hash-guarded IPC channels, the move rolling back on a failed
  target write; search hits and citations for `areas/*` route in-app to `#/notes?a=<slug>`.
- 006 — Inbox becomes the unfiled filter in Notes · S02 · The rail entry "Inbox" is gone
  (final rail numbering 1–7); `#/inbox` and every in-app link redirect to
  `/notes?filter=unfiled`, which runs the unchanged filing workspace inside Notes; filing
  no longer deletes the dump into the trash but leaves it as a `status: filed` receipt
  with `filed_into`/`filed_at`, shown in a collapsed "filed" trail; Today gained a
  "N unfiled" strip. Fixed a review finding (F1): an emptied-out edited proposal now
  raises an error instead of being stamped "filed" with nothing written.
- 003 — Project notes and waiting-on, editable in place · S03 · The project detail view
  gained a hand-typed note composer (`projects:createNote`/`removeNote`, byte-identical to
  the filing path, undoable) and an inline waiting-on composer (who required, what/since/due
  optional, via the existing `projects:patch`), both hash-guarded and reachable via `m`/`w`;
  the notes panel dropped its show/hide toggle and now always shows notes plus the composer.
  Fixed a review finding (F2): the renderer's own heading-alias resolution now agrees with
  the write path on which of "Notizen"/"Notes" wins when a file carries both.
- 004 — Where the project status and next step come from · S03 · Optional
  `status_set`/`next_step_set` frontmatter maps (`{at, by: user|suggestion|filing}`),
  stamped by the app on every write and shown as a quiet provenance line under status and
  next step, plus a "possibly outdated" badge when the project was touched since the step
  was written; the honest fallback shows no author when the file never recorded one.
- 013 — Favourite projects (star) and an order that matches how I work · S03 · New
  frontmatter field `favorite: boolean`, toggleable from the list and the detail; the
  project list's default sort now shows the last-touched project, then favourites, then
  the rest as one list (scope stacking removed, documented as this list's exception), with
  a starred stale project pulled into the current section; dashboard tiles
  (`ActiveProjectsTile`/`StaleProjectsTile`) and the filing/agent-link pickers put
  favourites first via a shared `favoritesFirst()` helper. Fixed a review finding: added
  the missing D1 test coverage for `favorite`'s derivation and patch allowlist.
- 011 — Journal: one entry instead of day and conversation · S04 · The day file's
  `## Day`/`## Conversation` split became one chronological stream (my prose plain,
  the app's replies as interleaved blockquote blocks); the screen lost its "Day"/"Talk"
  tabs for one column, one field, and a stance row (listen/tips/analyse) whose primary
  action reads "save" or "save and ask" — listen writes via `journal:append` and never
  touches the LLM gateway. Legacy `## Conversation` files stay readable and get an
  explicit, confirmed, one-way "move into the entry" fold (`journal:foldDay`), never
  automatic. Fixed two review findings: a duplicate-paragraph render when a new entry
  merged into existing prose in the stream, and a silent loss of an embedded answer
  block when editing a heading-less day.
- 012 — Journal: the interview, for when I do not know what to write · S04 · A fixed
  five-question interview (work/events/people/open/feeling) as a starting aid, run as a
  `Dialog` overlay with an optional one-question model follow-up on `journal-chat`; each
  answer writes as a question/answer pair into 011's day stream before the next question
  appears, skips write nothing, and the overlay honestly names whether it's running the
  fixed set or a routed model. Fixed four review findings after a first FAIL: a possible
  double-write on a fast double Ctrl+Enter, an unbacked "day is covered" closing claim,
  the engine line trusting client-side routing instead of the plan's own server-decided
  mode, and a missing `todosDue` follow-up context; also added D2's missing
  external-edit round-trip test and restored focus to the composer on close.
