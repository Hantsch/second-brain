---
id: 057
title: Main re-validates what the renderer sends
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.4](../reviews/2026-09-03-architecture-review.md)),
P0. Evidence: `shell:openPath` returns any absolute path unchanged — the `..` guard covers only
the relative branch (`src/main/ipc/shell.ts:13`); a citation path the validator rejected still
renders as a clickable file button (`src/renderer/components/Markdown.tsx:83`), so model-authored
text can become a one-click `shell.openPath` on an arbitrary absolute path; `capture:apply`
checks only that `dumpPath` is a string and `primary` is an object
(`src/main/ipc/capture-proposal.ts:103`), then writes to the renderer-chosen path, honouring an
unknown section heading literally (`src/core/capture/sections.ts:76`); `will-navigate` allows
any `file://` URL (`src/main/window.ts:125`).

## Requirement

The Electron setup is tight — sandbox, context isolation, CSP, a preload that exposes three
functions. But three seams trust the renderer (and, one step further back, the model) more than
the rest of the app does. The model-side filing validation is exemplary: a proposed target that
doesn't exist is discarded with its reason. Then the confirmed proposal comes back from the
renderer and is written without being re-checked. And a hallucinated absolute path in an answer
is one click away from asking the OS to open it.

The main process is the trust boundary; it should hold everything the renderer sends to the
same standard the model's output is held to.

## Acceptance Criteria

- [ ] `shell:openPath` opens vault-relative paths and a defined set of app-owned locations
      only; an arbitrary absolute path is refused with an error code, not passed to the OS.
- [ ] A citation path that failed validation is not rendered as a clickable action.
- [ ] `capture:apply` re-validates the proposal server-side: the target path must resolve
      against the current index the same way the proposal builder resolves it, and a section
      heading outside the target's allowed set is normalized, not written literally.
- [ ] In-window navigation to arbitrary `file://` URLs is blocked; the app's own entry points
      keep working.
- [ ] Tests cover each seam: refused absolute path, rejected-citation rendering, a tampered
      proposal object, a `file://` navigation attempt.
- [ ] No legitimate flow regresses: opening a vault file in the OS editor, the ingest folder
      reveal, and filing with an edited (legitimate) target all keep working.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
