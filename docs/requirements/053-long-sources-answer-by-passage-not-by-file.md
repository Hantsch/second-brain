---
id: 053
title: Long sources answer by passage, not by file
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.3-2](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: chunking exists (`src/core/wiki/chunk.ts`) but only condensation uses it
(`src/core/wiki/summarize.ts:75`); in the query path a 40k-char transcript is one index document
with one candidate slot and one ≤700-char excerpt window (`src/core/wiki/excerpts.ts:81`). Raw
transcripts carry no `type:` frontmatter and index as `note` (`src/core/index/build.ts:73`).

## Requirement

The knowledge pillar's richest content — YouTube transcripts and long articles under `raw/` —
is structurally disadvantaged when I ask a question. A two-hour talk is one document in the
index: it competes for exactly one of the six evidence slots, and only one 700-character window
of it ever reaches the model, no matter how much of the answer it holds. Six short notes beat
one long transcript even when the transcript is the actual source of what I know.

Retrieval should see long documents as passages: several places in one transcript can be
evidence, each citable with its path (and ideally its place in the file), without the file's
length working against it. And a raw transcript should be recognizable as what it is — today it
indexes as an ordinary note, indistinguishable from something I wrote myself.

This is deliberately the cheap 80% before any embeddings discussion: same index, same MiniSearch,
finer retrieval units.

## Acceptance Criteria

- [ ] A question whose answer sits in the middle of a long transcript retrieves that passage;
      a test with a long fixture document pins it.
- [ ] Two different passages of the same long document can both appear as evidence when both
      are relevant.
- [ ] Citations still carry the real file path; the citation validator still verifies against
      the file.
- [ ] Documents under `raw/` are distinguishable by type in the index (not `note`), without
      touching the immutability of the raw payload.
- [ ] Index size and refresh cost do not regress disproportionately — measured against the
      existing perf test, extended with realistic document sizes.
- [ ] Search (Ctrl+K) behaviour stays sensible: one file appears once in the hit list, not
      once per passage.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
