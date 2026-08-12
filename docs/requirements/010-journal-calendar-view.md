---
id: 010
title: Journal — a calendar on top of the days
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I want to see my writing as a month, not only as a list. A calendar above the day
list: which days have an entry, which do not, where the holes are — and I can click a
day to open it and browse through months.

The list is good at "the last few days". It is bad at "how did June look", at finding a
day I only remember by its position in the month, and at showing a pattern. The data is
already there — one file per day, derived into `JournalDay` — nothing new has to be
recorded.

The calendar is a **navigation control**, not a second journal screen: it selects the
day, the entry below it stays the place where I read and write.

Related: [009](009-journal-open-days-filter.md) defines "finished / not finished". The
calendar shows that state as a marker, so an unfinished day is visible in the month
without turning on a filter first.

## Acceptance Criteria

- [ ] A month calendar sits above the day list, showing the month of the selected day.
- [ ] Every day cell states whether an entry exists — the difference between "written"
      and "not written" is legible without hovering.
- [ ] Clicking a day opens it, exactly like a click in the list, and updates
      `#/journal?d=…`.
- [ ] Today is marked, and it is marked differently from "selected".
- [ ] I can page to the previous and next month, and get back to today in one step.
- [ ] Months without a single entry are reachable and honestly empty, not skipped.
- [ ] A day's state is visible beyond "exists": at least mood (the dot the list already
      uses) and whether the day is unfinished (from [009](009-journal-open-days-filter.md)).
- [ ] Keyboard: the calendar is reachable and operable by keyboard, and the existing
      arrow-key day switching keeps working unchanged.
- [ ] A future day is not offered as if it were writable history; backfilling a past
      day works.
- [ ] Reading a month does not read every file of that month — it goes through the
      derived days, like the list does.
- [ ] External changes show up: a day added in Obsidian appears in the calendar.
- [ ] Works with no model configured.
- [ ] Weekday and month names come from the UI language via `Intl`, and every label
      goes through `t()`, in `de` and `en`.

## Open Questions

- **Month or a rolling heatmap?** A month grid answers "what did June look like"; a
  12-month contribution-graph strip answers "am I keeping this up" and would overlap
  with the existing streak tile. A month grid is the thing I actually asked for.
- Does the calendar **replace** the day list, or sit above it? Above means two
  navigation controls for the same thing in one column — possibly one too many.
  Replacing loses the excerpt and word count, which is what makes the list scannable.
- Can it be collapsed? If it is always open it eats vertical space on the screen where
  the writing field should dominate.
- What happens on a cell for a day with **no** entry — does clicking it create the day
  file immediately, or open an empty "write it now" state that only writes when I
  actually type? The second one, presumably: the vault should not fill up with empty
  days from browsing.
- How many markers can a cell carry before it becomes noise? Entry / mood / unfinished
  / conversation is four. Two is probably the limit.

## Plan

<Filled by `/ai-scrum:refine 010`.>

## Deliverables

<Filled by `/ai-scrum:refine 010`.>

## Model Hints

<Filled by `/ai-scrum:refine 010`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 010`.>

## Done

<Filled by `/ai-scrum:build 010`.>
