---
sprint: S04
status: in-progress # planned | in-progress | done
branch: sprint/S04
milestone: M3 — The journal becomes one thing
---

# Sprint S04 — The journal becomes one thing

## Goal

Writing a day stops being a choice between "Day" and "Conversation" — one field, a
stance next to it (listen / tips / analyse), and an interview button for when the field
is empty. The day list gets a "not finished" filter, and a month calendar sits above it
showing entries, mood and unfinished state. At the end, the journal is legible both as
"today" and as "this month", and it never requires a model to be usable.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 011 — Journal — one entry instead of day and conversation
- [x] 012 — Journal — the interview, for when I do not know what to write
- [ ] 009 — Journal — filter for days that are not finished
- [ ] 010 — Journal — a calendar on top of the days

## Notes

**Why this order.** 011 and 012 land in the day's writing surface: 012 explicitly
depends on 011 ("the interview writes into whatever surface that story settles on"), so
011 goes first or 012 has to guess a target. 009 and 010 land in the day list: 010 reads
009's "finished" definition as a calendar marker, so 009 goes first. The two pairs are
otherwise independent — writing surface vs. list/calendar — which is why 011/012 as a
pair precedes 009/010 as a pair rather than interleaving them.

**No concept behind M3.** [systems/navigation.md](../systems/navigation.md) explicitly
left the journal untouched at the rail level; 011 supersedes only the line about the
journal's *inner* structure staying untouched. The four stories are detailed enough to
cut from directly.

**Open questions to resolve in the clarification round** (from the story files):

- 011 — does the file format change (one interleaved stream) or only the screen (keep
  `## Day` / `## Conversation`, merge only the surface)? Where does a response appear
  relative to the paragraph it answers? Multiple entries per day or one growing text?
  Does the stance stick per day or per entry? Do tips/analyse respond immediately or on
  request?
- 012 — fixed question set or model-driven follow-ups? Inline on the day or an overlay?
  One interview per day or repeatable? Does it use day context (projects, todos) to ask
  targeted questions? Q&A pairs or condensed prose in the file? Force a local model or
  only recommend one?
- 009 — what makes a day "finished" — explicit frontmatter from close-out, derived from
  `## Facts` content, or a manual mark? Do days without any entry count as open? Is
  today itself exempt? Does the count surface anywhere outside the journal?
- 010 — month grid or rolling heatmap? Does the calendar replace the day list or sit
  above it? Can it collapse? Does clicking an empty day create the file immediately or
  only on first keystroke? How many markers per cell before it is noise?

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true: all
four stories are user-facing, each needs a real path through the running app
(`npm run seed && npm run shot`) before it may be called done. 011 and 012 touch the
day file format directly — the round-trip and conflict tests, plus the "what I wrote
reaches the file before any model is called" guarantee, are mandatory per CLAUDE.md.
