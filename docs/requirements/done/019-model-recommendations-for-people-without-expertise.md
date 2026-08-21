---
id: 019
title: Models without expertise — guided install, a machine scan, and recommendations I can trust
status: done # draft -> ready -> in-progress -> done
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
- [ ] For cloud targets the recommendation carries an estimated cost **per run**, not just a
      price per million tokens. No monthly forecast — instead, what was actually spent in the
      last 30 days, once there is a request log to read it from (decided in question 5).
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

**Subscriptions instead of keys** — **dropped on 2026-08-21**, not deferred. No officially
permitted path exists (see [019d](019d-subscription-providers.md) for the sources read at the
time and the reasoning). The reduced "say plainly that it is not possible" variant was offered
and declined as well.

- ~~The models tab tells me, in one sentence each, whether my Claude plan and my ChatGPT plan
  can be used here, on what terms, and what it costs against the plan.~~
- ~~Where a sanctioned path exists, setting it up is as guided as the rest.~~
- ~~Where no sanctioned path exists, the app says that plainly instead of offering a
  workaround.~~
- ~~What I have used against a plan is visible before it runs out.~~

**Across all of it**

- [ ] Everything here is a proposal until I accept it (guardrail 2), and none of it is
      required for the app to work (guardrail 1) — I can skip the whole thing and still use
      the app.
- [ ] No hardcoded string in the renderer; both languages carry every new key (guardrail 7).
- [ ] No recommendation, scan result or log line contains vault content (guardrail 6).

## Open Questions

All resolved on 2026-08-21. Kept here as the record of what was decided and why.

1. **~~One story or several?~~** → Split into **019a–d**, order `scan → recommendation →
   install → subscriptions`. The recommendation is what makes the install worth anything, and
   the recommendation needs the scan to know what fits. Each part ships and is useful alone.
   Note the ID deviation: [README.md](README.md) asks for plain three-digit IDs. These four
   carry a letter suffix on purpose, so the epic stays visible in the filename; `/build 019a`
   resolves fine.

2. **~~What may "install Ollama" do?~~** → **Download the official installer, state size and
   target path, open it after confirmation.** The user clicks through it themselves. No
   elevation handling in the app, no package-manager dependency, same shape on every platform.
   Uninstalling is **out of scope** — the app says up front that it leaves the runtime behind.
   Ollama, not llama.cpp: it carries the model registry and `POST /api/pull` gives the
   progress stream the acceptance criteria ask for. The app already has it as a preset
   ([presets.ts:11](../../src/core/llm/presets.ts#L11)) and probes it
   ([llm-detect.ts:49](../../src/main/ipc/llm-detect.ts#L49)).

3. **~~Where does the scan live?~~** → As proposed: **main detects, core judges.** Main
   reports a flat `MachineFacts` object (`os`, `child_process`); `src/core/llm/capacity.ts`
   turns it into a verdict and stays testable without a machine. → 019a.

4. **~~Where does the catalogue come from?~~** → **Curated list in the repo plus live fetch.**
   Bundled JSON is the offline fallback and the source of truth for data policy; OpenRouter's
   models API enriches prices when there is network. Maintenance commitment: the bundled list
   is updated by hand, once per release, and carries the date it was written. → 019b.

5. **~~How much usage is "my usage"?~~** → **Cost per run only.** No prediction from vault
   history — at first setup the vault is empty, which is exactly when the number would be
   shown. The month figure becomes "what you actually spent in the last 30 days", from the
   app's own request log, not a forecast. This narrows the acceptance criterion below.

6. **~~Subscription terms.~~** → Read at the source on 2026-08-21 during the 019d refine.
   Anthropic forbids it outright without prior approval ("Unless previously approved, Anthropic
   does not allow third party developers to offer claude.ai login or rate limits for their
   products, including agents built on the Claude Agent SDK"); OpenAI's "Sign in with ChatGPT"
   is identity only and partner-gated, and nothing documents a third party driving a
   ChatGPT-plan Codex session. → **019d rejected**, cluster dropped. Full record in
   [019d](019d-subscription-providers.md).

7. **~~Does a subscription target fit `LlmGateway`?~~** → Yes, at the inward `LlmProvider` seam
   with an injected process runner — no `CLAUDE.md` exception needed. Moot: 019d is rejected.
   The answer is recorded in 019d in case the question ever comes back.

8. **~~Only for the first five minutes?~~** → **No.** The machine card and the recommendation
   section live permanently in the models tab, not inside `StartCard`. Re-checking is always
   available and **strictly manual** — nothing in the app ever prompts it.

## Plan

**This file is the epic. Do not run `/build 019`.** It holds the vision, the full acceptance
criteria and the decision record; the buildable work lives in four child stories.

| Story | Scope | Depends on |
| --- | --- | --- |
| [019a](019a-machine-scan.md) | Machine scan: facts from main, verdict from core, card in the models tab | — |
| [019b](019b-model-recommendations.md) | Catalogue, reachability, per-task recommendation, sensitive-task rule | 019a |
| [019c](019c-guided-local-runtime.md) | Guided Ollama install and model pull with progress | 019a |
| ~~[019d](019d-subscription-providers.md)~~ | Claude / ChatGPT plan instead of a metered key — **rejected 2026-08-21**, no permitted path | — |

Coverage of the criteria above:

- **Guided local runtime** → 019c
- **Machine scan** → 019a
- **Recommendations per task** → 019b
- **Personal tasks** → 019b
- **Subscriptions instead of keys** → dropped with 019d, no successor story
- **Across all of it** → each child story repeats it as its own criterion

## Deliverables

None. The deliverables are in the child stories.

## Model Hints

None. Set per child story.

## Test Plan (manual acceptance)

None. Acceptance happens per child story.

## Done

**Complete — 3 built, 1 rejected.** 019a, 019b and 019c were built in
[sprint S06](../sprints/done/S06/sprint.md) and accepted by the user on 2026-08-21.
[019d](019d-subscription-providers.md) (subscriptions instead of keys) was refined the same day:
the research it was waiting on was done at the source and the answer closed the story instead of
unblocking it — Anthropic forbids third-party apps from using a Claude plan without prior
approval, and OpenAI documents no path either. The user rejected the story, including the
reduced "state it plainly in the UI" variant. The **"Subscriptions instead of keys"** criteria
above are therefore **dropped, not deferred**, and this epic is done.
