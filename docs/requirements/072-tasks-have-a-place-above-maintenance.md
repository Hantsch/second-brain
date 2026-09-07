---
id: 072
title: Tasks have a place above maintenance
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The user asked for it in exactly those terms (2026-09-07): "we should add a kind of queue or
task manager, best placed above maintenance." Story 071 builds the truth behind it; this story
gives it a place in the app — a rail entry directly above "Pflege" and a screen that answers
three questions at a glance: what is running, what is waiting, what just finished and how it
ended.

The screen is also where a run can be acted on: stopped, taken out of the queue before it
starts, or retried after it failed. The maintenance run's existing strip
(`src/renderer/components/RunStrip.tsx`) stays — but it reads the same source, so there is
never a strip saying one thing and a screen saying another.

## Acceptance Criteria

- [ ] **AC1** — The rail shows a tasks entry directly above the maintenance entry
      (`rail.garden`), reachable by mouse and by keyboard, in both UI languages.
- [ ] **AC2** — While at least one task is running or waiting, the entry carries a count
      badge; with nothing in flight it carries none.
- [ ] **AC3** — The screen shows three groups, each labelled: running (kind, subject,
      progress, elapsed time), waiting (with position in the queue), finished this session
      (outcome and duration).
- [ ] **AC4** — A running task can be stopped from the screen; it then appears as cancelled in
      the finished group rather than disappearing.
- [ ] **AC5** — A waiting task can be removed from the queue before it starts, and does not
      start afterwards.
- [ ] **AC6** — A failed task can be retried from the screen; the retry appears as a new task
      and the failed record stays.
- [ ] **AC7** — With nothing ever started, the screen shows an honest empty state — no
      spinner, no blank panel.
- [ ] **AC8** — The screen carries exactly one accent colour, sentence case, no emoji, and no
      raw Tailwind palette class (CLAUDE.md design system).
- [ ] **AC9** — A maintenance run started from the garden screen shows the same state in
      `RunStrip` and on this screen at the same time — one source, proven by a test, not two
      that happen to agree.

## Open Questions

- Route and label: `/tasks` with `rail.tasks` — "Aufgaben"/"Tasks"? "Aufgaben" collides with
  todos in the user's vocabulary; "Läufe"/"Runs" may read more precisely. To be decided in the
  sprint's clarification round.
- Does the badge count waiting tasks only, or running plus waiting?
- Does stopping a half-finished condensation keep a partial result (as the maintenance run
  does for finished stages), or discard it?

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
