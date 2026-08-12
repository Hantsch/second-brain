---
id: 009
title: Journal — filter for days that are not finished
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The list of days is the part of the journal I actually like. What it cannot tell me is
which days are still _open_: a day I started, wrote three lines into, and never came
back to. Those are the ones I want to find — not by scrolling the whole list looking
for short entries, but by asking for them.

Today the list shows everything, newest first, with named gaps in between. Every row
looks equally finished. The day close-out exists (it pulls todos and frontmatter out
of the day), but nothing in the file or in the list records that it happened, so
"already dealt with" and "still lying around" are indistinguishable.

I want a filter on the day list: **not finished yet**. When it is on, the list shows
only those days, and it tells me how many there are. When there are none, it says so
instead of showing an empty list.

Related: [010 — calendar on top of the journal](010-journal-calendar-view.md) uses the
same "finished / not finished" state as a marker in the calendar. Whatever this story
decides, that one inherits.

## Acceptance Criteria

- [ ] The day list has a visible filter "not finished" (de: "nicht abgeschlossen"),
      off by default, and the current state is legible at a glance.
- [ ] With the filter on, the list shows only unfinished days, newest first, and names
      the count.
- [ ] Whether a day is finished is derived from the file — delete `.secondbrain/index/`
      and it still holds.
- [ ] If a day is finished it is visible on the day itself too, not only through the
      filter — I must be able to see the state of the day I have open.
- [ ] With the filter on and nothing unfinished, the list says "nothing open" rather
      than sitting blank.
- [ ] Today is reachable in every filter state — the way into the journal never
      disappears.
- [ ] The gap rows ("3 days without an entry") behave sensibly under the filter: they
      do not claim gaps that the filter created.
- [ ] Arrow-key navigation and `#/journal?d=…` keep working; the arrow keys walk the
      days the filter actually shows.
- [ ] The filter state survives leaving and re-entering the screen within a session.
- [ ] Works with no model configured — this is a filter over files, not a judgement.
- [ ] Labels go through `t()`, in `de` and `en`.

## Open Questions

- **What makes a day "finished"?** Three candidates: (a) an explicit frontmatter field
  written by the day close-out (`closed: 2026-08-12`), which needs an addition to
  [VAULT-FORMAT.md](../VAULT-FORMAT.md); (b) derived — the `## Facts` section has
  content; (c) manual — I mark the day done myself. (a) is honest and cheap but adds a
  field; (b) writes nothing but is wrong for a day where I typed a fact by hand and
  never closed out. Preference: (a), plus the ability to mark a day finished without
  running the close-out.
- Are days **without any entry** open, or only days _with_ an entry that was never
  closed? An empty day from six weeks ago is not something I want to be reminded of.
  Assumption: only days with a file count.
- Is today itself unfinished, or exempt until the day is over? Counting today makes
  the filter never empty.
- Does the count belong anywhere outside the journal — a dashboard tile, the "unfiled"
  strip on Today ([006](006-inbox-becomes-the-unfiled-filter.md))? Or does that turn a
  quiet feature into a nagging one?

## Plan

<Filled by `/ai-scrum:refine 009`.>

## Deliverables

<Filled by `/ai-scrum:refine 009`.>

## Model Hints

<Filled by `/ai-scrum:refine 009`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 009`.>

## Done

<Filled by `/ai-scrum:build 009`.>
