---
id: 019d
title: Use my Claude and ChatGPT plans instead of a second metered bill
status: rejected # draft -> ready -> in-progress -> done | rejected
created: 2026-08-21
rejected: 2026-08-21
---

Part of [[019-model-recommendations-for-people-without-expertise]]. Would have delivered the
"subscriptions instead of keys" cluster. **Rejected on 2026-08-21** after the research this story
was waiting for was actually done — see Decision. This file stays as the record of what was read
and why the answer is no; it is not a plan and must not be built.

## Requirement

I already pay for Claude and for a ChatGPT plan. I want to know whether this app can use those
subscriptions instead of a second, metered bill — and if it can, set it up the same guided way
as everything else: sign in, see that it answered, done. No key pasting, no token copied out of
another tool's config file.

Where no sanctioned path exists, the app should say that plainly instead of offering a
workaround.

## Decision

**Dropped. There is no officially permitted path, so the app does not build one — not even an
"honest panel" variant.** The requirement's own escape hatch ("where no sanctioned path exists,
the app says that plainly") was offered as a reduced scope and declined: a settings panel whose
only content is "your subscriptions cannot be used here" is noise, not a feature. The user's
decision, verbatim in intent: if it is not officially allowed and supported, we drop it.

Consequence for the epic: the **"Subscriptions instead of keys"** acceptance cluster in
[019](019-model-recommendations-for-people-without-expertise.md) is dropped, not deferred. The
epic is complete with 019a–019c. The API-key path that already exists stays the only way to
reach Claude and OpenAI models from this app.

## Research record — read at the source on 2026-08-21

Kept because the terms change and the next person to raise this needs to know what was read,
not just the conclusion. **Re-read all of it before reopening the question.**

**Anthropic — explicitly not permitted without prior approval.**

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), note box:
  "Unless previously approved, Anthropic does not allow third party developers to offer
  claude.ai login or rate limits for their products, including agents built on the Claude Agent
  SDK. Use the API key authentication methods described in the Quickstart instead."
- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), section
  _Authentication and credential use_: "**OAuth authentication** is intended exclusively for
  purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed
  to support ordinary use of Claude Code and other native Anthropic applications." and
  "Anthropic does not permit third-party developers to offer Claude.ai login or to route
  requests through Free, Pro, or Max plan credentials on behalf of their users." Plus:
  "Anthropic reserves the right to take measures to enforce these restrictions and may do so
  without prior notice."
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
  — the article the original story pointed at. It does confirm a monthly Agent SDK credit
  (Pro $20, Max 5x $100, Max 20x $200, Team standard $20 / premium $100, Enterprise $20 /
  seat-based premium $200) and that it covers "Third-party apps that authenticate with your
  Claude subscription through the Agent SDK". **This is a billing statement, not a permission
  grant** — read together with the two documents above, it describes how already-approved
  integrations are metered. It names no authentication mechanism, no approval process, and no
  way to read remaining credit.
- Credit exhaustion: "additional Agent SDK usage flows to usage credits at standard API
  rates — but only if you've enabled usage credits. If usage credits aren't enabled, Agent SDK
  requests stop until your credit refreshes."

**OpenAI — a real integration surface exists, but the plan-sign-in question is undocumented.**

- "Sign in with ChatGPT" is an **identity provider**, not inference. The partner app receives
  name, e-mail address and profile picture. It is partner-gated (launch partners: Airtable,
  GitLab, HubSpot, Notion, Supabase, Vercel), not self-service.
  [help.openai.com](https://help.openai.com/en/articles/20001410-sign-in-with-chatgpt)
- [Codex authentication](https://learn.chatgpt.com/docs/auth): two methods, "Sign in with
  ChatGPT for subscription access" and API key. The browser flow belongs to the ChatGPT desktop
  app, the Codex CLI or the IDE extension; credentials are cached at `~/.codex/auth.json` or in
  the OS credential store. Nothing states whether a third-party product may drive that
  subscription session. No documented way to read remaining plan usage.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): the interface Codex uses to
  power rich clients, spawned as a subprocess (`codex app-server`), JSON-RPC 2.0 over
  newline-delimited stdio, requires the `codex` binary. It does expose per-thread token usage
  (`thread/tokenUsage/updated`, `tokensUsed`) — but per-thread spend, not remaining plan quota.

**What this would have cost architecturally, had it gone ahead.** Recorded so a future reopen
starts from the answer, not the question:

- The two open architecture questions had answers. A subscription target fits the inward
  `LlmProvider` seam ([src/core/llm/types.ts:58](../../src/core/llm/types.ts#L58):
  `complete`/`stream`/`listModels`/`probe`) as a fourth `ProviderKind`, with process spawning
  injected the way [src/core/ingest/node-adapters.ts](../../src/core/ingest/node-adapters.ts)
  already injects yt-dlp — so `src/core/` stays Electron-free and no `CLAUDE.md` exception is
  needed. Branch sites that would have had to grow a case:
  [factory.ts:24](../../src/core/llm/factory.ts#L24),
  [presets.ts:89](../../src/core/llm/presets.ts#L89),
  [reachability.ts:102](../../src/core/llm/reachability.ts#L102),
  [catalogue/index.ts:62](../../src/core/llm/catalogue/index.ts#L62),
  [main/ipc/llm.ts:24](../../src/main/ipc/llm.ts#L24).
- Neither CLI can honour the per-request no-training flag 019b introduces, so a subscription
  target would have carried `dataPolicy: 'unknown'` — which [[019b-model-recommendations]]'s
  rule already refuses for `classify-dump`, `extract-tasks` and `journal-chat`. The privacy
  guardrail would have held automatically; a subscription target would simply never have been
  routable for the three tasks the user most wants kept private.
- Acceptance criterion "usage visible before it runs out" was unbuildable as written: neither
  vendor exposes remaining plan credit. It could only have become "what this app has spent",
  which needs the persisted request log that 019b explicitly left out of scope (`Usage` is
  returned per call at [gateway.ts:179](../../src/core/llm/gateway.ts#L179) and dropped).

## Acceptance Criteria

Dropped with the story. Kept struck through so the epic's coverage table stays honest.

- ~~The models tab tells me, in one sentence each, whether my Claude plan and my ChatGPT plan
  can be used here, on what terms, and what it costs against the plan.~~
- ~~Where a sanctioned path exists, setting it up is as guided as the rest.~~
- ~~Where no sanctioned path exists, the app says that plainly instead of offering a
  workaround.~~ — declined explicitly: no panel for a non-feature.
- ~~What I have used against a plan is visible before it runs out.~~ — not readable from either
  vendor.
- ~~A subscription target is routable for the same tasks as any other target.~~
- ~~Guardrails 1, 2, 6 and 7 hold as everywhere else.~~

## Open Questions

None. All three were answered on 2026-08-21 — see Research record — and the answers closed the
story rather than unblocking it.

## Plan

None. Rejected, see Decision.

## Deliverables

None.

## Model Hints

None.

## Test Plan (manual acceptance)

None. Nothing was built.

## Done

Not done — **rejected**. No code, no test, no commit. This file is the decision record.

**If this is ever reopened,** the trigger is external, not internal: Anthropic granting an
approval (the "unless previously approved" clause) or OpenAI documenting that a third-party
product may drive a ChatGPT-plan Codex session. Re-read every source above first; all of it was
read on 2026-08-21 and terms of this kind change.
