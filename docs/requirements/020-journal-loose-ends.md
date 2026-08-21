---
id: 020
title: Journal — announced and never followed up
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-21
---

## Requirement

I write forward-looking sentences into the journal all the time. "Tomorrow is the
notary appointment." "Tomorrow is a day off." "Next week I'll finally call the tax
office." And then the day comes, I write three lines about something else, and the
notary appointment never appears again. Not because it did not happen — because
nobody asked.

Those are **loose ends**: something I announced that no later entry ever speaks to.
Today they are invisible. The day close-out pulls todos out of an entry, and
reminders nag about dates that live in frontmatter or in a checkbox — but a plain
sentence in prose ("morgen bin ich beim Notar") produces neither. It is written
down, it is gone, and the day it referred to stays blank forever.

I want the journal to notice. Not with a new duty, and not with a nagging counter —
but so that somewhere I can see: **these five things you announced and never came
back to.** And from there I want to be able to fill them in, even weeks later:
answer the question, and the answer lands on the day it belongs to.

I want it to reach me in two ways, both of which already exist as surfaces:

- **In the conversation.** When I am writing in the journal and there is a loose
  end lying around, the app may ask me about it — "how did the notary appointment
  on Tuesday go?" — instead of asking a generic question.
- **As a reminder.** The same way an overdue answer or a deadline reaches me today,
  so I see it without opening the journal.

Two things it must not become. It must not turn into a second todo list — a
checkbox with a date is already a reminder ([reminders.ts](../../src/core/overview/reminders.ts)),
and I do not want the same thing twice with different words. And it must not
invent: if it claims I announced something, it has to show me the sentence and the
day it stands in, or I stop trusting the whole list.

Related: [012](done/012-journal-interview-as-a-start.md) built the interview that asks
when the field is empty — this is the same idea pointed backwards, at days that are
already written. [009](done/009-journal-open-days-filter.md) gave the journal the notion
of an *open day*; this is about an open *topic*, which is not the same thing — a day can
be closed and still leave a loose end behind.

## Acceptance Criteria

- [ ] A loose end is **derived from the entries**: a forward-looking statement in a
      day, whose referenced day has passed, with no later entry that speaks to it.
      Delete `.secondbrain/index/` and the same loose ends come back.
- [ ] Every loose end shows **the sentence it came from, the day, and the file path**.
      No loose end without evidence I can click into (guardrail 3).
- [ ] There is **one place** where all loose ends are visible together, and it names
      how many there are. When there are none, it says so instead of sitting blank.
- [ ] From that place I can **answer** a loose end: I type what happened, and the text
      lands in the day it belongs to as my own words — retro-filling an old day is the
      normal case here, not an edge case.
- [ ] I can **dismiss** a loose end without answering it ("did not happen", "nothing to
      add"), and it stays gone. Dismissing is one click, not a form.
- [ ] A loose end **closes by itself** when a later entry clearly speaks to it — the
      list does not ask about the notary appointment I already wrote about.
- [ ] Nothing forward-looking about a **day that has not passed yet** ever appears as a
      loose end (same rule as 009: a thing only counts as open once it is over).
- [ ] It does **not duplicate the todos and reminders that already exist**: something
      that became a todo with a deadline is a todo, and shows up once, not twice.
- [ ] During journal writing, an open loose end can become **the app's question** in
      the conversation — asked as a question, never as a claim about me, and skippable
      like any other question.
- [ ] The same loose ends reach me **as reminders**, in the surface that already
      answers "what am I waiting on" — with their own source, so the UI can say *why*
      it is nagging.
- [ ] **Without a model it still works**: a heuristic fallback finds the obvious cases
      (a date or a "tomorrow/next week" phrase plus a planned event), and the surface
      says which one ran. Never a dead screen (guardrail 1).
- [ ] Detection reads journal prose, so it counts as a **sensitive task** and
      recommends a local model, like `journal-chat` and `classify-dump`
      (guardrail 6, [019b](done/019b-model-recommendations.md)).
- [ ] Answering and dismissing are **hash-guarded writes**: a stale hash yields
      `conflict` instead of overwriting what I edited in Obsidian.
- [ ] All labels and questions go through `t()` / the document language, `de` and `en`,
      sentence case, no emoji, calm tone — a loose end is a note, not an accusation.

## Open Questions

- **Where does the "one place" live?** A filter/tab inside the journal (next to the
  open-days filter from 009), a section on the dashboard, or a finding type in
  Maintenance ([014](014-maintenance-says-befund.md) already builds a finding surface with
  accept/dismiss)? All three exist; picking two of them would split the truth.
- **Where does the answer get written?** Into the announcing day, into the day the thing
  actually happened on, or into today with a back-reference? The user's wording ("so I
  can fill it in afterwards") does not decide it.
- **Where does the state live?** A loose end that is answered or dismissed must stay
  gone across an index rebuild — so it needs a mark in a file. In the announcing day's
  frontmatter, in the answering day, or in a dedicated place?
- **What is the horizon?** Does a sentence from four months ago still ask, or is there a
  point where a loose end quietly expires?
- **How specific may the model get?** Is "how did the notary appointment go?" allowed to
  name the notary appointment (quoting my own sentence back at me), or must it stay
  generic to avoid asserting anything?
- **Does a loose end survive a closed day?** 009's `closed` marks a day as finished —
  does closing a day suppress its loose ends, or are the two independent (my assumption:
  independent)?

## Plan

<Leave empty. Filled by `/refine 020`.>

## Deliverables

<Leave empty. Filled by `/refine 020`.>

## Model Hints

<Leave empty. Filled by `/refine 020`.>

## Test Plan (manual acceptance)

<Leave empty. Filled by `/refine 020`.>

## Done

<Leave empty. Filled by `/build 020`.>
