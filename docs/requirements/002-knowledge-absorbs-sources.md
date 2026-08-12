---
id: 002
title: Knowledge absorbs sources
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

"Modules" names the mechanism, not the content. The screen holds what I know, so it
should be called **Knowledge**.

And **Sources** must not sit beside it. Sources is the entrance to Knowledge — every
ingested video, file, and URL ends up digested in a knowledge module. As two sibling
rail entries, that relationship is invisible: a new user cannot tell that ingesting a
source is how knowledge gets in. Sources belongs *inside* Knowledge, as its input
tab.

Target picture and reasoning: [concepts/navigation.md](../concepts/navigation.md).

This is a UI change only. The vault format is untouched — `modules/`, `raw/`,
frontmatter keys, and every code identifier keep their names. Renaming the folder
would break existing vaults for a label.

## Acceptance Criteria

- [ ] The rail entry reads "Knowledge" (de: "Wissen"), in both languages, via `t()`.
- [ ] The rail entry "Sources" is gone; the screen is reachable as a tab inside
      Knowledge, alongside the existing module views.
- [ ] The sources screen keeps every function it has today: the detecting input
      field, drop zone, yt-dlp status, job list, inventory, detail dialog.
- [ ] Ingesting a source from inside Knowledge still lets me pick the target module,
      and the picker is prefilled when I came from a module.
- [ ] `#/sources` and every existing deep link into it still arrive at the right
      place (redirect, not a 404 or a blank screen).
- [ ] The command palette finds both "Knowledge" and "Sources" and lands correctly.
- [ ] Hotkeys stay consistent: no key points at a screen that no longer exists, and
      the freed key is either reassigned deliberately or left unassigned.
- [ ] `#/modules?m=<slug>&tab=…` deep links from citations, maintenance findings, and
      the palette keep working unchanged.
- [ ] No vault path, frontmatter key, type name, or IPC channel is renamed.
- [ ] The screen is usable without a configured model, as before.

## Open Questions

- Does the sources tab live at the Knowledge top level (all sources across modules,
  as today) or per module (only that module's sources), or both — top level in the
  overview, filtered in the module detail?
- The module detail already has a "sources" tab. Is the new top-level tab the same
  component with a wider scope, or a second, separate view?

## Plan

<Filled by `/ai-scrum:refine 002`.>

## Deliverables

<Filled by `/ai-scrum:refine 002`.>

## Model Hints

<Filled by `/ai-scrum:refine 002`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 002`.>

## Done

<Filled by `/ai-scrum:build 002`.>
