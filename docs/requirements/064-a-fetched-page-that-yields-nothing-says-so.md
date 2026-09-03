---
id: 064
title: A fetched page that yields nothing says so
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.1-3](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: the fetch sends no User-Agent header (`src/core/ingest/url.ts:134` sends only
`accept`) — bot walls 403 or serve interstitials; a consent page or SPA shell converts to
near-empty Markdown and is written as a legitimate source; an empty-text job ends `awaiting-llm`
with `message: null` (`src/core/ingest/queue.ts:280`), indistinguishable on screen from "no
model configured"; the duplicate check offers no "ingest anyway" (`SourcesTab.tsx:66` shows only
a toast), so a changed page cannot be re-fetched from the UI.

## Requirement

When I paste a URL, three failure shapes currently masquerade as success or as each other. A
site that blocks clients without a User-Agent fails where a browser would succeed. A cookie
wall or JavaScript-only page converts to a near-empty Markdown file that gets written as a
legitimate source — a hollow page later answers can cite. And when extraction genuinely yields
nothing, the job shows the same state as "no model configured", so I cannot tell a broken page
from a missing setting. On top of that, a page that changed since I first ingested it cannot be
fetched again: the duplicate check has no override.

Fetching should look like a normal client, a page that yielded no real content should be a
named, visible outcome instead of a hollow source, and re-ingesting deliberately should be
possible.

## Acceptance Criteria

- [ ] The fetch sends a reasonable User-Agent; a test pins the header.
- [ ] A fetch whose extracted content is empty or trivially small ends in a named state ("page
      yielded no content"), distinct from "no model configured" and from network errors — and
      writes no digestible source that pretends otherwise.
- [ ] The duplicate detection gains an explicit "ingest again" path that creates a new dated
      raw source, never overwriting the old one (raw stays immutable).
- [ ] Content-type rejections and truncations keep their existing behaviour; existing tests are
      unweakened.
- [ ] Tests cover: a consent-wall-shaped page, an empty extraction, and the re-ingest path —
      all offline against fixtures.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
