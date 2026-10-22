---
id: 083
title: Settings has an Agent tab
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

The vault agent ([concepts/vault-agent.md](../concepts/vault-agent.md)) needs one place in Gaston
where the user sees whether it can work at all. Settings gets a seventh tab, **Agent**, after
Customization and before About, following the existing tab pattern in `SettingsScreen.tsx`
(concept §12).

This story is the tab and its first two sections: **CLI status** (is Claude Code on this machine,
which version) and **About this** (what the agent does and does not do). Gaston does not install
the CLI; when it is absent, the tab says so and links to the official installation guide (AGT-1).
The other sections arrive with their stories: setup [[084]], protection [[085]], terminal
[[087]], last run [[089]].

The tab is never a dead screen (guardrail 1): every state has its sentence.

## Acceptance Criteria

- [ ] **AC1** — Settings shows a tab "Agent" between Customization and About, reachable via
      `#/settings?tab=agent`, labelled in `de` and `en`.
- [ ] **AC2** — With `claude` on `PATH`, the CLI status reads "installed" with the version the CLI
      reports.
- [ ] **AC3** — Without `claude` on `PATH`, the CLI status says it is not installed and offers a
      link to the official installation guide that opens in the external browser.
- [ ] **AC4** — Gaston downloads and installs nothing in either state.
- [ ] **AC5** — "About this" states in a few sentences what the agent may do (curate the wiki
      layer, write proposals, work handed-over jobs) and what it never does (read `journal/`, write
      `raw/`, be started by Gaston without a terminal).
- [ ] **AC6** — A CLI check that fails (timeout, unreadable output) shows "status unknown" with the
      reason, not "installed" and not a blank section.

## Open Questions

- **Q1 — How the version is read.** `claude --version` starts the CLI binary, though without a
  model call or credentials. Does that sit inside AGT-8 ("the only process Gaston starts is the
  user's terminal"), or must detection be a pure `PATH` lookup with the version left out?
- **Q2 — The install guide URL** — pin it at refine against the current official documentation.

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
