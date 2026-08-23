---
id: 030
title: The app is called Guston, everywhere
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Precondition for [[031-a-build-i-can-hand-on]] — a copy handed to someone else must not
introduce itself under two names.

## Requirement

`package.json` has said `Guston` since the first build config, but almost nothing else does. The
window is titled "Second Brain", the HTML title says "Second brain", the dashboard offers a
"Frage an das Second Brain", the journal writes its own answers under the speaker
`> **Second Brain**`, the prompts tell the model it is filing into a "persönliches Second Brain",
the OpenRouter request header says `Second Brain`, and `README.md` opens with it.

I want one name. Guston is the app; "second brain" is at most a description of what kind of app
it is, and it stops being used as a product name.

Two things are already decided and are not open questions:

- **The vault directory stays `.secondbrain/`** (user, 2026-08-23). Renaming it is a
  vault-format change with a migration path, and this story is not that. A vault written by the
  old build must open with no migration and no warning.
- **The journal speaker becomes Guston for new turns, and every existing day stays readable**
  (user, 2026-08-23). Nothing in the vault gets rewritten.

## Acceptance Criteria

- [ ] The window title, the taskbar/`setAppDetails` name, the HTML `<title>` and the About tab
      all say Guston.
- [ ] No user-visible string in the app uses "Second Brain" as the product's name any more — in
      both language catalogues.
- [ ] New journal turns are written as `> **Guston**`; days already containing
      `> **Second Brain**` still render, still parse into turns, and still fold correctly. The
      assistant-label sets in `src/core/index/journal.ts` and `src/core/journal/dialog.ts`
      recognise `guston` in addition to everything they recognise today.
- [ ] The prompts sent to models no longer name a different product than the app, and the
      OpenRouter `x-title` header says Guston.
- [ ] `README.md`, `AGENTS.md` and the `docs/` entry points name the app Guston. Where "second
      brain" is used as a generic category rather than as the product's name, it may stay — that
      is a deliberate call per occurrence, not a blanket replace.
- [ ] `.secondbrain/` is untouched everywhere: code, seed scripts, `docs/VAULT-FORMAT.md`. An
      existing vault opens unchanged.
- [ ] Seeded demo content that quotes a real external title (the YouTube source in
      `scripts/seed/`) keeps that title. The rename does not falsify sample data.
- [ ] Tests: a journal round-trip over an old-label day and a new-label day, and an i18n test
      that no catalogue carries the old product name — the same shape as the quote test story
      026 added.
- [ ] `npm run verify` green, and a screenshot run shows the new name in the title bar.

## Open Questions

- **Q1 — Guston or Gaston?** The design system is vendored as `Gaston`
  (`src/renderer/styles/gaston/`, the `gs-*` atoms, a chapter in CLAUDE.md); the app is `Guston`.
  Is that a deliberate distinction (a design system with its own name, used by the app) or is one
  of the two a typo that this story should align? Aligning them touches a directory name, an
  import path in every atom and a CLAUDE.md chapter.
- **Q2 — Does the repository name change too?** The checkout is `second-brain`, the package is
  `guston`. Renaming the folder and the remote is outside the app but inside "everywhere".
- **Q3 — What is the app's one-line description?** `package.json` still carries a German sentence
  built around the old name; the About tab and the handed-on readme in story 031 will both want
  one sentence, in a decided language.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
