---
id: 092
title: I hand a module's condensation to the agent
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

With the module level of the condensed layer in place ([[081]]), the condensation is the kind of
work a strong model does better than a weak local one. The user can hand it to the agent instead
of running `condense-module` through the gateway (concept §10, AGT-16).

The condensed-layer concept wins over "the wiki layer is direct": `overview.md` is a
diff-confirmed artifact, so the agent's result is a proposal, never a direct write — and the deny
rule from [[085]] already keeps the agent's file tools off it. The proposal is confirmed where
every module condensation is confirmed: in the module view, with the same diff, accept and
reject-with-reason as [[081]] (CND-37), not in Maintenance. Job format and validation come from
[[090]].

## Acceptance Criteria

- [ ] **AC1** — The module view offers "Hand to agent" next to "Condense"; one click writes exactly
      one condense-module job.
- [ ] **AC2** — "Hand to agent" is available when no model is configured for `condense-module`.
- [ ] **AC3** — A valid result appears in the module view as the same diff an in-app run produces;
      nothing is written before the user accepts.
- [ ] **AC4** — Accepting and rejecting behave exactly as in [[081]]: hash guard, undo copy,
      reason appended to the directives section.
- [ ] **AC5** — A result missing a section, a section's source line, or citing a path that is not a
      page of the module shows the job as failed with the reason, and no diff is offered.
- [ ] **AC6** — If `overview.md` changed between handing over and the result, the job shows as
      failed with that reason.
- [ ] **AC7** — The installed job-queue skill describes the condense-module kind, including the
      directives section as an instruction it never writes to; the template test pins it.

## Open Questions

- **Q1 — Two pending condensations.** What happens when the user starts an in-app condensation
  while a condense-module job for the same module is with the agent — block, replace, or allow
  both and let the hash guard decide?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
