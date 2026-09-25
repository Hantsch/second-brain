---
id: 054
title: Saving one file costs one file
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.2-1](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: `refresh(paths)` uses paths only as a relevance gate, then walks the whole tree
(`src/core/index/service.ts:172`); all derivations re-run over all docs
(`src/core/index/build.ts:134`); the entire index — every document body plus the MiniSearch
state — is re-serialized and rewritten on every run (`src/core/index/persist.ts:89`), with a
read of the old file first (`src/core/vault/fs-store.ts:97`); startup does a full
walk+derive+persist unconditionally (`src/core/index/service.ts:88`) on top of chokidar's own
scan (`src/main/core-bridge.ts:40`); no worker thread exists in `src/main`; no document-size
guard exists; the only perf test is 5,000 × 200-byte docs without persistence
(`tests/core/index/build.test.ts:274`).

## Requirement

The vault only ever grows — every journal day, every transcript, every note adds to it and
nothing leaves. But the index treats every change as if it were the first: one keystroke-save in
Obsidian triggers a full tree walk, a re-derivation over every document, and a rewrite of an
`index.json` that contains every document body — a file roughly the size of the whole vault
text, read and written on the main thread. Opening the vault does the same twice before the UI
is live.

At demo scale this is invisible. At a year of journaling plus a few hundred transcripts, every
save and every launch freezes the app for seconds — and it will be the index, not any feature,
that makes Gaston feel broken first. The cost of a change must scale with the change, not with
the vault. The file-level incremental logic (mtime/size/hash skip) already exists and is good;
what's missing is that the walk, the derivations, and the persist take advantage of it.

## Acceptance Criteria

- [ ] After one file changes, the refresh stats/reads only what the change requires, not every
      file in the vault.
- [ ] Persisting the index after a single-file change does not rewrite every document's body;
      the write cost is bounded by the change, not the vault size.
- [ ] App startup with an unchanged vault does not re-derive and re-persist the whole index
      before the UI is usable.
- [ ] Index work does not block the UI thread noticeably; if the main thread must do it, it
      yields — or it moves off the main thread. Refine decides the mechanism.
- [ ] A document-size guard exists: a pathologically large file degrades that file's handling
      (with an honest note), not the whole app.
- [ ] A perf test with realistic sizes (long transcripts, hundreds of journal days, persistence
      included) pins the budget; the numbers are recorded in the story's Done section.
- [ ] `.secondbrain/index/` stays deletable and rebuildable — no new second truth.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
