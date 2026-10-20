# Changelog

All notable changes to Gaston are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

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
