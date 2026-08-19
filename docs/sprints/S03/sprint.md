---
sprint: S03
status: in-progress # planned | in-progress | done
branch: sprint/S03
milestone: M2 — Projects answer where I left off
---

# Sprint S03 — Where I left off

## Goal

A project stops being read-only outside the status dropdown. I can add a note and a
waiting-on entry without a detour through the inbox, the detail view tells me where the
status and next step actually came from and whether they are stale, and the project list
puts the project I last worked on and the ones I keep coming back to at the top — one
list, no duplicates. At the end, opening Projects answers "where did I leave off?" without
me hunting for it.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 003 — Project notes and waiting-on, editable in place
- [ ] 004 — Where the project status and next step come from
- [ ] 013 — Favourite projects (star) and an order that matches how I work

## Notes

**Why this order.** 003 and 004 both land in the project detail view — writing notes/
waiting-on next to showing where status and next-step come from is one continuous piece of
that screen, so doing them back to back means touching `ProjectDetail` once instead of
twice. 013 is the odd one out: it reaches into the project **list**, the dashboard tiles
and the pickers instead, and has no dependency on the other two — it goes last only because
it is the widest-reaching of the three and benefits from the detail view's write paths (013
does not add new frontmatter writes beyond `favorite`, but shares the same hash-guarded
write path 003 exercises first).

**No concept behind M2.** Per the roadmap, all three stories are detailed enough to cut
from directly — no `docs/concepts/` entry to derive scope from.

**Open questions to resolve in the clarification round** (from the story files):

- 003 — does a hand-written note get `title-tags` treatment when a model is configured, or
  stay deliberately plain text? Is the notes panel open by default once a composer is
  present, or only after the first write?
- 004 — where does provenance live: new optional frontmatter keys, or derived from
  `log.md`/file history? What counts as "worked on since" — file mtime, indexed changes,
  agent sessions, or all three?
- 013 — is the top row marked "last worked on" so it reads apart from a favourite? Is there
  an upper bound on favourites? Do tiles/pickers also want "last touched" first, or only
  favourites? Note for the concept/doc trail: dropping the scope blocks in the project list
  is a deliberate exception to the work/private separation kept everywhere else.

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true: all three
stories are user-facing, each needs a real path through the running app
(`npm run seed && npm run shot`) before it may be called done. 003 and 013 add new vault
write paths (project notes/waiting-on, `favorite` frontmatter) — the round-trip and
conflict tests are mandatory for both, per CLAUDE.md.
