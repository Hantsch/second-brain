---
id: 063
title: A module can be renamed and deleted
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-5](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: the complete module channel list is
`modules:list|create|pages|page|savePage|sources|graph` (`src/shared/ipc.ts:639`) — create-only;
the slug is embedded in every page's frontmatter (`src/core/wiki/pages.ts:181`), in `AGENTS.md`,
in `.ingest.json.modules` (`src/core/ingest/raw.ts:31`), and in cross-module wikilink targets,
so a manual rename in the file system breaks references.

## Requirement

A knowledge module can only be created. A mis-typed name, a module that turned out to be two
subjects, or one that should be retired — all of that means editing the file system by hand,
where the module's slug is woven into every page's frontmatter, into the ingest protocols under
`raw/`, and into wikilinks from other modules. Renaming a folder by hand silently breaks all of
them, and the app offers no alternative.

The module lifecycle needs at least rename and delete inside the app, done the way this app does
writes: what changes is shown first, the write is hash-aware, and there is a way back. Merging
two modules can stay out for now — it is its own story once rename/delete exist.

## Acceptance Criteria

- [ ] A module can be renamed in the app: folder, page frontmatter, `AGENTS.md`, ingest
      protocols under `raw/`, and wikilinks referencing the module are updated consistently;
      what will change is shown before anything is written.
- [ ] A module can be deleted in the app: it says what goes (page count, sources affected),
      the delete is undoable through the trash path, and raw sources under `raw/` are never
      deleted with it — they return to "undigested".
- [ ] Both operations are hash-aware: concurrent external edits produce a conflict, not a
      broken half-rename.
- [ ] The index, search, and ask reflect the change immediately afterwards.
- [ ] Both work without a model configured.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
