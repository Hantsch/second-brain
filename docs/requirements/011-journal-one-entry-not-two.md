---
id: 011
title: Journal — one entry instead of day and conversation
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The split between "Day" and "Conversation" does not match how I use this. For me it is
**one** thing: I write my day. Right now the screen asks me to decide first _where_ I
am writing — into the day text, or into the talk — and the two are separate tabs with
separate fields, separate save behaviour, and separate sections in the file.

The way I actually think about it: there is one field, I write into it, and the
**stance** decides what happens next.

- **Listen** — it is simply filed. No answer, no advice. What I wrote is the entry.
- **Tips** — it gives me feedback on the day, concrete and small.
- **Analyse** — it helps me understand a problem and it builds me up emotionally,
  rather than reporting patterns at me.

So the stance stops being "which conversation am I having" and becomes "what should the
app do with what I just wrote". Writing is always the same act.

This supersedes the line in [concepts/navigation.md](../concepts/navigation.md) that
says the journal stays untouched: the journal's inner structure changes here, its place
in the rail does not.

**What must not break:** what I wrote is written. My words go into the file before any
model is asked, and nothing the app generates ever overwrites them
([CONCEPT.md](../CONCEPT.md), guardrail 2). The file stays the truth, and it stays
readable in Obsidian.

## Acceptance Criteria

- [ ] One writing surface per day. I do not choose a target before writing — no "Day"
      vs "Conversation" decision.
- [ ] The stance is picked next to the field (listen / tips / analyse), switchable per
      entry, with the default coming from the journal settings as it does today.
- [ ] In "listen" nothing is generated at all. The entry is filed and that is the whole
      interaction — and this works with no model configured, without an error and
      without a dead state.
- [ ] "Tips" responds to the day I just wrote with concrete, small steps.
- [ ] "Analyse" helps me understand the problem and is emotionally supportive; it stays
      grounded in what is actually in my entries and does not invent history.
- [ ] What I wrote is always distinguishable from what the app wrote — in the UI and in
      the file. No answer is ever mixed into my own prose.
- [ ] My text reaches the file before the model is called. Model failure, abort, or app
      crash never loses a sentence.
- [ ] Existing day files keep working: days that already have both a `## Day` and a
      `## Conversation` section render correctly and stay editable. Nothing is migrated
      behind my back.
- [ ] Reading a day in Obsidian still makes sense: the sections are recognisable, and
      the format is documented in [VAULT-FORMAT.md](../VAULT-FORMAT.md).
- [ ] Editing the day's prose afterwards still works, still hash-guarded — a stale hash
      yields `conflict`, not an overwrite.
- [ ] The day close-out still finds what it reads today, and still does not turn the
      app's own sentences into todos.
- [ ] Citations and deep links into a day (`#/journal?d=…`) keep landing.
- [ ] Every label goes through `t()`, in `de` and `en`; sentence case, no emoji.

## Open Questions

- **Does the file format change, or only the screen?** Cheapest: keep `## Day` and
  `## Conversation` in the file and merge only the surface — my prose goes to `Day`,
  an answer goes to `Conversation`. Honest to what I described: one chronological
  stream of entries with the app's answers interleaved, which is a real format change
  and a migration question for existing days. My instinct is the second, but the first
  costs nothing.
- Where does a response **appear** if there is one field — inline under the paragraph
  it answers, or as a column beside the entry?
- Can I write several times a day (morning, evening) as separate entries, or is the day
  one growing text? Several entries is what "I write my day" actually looks like.
- Does the **stance stick per day**, or is it chosen per entry? If I write three times
  in one day in three different stances, what does the day look like afterwards?
- Should "tips" and "analyse" still respond immediately, or should the response be
  something I ask for after writing, so that writing never waits for a model?
- Do the mode hints in the settings need rewriting too, given that "analyse" is now
  defined by support rather than by pattern-finding?

## Plan

<Filled by `/ai-scrum:refine 011`.>

## Deliverables

<Filled by `/ai-scrum:refine 011`.>

## Model Hints

<Filled by `/ai-scrum:refine 011`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 011`.>

## Done

<Filled by `/ai-scrum:build 011`.>
