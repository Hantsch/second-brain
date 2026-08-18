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
