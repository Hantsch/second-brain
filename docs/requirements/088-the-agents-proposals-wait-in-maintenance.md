---
id: 088
title: The agent's proposals wait in Maintenance
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Outside the wiki layer, the agent may not write — it proposes (concept §9, AGT-9 to AGT-11). A
proposal is one file under `.secondbrain/` naming the target path, the content or section-wise
diff the agent wants, its reasoning, the target's hash as the agent read it, and the run that
produced it. Targets may be anything except `journal/` and `raw/`: `module.md`, `AGENTS.md`,
projects, areas, notes, inbox filings.

Gaston shows proposals in the Maintenance screen as a new finding kind next to the gardener's,
reusing the finding card, accept/reject and undo via `trash/`. The Maintenance rail entry carries a
badge with the number waiting, so proposals do not sit unseen. Proposals written while Gaston is
open appear without a restart, which today's watcher does not cover (it ignores only
`.secondbrain/index` and `trash`, but nothing reads the new folders yet; concept O10).

The proposal skill in the setup ([[084]]) learns the format here; its template version goes up, so
an installed setup shows "outdated".

## Acceptance Criteria

- [ ] **AC1** — A proposal file placed in the proposals folder while Gaston is open appears in
      Maintenance, without a restart, as a finding showing target, diff and reasoning.
- [ ] **AC2** — The Maintenance rail entry shows the number of waiting proposals and updates when
      one is added or resolved.
- [ ] **AC3** — Accepting writes the target hash-guarded, leaves an undo copy in
      `.secondbrain/trash/`, and removes the proposal.
- [ ] **AC4** — Accepting after the target changed since the agent read it reports a conflict and
      leaves the target unchanged.
- [ ] **AC5** — Rejecting removes the proposal and leaves the target unchanged.
- [ ] **AC6** — A proposal targeting `journal/`, `raw/`, or a path outside the vault is never
      offered for accepting; it shows as invalid with the reason.
- [ ] **AC7** — A proposal file with missing fields shows as invalid with the reason, not as a
      crash or an empty card.
- [ ] **AC8** — The installed proposal skill describes the format Gaston reads, and the template
      test pins it.

## Open Questions

- **Q1 — Content form** (concept O3): full new content, section-wise diff, or both allowed?
- **Q2 — Inbox filing** (concept O6): does a proposal to file a dump go through the existing filing
  flow in `src/core/capture/` (as a filing proposal), or is it a plain "write this file, delete that
  one" proposal?
- **Q3 — Retention.** Are rejected and accepted proposals deleted, or moved aside for the run
  report?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
