---
id: 087
title: Open Claude in the vault from Gaston
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

The subscription is used by the user in the official CLI, never by Gaston (concept §2 non-goals,
AGT-8). What Gaston can do is save the steps: open a terminal in the vault folder with `claude`
already started and, where it fits, the right skill as the first prompt (AGT-18).

The Agent tab's **Terminal** section gets three buttons: "Open Claude in the vault", "Work the
jobs", "Curate a module" (with a module picker). The launch runs in the main process; the renderer
never spawns anything (guardrail 5). Each button is disabled with a visible reason when the CLI is
absent ([[083]]) or the setup is missing ([[084]]).

## Acceptance Criteria

- [ ] **AC1** — "Open Claude in the vault" opens a terminal window whose working directory is the
      vault folder and which runs `claude`.
- [ ] **AC2** — "Work the jobs" opens the same with the job-queue skill as the first prompt.
- [ ] **AC3** — "Curate a module" asks for a module and opens the same with the curator skill and
      that module as the first prompt.
- [ ] **AC4** — With the CLI absent or the setup missing, all three buttons are disabled and the
      section says why.
- [ ] **AC5** — The launched command contains no print/headless flag, no API key and no credential
      Gaston holds; Gaston starts the terminal and nothing else.
- [ ] **AC6** — A vault path with spaces or non-ASCII characters launches correctly.
- [ ] **AC7** — A launch that fails (no terminal found) says so in the tab, with the reason.

## Open Questions

- **Q1 — Which terminal** (concept O2): Windows Terminal with a fallback to PowerShell, or
  PowerShell only? Gaston ships for Windows only (M19) — is macOS/Linux out for this story?
- **Q2 — Concurrent runs** (concept O5): warn on "Curate a module" when Gaston has a digestion or
  condensation running in the same module, or rely on the hash guard alone?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
