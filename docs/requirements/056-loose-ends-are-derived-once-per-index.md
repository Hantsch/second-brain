---
id: 056
title: Loose ends are derived once per index
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.2-3](../reviews/2026-09-03-architecture-review.md)),
P1 — the concrete follow-up the roadmap's M6 and M8 gap notes already predicted. Evidence:
`findLooseEnds` does two stream parses per journal day plus ~13 regex passes per sentence plus
an O(days) scan per candidate (`src/core/journal/loose-ends.ts:362`), and runs uncached from
five call sites: `journal:get` — which then filters the full result to one day
(`src/main/ipc/journal.ts:210`) — `journal:interviewPlan` (`src/main/ipc/journal.ts:386`),
`reminders()` for both `dashboard:data` and `reminders:list`
(`src/core/overview/reminders.ts:302`), the gardener check (`src/core/gardener/report.ts:160`),
and the hourly notifier (`src/main/reminder-notify.ts:184`). Every write invalidates all
vault-dependent query roots at once (`src/renderer/lib/events.ts:15`), so one coach turn near
the dashboard triggers two or more full-corpus passes; opening a day adds a third.

## Requirement

The heuristic that finds loose ends re-reads and re-parses the entire journal history every
time any screen wants any part of its result — and the screens want it constantly: opening a
day, opening the dashboard, the interview, the reminder tick. The result is identical between
two index changes, and most callers throw away almost all of it (the day view keeps one day's
rows out of a full-history scan).

The derivation stays exactly what it is — same findings, same honesty about being heuristic.
It just runs once per index state, and everything that needs loose ends reads that one result.
Opening a day or the dashboard must not scale with the length of my journal history.

## Acceptance Criteria

- [ ] Between two index changes, the loose-end derivation runs at most once, no matter how many
      screens ask; a test counts invocations across `journal:get`, `dashboard:data`,
      `reminders:list`, and the interview plan.
- [ ] A vault change invalidates the cached result; the next reader recomputes.
- [ ] The derived findings are byte-identical to today's — pinned by existing tests, none of
      which are weakened.
- [ ] `journal:get` for one day no longer pays for the whole history.
- [ ] The gardener check and the notifier read the same single source of truth.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
