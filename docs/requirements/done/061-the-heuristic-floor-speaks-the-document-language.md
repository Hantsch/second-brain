---
id: 061
title: The heuristic floor speaks the document language
status: done # draft -> ready -> in-progress -> done
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

- [x] With `languages.documents: en`, the heuristic detects moods, tasks, scopes, and relative
      dates in English text; test coverage mirrors the German cases.
- [x] Heuristic reason strings and the ask path's no-evidence marker follow the reply/document
      language.
- [x] Loose ends are detected in English forward-looking phrasing, with the same honesty about
      being heuristic.
- [x] A URL-bearing dump is filed to a module only when the module is actually mentioned;
      otherwise it stays in the inbox with an honest reason.
- [x] German behaviour is unchanged — pinned by the existing tests, none weakened.

## Open Questions

## Decisions (Sprint)

- **Capture detection selects lexicons by document language, not a blanket union:** `de` →
  German only, `en` → English plus German — `de` stays byte-identical (AC 5), and German
  recognition under `en` is already pinned (`document-language.test.ts` › „hängt unter „en" an
  das bestehende „## Tag" an" files German mood text to the journal under `en`).
- **Loose ends read both languages always, with no language parameter:** the journal is one
  stream that may mix languages, the `NOISE` list is already bilingual, and it keeps 056's
  derive-once cache free of a settings-dependent key.
- **The model's no-evidence marker follows the reply language** (`replyLanguage`), because the
  model writes its whole answer in that language; the no-candidate path keeps using
  `phrases(docLanguage).noEvidence` as today.
- **One source for the sentence:** `query-answer.ts` takes the marker from
  `phrases(language).noEvidence` (`src/core/wiki/text.ts`) instead of a second copy;
  `NO_EVIDENCE_MARKER` stays exported as the German value so existing importers keep compiling.
- **German reason strings stay byte-identical, straight quotes included** — AC 5 and the tests
  pin them (`heuristic.test.ts:52/61`, `classify.test.ts:159`, `inbox.test.tsx:179`); moving them
  to „…" is a separate change, not this story's.
- **English reasons render dates as ISO `YYYY-MM-DD`:** unambiguous across English locales and
  identical to the vault's own date format.
- **English relative dates: no slash dates (`08/15`) and no `week 34`:** the US/UK order is
  ambiguous and a wrong deadline is worse than none (the rule of `dates.ts`); `KW 34` stays
  recognized in every language as today.
- **Vague English spans stay the model pass's job** ("in a few days", "soon", "later this
  week") — the same restraint the German rule shows.
- **English task detection has no infinitive rule:** English has no infinitive ending, so a
  sentence is a task by list item, an intent phrase anywhere ("need to", "have to", "must",
  "should", "todo", "don't forget", "remember to"), or a task verb **at the start** of the
  sentence (imperative) — verbs anywhere would turn reports ("got a call") into todos.
- **The sole-module fallback is removed outright** (AC 4), and the existing inbox reason
  („…aber kein Modul, in das er gehört.") is reused for "modules exist, none named" — it is
  already the honest sentence for both cases.
- **Test premises that equated "English" with "invisible to the heuristic" are moved, not
  weakened:** `loose-ends-llm.test.ts` and `gardener-ipc.test.ts` use a "Tomorrow …" sentence as
  the case only the model can find; it becomes an English sentence the rule still cannot
  resolve ("In a few days …"), with every assertion unchanged.
- **`heuristic.test.ts` › „führt einen Link zum Modul, weil daraus eine Quelle wird" gets the
  module named in its dump** — it pinned exactly the fallback AC 4 removes; its assertions stay.
- **Out of scope: `journal/close.ts` (`scopeSignals`), `journal/facts.ts` (`moodSignals`),
  `waiting.ts`, entity detection, title stopwords** — they keep the German default; the ACs
  name the capture heuristic, loose ends and the ask marker.
- **All ACs map to unit tests, no e2e:** none describes a user action — each is classification
  or prompt logic without a surface-specific behaviour.
- **New comments in English; existing German comments are not rewritten** — CLAUDE.md
  convention without collateral edits.

## Plan

Build order: D1 → D2 → D3 → D4 → D5 → D6 (D6 needs D1; D3 needs D1 + D2; D4, D5 independent).

1. **Dates (D1)** — `findDates(text, today, languages = ['de'])`: language-neutral patterns
   (ISO, `15.08.`, `KW`) always, German tables when `'de'`, English tables when `'en'`.
   English tables in a new `date-phrases-en.ts` to keep `dates.ts` under ~300 lines.
2. **Lexicon + tasks (D2)** — English mood/task/report/scope lists in `lexicon-en.ts`;
   `moodSignals`, `scopeSignals`, `isTask`, `taskText`, `heuristicTasks` take `languages`
   (default `['de']`).
3. **Heuristic (D3)** — `heuristicDraft` derives `languages` from `docLanguage`
   (`en` → `['en','de']`, else `['de']`), threads it through, and takes reason text from a new
   `reasons.ts` phrase table (DE byte-identical, EN new). `classify.ts` passes `docLanguage`.
4. **URL rule (D4)** — drop the `modules.length === 1` fallback in `findModuleMention`.
5. **Ask marker (D5)** — `noEvidenceMarker(language)` in `query-answer.ts`, prompt uses the
   reply language.
6. **Loose ends (D6)** — bilingual `findDates` call and forward-phrase table; rewrite the
   "German only" header; move the two test premises.

**056 reconciliation:** 061 is built after 056 has landed. D6's build agent must work on 056's
actual `loose-ends.ts` / cache shape (the `findDates` call and `isForward` may have moved), not
the pre-056 code quoted here, and must confirm the cache needs no new key (D6 adds no parameter).

Risks: "day after tomorrow" also contains "tomorrow" (overlap must not yield a second date);
German output must not shift — every existing test stays green unedited except the three
documented premise moves.

## Deliverables

- [x] **D1 — English relative dates in `findDates`.** Files: `src/core/capture/dates.ts`, new
      `src/core/capture/date-phrases-en.ts`, new `tests/core/capture/dates-en.test.ts` (mirror
      `tests/core/capture/dates.test.ts`). Change the signature to
      `findDates(text: string, today: string, languages: readonly DocLanguage[] = ['de'])`
      (`DocLanguage` from `@shared/types`). Always on: ISO dates, `15.08.`-numeric dates,
      `KW 34`. German tables (weekdays, months, `PHRASES`, `in N Tagen`) only when `'de'` is in
      `languages` — with the default, output must be identical to today for every input.
      English when `'en'` is in `languages`: `today`, `tomorrow`, `day after tomorrow`,
      `yesterday`, `next week` / `coming week` (→ next Monday, like `nächste Woche`),
      `in a week`, `in two weeks`, `in N days`, `end of the month` / `end of month`, weekday
      names `monday`…`sunday` (projected forward, like German), month dates `15 August`,
      `15th August`, `15th of August`, `August 15`, `August 15th` (full month names only). No
      slash dates, no `week 34`, no vague spans ("in a few days", "soon"). Build every pattern
      with `wordRegex` from `./words` (case-insensitive). **Overlap:** in "day after tomorrow"
      the inner `tomorrow` must not produce its own hit — drop any hit whose span lies inside a
      longer hit's span, and prove it with a test. Also export
      `dayLabel(iso: string, today: string, language: DocLanguage): string` — `'de'` returns
      exactly `germanDay(iso, today)`, `'en'` returns the ISO date (keep `germanDay` exported).
      Tests (in `dates-en.test.ts`): "resolves English relative phrases against today",
      "resolves English weekday and month names", "day after tomorrow yields one date, not two",
      "English phrases are ignored without 'en'", "dayLabel renders ISO in English and 15.08.
      in German". Existing `dates.test.ts` must pass unedited.
- [x] **D2 — English lexicon and task detection.** Files: `src/core/capture/lexicon.ts`, new
      `src/core/capture/lexicon-en.ts`, `src/core/capture/signals.ts`,
      `src/core/capture/tasks.ts`, new `tests/core/capture/signals-en.test.ts` (mirror
      `tests/core/capture/signals.test.ts`), `tests/core/capture/tasks.test.ts` (add cases).
      Mirror `lexicon.ts`'s shape: English `MOOD_WORDS` (e.g. `i feel`, `feel(s|ing)`,
      `stressed`, `tired`, `exhausted`, `overwhelmed`, `anxious`, `worried`, `sad`, `angry`,
      `grateful`, `relieved`, `lonely`, `drained`, `slept badly`, `too much`), intent phrases
      (`need to`, `have to`, `has to`, `must`, `should`, `todo`, `to-do`, `don't forget`,
      `remember to`, `urgent`), task verbs (`call`, `email`, `send`, `buy`, `order`, `book`,
      `cancel`, `check`, `fix`, `schedule`, `prepare`, `submit`, `follow up`, `pick up`,
      `write`, `ask`, `pay`, `renew`), English work/private scope stems (e.g. `customer`,
      `client`, `colleague`, `invoice`, `contract`, `office`, `boss` / `family`, `wife`,
      `husband`, `kids`, `daughter`, `son`, `garden`, `apartment`, `rent`, `doctor`, `dentist`,
      `birthday`, `groceries`, `vacation`, `weekend`, `friends`, `parents`). Existing German
      exports keep their names and values. Add `languages: readonly DocLanguage[] = ['de']` to
      `moodSignals`, `scopeSignals`, `isTask(sentence, languages)`, `taskText(text, languages)`
      and `TaskOptions` (`heuristicTasks` passes it to `isTask`, `taskText`, `findDates`).
      `isTask` for English: unchecked list item → task; any mood word of the active languages
      → never a task; an English intent phrase anywhere → task; an English task verb as the
      **first word** of the sentence → task. The German infinitive-at-end rule and German task
      words apply only when `'de'` is active. `taskText` strips English prefixes too when `'en'`
      is active (`todo:`, `I need to`, `I have to`, `we need to`, `don't forget to`,
      `remember to`). Tests: "detects English moods, intents and imperatives", "an English
      report sentence is not a task" ("I called the bank yesterday."), "an English mood
      sentence is never a task", "English words are ignored under the German default"
      (`isTask` on "Need to call the bank." with default languages → false; `moodSignals` on
      "I feel tired" → `[]`), "heuristicTasks extracts an English todo with its deadline"
      ("Call the dentist tomorrow." with `['en','de']` → due = today + 1). Existing
      `signals.test.ts` / `tasks.test.ts` cases pass unedited.
- [x] **D3 — The heuristic speaks the document language.** Files:
      `src/core/capture/heuristic.ts`, new `src/core/capture/reasons.ts`,
      `src/core/capture/classify.ts`, new `tests/core/capture/heuristic-en.test.ts` (mirror
      `tests/core/capture/heuristic.test.ts`; reuse `captureFixture` from
      `tests/core/capture/fixtures.ts`). Needs D1 + D2. In `heuristicDraft`, derive
      `languages = docLanguage === 'en' ? ['en', 'de'] : ['de']` and pass it to
      `scopeFromSignals`/`scopeSignals`, `moodSignals`, `findDates`, `heuristicTasks`. Move every
      reason sentence of `decide()`/`withDate()` into `reasons.ts` as a DE/EN phrase table with
      `reasons(language)` — mirror `phrases()` in `src/core/wiki/text.ts`. The DE entries must
      produce **byte-identical** strings to today (straight `"` quotes, `und`, `am 15.08.`).
      EN: `Mentions "X".`, `Mentions "X" and a date on 2026-08-15`, `Contains mood words ("a"
and "b") and no project reference.`, `Contains a link (host) and matches the module
"Title".`, `Contains a link (host), but no module it belongs to.`, `Mentions "X" from an
active area`, `No project reference, no day reference and no source recognizable — stays
in the inbox.` Dates in reasons via `dayLabel(iso, today, language)` from D1. English
      strings never contain U+201E. Update the `docLanguage` doc comment on `HeuristicInput`
      (it now also selects lexicons and reason language). In `classify.ts` `classifyDump`, pass
      `docLanguage` into the `heuristicDraft({...})` call. Tests: "files an English work dump
      to the mentioned project with an English reason", "names project and date in English:
      ISO date", "sends an English mood dump to the journal without todos", "picks the private
      scope from English signal words", "stays in the inbox with an English reason when
      nothing matches", "German behaviour is unchanged when docLanguage is de" (the German dump
      texts of `heuristic.test.ts` with `docLanguage: 'de'` give the same reasons as without),
      and a no-model case via `classifyDump` with `emptyGateway()` and `docLanguage: 'en'`
      ("without a model, an English dump gets English detection and reasons"). Existing
      `heuristic.test.ts`, `classify.test.ts`, `document-language.test.ts` pass unedited
      (except D4's one documented change).
- [x] **D4 — A link files to a module only when the module is named.** Files:
      `src/core/capture/mentions.ts`, `tests/core/capture/heuristic.test.ts`. In
      `findModuleMention`, remove the `modules.length === 1` fallback and its doc sentence:
      return a module only if its slug or title occurs in the text, else `null`. The URL
      branch in `heuristic.ts` then already goes to `inbox` with the existing reason
      („Enthält einen Link (…), aber kein Modul, in das er gehört."). The fixture vault has
      exactly one module: slug `identity-management`, title `Identitätsmanagement`. In
      `heuristic.test.ts`, the test „führt einen Link zum Modul, weil daraus eine Quelle wird"
      pins the removed fallback: add the module name to its dump text (e.g. „Guter Artikel
      fürs Identitätsmanagement über Token-Lebensdauern: https://example.com/tokens") and keep
      all three assertions. Add „lässt einen Link liegen, wenn das einzige Modul nicht genannt
      ist" (the old dump text, default fixture with its one module → `primary.target` `inbox`,
      `primary.path` = dump path, reason contains `kein Modul`).
- [x] **D5 — The ask path's no-evidence marker follows the reply language.** Files:
      `src/core/llm/prompts/query-answer.ts`, `src/core/llm/prompts/index.ts`,
      `tests/core/llm/prompts.test.ts`. Add
      `export function noEvidenceMarker(language: UiLanguage | DocLanguage): string` returning
      `phrases(language).noEvidence` from `@core/wiki/text` (one source for the sentence; that
      module only imports `@core/index/text`, so no cycle). Keep
      `export const NO_EVIDENCE_MARKER = noEvidenceMarker('de')` (same value as today). In
      `queryAnswerPrompt`, the "if you find no answer, write exactly …" line uses
      `noEvidenceMarker(replyLanguage)`. Export `noEvidenceMarker` from the prompts barrel.
      Tests in `prompts.test.ts`: "the no-evidence marker follows the reply language"
      (`queryAnswerPrompt(input, 'de', 'en')` system contains `Nothing in the vault covers
that.` and not `Dazu steht nichts im Vault.`; `(input, 'en', 'de')` contains the German
      one). The existing „schreibt vor, was bei fehlendem Beleg zu sagen ist" passes unedited.
- [x] **D6 — Loose ends in English forward-looking phrasing.** Files:
      `src/core/journal/loose-ends.ts` (optionally extract `isForward` + its tables into a new
      `src/core/journal/forward.ts`; the file is far over 300 lines),
      `src/core/journal/loose-ends-llm.ts`, `tests/core/journal/loose-ends.test.ts`,
      `tests/core/journal/loose-ends-llm.test.ts`, `tests/main/gardener-ipc.test.ts`. Needs D1.
      **Story 056 has already changed this area (derive-once caching): work on the landed shape
      of `loose-ends.ts` and its cache, not on older code; this D adds no parameter, so the
      cache must need no new key — confirm that.** Changes: the per-sentence
      `findDates(sentence.text, date)` becomes `findDates(sentence.text, date, ['de', 'en'])`;
      same for `findDates(raw.quote, raw.day)` in `loose-ends-llm.ts` (the `at` anchor of a
      model quote). `isForward` gains English: `tomorrow`, `day after tomorrow`,
      `next week` / `coming week`, `in a week`, `in two weeks`, `end of the month` /
      `end of month`; an English weekday counts only after `next` or `coming` (like
      `nächsten Freitag`); `today`/`yesterday` never count; digit-bearing labels stay forward
      as before. Rewrite the header's "Scope of the heuristic" paragraph (both languages;
      vague spans remain the model pass's job) and the matching sentences at the top of
      `loose-ends-llm.ts`. **Premise moves (no assertion changes):** `loose-ends-llm.test.ts`
      `ENGLISH_TEXT` 'Tomorrow I am signing the lease at the notary.' and `gardener-ipc.test.ts`
      `ENGLISH_QUOTE` 'Tomorrow I finally call the tax office.' stand for "only the model
      finds this"; replace each with an English sentence the rule still cannot resolve
      ('In a few days I am signing the lease at the notary.', 'In a few days I finally call
      the tax office.'), update the comments that say English is unresolvable, and keep
      paraphrase variants in those tests consistent with the new sentence. Tests in
      `loose-ends.test.ts` (mirror the German cases): "finds an English announcement whose day
      has passed" ('Tomorrow I am signing the lease at the notary.'), "English day after
      tomorrow, next week and next friday are forward", "a bare English weekday is not an
      announcement", "English today and yesterday announce nothing", "a later English day
      that links back settles it". All existing German loose-end, upcoming-mention and
      resolution tests pass unedited.

## Model Hints

- D6 → deliverable-hard: it lands on 056's freshly reshaped `loose-ends.ts` cache (a cross-story
  reconciliation the spec cannot quote) and must move the "English is invisible" premise in two
  existing test files without touching a single assertion.
- Review: → default

## Acceptance Tests

- AC1 (dates) → unit `tests/core/capture/dates-en.test.ts` › "resolves English relative phrases
  against today", "resolves English weekday and month names", "day after tomorrow yields one
  date, not two" (D1)
- AC1 (moods, tasks, scopes) → unit `tests/core/capture/signals-en.test.ts` › "detects English
  moods, intents and imperatives", "an English report sentence is not a task", "an English mood
  sentence is never a task"; `tests/core/capture/tasks.test.ts` › "heuristicTasks extracts an
  English todo with its deadline" (D2); `tests/core/capture/heuristic-en.test.ts` › "files an
  English work dump to the mentioned project with an English reason", "sends an English mood
  dump to the journal without todos", "picks the private scope from English signal words",
  "without a model, an English dump gets English detection and reasons" (D3)
- AC2 (reasons) → unit `tests/core/capture/heuristic-en.test.ts` › "names project and date in
  English: ISO date", "stays in the inbox with an English reason when nothing matches" (D3)
- AC2 (ask marker) → unit `tests/core/llm/prompts.test.ts` › "the no-evidence marker follows the
  reply language" (D5)
- AC3 → unit `tests/core/journal/loose-ends.test.ts` › "finds an English announcement whose day
  has passed", "English day after tomorrow, next week and next friday are forward", "a bare
  English weekday is not an announcement", "English today and yesterday announce nothing", "a
  later English day that links back settles it" (D6); honesty (`origin: 'heuristic'`) asserted
  in the first of these
- AC4 → unit `tests/core/capture/heuristic.test.ts` › „lässt einen Link liegen, wenn das einzige
  Modul nicht genannt ist" and „führt einen Link zum Modul, weil daraus eine Quelle wird" (with
  the module named) (D4)
- AC5 → unit `tests/core/capture/dates-en.test.ts` › "English phrases are ignored without 'en'"
  (D1); `tests/core/capture/signals-en.test.ts` › "English words are ignored under the German
  default" (D2); `tests/core/capture/heuristic-en.test.ts` › "German behaviour is unchanged when
  docLanguage is de" (D3); plus the full existing suites `tests/core/capture/`,
  `tests/core/journal/`, `tests/core/llm/prompts.test.ts`, `tests/core/wiki/ask.test.ts`,
  `tests/main/gardener-ipc.test.ts` green, edited only at the three premise moves recorded under
  Decisions (all D's)

## Done

Added an English lexicon/date/reason path alongside the existing German one across
`src/core/capture/` (dates, moods, tasks, scopes, heuristic reasons), the ask path's
no-evidence marker (`query-answer.ts`), and loose-end detection (`journal/`); German
output stays byte-identical (confirmed by the unedited German suites and a dedicated
"German unchanged" test per D). Also removed the `modules.length === 1` fallback in
`findModuleMention` — a link now files to a module only when it is actually named.

Commit message: `061: the heuristic floor speaks the document language`

Verification: narrow gate — `npm run build` green, `npm run lint` green,
`npm run typecheck` green, `npm run format:check` green after formatting the 4 files
this story touched (one pre-existing red file, `tests/main/services.test.ts`, is
untouched by this story and not fixed here). `npx vitest run --changed HEAD` green
(2610 tests); supplementary targeted run of `tests/core/capture/`, `tests/core/journal/`,
`tests/core/llm/prompts.test.ts`, `tests/core/wiki/ask.test.ts`,
`tests/main/gardener-ipc.test.ts` green (570 tests). No e2e-story run — this story's own
`## Acceptance Tests` section states all ACs map to unit tests, no e2e. AC1–AC5 all
verified PASS against their named tests (see `## Acceptance Tests` above, unchanged from
refine). Review (default tier, one cycle): PASS, no blocking findings — one non-blocking
note (an unused `TASK_VERBS_EN` export in `lexicon-en.ts`, dead code with a misleading
comment, left as-is since it doesn't affect correctness and a fix cycle wasn't warranted
for it).

Decisions: confirmed against the landed 056 cache (`loose-ends-derived.ts`, a WeakMap
keyed on the index object plus `today`) that D6 needs no new cache key — the language
list (`['de','en']`) is a fixed constant, not a caller-supplied parameter, so the
existing key shape already covers it. `isForward` and its tables were extracted from
`loose-ends.ts` into a new `journal/forward.ts`; `loose-ends.ts` is still noticeably over
the ~300-line soft limit even after the split (~500 lines) — left as a follow-up, not a
blocker for this story.

tiers: D 6 / hard 1 · review default · cycles 1 · agents 9
