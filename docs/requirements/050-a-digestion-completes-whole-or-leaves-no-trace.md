---
id: 050
title: A digestion completes whole or leaves no trace
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.1-1](../reviews/2026-09-03-architecture-review.md)),
P0. Evidence: `markRawProtocol` runs last (`src/core/wiki/ingest.ts:238`); retry re-enters with
`sourcePage: null` and `freeSlug` writes a `…-2` page (`src/core/wiki/pages.ts:239`);
`wiki/log.md` is appended without `expectedHash` (`src/core/wiki/ingest.ts:217`); concurrency is
2 (`src/main/ipc/ingest.ts:62`) with no per-module serialization; `close-guard.ts` only protects
gardener runs; chunk-merge input is clamped at 12,000 chars with no notice to the user
(`src/core/llm/prompts/summarize-source.ts:166`).

## Requirement

When I take a source into a knowledge module, one of two things must be true afterwards: the
digestion happened completely — source page, entity pages, index, chronicle, protocol — or it
did not happen at all and the app says why. Today a failure halfway through (a hash conflict,
a disk error, quitting the app mid-run) leaves wiki pages written while the protocol still calls
the source undigested, and retrying writes a second source page next to the first. Two sources
digesting into the same module at the same time can also lose a chronicle entry or trip each
other into that same half-state.

I never look at `wiki/` internals — I trust the "Unverdichtet" badge. If that badge can lie
after a failure, the knowledge pillar cannot be trusted, and every answer that later cites a
duplicated or orphaned page inherits the lie. Also, when a very long source had to be cut down
to fit the model, I want the artifact to say so, the way condensation runs already do — not
pretend it read everything.

## Acceptance Criteria

- [ ] A digestion that fails at any step leaves the vault in a state where retrying produces
      exactly one source page — no `…-2` duplicates, no orphaned entity pages the protocol
      knows nothing about.
- [ ] Two sources digested into the same module concurrently both complete, and both of their
      chronicle entries are in `wiki/log.md` afterwards.
- [ ] Quitting the app while a digestion runs is handled the way a running maintenance run is:
      a warning, a way to let it finish or stop it — not a silent kill into a half-state.
- [ ] When chunk summaries were truncated to fit the merge prompt, the source page states that,
      the way condensation artifacts mark truncation.
- [ ] A digestion that takes many model calls reports progress; the bar does not sit at one
      value for minutes.
- [ ] A failed digestion says what failed on the job, distinguishable from "no model
      configured".
- [ ] Tests cover: failure after the source page is written + retry; two concurrent digestions
      into one module; the no-model path unchanged.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
