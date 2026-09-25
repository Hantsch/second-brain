---
id: 061
title: The heuristic floor speaks the document language
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-3](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: the mood/task/report/scope lexicons are German word lists
(`src/core/capture/lexicon.ts`), task detection uses German infinitive morphology
(`src/core/capture/signals.ts:75`), relative dates are German phrases
(`src/core/capture/dates.ts:123`), loose-end phrasing is German-only — documented at
`src/core/journal/loose-ends.ts:25`; the heuristic's reason strings are hardcoded German
(`src/core/capture/heuristic.ts:103`); any URL-bearing dump files into the single existing
module without a mention (`src/core/capture/mentions.ts:130`); the with-model no-evidence
marker is hardcoded German in the prompt (`src/core/llm/prompts/query-answer.ts:33`).

## Requirement

The app promises two independently configurable languages, and it promises that everything
works without a model — the heuristic is "the floor, not the fallback path". But the floor
only exists in German: in an English vault (`languages.documents: en`), dumps get no mood
detection, no task words, no relative dates — nearly everything falls through to the inbox,
with German reason strings attached. Loose ends are never found in English phrasing. Even the
with-model ask path can emit a hardcoded German refusal sentence to an English user.

For the app's author this is invisible. For the test user story 031 exists for — and for any
English vault — the no-model floor silently isn't there. Either both document languages get a
heuristic floor, or the app must say the floor is German-only; the current state claims one
thing and does the other. While in the heuristic: the rule that files any URL-bearing dump into
the sole existing module without a mention is a confident misfire and should require an actual
mention.

## Acceptance Criteria

- [ ] With `languages.documents: en`, the heuristic detects moods, tasks, scopes, and relative
      dates in English text; test coverage mirrors the German cases.
- [ ] Heuristic reason strings and the ask path's no-evidence marker follow the reply/document
      language.
- [ ] Loose ends are detected in English forward-looking phrasing, with the same honesty about
      being heuristic.
- [ ] A URL-bearing dump is filed to a module only when the module is actually mentioned;
      otherwise it stays in the inbox with an honest reason.
- [ ] German behaviour is unchanged — pinned by the existing tests, none weakened.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
