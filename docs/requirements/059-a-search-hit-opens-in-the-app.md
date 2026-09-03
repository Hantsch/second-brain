---
id: 059
title: A search hit opens in the app
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-1](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: no search screen exists (`src/renderer/lib/screens.ts:22`); Ctrl+K shows at most
6 hits and a non-area hit runs `api.shell.openPath(hit.path)` — the OS default editor — with
the code's own comment "as long as the app doesn't have its own reading view"
(`src/renderer/components/CommandPalette.tsx:120`); snippets are computed
(`src/core/index/snippet.ts`) but not rendered; scope/type filters exist in `SearchQuery` and
in `retrieve()` but are not exposed anywhere.

## Requirement

"What do I know about X?" has two answers in this app: ask (an LLM answer with citations) and
search (find the note and read it). The second one currently ends outside the app: Ctrl+K shows
six title rows without snippets, and choosing one opens Notepad or Obsidian — for the app's own
journal days, project files, and wiki pages, all of which it can render. Citations in an answer
have the same exit. For a knowledge app, being ejected into an external editor to read your own
note is the most visible gap in the product.

Search needs a real result surface — more than six hits, with snippets, with the scope/type
filters the engine already supports — and a hit needs to open in a reading view inside the app.
Editing can stay external where no in-app editor exists yet; reading must not.

## Acceptance Criteria

- [ ] A search has a full result view (reachable from Ctrl+K, e.g. "show all results") with
      snippets and the filters the index already supports (scope, type).
- [ ] Selecting a hit opens the document in an in-app reading view: rendered Markdown,
      frontmatter not shown as a raw dump, wikilinks and vault paths navigable in-app.
- [ ] Documents that already have an in-app home (areas, journal days, project files, wiki
      pages, condensed artifacts) deep-link to that home instead of a generic view.
- [ ] "Open externally" remains available as an explicit secondary action — the default stops
      being the OS editor.
- [ ] Citations in an ask answer use the same in-app opening.
- [ ] Keyboard-first: the whole path from Ctrl+K to reading a hit works without the mouse.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
