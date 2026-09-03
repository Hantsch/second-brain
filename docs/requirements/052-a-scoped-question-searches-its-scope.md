---
id: 052
title: A scoped question searches its scope
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.3-1](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: `scope` and `project` filters are applied after the top-24 candidate cut
(`src/core/wiki/ask.ts:82` vs `:69`); only the `module` filter reaches the search itself. The
fixture vaults are too small for any test to notice.

## Requirement

When I ask a question scoped to one project or one scope (work/private), the app today searches
the whole vault, takes the best 24 hits, and only then throws away everything outside my scope.
In a vault where the project is a small minority of the content — which is every real vault —
the relevant project files sit below rank 24, the scope filter empties the candidate list, and I
get two weak excerpts or an honest-sounding "nothing found" that is actually wrong. The feature
breaks exactly when the vault becomes big enough to need it, and it breaks silently.

A scoped question must run the scope inside retrieval: the candidates competing for the answer
are the scope's documents, not the whole vault's. While in there: a follow-up question in a
thread currently retrieves on its raw words alone ("and what about the deadline?"), which is
the same class of problem — the retrieval not seeing what the question is actually about.

## Acceptance Criteria

- [ ] With a project filter set, retrieval candidates come from that project's documents; a
      question whose answer is in the project is answered even when the vault is large and the
      project is small.
- [ ] Same for the scope filter (work/private).
- [ ] "Nothing found" under a scope means the scope has nothing — verified by a test with a
      vault where the answer exists outside the scope only.
- [ ] The no-model excerpt path honours the same scoping.
- [ ] A test with a deliberately large fixture (relevant docs beyond the old candidate cut)
      pins the fix.
- [ ] Optional, refine decides: a follow-up turn's retrieval query is built from the thread's
      context, not the follow-up words alone — or this is split into its own story.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
