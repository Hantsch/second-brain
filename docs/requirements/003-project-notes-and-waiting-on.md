---
id: 003
title: Project notes and waiting-on, editable in place
status: draft # draft -> ready -> in-progress -> done
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

- [ ] In the project detail view I can write a note and save it. It is appended to
      the project file's notes section with its date, in the format
      [VAULT-FORMAT.md](../VAULT-FORMAT.md) prescribes — the same format the filing
      path produces, so both are indistinguishable in the file.
- [ ] A newly written note is immediately visible in the notes panel, without a
      reload and without me having to expand the panel first.
- [ ] In the project detail view I can add a waiting-on entry with who, what, since
      when, and expected by when. Only "who" is mandatory.
- [ ] A new waiting-on entry appears in the waiting list and counts towards the
      "waiting on" tile on Today and the overdue reminder, exactly like a filed one.
- [ ] Both writes go through the existing hash-guarded write path: writing against a
      stale hash fails with a conflict instead of overwriting an edit made in
      Obsidian or VS Code.
- [ ] Both writes are undoable the way the existing project actions are (toast with
      undo), and an undo does not cost content the app does not interpret.
- [ ] Both work without a configured model — nothing here needs an LLM.
- [ ] The keyboard reaches both: a key opens the note composer, consistent with the
      existing `t` for a new todo.
- [ ] Round-trip test: write a note in the app, edit the file externally, re-read —
      no data loss. Conflict test: write with a stale hash, get `conflict`.

## Open Questions

- Adding a note by hand: does it get a title/tags via the existing `title-tags`
  task when a model is configured, or is a project note deliberately plain text?
- The notes panel is collapsed by default and hidden entirely when empty. With a
  composer present, should the panel always be open, or open on first write?

## Plan

<Filled by `/ai-scrum:refine 003`.>

## Deliverables

<Filled by `/ai-scrum:refine 003`.>

## Model Hints

<Filled by `/ai-scrum:refine 003`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 003`.>

## Done

<Filled by `/ai-scrum:build 003`.>
