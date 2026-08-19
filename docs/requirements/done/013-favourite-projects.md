---
id: 013
title: Favourite projects (star) and an order that matches how I work
status: done # draft -> ready -> in-progress -> done
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

- [x] A project can be starred and unstarred from the project list, and from the project
      detail — one click, no dialog, no confirmation.
- [x] The star is written to the project frontmatter as `favorite`, and
      [VAULT-FORMAT.md](../VAULT-FORMAT.md) documents the field.
- [x] A `favorite: true` typed into the file by hand in Obsidian has exactly the same
      effect as a click in the app — and the app reflects the external change.
- [x] Whether a project is starred is visible at a glance in the list, in Gaston terms —
      one accent, no second one, no emoji.
- [x] With the default sort, the order is: the last-touched project, then the starred
      projects, then the rest.
- [x] "Last touched" is `lastTouch` from the frontmatter — the same value the default sort
      already uses, no second notion of recency.
- [x] Every project appears exactly once in the list. If the last-touched project is
      starred, it stands at the top and not a second time in the favourites.
- [x] `deadline`, `priority`, and `name` sort exactly as they do today — neither the star
      nor the last-touched project changes those orders.
- [x] With scope "all" the list is **one list**, no work/private blocks. Seeing a single
      scope happens through the scope filter.
- [x] A starred project is never banished to the stale section — the star pulls it into
      the current list, and the fact that it is stale stays visible on the row.
- [x] The starred state survives an app restart, and travels with the vault: the same
      vault on another machine has the same favourites.
- [x] Deleting `.secondbrain/index/` does not lose any favourite.
- [x] Starring does not overwrite the user's edits: writing with a stale hash gets a
      `conflict`, as everywhere.
- [x] Filters keep working: a starred project that the scope/status filter excludes stays
      excluded — the star raises a project, it does not smuggle it past a filter.
- [x] The list has a state for "nothing starred yet": no empty section, no gap — the order
      is simply the one it is today.
- [x] The dashboard tiles that list projects put favourites first —
      [ActiveProjectsTile](../../src/renderer/components/tiles/ActiveProjectsTile.tsx) and
      [StaleProjectsTile](../../src/renderer/components/tiles/StaleProjectsTile.tsx) —
      without dropping what they are about.
- [x] The project pickers put favourites first: filing a dump
      ([TargetPicker](../../src/renderer/components/TargetPicker.tsx)) and linking an agent
      project ([ProjectLinkPicker](../../src/renderer/screens/agents/ProjectLinkPicker.tsx)).
- [x] Keyboard navigation over the list follows the order actually shown.
- [x] Works with no model configured — this is an order over files, not a judgement.
- [x] Labels go through `t()`, in `de` and `en`.

## Open Questions

Decided (2026-08-12): frontmatter only · default sort only · `lastTouch` from the
frontmatter · the star beats "stale" · one list plus the scope filter instead of scope
blocks · favourites also count in the tiles and the pickers.

Still open:

- ~~**Is the top row marked as "last"?**~~ answered → Decisions (Sprint)
- ~~**Is there an upper bound on favourites?**~~ answered → Decisions (Sprint)
- ~~**Do the tiles and pickers need the last-touched project first too, or only the
  favourites?**~~ answered → Decisions (Sprint)
- ~~**What does dropping the scope blocks do to the scope separation elsewhere?**~~
  resolved as documentation, not as a new decision: there is no concept behind M2, so the
  doc trail is [VAULT-FORMAT.md](../VAULT-FORMAT.md) plus the two code comments that
  currently claim the opposite (`filter.ts`, `ProjectList.tsx`). D1 writes one line there:
  work and private stay separated everywhere else (todo tiles, todo scoping) — the project
  list is a scoped exception, and separation there happens through the scope filter.

## Decisions (Sprint)

- **(User)** Top row label: gets a quiet marker ("last worked on") on the row, so it
  reads apart from a favourite instead of relying on position alone.
- **(User)** No upper bound on favourites — trust the user, no cap or warning UI.
- **(User)** Tiles and pickers surface favourites first only, not the last-touched
  project — in pickers (filing a dump, linking a project) "last worked on" is often
  the wrong suggestion.
- Unstarring writes `favorite: false`, it does not delete the key — idempotent, visible
  in Obsidian, and it avoids a second "clear the field" path in `project-patch.ts`.
- The star carries **no** colour accent: outline = not starred, filled at text colour =
  starred. Teal belongs to the selection on this screen and amber already means "stale",
  so a coloured star would be the second accent the criterion forbids.
- The star toggle sits as a sibling of the row button inside the `<li>`, not inside it —
  a nested `<button>` is invalid HTML and would swallow the row click.
- On non-favourite rows the star is only visible on hover/focus (opacity), but stays in
  the tab order with an `aria-label` — otherwise fifteen empty stars compete with the data.
- The "last worked on" marker only appears with the default sort — under `deadline`,
  `priority` or `name` the top row is not the re-entry point, so the marker would lie.
- The top row is exempt from the stale section as well, for the same reason the star is:
  if everything is stale, the re-entry point still belongs at the top, marked stale.
- Ordering is rank-based over the already filtered and touch-sorted list (0 = last touched,
  1 = favourite, 2 = rest, stable within a rank) — one pass, dedup by construction, and it
  cannot smuggle a project past a filter.
- The reusable ordering helper lives in `src/renderer/lib/favorites.ts`, not in
  `screens/projects/filter.ts` — components and tiles must not import from a screen.
- Pickers order via `SessionLink` itself rather than in each caller, so the agent link
  picker and the dashboard session tile get the same order from one place.
- In `TargetPicker` the currently selected action stays first, then favourite projects,
  then the proposal's order — the app's own filing answer must not be pushed down.
- The list star writes without `expectedHash` (the list has no doc hash; the handler reads
  fresh, same as the existing `next_step` patch), the detail star passes `doc.hash` — that
  is the path the conflict test covers.

## Plan

1. **Field first, UI after.** `favorite` becomes a real frontmatter field end to end
   (type, derivation, key order, patch allowlist, VAULT-FORMAT) before any screen reads it.
2. **Ordering as pure logic.** `visibleProjects` gets a rank pass; `sortProjects` stays
   untouched for `deadline`/`priority`/`name`. `splitStalled` learns that a favourite (and
   the top row) never counts as stalled. Scope stacking and `scopeRank`/`scopeGroups`
   disappear — with them the two code comments that assert the opposite.
3. **Then the three surfaces**, each on its own: project list row + toggle, project detail
   toggle, dashboard tiles, pickers.
4. **Then seed + live smoke**, so the star is actually visible in a screenshot.

Order: D1 → D2 → (D3, D4, D5, D6 in any order) → D7.

Affected files, by layer:

- shared/core/main: `src/shared/types/domain.ts`, `src/core/index/projects.ts`,
  `src/core/vault/frontmatter-order.ts`, `src/main/ipc/project-patch.ts`
- renderer logic: `src/renderer/lib/favorites.ts` (new),
  `src/renderer/screens/projects/filter.ts`
- renderer UI: `ProjectCard.tsx`, `ProjectList.tsx`, `ProjectsScreen.tsx`, `ProjectHead.tsx`,
  `ProjectDetail.tsx`, `ActiveProjectsTile.tsx`, `StaleProjectsTile.tsx`, `TargetPicker.tsx`,
  `tiles/SessionLink.tsx`, `atoms/Icon.tsx`, `styles/app/projects.css`, `i18n/*-projects.ts`
- docs: `docs/VAULT-FORMAT.md`

Watch out (this sprint touches the same screen three times): 003 extends the notes and
waiting-on area of the detail, 004 extends the **facts row** of `ProjectHead`. The star
goes into `sb-phead-title`, next to the scope badge — no overlap with either.

Note: no channel change. `projects:patch` already carries
`{ slug, patch: Partial<ProjectFrontmatter>, expectedHash? }`; only the allowlist grows.

## Deliverables

### D1 — `favorite` exists in the file, and can be written

The field, end to end below the UI. No screen shows it yet.

- `src/shared/types/domain.ts`: `favorite?: boolean` in `ProjectFrontmatter`,
  `favorite: boolean` in `Project`.
- `src/core/index/projects.ts`: derive in `deriveProjects` — `frontmatter['favorite'] === true`
  (mirror the existing `record['resolved'] === true`), missing/garbage → `false`.
- `src/core/vault/frontmatter-order.ts`: `favorite` into the `PROJECT` order, after `priority`.
- `src/main/ipc/project-patch.ts`: `'favorite'` into `WRITABLE`, plus a boolean branch in
  `checkProjectPatch` (`value === true`) before the `asList` fall-through.
- Fixtures that build a full `Project` need the field or typecheck fails:
  `src/renderer/lib/mock-fixtures.ts`, `src/renderer/lib/mock-bridge.ts`,
  `tests/renderer/dashboard-fixtures.ts`, `tests/renderer/projects.test.tsx` (`project()`).
- `docs/VAULT-FORMAT.md`: `favorite: true` in the project example + one line on what it means,
  **and** the one line on the scope exception (see Open Questions).
- Mirror: how `repos`/`priority` travel the same path.

Acceptance: `tests/core/index/projects.test.ts` — `favorite: true` in the file arrives as
`true`, a missing key as `false`. `tests/main/projects-ipc.test.ts` — patching `favorite`
writes it, an unknown user key survives, a stale `expectedHash` still gives `conflict`.

### D2 — The order the list actually makes

Pure logic, no JSX.

- `src/renderer/lib/favorites.ts` (new): `favoritesFirst(projects)` — stable, favourites
  first, everything else in the given order. One place, used by D2/D5/D6.
- `src/renderer/screens/projects/filter.ts`:
  - `sortProjects` unchanged for `deadline`/`priority`/`name`.
  - `visibleProjects`: with `sort === 'touch'`, rank the filtered+sorted rows
    0 = last touched, 1 = favourite, 2 = rest; stable within a rank. Return the top row's
    slug (e.g. `latest: string | null`) so the UI can mark it, and `null` outside `touch`.
  - `splitStalled`: `stale && !favorite && slug !== latest` → stalled.
  - Drop `grouped`, `scopeRank`, `SCOPE_ORDER` and the file comment that argues for scope
    stacking; replace it with why the list is now one list.
- New `tests/renderer/projects-filter.test.ts`: top row, favourites after it, each project
  exactly once, starred-and-last appears once, starred stale in `current`, no favourites →
  today's order, `deadline`/`priority`/`name` unchanged, a filtered-out favourite stays out.

Acceptance: the new test file is green and `tests/renderer/projects.test.tsx` still is.

### D3 — Star and marker on the row

- `src/renderer/atoms/Icon.tsx`: add lucide `Star` to the import + name map.
- `src/renderer/components/ProjectCard.tsx`: star toggle as a sibling of the row button
  inside the `<li>`; `latest` prop renders a quiet `sb-projectitem-latest` chip in the meta
  row. New props: `favorite` state comes off `project`, plus `onToggleFavorite`, `latest`.
- `src/renderer/screens/projects/ProjectList.tsx`: drop `grouped`/`scopeGroups`, one `<ul>`;
  pass `latest` and the toggle through.
- `src/renderer/screens/projects/ProjectsScreen.tsx`: wire the toggle to
  `mutations.patch.mutate({ slug, patch: { favorite: !project.favorite } })` (no
  `expectedHash`); keyboard `count`/`index` keep coming from `list.all`, which now carries
  the shown order, so nothing else changes.
- `src/renderer/styles/app/projects.css`: `.sb-projectitem-star` (hidden until hover/focus
  when off, filled when on), `.sb-projectitem-latest` (calm, no colour).
- `src/renderer/i18n/de-projects.ts` / `en-projects.ts`: `projects.favorite.add`,
  `projects.favorite.remove`, `projects.lastWorkedOn`.
- Mirror: `ProjectCard`'s existing meta chips; `StatusPicker` for the write-and-toast pattern.

Acceptance (in `tests/renderer/projects.test.tsx`): clicking the star patches `favorite`
and does not select the row; with scope `all` there are no scope headings; the top row
carries the marker under `touch` and none under `name`; `i18n.test.ts` stays green.

### D4 — Star in the project detail

- `src/renderer/screens/projects/ProjectHead.tsx`: toggle next to title and scope badge
  (same icon/CSS as D3), `onFavorite` prop.
- `src/renderer/screens/projects/ProjectDetail.tsx`: wire it with
  `expectedHash: doc.hash`.
- Mirror: how `onStatus`/`StatusPicker` is wired from `ProjectDetail`.

Acceptance: test in `tests/renderer/projects.test.tsx` — the detail star patches with the
doc hash, and a stale hash surfaces as a conflict, not as a silent no-op.

### D5 — Favourites first in the dashboard tiles

- `src/renderer/components/tiles/ActiveProjectsTile.tsx`: `favoritesFirst(...)` after
  `byPriority`, **before** the `LIMIT` slice.
- `src/renderer/components/tiles/StaleProjectsTile.tsx`: same, over the resolved rows,
  before the slice — stale projects stay in the tile, they just sort first.

Acceptance: dashboard test — a favourite that ranks below the limit by priority is in the
visible rows; the tiles still only show what they are about (`active` / stale slugs).

### D6 — Favourites first in the pickers

- `src/renderer/components/tiles/SessionLink.tsx`: `favoritesFirst()` over the incoming
  projects — one place, so `ProjectLinkPicker` and the session tile agree.
- `src/renderer/screens/agents/ProjectLinkPicker.tsx`: no change expected; verify and cover.
- `src/renderer/components/TargetPicker.tsx`: order entries by
  (current → favourite project → proposal order), stable; non-project targets keep theirs.

Acceptance: tests for both pickers — favourite project appears above a more recently
touched non-favourite; the currently selected filing target stays first in `TargetPicker`.

### D7 — Visible in the demo vault, and smoke-tested

- `scripts/seed/*`: mark two demo projects `favorite: true`, one of them stale, so the
  order and the pulled-up stale row show up in a screenshot.
- Run `npm run seed && npm run shot`, check the projects screen and dashboard PNGs.

Acceptance: `.screenshots/` shows a starred row above the rest, a top row with the
"last worked on" marker, and no scope headings.

### Coverage (every criterion has a deliverable)

star from list/detail → D3, D4 · `favorite` written + documented → D1 · hand-typed in
Obsidian → D1 · visible at a glance → D3 · default sort order → D2 · `lastTouch` as the
only recency → D2 · exactly once → D2 · other sorts unchanged → D2 · one list → D2 (logic)

- D3 (render) · starred stale pulled up → D2 · survives restart / travels → D1 · index
  deletable → D1 · stale-hash conflict → D1 + D4 · filters still exclude → D2 · nothing
  starred yet → D2 · tiles → D5 · pickers → D6 · keyboard follows the shown order → D3
  (`ProjectsScreen` counts `list.all`) · works with no model → D2/D3, no LLM path is touched
  at all · labels via `t()` in de+en → D3, D4 (guarded by `tests/renderer/i18n.test.ts`).

## Model Hints

- D2 → `deliverable-hard` — the ordering pass has to satisfy six criteria at once
  (top row, favourites, exactly-once, stale exemption, other sorts untouched, filters not
  bypassed) and it silently feeds keyboard navigation and the default selection in
  `ProjectsScreen`; a wrong rank is invisible in the diff and wrong on screen.
- D1, D3, D4, D5, D6, D7 → default.
- Review: → `story-review-hard` — the story deletes a documented invariant (scope stacking)
  and changes ordering on five surfaces, where a regression shows up as "wrong row on top"
  rather than as a failing test.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app, open **Projects**.
2. Scope filter on "all": one list, **no** work/private headings. The top row carries the
   quiet "last worked on" marker.
3. Hover a non-favourite row → star appears. Click it → row jumps under the top row, star
   stays filled. Click again → row returns to its old position.
4. Star a project from the stale section → it leaves the section and appears in the list
   above, still marked stale. Unstar → back into the stale section.
5. Star the top row → it stays at the top, exactly once, and does not appear a second time
   among the favourites.
6. Switch the sort to deadline, priority, name → the order is exactly the old one, no
   marker, favourites are not pulled up. Back to "last touch" → the new order returns.
7. Set the scope filter to "work" while a private project is starred → the private one
   stays hidden.
8. Open a project's detail, toggle the star there → the list row follows immediately.
9. In Obsidian/VS Code write `favorite: true` into a project file, save → the app shows the
   star and the new order without a restart.
10. Restart the app → the favourites are the same. Delete `.secondbrain/index/`, restart →
    still the same.
11. Dashboard: a starred active project sits at the top of "active projects"; a starred
    stale project at the top of "stale projects".
12. Capture a dump, open the target picker → the currently proposed target first, then the
    starred projects. In Projects → Sessions, "link project" → starred projects first.
13. Switch the UI language to English and back → all new labels change with it.

## Done

**Summary.** `favorite: boolean` now travels the full frontmatter path (type, derivation,
canonical key order, patch allowlist, VAULT-FORMAT.md). The project list's default sort
(`touch`) ranks the last-touched project first, then favourites, then the rest, in one pass
over the already filtered list — scope stacking (`grouped`/`scopeRank`/`SCOPE_ORDER`) is gone,
per the story's documented scope-separation exception (project list only; todo tiles/scoping
elsewhere are untouched). A starred stale project is pulled into the current section and keeps
its stale marker. The star renders in the list (sibling of the row button, hover/focus-only
when off, no colour accent) and in the detail head; the list write has no `expectedHash`, the
detail write does, covering the conflict path. Dashboard tiles (`ActiveProjectsTile`,
`StaleProjectsTile`) and both pickers (`TargetPicker`, `SessionLink`/`ProjectLinkPicker`) put
favourites first via a shared `favoritesFirst()` helper (tiles/pickers) or an equivalent inline
partition (`filter.ts`, which additionally interleaves with "last touched" and the stale split).
Two demo projects were starred in the seed (one of them stale) for the live smoke test.

**Commit message.**
```
013: favourite projects — star, reordered list, tiles and pickers
```

**Verification.**
- `npm run build` — green.
- `npm test` (`npx vitest run --pool=threads`) — 2023/2025 passed. The 2 failures are
  pre-existing and unrelated to this story: `tests/core/wiki/module.test.ts` (MODULE-SCHEMA
  drift) and `tests/main/ipc/agents.test.ts` (leaks real `~/.claude` data on this machine) —
  both fail identically at HEAD before this story's changes.
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run format:check` — not run as a gate (pre-existing repo-wide CRLF/LF mismatch on this
  Windows checkout vs. Prettier's LF default, called out as a known condition, not chased here).
- Live smoke test (`npm run seed && npm run shot`), screenshots inspected directly:
  - `.screenshots/02-projects.png` — scope filter on "Alle": one flat list, no "Arbeit"/"Privat"
    headings. Top row (Kundenportal Relaunch) carries the "ZULETZT BEARBEITET" chip. Orbit
    SSO-Migration and Datenmigration Legacy-CRM show a filled star; the latter also keeps its
    amber "Stagniert" tag while sitting in the current section, not the stale one. The detail
    head shows an outline (unstarred) star next to the scope badge.
  - `.screenshots/34-project-sessions.png` — detail star renders filled for a starred project.
  - Dashboard tiles: `ActiveProjectsTile`/`StaleProjectsTile` are hidden by default in this
    app's (and the demo's) dashboard layout — same default as production, unrelated to this
    story. To verify their favourites-first behaviour live regardless, the two tiles were
    temporarily unhidden in the local seed config, `npm run seed && npm run shot` was re-run,
    and the resulting dashboard screenshot showed "Datenmigration Legacy-CRM" (favourite, lower
    priority, and — for the stale tile — later in slug order) ranked first in both "Laufende
    Projekte" and "Stagnierende Projekte", ahead of higher-priority/earlier non-favourites. The
    temporary config change was reverted afterward (`git diff` on `scripts/seed/internal.mjs`
    is empty) and the demo vault/screenshots were regenerated against the real defaults before
    finishing. No picker has a dedicated shot-script screenshot; ordering there is covered by
    the new `tests/renderer/session-link.test.tsx` and `tests/renderer/target-picker.test.tsx`.
- Code review (`story-review-hard`, clean agent): first pass returned **FAIL** — D1's own
  stated acceptance tests (`tests/core/index/projects.test.ts`,
  `tests/main/projects-ipc.test.ts`) were never written, leaving the derivation and the patch
  allowlist for `favorite` completely unguarded by tests (confirmed correct by inspection, but
  a silent regression there would have passed every existing test). Fixed in one review-fix
  cycle: coverage added to both files (arrives-as-`true`, missing-key-is-`false`,
  garbage-value-is-`false`, patch writes it, an unknown user key survives alongside it, a stale
  `expectedHash` still yields `conflict`, and `favorite: null` is rejected rather than treated
  as "clear the field"). Full verification re-run afterward: build/lint/typecheck green, tests
  2023/2025 (same 2 pre-existing failures).

**Decisions and known limitations** (beyond the ones already recorded under
`## Decisions (Sprint)`):
- A failed list-star write (`ProjectsScreen.tsx`) is silent — no `onError`/error surface, same
  as the pre-existing `next_step` patch on this screen. The detail-star write is not silent (it
  has `expectedHash` and shares `ProjectDetail`'s existing generic `ErrorState` for `patch`
  failures). Left as-is: the story's own decision was that only the detail path carries a hash
  and therefore a conflict is only reachable there; making the list path noisy on every kind of
  failure (not just conflicts, which can't happen there) would be new scope, not something this
  story's acceptance criteria ask for.
- Starring a project from the detail view does not clear the `next_step` status-save
  confirmation banner if one is currently showing (`ProjectHead`/`ProjectDetail` share one
  `patch` mutation observer). Cosmetic; not covered by any acceptance criterion.
- `TargetPicker`'s reorder removes every entry sharing `current`'s path from the "rest" bucket
  before re-adding it once at the front. Two `FilingAction`s can never legitimately share a
  path today (`alternativesFor` in `src/core/capture/actions.ts` guards this, and the picker's
  own React `key` already assumes path uniqueness), so this is a non-reachable edge case, not a
  live bug — left as an inline comment risk rather than a defensive rewrite for a case the rest
  of the codebase already assumes can't happen.
- The "last worked on" marker is computed over the already scope/status/query-filtered list
  (`filter.ts`), so under a narrowed scope it marks the most recently touched project *within
  that scope*, not the global last-touched project. This is intentional (the alternative would
  either show no marker under a scope filter or mark a row that isn't visually on top) and is
  pinned by a test, but wasn't written down as an explicit Decision during refine — recorded
  here for the sprint review.
- `tests/core/wiki/module.test.ts` and `tests/main/ipc/agents.test.ts` fail identically before
  and after this story's changes (pre-existing, unrelated) — not fixed, per the sprint's
  standing instruction not to chase pre-existing failures outside a story's scope.
