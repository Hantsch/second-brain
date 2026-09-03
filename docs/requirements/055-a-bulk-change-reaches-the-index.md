---
id: 055
title: A bulk change reaches the index
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.2-2](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: the watcher debounce is trailing-only with no maximum wait — every event resets
the 250 ms timer (`src/core/vault/watch.ts:76`); the pending set grows unbounded
(`src/core/vault/watch.ts:64`); chokidar runs without `awaitWriteFinish`; a refresh failure is
warned to console and `event:vault-changed` fires anyway (`src/main/services.ts:257`).

## Requirement

The vault is allowed to live on OneDrive, on a USB stick, in a git repository — that is the
concept's portability promise. But when something external touches many files in a stream — a
OneDrive sync, a `git checkout`, a bulk copy — the watcher's debounce can be reset indefinitely:
as long as events keep arriving more often than every 250 ms, the index update never fires. The
app sits on a stale index for the whole duration and shows stale todos, stale projects, stale
search results, with no sign that anything is pending. On top of that, a file can be read while
the sync tool is still writing it, and if a refresh fails outright, the renderer is told the
vault changed and refetches against the stale index believing it is current.

A bulk change must reach the index in bounded time, half-written files must not be read as
content, and a failed refresh must not report success.

## Acceptance Criteria

- [ ] Under a sustained event stream, the index still updates within a bounded interval — a
      test simulates events arriving faster than the debounce and asserts a flush happens.
- [ ] Files still being written by an external tool are not indexed half-written.
- [ ] A refresh that fails does not emit `event:vault-changed` as if it succeeded; the failure
      is visible (at minimum in the maintenance/health surface, not only on the console).
- [ ] Back-to-back storms do not queue a pile of sequential full rebuilds; pending work
      collapses.
- [ ] Normal single-file editing behaviour (250 ms trailing debounce) is unchanged.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
