---
sprint: S16
status: in-progress # planned | in-progress | done
branch: sprint/S16
milestone: M17 — Nothing enters half-true, and nothing trusts more than it must
---

# Sprint S16 — The entrance tells the truth, and the gate never sleeps

## Goal

At the end of this sprint `npm run verify` runs on every push and pull request, so no red
test and no unformatted file can ride along for a sprint again. And the knowledge pillar's
entrance stops producing hollow pages: a digestion either completes whole or leaves no trace
and says why, a video without a transcript is a visible, honest state instead of a condensed
placeholder, and a URL that a bot wall, a consent page or an empty extraction defeats says
which of the three happened — distinguishable from "no model configured".

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 065 — The gate runs on every push
- [x] 050 — A digestion completes whole or leaves no trace
- [x] 051 — A video without a transcript is an honest failure
- [x] 064 — A fetched page that yields nothing says so

## Notes

Cut 2026-09-08 as the first half of M17, out of the architecture-review backlog (050–065) that
sat in `requirements/` with no milestone line since 2026-09-03. The four stories here are the
review's P0 ingest findings plus the process gate; the shell/trust half (057, 058, 059, 063)
follows as S17.

- **065 goes first, deliberately.** It is disjoint from every other story in the backlog
  (`.github/workflows/`, no `src/` change) and it is the net under the three sprints that
  follow — the review's own evidence is that this repo carried a red test for five sprints and
  a red `format:check` for four. Landing it first means S16's own stories are the first to be
  gated.
- **Then strict order 050 → 051 → 064**, because all three converge on
  [src/core/ingest/queue.ts](../../../src/core/ingest/queue.ts)'s terminal-state handling:
  050 rewrites the digestion transaction around it, 051 makes the empty-text guard actually
  fire, and 064 reuses 051's honest-failure shape for the URL path instead of inventing a
  second one.
- **050 is the risky story** — mark it `risk: high` at refine. It touches
  `src/core/wiki/ingest.ts`, `src/core/wiki/pages.ts` (`freeSlug`), `src/main/ipc/ingest.ts`
  (concurrency 2), `close-guard.ts` and the summarize-source prompt's 12k clamp, all under
  existing tests that must stay green without being weakened.
- **Reuse, do not copy** (CLAUDE.md): 050's "quitting mid-run is handled like a maintenance
  run" and its progress criterion are the `WorkRegistry` from story 071 plus the close dialog
  from 074 — not a third mechanism. Truncation is already marked the way condensation
  artifacts mark it (story 037/045); follow that wording.
- **Acceptance surface.** 051's and 064's criteria are things the user sees on a source, so
  they need `npm run test:e2e` through the real app per `ui-acceptance-required`. The known
  limit from S14/S15 applies: the no-model e2e vault cannot hold a producer in a long
  `running` state on demand, so anything that needs that is covered one level down and named
  in the review.
- The 050/051/064 story files carry unnumbered acceptance bullets from their draft round;
  refine numbers them `AC1…` before mapping tests.
- **`format:check` is red on this checkout before S16 starts** — 234 files, and not the CRLF
  cause story 041 fixed (only 21 files carry CR at all). `prettier` is pinned `^3.9.5` and
  3.9.6 is installed, which reformats wide-character table padding and `*em*` → `_em_`. Story
  065's gate would go red on its first run, so 065 pins prettier to an exact version and lands
  one `npm run format` pass with it, before the gate is switched on.
- The S08 git-safety rule applies as usual: no unscoped `git restore` / `git clean` in build
  agents.
