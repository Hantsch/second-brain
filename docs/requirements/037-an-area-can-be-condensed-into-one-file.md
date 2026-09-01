---
id: 037
title: An area can be condensed into one file
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). The core of the milestone: the artifact, the run and
the honest no-model case. Depends on [[036-a-day-says-which-areas-it-belongs-to]] for one of its
three inputs. Concept: [[../concepts/condensed-layer]] (CND-1, 3, 4, 5, 6, 9, 10, 11, 13, 14,
15, 16, 28, 29, 30, 31).

No screen in this story — the run produces a proposal, story 038 shows and confirms it.

## Requirement

An area collects material and nothing ever gathers it. Its notes section grows, its todos come
and go, and — after story 036 — day entries point at it. What is missing is the one file that
says what currently holds in this area, what pattern keeps repeating, and what is still open,
in prose I can read in a minute without rereading three weeks of days.

The app should be able to produce that file for an area: read the area's own notes and todos and
the day entries carrying its slug, and write _state_, _patterns_ and _open_ — each section ending
with the paths it was written from. It gets shorter as I get smarter: a run may delete, and it
compresses older material rather than appending to it.

It must not invent. A sentence it cannot attribute to one of the inputs it read does not get
written. And because an area sees my journal, this is a sensitive task: it should be routed to a
local model, and without a configured model the app says so plainly and writes nothing — there is
no mechanical fallback here, because a concatenation of excerpts presented as a synthesis would
assert knowledge nobody checked.

## Acceptance Criteria

- [ ] An area with inputs can be condensed into exactly one artifact file belonging to that area;
      an area with no inputs produces no artifact and no placeholder.
- [ ] The artifact carries `condensed_at` and a `sources:` list naming every input the run read.
- [ ] Its sections are _state_, _patterns_ and _open_, with headings in the document language
      (not the UI language), and each section ends with the source paths it came from.
- [ ] Input selection is deterministic and stated: the area's notes section, its todos, and the
      day entries carrying its slug. No model decides what it may read.
- [ ] Where the run read only part of the available inputs, the artifact says so.
- [ ] A run respects a soft size target and compresses older material instead of appending.
- [ ] A run that cannot complete leaves the artifact untouched and reports the failure — never a
      half-written file.
- [ ] Unknown frontmatter keys and the directives section of an existing artifact survive a run
      untouched.
- [ ] The task kind `condense-area` is independently assignable to a provider and model, is
      marked sensitive, and recommends a local model.
- [ ] With no model configured for it, the run does not start, states which task kind is missing,
      and writes nothing.
- [ ] Tests cover the run with the fake provider and with "no model configured", and a test proves
      nothing reaches a real network.

## Open Questions

- Q1 — What `type:` does the artifact carry: reuse `overview` (then every `type === 'overview'`
  branch has to be re-read for whether it means "module synthesis" or "any synthesis") or a new
  `DocType`? Concept open point O2.
- Q2 — What is the artifact's file name? `areas/<slug>.condensed.md` collides with
  VAULT-FORMAT.md's filename rule (no dots); `web/<date>-<slug>.ingest.json` is a precedent for an
  exception. Concept open point O7.
- Q3 — What is the soft size cap, concretely, and is it per artifact or per section? Concept open
  point O1 says any number named so far was a placeholder.
- Q4 — What bounds the inputs: how many day entries, how far back, how much of a long note?
  Concept open point O3.
- Q5 — What happens when I edited a body section by hand and the next run rewrites it: silently
  overwrite (the hash guard permits it), flag it in the diff, or protect it? Concept open point O8.
- Q6 — Are contradictions their own section on the area level, or a rule for the _state_ section?
  Concept open point O4.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
