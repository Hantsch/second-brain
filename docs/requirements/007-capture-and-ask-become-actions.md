---
id: 007
title: Capture and ask become actions, not places
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

Capture and Ask are things I *do*, not places I go. Right now they each own a rail
entry, which puts them on the same footing as Projects and Journal and makes the
navigation harder to read than the app actually is.

Capture is also redundant: the global window (`Ctrl+Shift+Space`) does the same thing
from anywhere, including when the app is not in the foreground. It is the better path
and it is already built.

Ask is worse off as a screen than as an overlay: I want to ask *from inside* a
context — in a project, in a module — and have the search scope already right.
Navigating away to a separate screen loses exactly the context that would have made
the question precise.

Target picture: [concepts/navigation.md](../concepts/navigation.md).

## Acceptance Criteria

- [ ] The rail entries "Capture" and "Ask" are gone.
- [ ] Both are reachable from a visible control in the shell — not by hotkey alone —
      and from the command palette.
- [ ] Their hotkeys keep working, including the global `Ctrl+Shift+Space`.
- [ ] Ask opens as an overlay over the current screen, with the search scope
      prefilled from where I am: inside a module, that module; inside a project, that
      project; otherwise the whole vault.
- [ ] Ask keeps everything it has today: citations with file paths, the honest "no
      evidence found" answer, and filing an answer back as a wiki page.
- [ ] Capture keeps stating where the thought landed, with the path, and keeps its
      undo.
- [ ] `#/capture` and `#/ask` still land correctly — as the overlay, not a dead route.
- [ ] The quick-capture window is untouched.
- [ ] The freed hotkeys are either reassigned deliberately or left unassigned; no key
      points at a screen that no longer exists.
- [ ] Both have an honest "no model configured" state, as today.
- [ ] Both are still reachable from their dashboard tiles.

## Open Questions

- Does the capture *screen* disappear entirely (the global window being the only
  path), or does it stay as an overlay? "Just leave it out for now" was the first
  instinct — worth deciding explicitly, because the global window is the only capture
  path that then exists.
- Ask and the command palette are both `Ctrl+K`-shaped. One control with two modes,
  or two clearly separate controls?

## Plan

<Filled by `/ai-scrum:refine 007`.>

## Deliverables

<Filled by `/ai-scrum:refine 007`.>

## Model Hints

<Filled by `/ai-scrum:refine 007`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 007`.>

## Done

<Filled by `/ai-scrum:build 007`.>
