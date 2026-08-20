---
sprint: S05
status: planned # planned | in-progress | done
branch: # set by /sprint
milestone: M4 — A finding can be acted on
---

# Sprint S05 — A finding can be acted on

## Goal

Every maintenance finding names a real way out, not just "Passt so". A near-duplicate can be
discarded or marked as superseded, an orphaned page can be linked wherever the user says, and
every card is honest about what happened to the findings that got hidden along the way.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 014 — The maintenance run reports findings, not results
- [ ] 015 — A near-duplicate can be resolved, not only compared
- [ ] 016 — An orphaned page can be linked where I say, not only where it is obvious
- [ ] 017 — A finding says how it ends — and "looks fine" stays reversible

## Notes

**Why this order.** 014 is a pure rename (Befund/Ergebnis) with no dependencies — done first so
the rest of the sprint builds its cards on the right vocabulary from the start. 015 introduces
the discard action and the `supersedes`/`contradicts`/`extends` relation as a way to silence a
finding; 016 explicitly leans on that same discard mechanism for its own "page turned out to be
junk" case (both stories' Open Questions name this as one decision, not two), so 015 goes first.
017 generalizes the "ways out" framework (a card names its exits, a dismissed finding stays
visible and reversible, the health score says it ignores dismissed findings) across every finding
card — it goes last so it can point at 015's and 016's concrete exits instead of guessing at them
in the abstract.

**No concept behind M4.** Cut straight from the stories, by decision on 2026-08-14 (see
[ROADMAP.md](../../ROADMAP.md)).

**Open questions to resolve in the clarification round** (from the story files):

- 015 — does discarding also remove the catalog line in `wiki/index.md`? What happens to inbound
  links of a discarded page? Which page counts as "the newer one" for supersede? Does the raw
  source under `raw/` get discarded too?
- 016 — does the picker suggest an order, or is it a plain list? Is the module overview a
  one-click default? Is the `sources:`-frontmatter variant part of this story or its own? Does
  the picker reach across modules?
- 017 — is there a "not now" state between "not a problem" and "handled"? Where do hidden
  findings live in the UI (filter value, collapsed section, own view)? Does listing them need a
  new IPC channel? Does "handled in the vault" re-check everything or just this finding? What
  happens to a dismissed finding whose file was deleted?

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true: all four
stories are user-facing and need a real path through the running app
(`npm run seed && npm run shot`) before they may be called done. 015, 016 and 017 add new write
paths into the vault (discard, supersede, undismiss) — the AI-proposes/human-confirms guardrail
and the hash-guarded write are the load-bearing part, per the roadmap's note on this milestone.
