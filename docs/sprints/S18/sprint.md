---
sprint: S18
status: in-progress # planned | in-progress | done
branch: sprint/S18
milestone: M18 — The vault can grow, and an answer finds its evidence
---

# Sprint S18 — The vault can grow, and an answer finds its evidence

## Goal

At the end of this sprint saving one file costs one file instead of a full tree walk and a full
index rewrite, a bulk change from OneDrive, `git checkout` or a copy actually reaches the index
instead of resetting the debounce forever, loose ends are derived once per index instead of on
every screen that asks, and a Codex session counts as a project's last touch exactly like a
Claude session does. On top of that: a scoped question retrieves inside its scope instead of
filtering the top-24 candidate cut afterward, a long transcript competes as passages instead of
one document with one excerpt window, a PDF yields real text into the same ingest pipeline as
every other source, and the heuristic floor speaks the vault's document language instead of only
German.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 054 — Saving one file costs one file
- [x] 055 — A bulk change reaches the index
- [x] 056 — Loose ends are derived once per index
- [x] 062 — Codex work counts as work
- [x] 052 — A scoped question searches its scope
- [ ] 053 — Long sources answer by passage, not by file
- [ ] 060 — A PDF becomes a readable source
- [ ] 061 — The heuristic floor speaks the document language

## Notes

Cut 2026-09-25 as a single sprint covering all of M18 — both halves the 2026-09-08 cut had
planned as separate sprints, S18 "the vault can grow" (054, 055, 056, 062) and S19 "an answer
finds its evidence" (052, 053, 060, 061) — by user decision to try a larger sprint cut instead of
two four-story sprints. All eight stories already exist as draft requirement docs from the
2026-09-08 architecture-review split (050–065); nothing here changes their content, only the
grouping and the build order.

- **054 → 055 → 056 stay strictly sequential**, as decided at the 2026-09-08 cut: all three edit
  `src/core/index/` (`service.ts`, `build.ts`, `persist.ts`) and `src/core/vault/watch.ts`. 056
  in particular depends on the index-time derivation hook 054 adds.
- **062 rides along after 056.** Disjoint files (`src/main/ipc/overview-deps.ts`,
  `src/core/overview/dashboard.ts`, `src/core/overview/recent.ts`) — no ordering constraint with
  any other story, kept next to 054–056 because it shares that group's "overview surface" framing
  from the original cut.
- **052 before 053**, as decided at the 2026-09-08 cut: both rewrite the query path
  (`src/core/wiki/ask.ts`, `excerpts.ts`); scope-inside-retrieval is the smaller change and
  defines the candidate set 053 then splits into passages.
- **053 also touches `src/core/index/build.ts`** (indexing chunks for long documents) — the same
  file 054 reshapes earlier in this sprint. Sequential build order means no conflict, but 053's
  review should confirm it builds on 054's shape rather than reintroducing whole-document
  indexing.
- **056 and 061 both touch `src/core/journal/loose-ends.ts`** (056: derive-once caching; 061:
  German-only phrasing becomes language-aware). Same reasoning — 061's review should check it
  against 056's cache shape, not the pre-056 code.
- **060 and 061 carry no ordering constraint** with each other or with the rest; placed last as
  the two smallest, most self-contained stories (PDF text extraction; lexicon/i18n).
- **Risk carried knowingly.** The 2026-09-08 cut split this into two sprints specifically to
  avoid two sprints (or parallel stories) editing the same index files at once. That risk does
  not reappear here — `/ai-scrum:sprint` builds stories strictly sequentially regardless of
  sprint boundaries — but the sprint's own regression gate (`npm test`, `npm run test:e2e`) now
  runs once across eight stories instead of twice across four, so a break introduced early is
  caught later than it would be with two sprints. Worth watching if this sprint's review turns up
  more fix-cycles than S18/S19 would have separately.
- The S08 git-safety rule applies as usual: no unscoped `git restore` / `git clean` in build
  agents.
