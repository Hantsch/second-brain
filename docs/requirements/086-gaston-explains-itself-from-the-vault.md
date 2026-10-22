---
id: 086
title: Gaston explains itself from the vault
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

"How does the curator work, what does a proposal look like, what is the Tasks screen for" should
be answerable by asking Gaston — with the same citations as any other question, because Ask
answers only from the vault (guardrail 3). So the help lives in the vault: one module,
`modules/<help-slug>/`, shipped and versioned by Gaston (concept §11, AGT-19 to AGT-22).

It is a normal module — visible in Knowledge, evidence for Ask, readable by the agent — but
Gaston maintains it, so gardener checks and the health score skip it. It is managed like the setup
files from [[084]]: marker, version, update on click, pages the user added left alone. It covers
every rail screen, the vault format and the agent, in English.

## Acceptance Criteria

- [ ] **AC1** — After the help module is written, `modules/<help-slug>/` exists with `module.md`,
      `AGENTS.md` and its wiki pages, and is listed in Knowledge.
- [ ] **AC2** — Asking how proposals work (fake provider) yields an answer citing a help-module page
      by path; without a model, the search hits include that page.
- [ ] **AC3** — A gardener run produces no finding for a help-module page, and the health score is
      the same with and without the help module.
- [ ] **AC4** — Each help page carries the Gaston marker and version; the Agent tab shows the help
      module as current, outdated or missing, and Update rewrites only marked pages.
- [ ] **AC5** — A page the user added to the help module is byte-identical after an update.
- [ ] **AC6** — The help module has a page for every rail screen, one for the vault format and one
      for the agent; a test against the rail's screen list fails when a screen has no page.
- [ ] **AC7** — The Agent tab's "About this" links to the agent page, which opens in Knowledge.

## Open Questions

- **Q1 — When it is written** (concept O8): with every new vault, or only on the agent setup's
  Install?
- **Q2 — Slug and collision** (concept O9): which slug, and what happens when a user module already
  has it?
- **Q3 — Keeping it true.** AC6 pins the screen list. Should a test also pin each page to a source
  of truth (as `MODULE_SCHEMA_TEMPLATE` is pinned to its doc), or is the per-screen coverage enough?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
