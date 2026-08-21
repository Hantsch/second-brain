---
id: 019b
title: One recommended model per task, in plain language and in money
status: done # draft -> ready -> in-progress -> done
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

- [x] For each of the ten tasks I get one recommended target with a one-sentence reason that
      uses no jargon, plus one sentence on what I give up versus the cheaper or the local
      option.
- [x] Recommendations only name reachable targets: installed locally, runnable on this machine
      if pulled (marked "needs a download of X GB"), or behind a configured cloud provider.
- [x] For cloud targets the recommendation shows an estimated cost per run, derived from the
      task's typical token counts and the catalogue price — labelled as an estimate.
- [x] Accepting writes the routing in one confirmed step; rejecting leaves routing untouched.
- [x] I can accept the whole set or a single task, the way the existing routing diff already
      lets me.
- [x] A recommendation for a `sensitive` task (`classify-dump`, `extract-tasks`,
      `journal-chat`) never names a target that may train on the content. Local always
      qualifies; a cloud endpoint only if its data policy says no training.
- [x] For each sensitive recommendation the app shows **which policy it read and when it read
      it** — the source and the date, not a claim.
- [x] On OpenRouter, a sensitive request enforces no-training **per request** and refuses a
      non-qualifying endpoint instead of falling through to one.
- [x] If nothing qualifies for a sensitive task, the app says so and leaves the task without a
      model. It does not weaken the rule.
- [x] **A test proves the rule:** with only a trains-on-input cloud model available, the three
      sensitive tasks come back unrouted.
- [x] With no network, recommendations still come — from the bundled catalogue — and the app
      says the prices may be stale, naming the catalogue's date.
- [x] Everything is a proposal until accepted (guardrail 2). Skipping it entirely leaves the app
      fully usable (guardrail 1).
- [x] No hardcoded string in the renderer; `de.ts` and `en.ts` both carry every new key.
- [x] No recommendation, log line or error message contains vault content (guardrail 6).

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

**D1 — Catalogue type, curated file, loader** [x]
New `src/core/llm/catalogue/models.json`, `src/core/llm/catalogue/index.ts`, new
`tests/core/llm/catalogue.test.ts`. Also a short "who curates this, how often" note in
[docs/requirements/README.md](README.md) or a header comment in the JSON — once per release,
by hand, with `generatedAt`.
_Accepted when:_ the loader parses the bundled file, rejects a malformed entry with a named
error, and the test asserts every entry has a `dataPolicy` and a `policySource`.

**D2 — Live enrichment with offline fallback** [x]
`src/core/llm/catalogue/index.ts`, new `src/core/llm/catalogue/openrouter.ts`, tests with an
injected fake fetch. Merge live prices and per-endpoint policy over bundled; cache with a
timestamp; on any failure use bundled and mark the result `stale`.
_Accepted when:_ three tests pass — live wins over bundled, a failing fetch falls back
silently with `stale: true`, and a partial response only overwrites the fields it carries.

**D3 — Typical tokens per task** [x]
`src/shared/types/llm.ts`, `src/core/llm/tasks.ts`, existing task tests. Add
`typicalTokens` to all ten definitions with a comment on where the numbers come from.
_Accepted when:_ `npm run typecheck` is green and a test asserts all ten tasks carry the field.

**D4 — Reachability filter** [x]
New `src/core/llm/reachability.ts` + test. Takes catalogue, configured providers, installed
local model ids and the 019a `CapacityVerdict`; returns per model whether it is reachable now,
after a download of N GB, or not at all with a reason.
_Accepted when:_ fixtures cover all four outcomes and no unreachable model survives the filter.

**D5 — The sensitive-task rule** _(risky, see Model Hints)_ [x]
New `src/core/llm/sensitive.ts`, new `tests/core/llm/sensitive.test.ts`. Local or
`'no-training'` only; `'unknown'` is refused. Carries the policy source and date through.
_Accepted when:_ the mandated test passes — catalogue with only a trains-on-input cloud model
plus no local runtime ⇒ `classify-dump`, `extract-tasks`, `journal-chat` all come back with
`pick: null` and a reason, while non-sensitive tasks are still routed.

**D6 — Recommendation and cost per run** [x]
New `src/core/llm/recommend.ts` + test. Ranking, reason/tradeoff keys, cost per run,
alternatives. Structured output only.
_Accepted when:_ fixture machines (local-only, cloud-only, both, nothing configured) each
produce ten entries, cost matches the hand-computed figure, and the no-provider case returns
ten `pick: null` with an honest reason instead of throwing.

**D7 — Per-request no-training enforcement on OpenRouter** _(risky, see Model Hints)_ [x]
`src/core/llm/providers/openai-compatible.ts`, `src/core/llm/gateway.ts` (pass the sensitive
flag down), provider tests.
_Accepted when:_ a test asserts the request body carries `provider.data_collection = 'deny'`
for a sensitive task on an OpenRouter base URL, carries nothing extra for a non-sensitive task
or a local base URL, and that a refused endpoint surfaces as an error rather than a retry
without the flag.

**D8 — IPC channel and handler** [x]
`src/shared/ipc.ts`, `src/main/ipc/llm.ts`. Mirror: the `llm:suggestRouting` entry at
[llm.ts:187](../../src/main/ipc/llm.ts#L187).
_Accepted when:_ `tests/main/ipc-coverage.test.ts` passes with the new channel.

**D9 — Recommendation section in the models tab** [x]
New `src/renderer/screens/settings/RecommendationSection.tsx`, `ModelsTab.tsx`,
`src/renderer/lib/api.ts`, `src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts`. Mirror:
`RoutingSection.tsx` for the diff-and-apply shape and
[ProposalCard.tsx](../../src/renderer/components/ProposalCard.tsx) for the reason line.
_Accepted when:_ all ten tasks render with target, reason, tradeoff and cost; accept-all and
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

**Summary.** Built the full recommendation pipeline: a curated + live-enriched model catalogue
(D1/D2), typical token counts per task (D3), a reachability filter honouring the 019a capacity
verdict (D4), a hard-gated sensitive-task rule refusing anything but local/`no-training`
targets (D5), the ranking/cost engine (D6), per-request `data_collection: 'deny'` enforcement
on OpenRouter (D7), the `llm:recommendModels` IPC channel (D8), and a new "Model recommendation"
panel in the models tab with accept-row/accept-all/discard (D9). Two review-fix cycles closed a
privacy-relevant reachability bug and several UX/attribution issues before sign-off.

**Commit message:**

```
019b: recommend one model per task, with cost, download size and the sensitive-task rule
```

**Verification:**

- `npm run format:check` / `lint` / `typecheck` / `build`: green.
- `npm test`: green except one pre-existing, unrelated failure
  (`tests/core/wiki/module.test.ts`, a drift check between `MODULE_SCHEMA_TEMPLATE` and
  `docs/MODULE-SCHEMA.md` — confirmed untouched by this story via `git log`/`git status` on
  both files, predates this branch).
- Live smoke: `npm run seed && npm run shot` — 60 screenshots, no console errors. Added a
  scrolled `settings-models-bottom` shot (mirroring the existing `settings-behavior-bottom`
  pattern) since the new panel pushed the tab past one screen; it shows the panel's honest
  "nothing configured yet" state. Interactive behaviour (fetch, accept-row, accept-all,
  discard, sensitive policy citations, stale-catalogue note) is covered by 32 renderer tests
  against the real component tree — no live Ollama/OpenRouter credentials exist in this
  environment to drive test-plan steps 4/5/6/7 through the actual app, so those remain manual
  acceptance steps for whoever has a configured machine (steps 1–3, 8–9 were performed here).
- Code review: two rounds with `story-review-hard` (clean agent). Round 1 found a BLOCKER
  (see Decisions) plus 8 other findings — all fixed. Round 2 re-verified the fixes (all
  RESOLVED) and found 5 further issues (A, B, C, D, E) — A, B, C, E fixed; D documented below
  as a known, non-exploitable limitation rather than fixed, to avoid a larger unplanned
  redesign this late in the story.

**Decisions:**

- **Privacy-critical fix (round 1 BLOCKER):** `reachability.ts`'s `matchingProviders()` and
  `recommend.ts`'s `resolveProvider()` used to fall back to "any enabled provider of the right
  kind" when resolving a cloud catalogue entry. Since Ollama and OpenRouter share the
  `providerKind` `'openai-compatible'`, a configured local Ollama provider could satisfy
  reachability for an unrelated _cloud_ entry — including a trains-on-input one — without its
  `dataPolicy` ever being checked, because the sensitive-task rule trusts `provider.local` as
  proof nothing leaves the machine. Fixed by requiring an exact `provider.local === wantsLocal`
  match with no fallback in both places, and rewrote the reachability test that had encoded the
  old (wrong) behaviour as intended.
- **Installed-model id mismatch:** catalogue ids carry a vendor prefix
  (`ollama/qwen2.5-coder:7b`); a real runtime's `listModels()` reports the bare id
  (`qwen2.5-coder:7b`). Fixed with a bare-suffix match (`isInstalled` in `reachability.ts`,
  reused by `recommend.ts`) instead of exact `Array.includes`.
- **Multi-runtime provider attribution (round 2, finding A):** with two local runtimes
  configured (e.g. Ollama and LM Studio), `resolveProvider` now prefers the specific one whose
  own `models` list actually carries the entry, instead of the first enabled local match —
  otherwise a route could point at a runtime that never pulled the model.
- **Disabled provider still counted as installed (round 2, finding B):** `llm-bridge.ts` now
  excludes disabled local providers when building `installedLocalModelIds`, so a model only
  present on a switched-off runtime is no longer reported reachable.
- **Dead-end accept button (round 1, finding 4):** a `needs-download` pick with no runtime
  configured yet carries a documented placeholder `providerId` that `llm:setRoute` would reject.
  `RecommendationRow`/`RecommendationSection` now only offer accept (row or all) when the pick
  names an actually configured provider, and accept-all records each success immediately
  instead of only after the whole loop finishes.
- **Not fixed — documented limitation (round 2, finding D):** a live OpenRouter policy lookup
  is applied to any catalogue entry whose id happens to parse as an OpenRouter `author/slug`,
  regardless of which concrete provider the user is actually routed through (e.g. Anthropic- or
  OpenAI-direct). With today's bundled catalogue this is latent, not live — the non-OpenRouter
  entries' ids (`openrouter/some-free-model`, `openai-compatible/unlisted-third-party`) don't
  resolve as real OpenRouter authors, so the lookup 404s and the bundled policy is kept
  unchanged (verified in `catalogue-live.test.ts`). Fixing it properly means attributing a live
  policy per-provider-instance rather than per-catalogue-entry, which is a larger change than a
  review-fix cycle should absorb this late in the story; flagging it here for a follow-up rather
  than expanding scope silently.
- Cost figures use `Intl.NumberFormat` with 4 fraction digits (`formatCostUsd` in
  `src/renderer/lib/format.ts`) since typical per-run costs are sub-cent.
- `TaskRecommendation.needsDownloadGb` was added to `@shared/types` mid-build (not in the
  original D6 output) so the renderer could satisfy the "needs a download of X GB" acceptance
  line — threaded from `reachability.ts`'s `'needs-download'` status through `recommend.ts`.

**Files changed:** see `git status`/`git diff` — core: `src/core/llm/catalogue/**`,
`reachability.ts`, `sensitive.ts`, `recommend.ts`, `tasks.ts`, `providers/openai-compatible.ts`,
`openrouter-host.ts`, `factory.ts`, `types.ts`; shared: `src/shared/types/llm.ts`,
`src/shared/ipc.ts`; main: `src/main/contracts.ts`, `llm-bridge.ts`, `ipc/llm.ts`,
`ipc/machine-scan.ts`; renderer: `RecommendationSection.tsx`, `RecommendationRow.tsx`,
`ModelsTab.tsx`, `lib/api.ts`, `lib/format.ts`, `lib/mock-bridge.ts`,
`i18n/{de,en}-settings-models.ts`, `styles/app/settings.css`; scripts: `scripts/shot.mjs`
(scrolled `settings-models-bottom` capture); tests: new `tests/core/llm/{catalogue,
catalogue-live,reachability,sensitive,recommend}.test.ts`,
`tests/core/llm/providers/openai-compatible-no-training.test.ts`, extended
`tests/renderer/settings.test.tsx` and `tests/core/llm/tasks.test.ts`.
