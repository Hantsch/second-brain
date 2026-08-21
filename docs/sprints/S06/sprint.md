---
sprint: S06
status: in-progress # planned | in-progress | done
branch: sprint/S06
milestone: M5 — Models without expertise
---

# Sprint S06 — A machine scan, a per-task recommendation, a guided local runtime

## Goal

The models tab stops asking me to guess. It tells me what this machine can carry, proposes one
model per task in plain language and in money — never a target I can't reach, never a training
endpoint for a sensitive task — and gets me a working local runtime without a terminal.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 019a — The app looks at my machine and tells me what it can carry
- [ ] 019b — One recommended model per task, in plain language and in money
- [ ] 019c — A local runtime without typing a command

## Notes

**Why this order.** 019a has no dependencies and produces the `CapacityVerdict` that 019b's
reachability filter and 019c's "which models are worth pulling" list both read — it goes first.
019b and 019c both depend only on 019a, not on each other, but 019b goes second because 019c's
plan explicitly degrades to a plain model list if 019b isn't there yet, while 019b has no such
fallback for 019c — the harder dependency direction goes earlier.

**019d is deliberately not in this sprint.** It stays `draft` in the requirements folder — its
Open Questions need primary-source reading (subscription terms) and an architecture decision
(does a subscription target fit `LlmGateway`) that no agent should resolve inside a build.
Refine it once 019b is done.

**All three stories are already refined to `ready`** (plan + deliverables + model hints filled
in during `/refine 019` on 2026-08-21, which split the original epic into 019a–d). The
clarification round should find nothing new — if it does, that is a signal the split missed
something, not routine.

**Model Hints already set per story:** 019a-D2 (GPU/VRAM detection) is `deliverable-hard`;
019b-D5 (sensitive-task rule) and 019b-D7 (per-request no-training enforcement) are
`deliverable-hard`, review is `story-review-hard`; 019c-D4 (pull stream with cancel) is
`deliverable-hard`, review is `story-review-hard`. 019a's review stays default.

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true: all three
stories are user-facing and need a real path through the running app
(`npm run seed && npm run shot`) before they may be called done. None of them are required for
the app to work — guardrail 1 holds throughout, and each story's own acceptance criteria say so.

**Sequencing against S05.** [S05](../S05/sprint.md) (M4 — a finding can be acted on) is also
still `planned`, cut earlier and not yet started. This sprint does not touch S05's stories or
files, so the two can run in either order; queue S06 behind S05 unless there's a reason to
reorder.
