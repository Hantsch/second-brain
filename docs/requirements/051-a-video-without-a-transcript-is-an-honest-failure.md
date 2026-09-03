---
id: 051
title: A video without a transcript is an honest failure
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.1-2](../reviews/2026-09-03-architecture-review.md)),
P0. Evidence: `renderProseTranscript` with zero cues still emits frontmatter plus
`_Kein Transcript verfuegbar._` (`src/core/ingest/youtube/transcript.ts:198`), which becomes
`outcome.text` (`src/core/ingest/youtube/ingestor.ts:144`), so the empty-text guard at
`src/core/ingest/queue.ts:276` never fires and the model condenses a placeholder. The video's
description and chapters in `metadata.md` are never passed to digestion.

## Requirement

When I ingest a YouTube video that has no transcript — a music video, a stream, an uncaptioned
upload — the app today writes a source page anyway: the model condenses the placeholder line
"Kein Transcript verfuegbar" into a hollow page, and later answers can cite it as if it were
knowledge. That is exactly the guessing guardrail 3 forbids, happening at the entrance instead
of the exit.

A transcript-less video should be a visible, honest state on the source: "no transcript, not
digested", with the metadata that does exist (title, description, chapters) preserved in `raw/`
as it already is. Whether the description alone is worth digesting is a decision I want to make
per source, not one the app makes for me by silently treating a placeholder as content.

## Acceptance Criteria

- [ ] Ingesting a video without a transcript never produces a source page from placeholder
      text. The job ends in a state that names the reason (no transcript), distinct from "no
      model configured" and from an error.
- [ ] The raw folder still keeps everything that was fetched (metadata, description, chapters)
      — nothing already saved is lost.
- [ ] The source row offers an explicit choice to digest from the description/metadata anyway,
      and a page created that way says what it was built from.
- [ ] The "undigested" filter and the gardener's unprocessed-source check both see such a
      source honestly.
- [ ] Existing hollow source pages are not rewritten by this story; only new ingests change
      behaviour.
- [ ] Tests cover: no-transcript video with and without a model; the explicit
      digest-from-metadata path.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
