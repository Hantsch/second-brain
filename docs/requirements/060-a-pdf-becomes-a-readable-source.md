---
id: 060
title: A PDF becomes a readable source
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-2](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: `.pdf` is classified but not read — the file is copied with a `pdf-not-read` note
(`src/core/ingest/file.ts:48`, `:113`), lands as `text: ''`, and the job ends `awaiting-llm`,
permanently undigestable. The deliberate no-heavy-parsers rationale is documented at
`src/core/ingest/file.ts:8`.

## Requirement

The knowledge pillar is "YouTube and articles" — and after web pages, the most common form an
article takes is a PDF: papers, whitepapers, documentation exports, invoices worth keeping. Today
a PDF is copied into `raw/` and then sits there forever as an undigestable source; the pipeline
cannot extract its text, and the "awaiting" state it lands in never resolves.

A text-based PDF should yield its text to the same pipeline every other source uses: extracted
into the raw folder alongside the original, digestible into a module, citable. Scanned/image
PDFs without a text layer are out — OCR is its own concept; the honest note for those stays. The
existing no-native-modules constraint holds: whatever extracts the text must be pure JS.

## Acceptance Criteria

- [ ] Ingesting a text-based PDF produces extracted text in the raw folder next to the
      untouched original, and the source is digestible like any text source.
- [ ] A PDF without a text layer (scanned) ends in an honest, named state — distinct from "no
      model configured" — with the original still preserved.
- [ ] The 5 MB-class size guard applies; an oversized PDF fails visibly, not silently.
- [ ] No native module enters the dependency tree.
- [ ] Tests cover: a text PDF, a scanned PDF, an oversized PDF — none touching the network.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
