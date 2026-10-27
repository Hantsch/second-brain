# Changelog

All notable changes to Gaston are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

<!-- Add changes as '- ...' bullets under '### Added' / '### Changed' / '### Fixed' / '### Removed' / '### Security'. -->

### Added

- Sources: a source that waits for a model can be handed to the agent from Sources or Tasks. Tasks
  lists what the agent holds and how each job ended, with the reason when it did not finish, and
  you can withdraw an open job and hand the source over again.
- Agent tab: a Last run section shows when the agent last finished, which skill ran and what it
  left behind, and counts the proposals waiting in Maintenance. A broken report is flagged, not
  guessed at.
- Condensed layer: a module gathers itself into what is decided, what is open and where pages
  contradict, which you read as a diff before anything is written.
- Agent setup: Gaston writes the vault's setup for Claude Code, shows you the plan first, and
  leaves every file you changed alone unless you tick it.
- Imports: a new source no longer appends itself to a module's overview. Imports no longer touch it;
  it changes only when you confirm a condensation. The catalog does the bookkeeping.
- Agent tab: Settings now says whether Claude Code is on this machine and where. Gaston looks,
  points you to the install guide if it is missing, and never plays host.
- Agent tab: a Protection section reads the guard rules back from the vault's own settings file
  and tells you which ones hold. Delete one by hand and it says so, without sulking.
- Help module: installing the agent setup also writes `gaston-help`, a module in which Gaston
  explains its screens, the vault format and the agent. Pages you add there stay yours, and a
  module of your own with that name blocks the install until you rename it.
- Agent screen: the agent has its own place in the rail. One button opens plain Claude in your
  vault and says why when it cannot; below it, the commands that session knows, with the modules
  you can curate, and a pointer to Settings when the setup needs installing or updating.
- Maintenance: edits the agent proposes wait there as cards with a diff. You accept or reject each
  one, and an accepted edit can be undone.

## 0.2.0 — 2026-10-20

### Added

- Capture: dump a thought, get a filing proposal with visible reasoning, accept it, and undo it
  if you change your mind. Nothing moves until you say so.
- Search and answers: full-text search over the vault, and questions answered only from your own
  notes, each with a citation and a file path. No evidence means the answer says so.
- Journal: one entry per day, three coach stances, an interview for the days the page stays
  empty, a calendar, and a single close action that proposes what to keep and lets you correct it.
- Loose ends: a forward-looking sentence whose day has passed becomes a visible, answerable
  reminder instead of quietly rotting.
- Wiki: knowledge modules with ingest, page maintenance, a link graph, and module rename and
  delete with undo.
- Ingest: YouTube transcripts, files, PDFs, URLs and plain text become sources. A video without
  a transcript is reported as exactly that.
- Overview: projects with status and next step, todos with due dates, waiting-on, reminders with
  quiet periods, and a dashboard that answers where you left off.
- Condensed layer: areas and projects gather themselves into a summary you read as a diff
  before anything is written.
- Gardener: maintenance runs you can see, stop and continue, with findings you can act on and
  a health score that admits when it is partial.
- Claude sessions: Claude Code and Codex sessions count as work on a project.
- Work in flight: one list for condensations, day closes, imports and maintenance, with a queue
  for the model.
- Local models: a machine scan, per-task recommendations in money, guided Ollama and llama.cpp
  installs, and small models for modest hardware. The app starts and is useful with no model
  at all.
- Handoff: `npm run handoff` packages a portable build as a single ZIP with nothing of yours
  inside.
- Releases: a push to `main` publishes the installer, the portable build and the update feed
  from this changelog.
- Updates: Gaston checks for a new version once a day, quietly, and installs it only when you
  ask. About shows what changed.
- Update button: when a new version exists, one calm button in the title bar offers it. Download
  it, cancel if you like, and Gaston restarts into it only after a second click — never in the
  middle of a running task or a streaming answer.
- About: this version's release notes, what a waiting update would bring, when Gaston last
  checked, and a "Check now" button — plus links to the project and the full changelog.
