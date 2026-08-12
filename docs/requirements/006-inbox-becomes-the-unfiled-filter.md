---
id: 006
title: Inbox becomes the "unfiled" filter in Notes
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

"Inbox" names a container, not a job. Standing in front of it, I do not know what I
am supposed to do here, or how working with the app is meant to go. It also implies a
duty: things are *in* the inbox, so presumably they have to get *out*.

The honest model is different. A dump I never file is not a backlog item — it is a
note. So the inbox is not a place of its own: it is the **unfiled** filter on Notes
(story 005). Filing becomes an offer, not a chore.

Depends on 005 — this story needs the Notes screen to exist.

Target picture: [concepts/navigation.md](../concepts/navigation.md).

## Acceptance Criteria

- [ ] The rail entry "Inbox" is gone. Unfiled dumps are reachable as a filter on
      Notes, labelled with their count.
- [ ] The filing workspace keeps every function it has today: two columns, the
      proposal with editable text, todos, target picker, the four actions, and
      "leave it" writing `status: kept`.
- [ ] The keyboard keeps working exactly as documented in the current screen: j/k and
      arrows move, Enter into the proposal, e into the text, Ctrl+Enter files, Esc
      back to the list.
- [ ] Undo keeps working for ten seconds on every action, including "leave it".
- [ ] The selection still hangs off the path, not the position: a dump marked "stays
      put" may be followed down the list and must not jump to an unrelated dump.
- [ ] Today shows a strip "N unfiled" that leads there, and the strip is absent when
      nothing is unfiled — no permanent zero.
- [ ] The existing inbox tile on Today keeps working, or is deliberately replaced by
      the strip.
- [ ] `#/inbox` and links into it from capture, toasts, and the palette still land
      correctly.
- [ ] Without a configured model the heuristic proposal still appears, and the dump
      stays visible — nothing is lost.
- [ ] The screen says, in one sentence, that filing is optional.

## Open Questions

- Filed dumps: after filing, the dump is moved into its target. Does it disappear
  from Notes entirely, or stay visible as "filed into <project>" with a link? The
  second answers "where did that thought go?", which is one of the three questions
  the app promises to answer.
- The unfiled workspace is a two-column layout; Notes (005) may be a single stream.
  Do they share one layout, or does the filter switch the screen into the workspace?

## Plan

<Filled by `/ai-scrum:refine 006`.>

## Deliverables

<Filled by `/ai-scrum:refine 006`.>

## Model Hints

<Filled by `/ai-scrum:refine 006`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 006`.>

## Done

<Filled by `/ai-scrum:build 006`.>
