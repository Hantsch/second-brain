---
id: 013
title: Favourite projects (star) and an order that matches how I work
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

Most of the time I work on the same handful of projects. The project list treats all of
them as equals — it sorts by last touch, by deadline, by priority, by name, but it has
no idea which projects are _mine_ in the sense of "I come back here every day". So the
two or three that matter sit somewhere in a list of fifteen, and I go looking.

I want to **star a project**. A starred project is a project I want to see, immediately,
without filtering or searching for it.

And I want the order of the list to say what is actually true about my work:

1. **The project I last worked on** — the re-entry point, at the very top.
2. **Then my starred projects** — the ones I keep coming back to.
3. **Then everything else**, in the order the list uses today.

Each project appears **exactly once**. No "favourites" block that repeats the same rows
again further down, no star section plus the same project in the main list. If the
project I last worked on is also starred, it stands at the top once — as the latest
project — and does not appear a second time among the favourites.

The star is a statement about the project, not about the current screen: I set it once
and it holds — after a restart, and when I open the vault somewhere else. It lives in the
project frontmatter (`favorite: true`), like everything else that is true about a project.

This order is the **default sort** ("last touch"). Sorting by deadline, priority, or name
is a deliberate question, and a favourite must not distort the answer — those three stay
as they are.

Two things follow that the list does differently today:

**One list, not two stacks.** With scope "all" the list currently stacks work first, then
private. I don't want that any more. I want **one list**, and if I only want to see one
scope I say so with the scope filter — which already exists. Separating the scopes into
blocks makes the new order impossible to read: "latest, then favourites" would either
appear twice, once per scope, or sit above blocks it does not belong to.

**A starred stale project gets pulled up.** Stale projects sit in their own section at the
end. If I starred a project, it belongs in the list I actually look at — the star wins
over "stale".

The star reaches beyond the project list: wherever the app offers me projects — the
dashboard tiles, the project pickers when filing — favourites come first, for the same
reason they do here.

Related: the list logic lives in
[src/renderer/screens/projects/filter.ts](../../src/renderer/screens/projects/filter.ts)
(`sortProjects`, `visibleProjects`, `splitStalled`), the scope stacking is rendered in
[ProjectList.tsx](../../src/renderer/screens/projects/ProjectList.tsx) via `grouped`.

## Acceptance Criteria

- [ ] A project can be starred and unstarred from the project list, and from the project
      detail — one click, no dialog, no confirmation.
- [ ] The star is written to the project frontmatter as `favorite`, and
      [VAULT-FORMAT.md](../VAULT-FORMAT.md) documents the field.
- [ ] A `favorite: true` typed into the file by hand in Obsidian has exactly the same
      effect as a click in the app — and the app reflects the external change.
- [ ] Whether a project is starred is visible at a glance in the list, in Gaston terms —
      one accent, no second one, no emoji.
- [ ] With the default sort, the order is: the last-touched project, then the starred
      projects, then the rest.
- [ ] "Last touched" is `lastTouch` from the frontmatter — the same value the default sort
      already uses, no second notion of recency.
- [ ] Every project appears exactly once in the list. If the last-touched project is
      starred, it stands at the top and not a second time in the favourites.
- [ ] `deadline`, `priority`, and `name` sort exactly as they do today — neither the star
      nor the last-touched project changes those orders.
- [ ] With scope "all" the list is **one list**, no work/private blocks. Seeing a single
      scope happens through the scope filter.
- [ ] A starred project is never banished to the stale section — the star pulls it into
      the current list, and the fact that it is stale stays visible on the row.
- [ ] The starred state survives an app restart, and travels with the vault: the same
      vault on another machine has the same favourites.
- [ ] Deleting `.secondbrain/index/` does not lose any favourite.
- [ ] Starring does not overwrite the user's edits: writing with a stale hash gets a
      `conflict`, as everywhere.
- [ ] Filters keep working: a starred project that the scope/status filter excludes stays
      excluded — the star raises a project, it does not smuggle it past a filter.
- [ ] The list has a state for "nothing starred yet": no empty section, no gap — the order
      is simply the one it is today.
- [ ] The dashboard tiles that list projects put favourites first —
      [ActiveProjectsTile](../../src/renderer/components/tiles/ActiveProjectsTile.tsx) and
      [StaleProjectsTile](../../src/renderer/components/tiles/StaleProjectsTile.tsx) —
      without dropping what they are about.
- [ ] The project pickers put favourites first: filing a dump
      ([TargetPicker](../../src/renderer/components/TargetPicker.tsx)) and linking an agent
      project ([ProjectLinkPicker](../../src/renderer/screens/agents/ProjectLinkPicker.tsx)).
- [ ] Keyboard navigation over the list follows the order actually shown.
- [ ] Works with no model configured — this is an order over files, not a judgement.
- [ ] Labels go through `t()`, in `de` and `en`.

## Open Questions

Decided (2026-08-12): frontmatter only · default sort only · `lastTouch` from the
frontmatter · the star beats "stale" · one list plus the scope filter instead of scope
blocks · favourites also count in the tiles and the pickers.

Still open:

- **Is the top row marked as "last"?** It stands first, but without a label a reader
  cannot tell whether it is first because it is the most recent one or because it is
  starred. A quiet marker on the row ("last worked on") would say it; another badge on
  every row would be noise.
- **Is there an upper bound on favourites?** Fifteen favourites are no favourites. Cap
  it, warn, or trust the user?
- **Do the tiles and pickers need the last-touched project first too, or only the
  favourites?** In the pickers "what I last worked on" is often exactly the wrong target
  for a dump.
- **What does dropping the scope blocks do to the scope separation elsewhere?** Work and
  private stay separated in the two todo tiles and in
  [VAULT-FORMAT.md](../VAULT-FORMAT.md). The project list giving that up is a deliberate
  exception, not a new rule — worth a line in the concept so it does not read as a
  regression later.

## Plan

<Filled by `/ai-scrum:refine 013`.>

## Deliverables

<Filled by `/ai-scrum:refine 013`.>

## Model Hints

<Filled by `/ai-scrum:refine 013`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 013`.>

## Done

<Filled by `/ai-scrum:build 013`.>
