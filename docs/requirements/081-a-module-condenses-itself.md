---
id: 081
title: A module condenses itself
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

The area (M12) and project (M14) levels of the condensed layer exist; the module level does not.
Today `modules/<slug>/wiki/overview.md` is a bullet list the ingest appends to, which is exactly
the mechanism the concept retires ([concepts/condensed-layer.md](../concepts/condensed-layer.md),
CND-2). This story makes `overview.md` the module's condensed artifact, written by a
`condense-module` run the user starts in the module view, confirmed as a diff like the other two
levels.

Inputs are all wiki pages of the module except `index.md`, `log.md` and the artifact itself
(concept §11). Sections are _decided_, _open_, _contradictions_ plus the directives section, each
section ending with the source paths it was written from (concept §7, §8). Reuse the existing
machinery in `src/core/condense/` and the `condense:*` channels with their `unit` discriminator —
a third level, not a third copy.

Retiring the ingest's own writes to `overview.md` is [[082]]. Handing the condensation to the
vault agent instead of a model is [[092]].

## Acceptance Criteria

- [ ] **AC1** — The module view offers "Condense"; a `condense-module` run starts only on that
      click, never on a schedule or after an ingest.
- [ ] **AC2** — Before anything is written, the module view shows the proposed `overview.md` as a
      diff in which removals are as visible as additions.
- [ ] **AC3** — Accepting writes `wiki/overview.md` with `condensed_at`, a `sources:` list of every
      page the run read, and the sections _decided_, _open_, _contradictions_, each ending with its
      source paths; an undo copy of the previous file lies in `.secondbrain/trash/`.
- [ ] **AC4** — Accepting after `overview.md` changed on disk since the run read it reports a
      conflict and leaves the file unchanged.
- [ ] **AC5** — Rejecting requires a reason; the reason is appended to the directives section and
      nothing else in the file changes.
- [ ] **AC6** — The next run's prompt contains the directives section, and the accepted result
      keeps it and every unknown frontmatter key unchanged.
- [ ] **AC7** — Section headings follow the document language, not the UI language.
- [ ] **AC8** — Maintenance shows an informational "condensation due" finding for a module with a
      page newer than `condensed_at`, or with pages and no condensation yet; its fix opens the
      module view and writes nothing.
- [ ] **AC9** — `condense-module` is assignable to a provider and model in the Models settings like
      `condense-area` and `condense-project`.
- [ ] **AC10** — Without a model configured for `condense-module`, the module view says so, names
      the task kind, links to the setting, and writes nothing.

## Open Questions

- **Q1 — Input bound.** A module can hold hundreds of pages. Reuse the project level's bound, or a
  module-specific ceiling (and how the artifact states a partial read, CND-14)?
- **Q2 — Empty module.** CND-4 says a unit without inputs has no artifact, but module creation
  (`overviewBody()` in `src/core/wiki/module.ts`) writes an `overview.md` stub today. Keep the stub,
  or stop writing it for new modules?
- **Q3 — `log.md` line per run** (condensed-layer O5): does an accepted module condensation append
  one entry to `wiki/log.md`?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
