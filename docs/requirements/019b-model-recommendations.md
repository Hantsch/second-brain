---
id: 019b
title: One recommended model per task, in plain language and in money
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-21
---

Part of [[019-model-recommendations-for-people-without-expertise]]. Delivers the
"recommendations per task" and "personal tasks" clusters. Builds on
[[019a-machine-scan]] — the capacity verdict decides what counts as reachable.

## Requirement

The models tab asks me to assign a model to ten tasks I have never heard of. I want the app to
propose one target per task with a sentence I can understand without knowing what a token is,
plus what I give up by taking the cheaper or the local option, plus what a run costs in money.

Two hard lines. First: it may only name things I can actually reach — installed locally,
pullable on this machine, or behind a provider I have configured. Never a name I have no way to
get to. Second: my journal, my dumps and my extracted todos are personal. A recommendation for
a `sensitive` task ([tasks.ts](../../src/core/llm/tasks.ts)) may only name a target that does
not train on my content, and where the provider lets it be enforced per request, it is enforced
per request. If nothing qualifies, the task stays unrouted — the rule does not bend to produce
a recommendation.

**Not in scope:** a monthly cost forecast. Nothing persists usage today (`Usage` is returned
per call at [gateway.ts:179](../../src/core/llm/gateway.ts#L179) and then dropped), so "spent
in the last 30 days" needs a usage log that does not exist. Cost per run only; the log is a
separate story.

## Acceptance Criteria

- [ ] For each of the ten tasks I get one recommended target with a one-sentence reason that
      uses no jargon, plus one sentence on what I give up versus the cheaper or the local
      option.
- [ ] Recommendations only name reachable targets: installed locally, runnable on this machine
      if pulled (marked "needs a download of X GB"), or behind a configured cloud provider.
- [ ] For cloud targets the recommendation shows an estimated cost per run, derived from the
      task's typical token counts and the catalogue price — labelled as an estimate.
- [ ] Accepting writes the routing in one confirmed step; rejecting leaves routing untouched.
- [ ] I can accept the whole set or a single task, the way the existing routing diff already
      lets me.
- [ ] A recommendation for a `sensitive` task (`classify-dump`, `extract-tasks`,
      `journal-chat`) never names a target that may train on the content. Local always
      qualifies; a cloud endpoint only if its data policy says no training.
- [ ] For each sensitive recommendation the app shows **which policy it read and when it read
      it** — the source and the date, not a claim.
- [ ] On OpenRouter, a sensitive request enforces no-training **per request** and refuses a
      non-qualifying endpoint instead of falling through to one.
- [ ] If nothing qualifies for a sensitive task, the app says so and leaves the task without a
      model. It does not weaken the rule.
- [ ] **A test proves the rule:** with only a trains-on-input cloud model available, the three
      sensitive tasks come back unrouted.
- [ ] With no network, recommendations still come — from the bundled catalogue — and the app
      says the prices may be stale, naming the catalogue's date.
- [ ] Everything is a proposal until accepted (guardrail 2). Skipping it entirely leaves the app
      fully usable (guardrail 1).
- [ ] No hardcoded string in the renderer; `de.ts` and `en.ts` both carry every new key.
- [ ] No recommendation, log line or error message contains vault content (guardrail 6).

## Open Questions

None.

## Plan

The engine is pure core; the only new I/O is the catalogue fetch (injected) and one IPC channel.
The accept step reuses the existing routing commit path
([RoutingSection.tsx](../../src/renderer/screens/settings/RoutingSection.tsx),
`llm:setRoute` / `llm:setDefault`) rather than inventing a second writer.

1. **Catalogue** — new `src/core/llm/catalogue/models.json` (curated, carries a
   `generatedAt` date) plus `catalogue/index.ts`: entry type `{ id, providerKind, paramsB,
   sizeOnDiskGb, quantisation, priceInPerMTok, priceOutPerMTok, dataPolicy: 'no-training' |
   'trains' | 'unknown', policySource, policyReadAt }`. Loader merges live data over bundled.
2. **Live enrichment** — OpenRouter `/api/v1/models` for prices, `/api/v1/models/:author/:slug/
   endpoints` for per-endpoint data policy; local models from the existing
   `OpenAiCompatibleProvider.listModels()`
   ([openai-compatible.ts:115](../../src/core/llm/providers/openai-compatible.ts#L115)). Fetch
   is injected, cached with a timestamp, and failure falls back to bundled — never an error
   screen.
3. **Typical tokens per task** — add `typicalTokens: { in, out }` next to `suggested` on
   `TaskDefinition` ([src/shared/types/llm.ts:84](../../src/shared/types/llm.ts#L84)),
   populated in [tasks.ts](../../src/core/llm/tasks.ts). Commented as a heuristic. Cost per run
   is `in/1e6 * priceIn + out/1e6 * priceOut`.
4. **Reachability** — `src/core/llm/reachability.ts`: catalogue + configured providers +
   installed local models + the 019a capacity verdict → `{ reachable, needsDownloadGb, notHere,
   reason }` per model. Pure.
5. **The rule** — `src/core/llm/sensitive.ts`: a candidate is allowed for a sensitive task iff
   it is local **or** `dataPolicy === 'no-training'`. `'unknown'` is not good enough. Pure, and
   the mandated test lives beside it.
6. **Recommendation** — `src/core/llm/recommend.ts`: per task, filter by reachability, apply the
   sensitive rule, rank by tier fit then cost, return `{ task, pick | null, reasonKey,
   tradeoffKey, costPerRun, policySource, policyReadAt, alternatives }`. Structured data only —
   no formatted sentences from core.
7. **Per-request enforcement** — in
   [openai-compatible.ts](../../src/core/llm/providers/openai-compatible.ts): when the call is
   for a sensitive task and the base URL is OpenRouter, send `provider: { data_collection:
   'deny' }` and treat a non-qualifying response as a failure. Anthropic and local need no flag.
8. **IPC** — `llm:recommendModels` in [src/shared/ipc.ts](../../src/shared/ipc.ts), handler in
   [src/main/ipc/llm.ts](../../src/main/ipc/llm.ts) beside `llm:suggestRouting`.
9. **Renderer** — new `src/renderer/screens/settings/RecommendationSection.tsx`, mirroring
   `RoutingSection.tsx`: one row per task with target, reason, tradeoff, cost per run, and for
   sensitive tasks the policy source and date; accept-all and accept-row both commit through
   `setRoute`. Placed in [ModelsTab.tsx](../../src/renderer/screens/settings/ModelsTab.tsx).
10. **i18n + tests** in both languages; fixture-driven core tests, no network, no real LLM.

## Deliverables

**D1 — Catalogue type, curated file, loader**
New `src/core/llm/catalogue/models.json`, `src/core/llm/catalogue/index.ts`, new
`tests/core/llm/catalogue.test.ts`. Also a short "who curates this, how often" note in
[docs/requirements/README.md](README.md) or a header comment in the JSON — once per release,
by hand, with `generatedAt`.
*Accepted when:* the loader parses the bundled file, rejects a malformed entry with a named
error, and the test asserts every entry has a `dataPolicy` and a `policySource`.

**D2 — Live enrichment with offline fallback**
`src/core/llm/catalogue/index.ts`, new `src/core/llm/catalogue/openrouter.ts`, tests with an
injected fake fetch. Merge live prices and per-endpoint policy over bundled; cache with a
timestamp; on any failure use bundled and mark the result `stale`.
*Accepted when:* three tests pass — live wins over bundled, a failing fetch falls back
silently with `stale: true`, and a partial response only overwrites the fields it carries.

**D3 — Typical tokens per task**
`src/shared/types/llm.ts`, `src/core/llm/tasks.ts`, existing task tests. Add
`typicalTokens` to all ten definitions with a comment on where the numbers come from.
*Accepted when:* `npm run typecheck` is green and a test asserts all ten tasks carry the field.

**D4 — Reachability filter**
New `src/core/llm/reachability.ts` + test. Takes catalogue, configured providers, installed
local model ids and the 019a `CapacityVerdict`; returns per model whether it is reachable now,
after a download of N GB, or not at all with a reason.
*Accepted when:* fixtures cover all four outcomes and no unreachable model survives the filter.

**D5 — The sensitive-task rule** *(risky, see Model Hints)*
New `src/core/llm/sensitive.ts`, new `tests/core/llm/sensitive.test.ts`. Local or
`'no-training'` only; `'unknown'` is refused. Carries the policy source and date through.
*Accepted when:* the mandated test passes — catalogue with only a trains-on-input cloud model
plus no local runtime ⇒ `classify-dump`, `extract-tasks`, `journal-chat` all come back with
`pick: null` and a reason, while non-sensitive tasks are still routed.

**D6 — Recommendation and cost per run**
New `src/core/llm/recommend.ts` + test. Ranking, reason/tradeoff keys, cost per run,
alternatives. Structured output only.
*Accepted when:* fixture machines (local-only, cloud-only, both, nothing configured) each
produce ten entries, cost matches the hand-computed figure, and the no-provider case returns
ten `pick: null` with an honest reason instead of throwing.

**D7 — Per-request no-training enforcement on OpenRouter** *(risky, see Model Hints)*
`src/core/llm/providers/openai-compatible.ts`, `src/core/llm/gateway.ts` (pass the sensitive
flag down), provider tests.
*Accepted when:* a test asserts the request body carries `provider.data_collection = 'deny'`
for a sensitive task on an OpenRouter base URL, carries nothing extra for a non-sensitive task
or a local base URL, and that a refused endpoint surfaces as an error rather than a retry
without the flag.

**D8 — IPC channel and handler**
`src/shared/ipc.ts`, `src/main/ipc/llm.ts`. Mirror: the `llm:suggestRouting` entry at
[llm.ts:187](../../src/main/ipc/llm.ts#L187).
*Accepted when:* `tests/main/ipc-coverage.test.ts` passes with the new channel.

**D9 — Recommendation section in the models tab**
New `src/renderer/screens/settings/RecommendationSection.tsx`, `ModelsTab.tsx`,
`src/renderer/lib/api.ts`, `src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts`. Mirror:
`RoutingSection.tsx` for the diff-and-apply shape and
[ProposalCard.tsx](../../src/renderer/components/ProposalCard.tsx) for the reason line.
*Accepted when:* all ten tasks render with target, reason, tradeoff and cost; accept-all and
accept-row both persist through `setRoute`; discard changes nothing; sensitive rows show the
policy source and date; both languages complete; `npm run lint` finds no raw palette class.

## Model Hints

- `D5 → deliverable-hard` — this is the privacy guardrail in one function: a false negative
  (treating `'unknown'` or a stale policy as acceptable) silently routes journal and dump
  content to an endpoint that trains on it, and nothing downstream would catch it.
- `D7 → deliverable-hard` — it edits the request builder every provider call goes through; a
  wrong condition either breaks ordinary calls or drops the enforcement without a visible
  symptom, and the fall-through-refusal path is the subtle part.
- D1, D2, D3, D4, D6, D8, D9 → default.
- `Review: → story-review-hard` — the story's whole point is a rule that fails silently. A
  reviewer has to check the sensitive path end to end (catalogue policy → filter →
  recommendation → per-request flag) against the spec, which the cheap tier will not do
  reliably.

## Test Plan (manual acceptance)

**1. Verify and seed** (PowerShell, repo root)

```powershell
npm run verify
```

Expected: all green, including the new sensitive-rule test. If red, stop and show the output.

```powershell
npm run seed
```

**2. Start the app**

```powershell
npm run dev
```

**3. With nothing configured** — Settings → Models. The recommendation section is present and
says honestly that nothing is reachable yet. No crash, no empty panel, no spinner that stays.

**4. Local only.** Configure the Ollama provider in the UI (Providers → add → Ollama) with
Ollama running. Return to the recommendation section and press refresh. Expect: ten rows, each
naming a local model or "needs a download of X GB", no cost figure on local rows. The three
sensitive rows show a local target.

**5. Cloud.** Add an OpenRouter provider with your key through the UI. Refresh. Expect: cost per
run on cloud rows, and the three sensitive rows either still local or a cloud endpoint that
names its policy source and the date it was read. If any sensitive row names an endpoint
without a policy line, that is a failure.

**6. Accept.** Press accept on one row. The routing section above updates for that task only.
Press discard on the rest. Then:

```powershell
git -C .demo-vault diff .secondbrain/settings.json
```

Expected: exactly the one accepted task appears under `routing.tasks`. Nothing else.

**7. Offline.** Disable the network adapter, refresh the recommendations. Expect: rows still
appear, plus a visible note that prices come from the bundled catalogue with its date. Re-enable
the adapter afterwards.

**8. Language.** Switch UI language and revisit. Every label, reason and tradeoff translated.

**9. Screenshots**

```powershell
npm run shot
```

Expected: PNGs in `.screenshots/`; the models tab shot shows the recommendation section.

## Done
