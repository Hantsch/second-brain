---
id: 019d
title: Use my Claude and ChatGPT plans instead of a second metered bill
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-21
---

Part of [[019-model-recommendations-for-people-without-expertise]]. Delivers the "subscriptions
instead of keys" cluster. **Deliberately not planned yet** — see Open Questions. Refine this
only once [[019b-model-recommendations]] is done, and start that refine by reading the terms at
the source.

## Requirement

I already pay for Claude and for a ChatGPT plan. I want to know whether this app can use those
subscriptions instead of a second, metered bill — and if it can, set it up the same guided way
as everything else: sign in, see that it answered, done. No key pasting, no token copied out of
another tool's config file.

Where no sanctioned path exists, the app should say that plainly instead of offering a
workaround.

## Acceptance Criteria

- [ ] The models tab tells me, in one sentence each, whether my Claude plan and my ChatGPT plan
      can be used here, on what terms, and what it costs against the plan.
- [ ] Where a sanctioned path exists, setting it up is as guided as the rest: sign in, see that
      it answered, done — no key pasting, no token copied out of another tool's config.
- [ ] Where no sanctioned path exists, the app says that plainly instead of offering a
      workaround.
- [ ] What I have used against a plan is visible before it runs out, not only when requests start
      failing.
- [ ] A subscription target is routable for the same tasks as any other target, and the
      sensitive-task rule from [[019b-model-recommendations]] applies to it unchanged.
- [ ] Guardrails 1, 2, 6 and 7 hold as everywhere else: optional, proposed before applied, no
      vault content in logs, both languages complete.

## Open Questions

Both must be answered before this story can be planned. Neither can be answered from the
requirement text — the first needs primary sources, the second needs an architecture decision.

1. **Read the terms at the source, not from this file.** What was found on 2026-08-21, as a
   starting pointer only: Anthropic gives Pro/Max/Team/Enterprise plans a monthly Agent SDK
   credit ($20/$100/$200) that explicitly covers third-party apps authenticating through the
   Agent SDK, while reusing a Claude Code OAuth token in a third-party tool is **not**
   permitted ([support.claude.com](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)).
   For OpenAI the pointer is the Codex App Server, not the CLI's ChatGPT login. Terms of this
   kind change; re-read both before a line is written, and record the date they were read.

2. **Does a subscription target fit `LlmGateway`?** The gateway speaks two protocols today
   ([providers/](../../src/core/llm/providers/)): Anthropic Messages and OpenAI-compatible
   (`ProviderKind = 'anthropic' | 'openai-compatible' | 'fake'`,
   [src/shared/types/llm.ts:5](../../src/shared/types/llm.ts#L5)). An Agent SDK or App Server
   target is a third shape — possibly a spawned local process rather than an HTTP call, and
   possibly one that cannot honour the per-request no-training flag 019b introduces. Guardrail 4
   says the interface holds, so the burden of proof is on "it fits". If it does not, the answer
   is a documented exception in `CLAUDE.md`, not a quiet second abstraction.

   Sub-question that falls out of it: an OAuth sign-in needs a redirect and a stored refresh
   token. Where does that live — `safeStorage` in `userData` like the API keys, never in the
   vault (guardrail: keys never travel with it)?

3. **Is a plan-usage figure even readable?** The fourth acceptance criterion assumes the
   provider exposes remaining plan credit. If neither does, the criterion has to change to
   "what this app has spent against the plan", which needs the persisted usage log that
   [[019b-model-recommendations]] explicitly left out of scope.

## Plan

Not planned. Resolve the open questions first — a plan written on today's reading of the terms
would be wrong by the time it is built.

## Deliverables

None yet.

## Model Hints

Not set yet.

## Test Plan (manual acceptance)

Not written yet.

## Done
