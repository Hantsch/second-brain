---
id: 012
title: Journal — the interview, for when I do not know what to write
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The hardest part of keeping a journal is the empty field. I sit in front of "How was
your day?" and nothing comes, and then the day does not get written down at all.

I want an **interview** button. It asks me, one structured question at a time, until
the day is roughly covered — what I worked on, what came up, who I dealt with, what is
still open, how it felt. Short questions, one at a time, so I only ever have to answer
what is in front of me.

It is a **starting aid**, not the format of the journal. As soon as I am writing on my
own, I should be able to walk out of it and keep going in my own words. Everything I
answered stays — it belongs to the day like anything else I wrote.

Depends on [011](011-journal-one-entry-not-two.md): the interview writes into whatever
surface that story settles on. Refine 011 first, or this one has to guess a target.

## Acceptance Criteria

- [ ] A visible "Interview" button on the day, most prominent when the day is still
      empty — that is when I need it.
- [ ] It asks one question at a time. I answer, the next one comes. No wall of
      questions.
- [ ] It covers a day roughly: work, events, people, what is still open, how it felt.
      The coverage is a stated set, not whatever the model feels like asking.
- [ ] It ends by itself when the day is covered, and it says so. It does not keep
      asking until I close the window.
- [ ] I can leave at any point and keep writing freely, and what I answered so far is
      already in the file — leaving early loses nothing.
- [ ] I can skip a question without ending the interview.
- [ ] My answers land in the day entry as my own text, attributed to me. The questions
      are legible as the app's — my words and its words never blur.
- [ ] Every answer reaches the file before the next question is asked. Nothing is held
      in memory waiting for an end that may not come.
- [ ] **Without a model it still works**: a fixed set of questions in the document
      language, asked in order. This is the case where the heuristic fallback is
      genuinely as good as the model, and the screen says which one is running.
- [ ] Questions never assert facts about me. No "you seemed stressed yesterday" unless
      it is actually in an entry, with the entry as evidence.
- [ ] Starting the interview on a day that already has text picks up from there and
      does not ask what I have just written.
- [ ] All questions go through `t()` / the document language, in `de` and `en`;
      sentence case, no emoji, calm tone — no cheerleading.

## Open Questions

- **Fixed question set or model-driven follow-ups?** A fixed set is predictable,
  testable, and works without a model. Model-driven follow-ups are what makes it feel
  like being talked to. Probably: fixed backbone, optional follow-up per answer when a
  model is configured.
- Does it run **inline** on the day (question above the field) or as a focused overlay
  the way capture does? Inline keeps the day visible; an overlay removes the empty page
  that caused the problem.
- Is one interview per day, or can I run it again in the evening for the second half of
  the day?
- Does the interview know the day's context — projects touched, agent sessions, todos
  due — so it can ask "you worked on X, how did that go?"? That is the thing that would
  make it feel like it knows me; it is also the fastest way to make it wrong out loud.
- Do the answers get **condensed into prose** at the end, or stay as question/answer
  pairs in the file? Q&A is honest and ugly; prose reads like a journal but means the
  app rewrote my words — which guardrail 2 says it does not do unconfirmed.
- Should the interview also be the thing that fills mood and energy, instead of the
  separate pickers?
- Privacy: this is the most personal path in the app. Does it force a local model, or
  only recommend one the way `journal-chat` does?

## Plan

<Filled by `/ai-scrum:refine 012`.>

## Deliverables

<Filled by `/ai-scrum:refine 012`.>

## Model Hints

<Filled by `/ai-scrum:refine 012`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 012`.>

## Done

<Filled by `/ai-scrum:build 012`.>
