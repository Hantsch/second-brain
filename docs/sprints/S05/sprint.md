---
sprint: S05
status: in-progress # planned | in-progress | done
branch: sprint/S05
milestone: M4 — A finding can be acted on
---

# Sprint S05 — A finding can be acted on

## Goal

Every maintenance finding names a real way out, not just "Passt so". A near-duplicate can be
discarded or marked as superseded, an orphaned page can be linked wherever the user says, and
every card is honest about what happened to the findings that got hidden along the way. Riding
along in the same sprint: the journal notices what I announced and never followed up on.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 014 — The maintenance run reports findings, not results
- [x] 015 — A near-duplicate can be resolved, not only compared
- [x] 016 — An orphaned page can be linked where I say, not only where it is obvious
- [ ] 017 — A finding says how it ends — and "looks fine" stays reversible
- [ ] 020 — Journal — announced and never followed up

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

**020 rides along, not part of M4.** Added to this sprint on 2026-08-21 by direct user decision
— the app has no next sprint queued and the user wanted 020 in the very next one, without
cutting a fresh sprint for a single story. It belongs to its own milestone (see ROADMAP.md);
tracked here for scheduling only. It goes **last**: its own Open Questions ask whether "the one
place" for a loose end should be the Maintenance finding surface that 014 and 017 build in this
same sprint — 020's refine round should look at 017's finished "ways out" framework (accept/
dismiss, exits, reversibility) before deciding whether to reuse it or build a separate surface.

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
- 020 — where does "the one place" live (journal filter, dashboard section, or the Maintenance
  finding surface from 014/017)? Where does the answer get written (announcing day, actual day,
  or today with a back-reference)? Where does answered/dismissed state persist? Is there an
  expiry horizon? How specific may the app's question get without asserting a claim? Does
  closing a day (009) suppress its loose ends?

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true: all four
stories are user-facing and need a real path through the running app
(`npm run seed && npm run shot`) before they may be called done. 015, 016 and 017 add new write
paths into the vault (discard, supersede, undismiss) — the AI-proposes/human-confirms guardrail
and the hash-guarded write are the load-bearing part, per the roadmap's note on this milestone.
