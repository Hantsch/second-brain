---
id: 019
title: Models without expertise — guided install, a machine scan, and recommendations I can trust
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-21
---

## Requirement

I have no idea about LLMs. I don't know what a parameter count is, what a token costs,
whether 8 GB of VRAM is a lot, or which of the 400 names on OpenRouter is the sane one for
"write me a title". Today the app asks me to pick a provider, paste a key and then assign a
model to ten tasks I have never heard of. If I already have Ollama running it offers to adopt
it — but if I don't, all I get is a link to a website and a command to type into a terminal.
Both ends of that leave me stuck: I can't install the local runtime from here, and once I have
one I still don't know what to put where.

I want the app to do the knowing for me, and to be honest about what it is guessing.

Three things follow from that:

1. **Getting a local runtime has to be a guided path inside the app**, not a homework
   assignment. Detect whether one is installed, install it if not, start it, and pull the
   models the app actually recommends for this machine — with progress I can watch and a
   clear statement of how much disk it takes and how long it will run. Not a terminal command
   in a hint text.

2. **The app should look at my machine and tell me what it can carry.** RAM, VRAM, GPU, CPU,
   free disk. From that: which models actually run here at a usable speed, which would run
   but crawl, which don't fit at all — and per task, which of the ones that fit is the right
   one. A 32 GB machine with an 8 GB GPU is a different recommendation from a 96 GB laptop
   with none, and I shouldn't have to know why.

3. **For cloud, the recommendation is about value for money, not about the biggest model.**
   For each task: what it would cost me per run, and the cheapest model that is still good
   enough for that task. `title-tags` does not need the model that `gardener-audit` needs,
   and the app already knows that ([tasks.ts](../../src/core/llm/tasks.ts) carries a tier per
   task) — it should say it in money, not in tiers.

And one hard line inside all of that: my journal, my dumps, my extracted todos are
**personal**. A recommendation for a `sensitive` task may only ever name a target that does
not train on my content. Local always qualifies. On OpenRouter that means the recommendation
is restricted to endpoints whose data policy says no training, and the request enforces it —
not "probably fine". If nothing qualifies, the app says the task stays local or stays off; it
does not quietly recommend a cheaper endpoint that trains.

Separate from keys: I already pay for Claude and for a ChatGPT plan. I want to know whether
this app can use those subscriptions instead of a second, metered bill — and if it can, set
it up the same guided way. Since June 2026 Anthropic covers third-party Agent SDK apps out of
a monthly subscription credit ([support.claude.com](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)),
so this is a real path and not a hack — but reusing a Claude Code OAuth token directly is
explicitly not allowed, so it has to be the sanctioned one.

## Acceptance Criteria

**Guided local runtime**

- [ ] From the models tab I get to a working local runtime without leaving the app and
      without typing a command: the app tells me whether one is installed, offers to install
      it if not, and starts it. Every step states what it is about to do before it does it,
      and I can stop.
- [ ] Installing is a proposal I confirm, not an automatic action — download size, install
      location and where it puts model data are named beforehand.
- [ ] Pulling a model shows progress, size and what is left, survives me looking at another
      screen, and can be cancelled without leaving a broken half-model behind.
- [ ] If installing isn't possible on this machine (no permission, unsupported platform, not
      enough disk), I get the reason in one sentence plus the manual path — not a spinner
      that never ends.

**Machine scan**

- [ ] I can trigger a scan of this machine and get a plain-language verdict: what it can
      carry, and the one number that limits it ("16 GB RAM, no usable GPU — models up to
      about 8B run, larger ones will crawl").
- [ ] The scan names its own uncertainty. It is a heuristic and says so; nothing it reports
      is presented as measured throughput unless it was actually measured.
- [ ] The scan changes nothing on its own. It produces a proposal.

**Recommendations per task**

- [ ] For each of the ten tasks I get one recommended target with a one-sentence reason I can
      understand without knowing what a token is — plus what I give up by taking the cheaper
      or the local option.
- [ ] Recommendations only name what I can actually reach: models installed locally, models
      this machine could run if pulled (marked as "needs a download of X"), and models behind
      configured cloud providers. Never a name I have no way to get to.
- [ ] For cloud targets the recommendation carries an estimated cost per run and per month at
      my usage, not just a price per million tokens.
- [ ] Accepting a recommendation writes the routing in one confirmed step, the way the
      existing routing proposal already does; rejecting it leaves routing untouched.

**Personal tasks**

- [ ] A recommendation for a `sensitive` task ([tasks.ts](../../src/core/llm/tasks.ts):
      `classify-dump`, `extract-tasks`, `journal-chat`) never names a target that may train on
      the content. Local is always allowed; a cloud endpoint only if its data policy states
      no training — and the app shows which policy it read, and when it read it.
- [ ] Where the provider lets it be enforced per request, it is enforced per request — not
      left to an account setting I might change later. On OpenRouter, a sensitive request
      refuses a non-qualifying endpoint instead of falling through to one.
- [ ] If nothing qualifies for a sensitive task, the app says so and leaves the task without
      a model. It does not weaken the rule to produce a recommendation.
- [ ] A test proves the rule: with only a trains-on-input cloud model available, the sensitive
      tasks come back unrouted.

**Subscriptions instead of keys**

- [ ] The models tab tells me, in one sentence each, whether my Claude plan and my ChatGPT
      plan can be used here, on what terms, and what it costs against the plan.
- [ ] Where a sanctioned path exists, setting it up is as guided as the rest: sign in, see
      that it answered, done — no key pasting, no token copied out of another tool's config.
- [ ] Where no sanctioned path exists, the app says that plainly instead of offering a
      workaround.
- [ ] What I have used against a plan is visible before it runs out, not only when requests
      start failing.

**Across all of it**

- [ ] Everything here is a proposal until I accept it (guardrail 2), and none of it is
      required for the app to work (guardrail 1) — I can skip the whole thing and still use
      the app.
- [ ] No hardcoded string in the renderer; both languages carry every new key (guardrail 7).
- [ ] No recommendation, scan result or log line contains vault content (guardrail 6).

## Open Questions

1. **This is more than one story.** As written it has four separable clusters — guided
   install, machine scan, recommendation engine, subscription providers — each of which can
   ship alone and be useful alone. Should `/refine` split it into 019a–d (recommended; order:
   scan → recommendation → install → subscriptions, because the recommendation is what makes
   the install worth anything), or plan it as one sprint-sized story?

2. **What exactly is "install Ollama" allowed to be?** Downloading and running an installer is
   a privileged act on the user's machine and needs its own decision: silent install, hand off
   to the platform package manager (`winget`, `brew`), or download plus "here is the
   installer, click it". The last is the least clever and the most honest — confirm before
   refine plans one of the others. Related: does uninstalling belong in scope, or may the app
   leave behind something it can't remove?

3. **Where does the machine scan live?** GPU and VRAM detection is platform-specific and can't
   sit in `src/core/` (guardrail 5 — and `os`/`child_process` is main's business anyway).
   Proposal: main detects and reports a plain fact object, `src/core/llm/` owns the judgement
   ("this fits / this crawls") and stays testable without a machine. Confirm the split before
   it gets built the other way round.

4. **Where does the model catalogue come from?** A recommendation needs facts the app doesn't
   have today: size on disk, quantisation, price per million tokens, data policy. Three
   options — bundle a curated list in the repo (offline, honest, goes stale), fetch from the
   providers' own APIs at scan time (current, needs network and a cache), or both with the
   bundled list as the offline fallback. The last is probably right, but "who curates the
   bundled list, how often" is a maintenance commitment worth naming before we take it on.

5. **How much usage is "my usage"?** A cost per month needs a request volume. Estimate it from
   the vault's own history (dumps per week, journal days, sources ingested), ask me for a rough
   band ("a few notes a day" / "all day"), or show cost per run only and stay out of
   prediction. The first is the most useful and the most likely to be wrong.

6. **The subscription terms must be read at the source during refine, not taken from here.**
   What I found on 2026-08-21: Anthropic gives Pro/Max/Team/Enterprise plans a monthly Agent
   SDK credit ($20/$100/$200) that explicitly covers third-party apps authenticating through
   the Agent SDK, while reusing a Claude Code OAuth token in a third-party tool is not
   permitted. For OpenAI the pointer is the Codex App Server, not the CLI's ChatGPT login.
   Both change the shape of the provider abstraction (see question 7), so both need checking
   before a line is written.

7. **Does a subscription target even fit `LlmGateway`?** The gateway speaks two protocols
   today ([providers/](../../src/core/llm/providers/)): Anthropic Messages and
   OpenAI-compatible. An Agent SDK / App Server target is a third shape, possibly a spawned
   local process rather than an HTTP call. Whether that is a third provider behind the same
   interface or a separate concept has to be decided before build — guardrail 4 says the
   interface holds, so the burden of proof is on "it fits".

8. **Is the recommendation only for the first five minutes?** Today the entry point is the
   models tab's `StartCard`, shown while no provider exists. But the recommendation is also
   what someone wants six months in, when a model got cheaper or they bought a GPU. Is there a
   "re-check my setup" path, and does anything ever prompt it, or is it strictly manual?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
