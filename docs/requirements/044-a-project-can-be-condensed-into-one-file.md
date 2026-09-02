---
id: 044
title: A project can be condensed into one file
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M14 (condensed layer, project level). The core of the milestone: the artifact, the run
and the honest no-model case, mirroring [[037-an-area-can-be-condensed-into-one-file]] for the
project level. Concept: [[../concepts/condensed-layer]] (CND-1, 3, 4, 5, 6, 9, 10, 11, 13, 14,
15, 16, 17, 28, 30, 31).

No screen in this story — the run produces a proposal, story 045 shows and confirms it.

## Requirement

A project collects notes, todos, waiting-on entries, agent sessions and journal mentions, and
none of it is gathered anywhere. Coming back to a project after a break means rereading all of
it. What is missing is the one file that says what currently holds, what the next step is, who I
am waiting on, and what I have learned — in prose I can read in a minute.

The app should be able to produce that file for a project: read the project's own state, its
notes, its todos and waiting-on entries, the linked agent sessions, and the journal entries
mentioning it, and write _state_, _next step_, _waiting on_ and _learned_ — each section ending
with the paths (including agent sessions) it was written from. It gets shorter as I get smarter:
a run may delete, and it compresses older material rather than appending to it.

It must not invent. A sentence it cannot attribute to one of the inputs it read does not get
written. Without a configured model for this task, the app says so plainly and writes nothing —
there is no mechanical fallback here, because a concatenation of excerpts presented as a
synthesis would assert knowledge nobody checked.

## Acceptance Criteria

- [ ] A project with inputs can be condensed into exactly one artifact file belonging to that
      project; a project with no inputs produces no artifact and no placeholder.
- [ ] The artifact carries `condensed_at` and a `sources:` list naming every input the run read,
      including agent sessions in a stable, resolvable citation form.
- [ ] Its sections are _state_, _next step_, _waiting on_ and _learned_, with headings in the
      document language (not the UI language), and each section ends with the source paths it
      came from.
- [ ] Input selection is deterministic and covers all four inputs: the linked agent sessions,
      `project.md` plus its notes, todos plus `waiting_on`, and journal entries mentioning the
      project. No model decides what it may read.
- [ ] Where the run reads only part of the available inputs (a long transcript, a bounded
      window of mentions), the artifact states it.
- [ ] A run respects a soft size target and compresses older material instead of appending.
- [ ] A run that cannot complete leaves the artifact untouched and reports the failure — never a
      half-written file.
- [ ] Unknown frontmatter keys and the directives section of an existing artifact survive a run
      untouched.
- [ ] The task kind `condense-project` is independently assignable to a provider and model.
- [ ] With no model configured for it, the run does not start, states which task kind is
      missing, and writes nothing.
- [ ] Tests cover the run with the fake provider and with "no model configured", and a test
      proves nothing reaches a real network.

## Open Questions

- Q1 — Is `condense-project` sensitive, like `condense-area`? The concept names journal content
  as the reason the area task is sensitive (§3), but §11 also lists journal mentions among the
  project's own inputs — the concept never says explicitly whether the project task should carry
  the same `sensitive: true` and local-model recommendation.
- Q2 — Citation form for an agent session (concept open point O6): `agent:<kind>/<pathKey>` is a
  sketch, not a decision, and this is the first story that actually needs it. Is the sketch
  sufficient, and how does the UI resolve such a citation back to a session view?
- Q3 — Soft size cap for the project artifact (concept open point O1): reuse the area's ~2000
  words / ~12k characters, or does a project — potentially with more transcript volume — need its
  own number?
- Q4 — Input bounds (concept open point O3): how much of a long agent transcript, how many
  journal mentions, how far back. Numbers are undecided at the concept level.
- Q5 — Contradictions on the project level (concept open point O4): the concept's default (§7)
  treats this as a rule for the _state_ section rather than its own section, same as the area —
  confirm, or does _learned_ absorb it instead?
- Q6 — Human edit vs. rewrite on a project artifact: reuse the area's decision from story 037
  (flagged in the diff, the human decides each time, no new protection machinery) — confirm.

## Plan

<Leave empty. Filled by `/refine 044`.>

## Deliverables

<Leave empty. Filled by `/refine 044`.>

## Model Hints

<Leave empty. Filled by `/refine 044`.>

## Test Plan (manual acceptance)

<Leave empty. Filled by `/refine 044`.>

## Done

<Leave empty. Filled by `/build 044`.>
