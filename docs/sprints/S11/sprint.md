---
sprint: S11
status: in-progress # planned | in-progress | done
branch: sprint/S11
milestone: M13 — Evidence stays primary, and the gate turns green
---

# Sprint S11 — Evidence stays primary, and the gate turns green

## Goal

The guardrail M12 decided but never enforced becomes real: an answer can no longer cite the app's
own condensation as evidence — always the file it was written from. Around it, the three carve-outs
that have been sitting in the roadmap's unprioritised table get closed: the format gate goes green
on Windows so `npm run verify` and `npm run handoff` are usable again, a maintenance run stays
visible when I navigate away from it, and a condensed artifact can be deleted from inside the app
instead of behind its back.

At the end, nothing in the answer path can launder machine-written prose into a quote with a file
path under it, and the gate that has been red since S07 is information again.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 040 — An answer cites the source, never the condensation
- [ ] 042 — A maintenance run stays visible wherever I am
- [ ] 043 — I can delete a condensed artifact
- [ ] 041 — The format gate is green on Windows

## Notes

**Why carve-outs and not the condensed layer's second level.** Chosen by the user at the
2026-09-02 `/roadmap plan` against the module/project levels of
[concepts/condensed-layer.md](../../concepts/condensed-layer.md). The roadmap gates those levels on
M12 being accepted, and that live walkthrough has not happened yet — six milestones (M4, M6, M9,
M10, M11, M12) are built with acceptance pending. This sprint deliberately contains nothing that
depends on any of them, so it cannot be invalidated by what the walkthroughs find.

**040 is the one that matters.** It is the only story here that closes a guardrail rather than a
papercut. `src/core/index/build.ts` classifies `areas/<slug>.condensed.md` as an ordinary indexed
document and the answer path never looks at a document's type, so today a condensation can be
returned as a citation exactly like a hand-written page. If the sprint has to be cut short, this is
the story that must land.

**Why 041 is last, despite being the gate.** It rewrites up to 1077 files in one commit. Placed
first it would make every following diff in this sprint hard to read, and a repo-wide line-ending
decision that goes wrong would eat the sprint before the guardrail story is built. Last, its sweep
also picks up whatever 040, 042 and 043 wrote. The cost is accepted knowingly: the sprint's first
three commits are not prettier-clean, which is no worse than today — `format:check` is not in the
verify list in `.claude/ai-scrum.md` and S10 already recorded that no story could use it as a gate.

**The clarification round is already done.** Twelve open questions were settled with the user at
the 2026-09-02 plan and are recorded per story under `## Decisions (Sprint)`, marked `(User)` and
binding: 040-Q1 to Q4, 041-Q1/Q2/Q3, 042-Q2/Q3, 043-Q1/Q3/Q4. `/sprint` should not re-ask them.
What deliberately stays open is refine's work, not the user's: 041-Q4 (the vendored Gaston
stylesheet under the new rule), 042-Q1 (the actual cause of the navigation bug, which must be
established and named before the strip moves) and 043-Q2 (own `condense:delete` channel versus a
generic vault delete, leaning to the former).

**042 grew at the plan and is no longer a carve-out.** The user chose a shell-wide progress strip
over a fix on the maintenance screen, plus a warning with stop-and-close when the app is closed
mid-run. That takes the story out of `src/renderer/lib/queries/gardener.ts` and into the shell and
`src/main/` window/quit handling. It stays in second position — 040 is still the story that must
land — but it should be estimated as the second-largest piece here, not as the papercut the
roadmap's table framed it as.

**Deliberately not in this sprint:** the condensed layer's module and project levels, CND-2, CND-17
and CND-35/36; the MCP interface outlook; and the German [MODULE-SCHEMA.md](../../MODULE-SCHEMA.md)
migration (the last German doc — the rest of `docs/` is English now). All stay in the roadmap's
"Open / unprioritised" table.

**Carried in, untouched:** story 034 is still `in-progress` (built, live acceptance pending on the
test user's laptop). It is not part of this sprint and must not be touched by it — same standing as
in S10.
