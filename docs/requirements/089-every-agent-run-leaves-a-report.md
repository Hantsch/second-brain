---
id: 089
title: Every agent run leaves a report
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Hash detection shows that files changed, not why. Every run of a Gaston skill ends with one report
file under `.secondbrain/`: when, which skill, wiki pages changed, proposals written, jobs finished
or failed (concept §5, AGT-17). The Agent tab's **Last run** section shows the newest report and
links to Maintenance when proposals wait ([[088]]).

## Acceptance Criteria

- [ ] **AC1** — Every installed Gaston skill ends its run by writing one report file in the reports
      folder, in the format Gaston reads; the template test pins this.
- [ ] **AC2** — The Agent tab shows the newest report: time, skill, pages changed, proposals
      written, jobs finished and failed.
- [ ] **AC3** — A report written while Gaston is open updates the tab without a restart.
- [ ] **AC4** — With no report yet, the section says no run has happened.
- [ ] **AC5** — An unreadable report shows as unreadable with its path; the tab still renders.
- [ ] **AC6** — When proposals are waiting, the section links to Maintenance.

## Open Questions

- **Q1 — Who writes the report.** The skill (the model can forget), or a CLI stop hook that writes
  it deterministically from what changed?
- **Q2 — Retention** (concept O3): keep every report, the last N, or the last N days?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
