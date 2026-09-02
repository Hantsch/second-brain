---
id: 040
title: An answer cites the source, never the condensation
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. The follow-up M12 decided but did not build: the rule exists as a user decision
(038-Q4 / concept O9, 2026-09-01), nothing in the code enforces it. Depends on
[[037-an-area-can-be-condensed-into-one-file]]. Concept: [[../concepts/condensed-layer]] (O9).
Named in [[../sprints/done/S10/review]] as the one M12 follow-up worth prioritising soon.

## Requirement

A condensed artifact is prose the app wrote about my own files. When I ask a question, it must
never come back as the evidence — the file it was written from must. Today it can: `build.ts`
classifies `areas/<slug>.condensed.md` as a normal indexed document of type `condensed`, and the
answer path never looks at a document's type, so a condensation competes for a citation slot
exactly like a page I typed myself.

That is a guardrail-3 problem, not a cosmetic one. Citing a condensation means quoting the app's
own summary back to me as if it were my note: the evidence chain becomes circular, and a sentence
the condensation got wrong is laundered into a "quote from the vault" with a file path under it.
The whole point of the citation is that I can go and read the line — and behind this line there is
only another machine-written line.

So the answer path has to know the difference. What I want to see cited is the day entry, the
note, the source page. The artifact records the paths it was written from (`sources:`), so the way
back to primary material exists in the file itself.

## Acceptance Criteria

- [ ] Answering a question never returns a `condensed` document as an excerpt or as a citation —
      in the with-model path and in the no-model path alike.
- [ ] The exclusion sits in retrieval, not in the prompt. A model's obedience is not the guard
      (same reason 037 enforces attribution deterministically).
- [ ] Module-scoped, project-scoped and whole-vault questions all behave the same way.
- [ ] A question whose only match is a condensed artifact produces the honest "no evidence found"
      answer instead of citing it.
- [ ] The existing `types` filter in `retrieve()` is used or extended — no second, parallel
      filtering mechanism.
- [ ] The rule survives a new document type: adding a machine-written type later does not require
      remembering to patch the answer path in two places.
- [ ] Tests cover it twice, per the project's LLM rule: one with the fake provider, one with no
      model configured.
- [ ] Filing an answer back as a wiki page cannot carry a condensed citation into the new page.
- [ ] The artifact stays findable in full-text search and in `Ctrl+K` — this story removes it from
      evidence, not from the vault's reach.
- [ ] The condensed tab says in one line that the artifact is not cited as evidence and that
      answers go to its sources; the string exists in `de` and `en`.

## Open Questions

- ~~Q1 — Drop the artifact from the candidates, or follow its `sources:` into them?~~
  answered → Decisions (Sprint)
- ~~Q2 — Does the exclusion apply to search too, or only to answers?~~
  answered → Decisions (Sprint)
- ~~Q3 — Only `condensed`, or every machine-written document (a module's `overview.md`)?~~
  answered → Decisions (Sprint)
- ~~Q4 — Should the condensed tab say that the artifact is not used as evidence?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding.

- **(User)** Q1 — **drop, do not follow.** The artifact leaves the candidate set and the ordinary
  full-text search finds the primary files on their own merits. No second retrieval path, and
  nothing is promoted that ranking had already set aside. Accepted cost: a synthesis words things
  differently than its sources, so a question only the condensation phrases well can answer
  "no evidence found" — which is the honest answer this project prefers over a laundered one.
- **(User)** Q2 — **answers only; the artifact stays findable in search.** The 038-Q4 decision was
  about evidence, and hiding a document the user asked the app to write would make it unreachable
  by the fastest route. It appears in `Ctrl+K` and never as a citation — see Q4 for why that
  asymmetry has to be stated.
- **(User)** Q3 — **`condensed` only, held in one named list** (e.g. `EVIDENCE_EXCLUDED_TYPES`), so
  a second type is one entry rather than a hunt through the answer path. A module's `overview.md`
  keeps behaving exactly as it does today: it has been citable since the wiki existed, and
  changing that silently would alter answers outside M13's scope. CND-35/36 handles it when that
  mechanism is retired.
- **(User)** Q4 — **one quiet line on the condensed tab** saying the artifact is not used as
  evidence and answers go to the sources. Because of Q2 the artifact is in search but never in a
  citation, and that asymmetry must read as deliberate rather than as a bug.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
