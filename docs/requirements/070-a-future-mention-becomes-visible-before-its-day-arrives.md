---
id: 070
title: A future mention becomes visible before its day arrives
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

From the user's own feedback (2026-09-07): "if I write 'tomorrow I need to do X', there should be
a reminder somewhere that something is open, and that it belongs to that day" — asked for at the
moment of writing, not after the fact. Split out of [[069-a-day-shows-how-its-own-loose-ends-were-answered]]
as its own story since it needs a different mechanism, not just a different view.

Investigated the same day: `findLooseEnds()` (`src/core/journal/loose-ends.ts:362-405`) only
surfaces a forward-looking sentence once its target day has passed with no later entry addressing
it (`candidate.iso < today` at line 381) — the exact opposite of "as soon as it's written". The
model-augmented pass (`src/core/journal/loose-ends-llm.ts`) shares the same after-the-fact framing.
There is no code path today that reacts to a forward-looking mention at write time.

## Requirement

When a day's own text names a concrete future day or event, that mention should become visible as
an open, upcoming item right away — not only once its day has passed unaddressed. The existing
loose-end mechanism (open once overdue, closes when a later entry addresses it) stays as it is for
the retrospective case; this adds the missing forward-looking half.

## Acceptance Criteria

- [ ] **AC1** — After writing a sentence that names a concrete future day or event, an "upcoming"
      item becomes visible (surface to be decided in refine — dashboard, journal, or maintenance)
      naming the mention and the day it points to, before that day arrives.
- [ ] **AC2** — Once the target day is reached, the same item continues into the existing loose-end
      lifecycle (open if unaddressed, resolved once a later entry addresses it) rather than existing
      as a second, disconnected mechanism.
- [ ] **AC3** — The baseline detection works with no model configured, reusing the existing
      heuristic date/forward-reference machinery (`findDates`/`isForward`); a model-augmented pass
      may extend it the same way it already does for the retrospective case, but is not required for
      the feature to work.

## Open Questions

- Where does the "upcoming" item live — its own small dashboard section, a badge on the calendar day
  it points to, both? A real placement decision, not a code default.
- Does this stay a visibly separate "upcoming" bucket, or fold into the same tile as today's loose
  ends? Recommendation: keep it separate — M8 split loose ends from waiting-on specifically because
  merging different questions ("will happen" vs. "should have happened by now") into one bucket lost
  meaning; the same risk applies here.
