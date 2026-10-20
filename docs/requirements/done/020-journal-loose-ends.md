---
id: 020
title: Journal — announced and never followed up
status: done # draft -> ready -> in-progress -> done
created: 2026-08-21
---

## Requirement

I write forward-looking sentences into the journal all the time. "Tomorrow is the
notary appointment." "Tomorrow is a day off." "Next week I'll finally call the tax
office." And then the day comes, I write three lines about something else, and the
notary appointment never appears again. Not because it did not happen — because
nobody asked.

Those are **loose ends**: something I announced that no later entry ever speaks to.
Today they are invisible. The day close-out pulls todos out of an entry, and
reminders nag about dates that live in frontmatter or in a checkbox — but a plain
sentence in prose ("morgen bin ich beim Notar") produces neither. It is written
down, it is gone, and the day it referred to stays blank forever.

I want the journal to notice. Not with a new duty, and not with a nagging counter —
but so that somewhere I can see: **these five things you announced and never came
back to.** And from there I want to be able to fill them in, even weeks later:
answer the question, and the answer lands on the day it belongs to.

I want it to reach me in two ways, both of which already exist as surfaces:

- **In the conversation.** When I am writing in the journal and there is a loose
  end lying around, the app may ask me about it — "how did the notary appointment
  on Tuesday go?" — instead of asking a generic question.
- **As a reminder.** The same way an overdue answer or a deadline reaches me today,
  so I see it without opening the journal.

Two things it must not become. It must not turn into a second todo list — a
checkbox with a date is already a reminder ([reminders.ts](../../src/core/overview/reminders.ts)),
and I do not want the same thing twice with different words. And it must not
invent: if it claims I announced something, it has to show me the sentence and the
day it stands in, or I stop trusting the whole list.

Related: [012](done/012-journal-interview-as-a-start.md) built the interview that asks
when the field is empty — this is the same idea pointed backwards, at days that are
already written. [009](done/009-journal-open-days-filter.md) gave the journal the notion
of an _open day_; this is about an open _topic_, which is not the same thing — a day can
be closed and still leave a loose end behind.

## Acceptance Criteria

- [x] A loose end is **derived from the entries**: a forward-looking statement in a
      day, whose referenced day has passed, with no later entry that speaks to it.
      Delete `.secondbrain/index/` and the same loose ends come back.
- [x] Every loose end shows **the sentence it came from, the day, and the file path**.
      No loose end without evidence I can click into (guardrail 3).
- [x] There is **one place** where all loose ends are visible together, and it names
      how many there are. When there are none, it says so instead of sitting blank.
- [x] From that place I can **answer** a loose end: I type what happened, and the text
      lands in the day it belongs to as my own words — retro-filling an old day is the
      normal case here, not an edge case.
- [x] I can **dismiss** a loose end without answering it ("did not happen", "nothing to
      add"), and it stays gone. Dismissing is one click, not a form.
- [x] A loose end **closes by itself** when a later entry clearly speaks to it — the
      list does not ask about the notary appointment I already wrote about.
- [x] Nothing forward-looking about a **day that has not passed yet** ever appears as a
      loose end (same rule as 009: a thing only counts as open once it is over).
- [x] It does **not duplicate the todos and reminders that already exist**: something
      that became a todo with a deadline is a todo, and shows up once, not twice.
- [x] During journal writing, an open loose end can become **the app's question** in
      the conversation — asked as a question, never as a claim about me, and skippable
      like any other question.
- [x] The same loose ends reach me **as reminders**, in the surface that already
      answers "what am I waiting on" — with their own source, so the UI can say _why_
      it is nagging.
- [x] **Without a model it still works**: a heuristic fallback finds the obvious cases
      (a date or a "tomorrow/next week" phrase plus a planned event), and the surface
      says which one ran. Never a dead screen (guardrail 1).
- [x] Detection reads journal prose, so it counts as a **sensitive task** and
      recommends a local model, like `journal-chat` and `classify-dump`
      (guardrail 6, [019b](done/019b-model-recommendations.md)).
- [x] Answering and dismissing are **hash-guarded writes**: a stale hash yields
      `conflict` instead of overwriting what I edited in Obsidian.
- [x] All labels and questions go through `t()` / the document language, `de` and `en`,
      sentence case, no emoji, calm tone — a loose end is a note, not an accusation.

## Open Questions

~~Where does the "one place" live?~~ answered → Decisions (Sprint)
~~Where does the answer get written?~~ answered → Decisions (Sprint)
~~Where does the state live?~~ answered → Decisions (Sprint)
~~What is the horizon?~~ answered → Decisions (Sprint)
~~How specific may the model get?~~ answered → Decisions (Sprint)
~~Does a loose end survive a closed day?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Where does "the one place" live?: As a finding type in the Maintenance surface built
  by [014](014-maintenance-says-befund.md)/[017](017-a-finding-says-how-it-ends.md) — reuse that
  accept/dismiss/exits framework instead of building a second one.
- **(User)** Where does the answer get written?: Into today's entry, with a back-reference to the
  announcing day. Matches "so I can fill it in afterwards" without rewriting a past day.
- **(User)** Where does the loose-end state live?: In its own dedicated place, independent of any
  single day — analogous to 017's dismissed-id list. A loose end belongs to no single day.
- **(User)** What is the horizon?: No automatic expiry. The user decides when something is done or
  dropped; nothing disappears silently.
- **(User)** How specific may the app's question get?: It may quote the user's own wording back at
  them. Those are the user's words, not a claim by the app — compatible with the
  no-hallucination guardrail.
- **(User)** Does closing a day (009) suppress its loose ends?: No — independent, as the story
  assumed. Day closure and loose-end lifecycle are separate concepts.

- **A loose end is a gardener finding of its own kind, `loose-end`, produced by an ordinary
  `Check`**: `Check.run` is synchronous and reads only the pre-built index
  ([types.ts:104-125](../../src/core/gardener/types.ts#L104-L125)), which the heuristic fits
  without changing the run's shape.
- **The check reaches journal days and todos through two new accessors on `GardenerIndexView`
  (`journal()`, `todos()`)**: `IndexService` already has both
  ([service.ts:121,142](../../src/core/index/service.ts#L121)), so it costs two names in
  `GARDENER_INDEX_METHODS` and no test fixture change.
- **The model pass is a separate async step in `runGardener`, mirroring `auditFindings`, not part
  of the check**: detection is not interpretation, and `audit.ts`'s `CANDIDATE_KINDS` deliberately
  fences which kinds a model may judge.
- **A model-proposed loose end survives only if its quoted sentence is found verbatim in the day
  file it names**: guardrail 3 — a loose end without the user's own sentence is a claim, not a
  finding.
- **Its own LLM task kind `journal-loose-ends`, `sensitive: true`, `structured: true`, tier
  `balanced`**: `sensitive` makes 019b's local-model recommendation and the sensitive-task rule
  apply by themselves ([sensitive.ts:67](../../src/core/llm/sensitive.ts#L67)), and resolving a
  relative date plus judging "was this addressed later" is more than a `cheap` model does reliably.
- **The heuristic reuses `findDates()` from [capture/dates.ts](../../src/core/capture/dates.ts)**:
  the relative-date lexicon ("morgen", "naechste Woche", "KW 34", numeric and ISO dates) exists
  already, and a second date parser would be a second truth.
- **Forward-looking markers get their own small de/en table inside the new module; English
  relative phrasing beyond a real date is left to the model pass**: extending `capture/dates.ts`
  with English would move the heuristics `classify-dump` and `extract-tasks` already depend on.
- **Severity is `info`**: a loose end is a note about the journal, not knowledge rot — the lowest
  weight in `SEVERITY_WEIGHT`, so it needs no per-kind exception in `health.ts`, which has none by
  design.
- **Dismissing goes through 017's existing `gardener:dismiss` / `gardener:undismiss`**: the
  (User) decision above says reuse, and it inherits reversibility and the hidden-findings filter
  for free.
- **The "own dedicated place" for state holds the _answered_ ids only, in
  `.secondbrain/loose-ends.json`**: dismissal is 017's judgement list, whereas answering is a
  resolution tied to a vault write and needs its own record (id, day, target path, timestamp) in
  the same shape as 017's dismissed-id list.
- **A loose end also closes with no state at all when a later day's entry links the announcing day
  and repeats its subject terms**: AC 6 has to hold for a day the user wrote in Obsidian, where no
  app state exists.
- **The answer is appended with `appendEntry` into today's `Day` stream, prefixed by a
  back-reference wikilink to the announcing day**:
  [stream.ts:99](../../src/core/journal/stream.ts#L99) is the only path that writes the user's own
  words as plain prose, and the wikilink is what lets the closure rule work from the file alone.
- **A loose end whose subject is already a todo with a deadline produces neither a finding nor a
  reminder**: AC 8 — the todo is the single record, checked against `index.todos()`.
- **Reminders are built from the heuristic only, never from a model call**: `reminders:list`
  answers on every dashboard load and has to stay instant and available without a model.
- **The reminder path excludes answered ids and 017's dismissed ids**: otherwise something the
  user already dealt with keeps nagging from a second surface.
- **`ReminderSource` gains `'loose-end'`, shown in the waiting-on tile**: AC 10 names that
  surface, and the source is what lets the tile say why it is nagging.
- **The interview's loose-end question is composed deterministically from the quoted sentence, no
  model call**: the user's own wording is already the question's content, so nothing can be
  invented and the question also exists without a model.
- **`GardenerFinding` gains an optional `origin: 'heuristic' | 'model'`**: AC 11 wants the surface
  to say which detector ran _per finding_, which the report's existing `usedLlm` cannot do for a
  mixed run; optional, so persisted state from older runs stays readable.
- **The loose-end group on the maintenance screen renders even at zero, with a "no loose ends"
  line**: AC 3 demands a statement instead of a blank, and a kind group that appears only when it
  has content cannot make one.
- **020 depends on [017](017-a-finding-says-how-it-ends.md) landing first** and is built last in
  S05: it consumes 017's exits, its visible dismissed list and its reversibility instead of
  building a second surface.
- **The answer field rides in 017's `extraActions` slot; dismiss, snooze, "handled in the files"
  and open stay with 017's `exits.ts`**: 017 reserves that slot for exactly this kind of
  parameterised way out, so 020 adds one exit and inherits four.
- **`'loose-end'` joins 017's `LLM_ONLY_KINDS`**: the model pass can produce ids the heuristic
  alone never produces, and 017 prunes a dismissed id a run did not find — losing a dismissal is
  worse than a slightly longer hidden list.
- **A loose end can be snoozed like any other finding, for free**: 017's (User) decision added
  "not now" to every card, and "ask me about the notary appointment next week" is precisely that
  state — no second mechanism needed.
- **The story stays in its own milestone (M6)**: it rides along in S05 for scheduling only, per
  [ROADMAP.md](../ROADMAP.md) — it is not part of M4's "a finding can be acted on" scope.

## Plan

A loose end becomes a **finding kind** in the maintenance surface. Nothing is built that
[017](017-a-finding-says-how-it-ends.md) already builds: the exits, the dismiss, the snooze, the
visible hidden list and the reversibility all come from there. **017 has to land before this
story starts** (it is the last story of S05 for exactly that reason).

1. **The rule, once, as a pure module** — `src/core/journal/loose-ends.ts`. Over the derived
   journal days plus their bodies (`index().byPath.get(day.path).body` through `parseStream`, so
   only the user's own `entry` blocks, never the app's answers): for each sentence a forward
   marker from a small de/en table, a date resolved by `findDates()` relative to _the day the
   sentence stands in_, that date strictly before `today`. Then subtract what is already
   answered — a later day whose entry links the announcing day and repeats the subject terms, or
   a todo carrying the same terms and a deadline. Result:
   `LooseEnd { id, day, path, line, quote, subject, refDate, origin }`, `id` from
   `sha256(day + quote)`, stable across runs, so the index stays deletable.
2. **The check** — `src/core/gardener/checks/loose-end.ts`, registered in `checks/index.ts`, new
   kind `'loose-end'` (severity `info`, no fix), title and detail through `GardenerLabels` (de in
   `core/gardener/labels.ts`, en in `main/gardener-labels.ts`). `GardenerIndexView` gains
   `journal()` and `todos()` — `IndexService` has both already, so only the two names in
   `GARDENER_INDEX_METHODS` (`main/ipc/gardener-deps.ts`) are added, no fixture changes.
3. **The model, optional** — new task kind `journal-loose-ends` (`sensitive`, `structured`, tier
   `balanced`); prompt in `core/llm/prompts/journal-loose-ends.ts`; `core/journal/loose-ends-llm.ts`
   runs as a second async step in `runGardener`, right after the checks and mirroring
   `auditFindings` (same `gateway` from `GardenerDeps`, same `signal`, same `isAvailable` gate).
   A proposal whose quote is not verbatim in the day file it names is dropped. Without a route
   the step is skipped and the heuristic result stands.
4. **Answering writes into today** — `core/journal/loose-end-answer.ts` puts the user's text into
   today's `Day` stream with `appendEntry`, prefixed by a back-reference wikilink to the
   announcing day, `expectedHash`-guarded. One new channel `journal:answerLooseEnd`; the answered
   id lands in `main/loose-end-state.ts` (`.secondbrain/loose-ends.json`).
5. **The card** — `screens/garden/LooseEndCard.tsx` wraps the generic `FindingCard` and passes the
   answer field through 017's `extraActions` slot, so 017's `exits.ts` keeps owning dismiss,
   snooze, "handled in the files" and open. The evidence (quote, day, path) and the provenance
   line go in `children`. Branch next to the `contradiction` branch in `FindingList.tsx`; the
   loose-end group renders whenever a report exists, with its count or a "no loose ends" line.
   `'loose-end'` joins `LLM_ONLY_KINDS` so a dismissal is never pruned by a run without a model.
6. **The reminder** — `ReminderSource` gains `'loose-end'`; `core/overview/reminders.ts` gets
   `fromLooseEnds` (heuristic only, no model call on the dashboard path), `main/ipc/reminders.ts`
   passes in the answered ids and 017's dismissed/snoozed ids, `WaitingOnTile` shows the source.
7. **The question in the conversation** — `planInterview` takes an optional loose-end list and
   appends **at most one** question per session, built from the quote, skippable like every other
   step; answering it goes through the same channel as step 4.
8. **Seed and shots** — `scripts/seed/journal.mjs` writes two announcing days (one answered by a
   later day, one not), so `npm run shot` photographs a filled loose-end group.

Out of scope: no expiry, no new list channel (findings ride in `gardener:report`, the interview
step in `journal:planInterview`), no second dismissal mechanism, no change to the health score's
per-severity weighting.

## Deliverables

**D1 — the loose-end rule as a pure module**
New `src/core/journal/loose-ends.ts` (+ export in `src/core/journal/index.ts`), `LooseEnd` in
`src/shared/types/domain.ts`, new `tests/core/journal/loose-ends.test.ts`.
Mirror: `src/core/gardener/checks/orphan.ts` (derive, never read a file) and the `findDates` use
in `src/core/journal/close.ts:165`.
Accepted when: a day containing "morgen bin ich beim Notar" yields one loose end carrying the
sentence, the day, the path, the line and the resolved date; the same sentence in a day whose
referenced date is today or later yields none; a later day whose entry links the announcing day
and names the subject yields none; a matching todo with a deadline yields none; only `entry`
blocks are read, never `answer` blocks; ids are stable across two calls and independent of
`ranAt`. → AC 1, 2, 6, 7, 8

**D2 — a loose end is a finding of the maintenance run**
`src/shared/types/overview.ts` (kind `'loose-end'`, optional `origin`), new
`src/core/gardener/checks/loose-end.ts`, `src/core/gardener/checks/index.ts`,
`src/core/gardener/types.ts` (`GardenerIndexView.journal()`, `.todos()`, `LLM_ONLY_KINDS`),
`src/core/gardener/labels.ts`, `src/main/gardener-labels.ts`, `src/main/ipc/gardener-deps.ts`,
new `tests/core/gardener/checks-journal.test.ts`.
Mirror: `checks/unfiled-dump.ts` plus its label pair.
Accepted when: a run over a vault with two announcing days reports two `loose-end` findings with
severity `info`, `fix: null`, `origin: 'heuristic'` and the day file in `paths`; the German and
the English label both name the quote and the day; deleting `.secondbrain/index/` and running
again gives the same ids; a dismissed loose end is not pruned by a run without a model
(`LLM_ONLY_KINDS`); every existing gardener test stays green. → AC 1, 2

**D3 — detection is a sensitive task that recommends a local model**
`src/shared/types/llm.ts` (`TaskKind`), `src/core/llm/tasks.ts`, `src/renderer/i18n/de.ts` +
`en.ts` (`task.journal-loose-ends.label` / `.hint`, `llm.note.journal-loose-ends`),
`tests/core/llm/tasks.test.ts`, `tests/renderer/i18n.test.ts`.
Mirror: the `journal-chat` entry in `tasks.ts` and its keys in `de.ts` / `en.ts`.
Accepted when: `sensitiveTasks()` contains `journal-loose-ends`, the settings routing list shows
it with label and hint in both languages, 019b's recommendation marks it as a local-model task
without a catalogue edit, and the de/en key parity test passes untouched. → AC 12

**D4 — the model finds what the heuristic misses, and invents nothing**
New `src/core/llm/prompts/journal-loose-ends.ts`, new `src/core/journal/loose-ends-llm.ts`,
`src/core/gardener/report.ts`, new `tests/core/journal/loose-ends-llm.test.ts`.
Mirror: `src/core/gardener/audit.ts` end to end (gate, signal, structured parse, merge).
Accepted when: with the fake gateway the step adds a loose end the heuristic missed and marks it
`origin: 'model'`; a proposal whose quote is not verbatim in the named file is dropped; with
`createEmptyGateway()` the step is skipped, the run returns the heuristic findings and `usedLlm`
stays `false`; no journal text appears in any log line or error message; an aborted `signal`
cancels the call without failing the run. → AC 11 (model side), AC 12

**D5 — answering a loose end writes my own words into today, hash-guarded**
New `src/core/journal/loose-end-answer.ts` (+ export), new `src/main/loose-end-state.ts`,
`src/shared/ipc.ts` (`journal:answerLooseEnd`: `{ id; day; text; expectedHash? }` →
`{ path; hash }`), preload allowlist, `src/main/ipc/journal.ts`, `src/renderer/lib/api.ts`,
`tests/main/journal-ipc.test.ts`.
Mirror: `journal:setClosed` end to end (009 D3) and `appendEntry`
(`src/core/journal/stream.ts:99`).
Accepted when: the text lands as plain prose in today's `Day` section, byte-identical to what was
typed, preceded by a back-reference wikilink to the announcing day; a stale `expectedHash`
returns `conflict` and writes nothing; today's file is created if it is missing; the answered id
is in `.secondbrain/loose-ends.json` and survives a restart; the next run no longer reports that
loose end; `tests/main/ipc-coverage.test.ts` is green without being loosened. → AC 4, 13

**D6 — the loose end has a card in the maintenance surface**
New `src/renderer/screens/garden/LooseEndCard.tsx`,
`src/renderer/screens/garden/FindingList.tsx`, `src/renderer/screens/garden/useFindingActions.ts`
(017's module — one answer handler), `src/renderer/i18n/de-garden.ts` + `en-garden.ts`,
`src/renderer/styles/app/garden.css`, `tests/renderer/garden.test.tsx`.
Mirror: `ContradictionCard.tsx` (a kind-specific wrapper around `FindingCard`) and
`FindingList.tsx`'s group header / count / `.sb-panel-empty`.
Accepted when: the group names how many loose ends there are and shows the "no loose ends" line
at zero; each card shows the quoted sentence, the day and the clickable path; the answer field
writes through D5's channel and the card leaves the list without a reload; dismiss is 017's
single click and the finding then shows up under 017's hidden filter and can be brought back;
the card names whether the heuristic or a model found it; every string goes through `t()` in `de`
and `en`, sentence case, no emoji, no second accent, tokens only. → AC 2, 3, 4, 5, 11
(surface), AC 14

**D7 — the same loose ends reach me as reminders**
`src/shared/types/overview.ts` (`ReminderSource`), `src/core/overview/reminders.ts`,
`src/main/ipc/reminders.ts`, `src/renderer/components/tiles/WaitingOnTile.tsx`,
`src/renderer/i18n/de-dashboard.ts` + `en-dashboard.ts`,
`tests/core/overview/reminders.test.ts`, `tests/renderer/dashboard.test.tsx`.
Mirror: `fromWaiting` in `src/core/overview/reminders.ts:137` and the `waiting-overdue` path
through the tile.
Accepted when: an open loose end appears once in the waiting-on tile with source `'loose-end'`
and a label that says why it is nagging; an answered, dismissed or snoozed one does not appear; a
loose end that is also a todo appears only as the todo; the existing `reminders:snooze` works on
it; the whole path runs with no model configured. → AC 8, 10

**D8 — the journal conversation may ask about a loose end**
`src/core/journal/interview.ts`, `src/main/ipc/journal.ts` (pass the loose ends into
`planInterview`), `src/renderer/screens/journal/InterviewDialog.tsx`,
`src/renderer/i18n/de-journal.ts` + `en-journal.ts`, `tests/core/journal/interview.test.ts`,
`tests/renderer/interview-dialog.test.tsx`.
Mirror: the fixed step handling in `interview.ts:133-179` and `handleAnswer` / `handleSkip` in
`InterviewDialog.tsx:93,133`.
Accepted when: with an open loose end the interview appends exactly one extra question, phrased
as a question and quoting only the user's own sentence, never asserting that something happened;
skipping writes nothing and does not mark it answered; answering writes through D5's channel and
the loose end is gone from the maintenance surface; with no loose end the plan is unchanged; with
no model configured the question is still asked. → AC 9, 11, 14

**D9 — the demo vault shows it**
`scripts/seed/journal.mjs`.
Accepted when: `npm run seed` writes at least two past days with a forward-looking sentence, one
of which a later day answers, and `npm run shot` produces a maintenance screenshot in which the
loose-end group and its count are visible.

## Model Hints

- `D1 → deliverable-hard` — this module decides what counts as an announcement and when it counts
  as answered; a wrong rule either floods the surface with invented loose ends or silently hides
  real ones, and all four surfaces (finding, card, reminder, interview) read the same output.
- `D4 → deliverable-hard` — it inserts a second async step into `runGardener`'s existing order
  (signal/cancel, hidden filter, health score) and carries the no-hallucination guard: a model
  quote that is not verbatim in the file has to be dropped, not shown.
- D2, D3, D5, D6, D7, D8, D9 → default.
- `Review: → story-review-hard` — the story adds a new write path into the journal plus a new LLM
  path over the most sensitive content in the vault, and it sits on top of 017's freshly changed
  finding pipeline; the sprint's own note names the write paths and the AI-proposes / human-
  confirms guardrail as the load-bearing part of this milestone.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app.
2. Open **Maintenance** and run the check with the model interpretation **off**. The findings
   list holds a loose-end group; it names the count, each card shows the announced sentence, the
   day it stands in and the file path, and the card says the heuristic found it.
3. Click the path on one card — the day opens and the sentence really stands there, unchanged.
4. On another card, type what actually happened into the answer field and confirm. The card
   leaves the list; open **Journal → today**: the text stands in the `Day` section in your own
   words, with a link back to the announcing day above it.
5. Run the check again: the answered loose end does not come back.
6. Dismiss a third one with one click, then switch the finding filter to the hidden findings
   (017): it is listed there with its reason and can be brought back — bring it back and it is on
   the open list again.
7. Open the **Dashboard**: the same open loose ends appear in the waiting-on tile, each saying
   why it is nagging. Snooze one — it leaves the tile and stays out until the snooze ends.
8. In the journal, start the interview on a day with an open loose end: after the fixed
   questions, one more comes up that quotes your own sentence and asks about it. Skip it -
   nothing is written and the loose end is still on the maintenance surface. Start the interview
   again and answer it: today's entry carries the text and the loose end is gone.
9. Settings → models: `journal-loose-ends` is in the task list, marked as a task for a local
   model, with label and hint in the UI language.
10. Remove the routing for `journal-loose-ends` (no model) and run the check again: the loose-end
    group is still filled and says that it was found without a model. No error, no empty screen.
11. Route a local model and run the check with interpretation on: further loose ends may appear,
    each marked as found by the model, and each still quoting a sentence that really stands in
    the named file.
12. Open one of the days in an editor, change a line and save, then answer a loose end from the
    maintenance screen that is still open in the app — the write is refused with a conflict
    instead of overwriting your edit.
13. Delete `.demo-vault/.secondbrain/index/`, restart, run again: the same loose ends with the
    same cards, and the answered and dismissed ones stay gone.
14. Switch the UI language to English and back: every label, question and empty line is
    translated, sentence case, no emoji, one accent on the screen.

## Done

**Summary**

A forward-looking sentence in a journal day ("morgen bin ich beim Notar") whose day has
passed and no later entry addresses is now a `loose-end` gardener finding (`info`, no fix),
detected by a pure heuristic (`findLooseEnds`, reusing `capture/dates.ts`) and, when a local
model is routed for the new sensitive task `journal-loose-ends`, extended by a model pass that
only keeps quotes verbatim in the source file. It surfaces in the Maintenance screen (its own
card riding on 017's exits/dismiss/snooze/hidden framework), in the dashboard's waiting-on
tile as a reminder, and as one deterministic extra question in the journal interview. Answering
appends the user's own words into today's entry with a back-reference wikilink, hash-guarded
against the live file; the answered id is tracked in `.secondbrain/loose-ends.json` and
excluded from every surface that reads the gardener report.

**Commit message**

```
020: journal loose ends — detect, surface, answer
```

**Verification**

- `npm run typecheck` — green.
- `npm run lint` — green.
- `npm test` — 2533/2534 green; the one failure (`tests/core/wiki/module.test.ts:150`) is the
  documented pre-existing `MODULE_SCHEMA_TEMPLATE` drift, unrelated to this story and present on
  a clean tree before the sprint's builds started.
- `npm run build` — green.
- `npm run format:check` — repo-wide CRLF drift predates this sprint; every file this story
  touched is prettier-clean on its own content.
- Live smoke: `npm run seed && npm run shot` — no console errors; `.screenshots/06-garden.png`
  shows "2 lose Enden" in the health breakdown and the "what's next" advice line correctly
  translated (`garden.advice.loose-end`).
- Code review (`story-review-hard`, per the story's `Review: → story-review-hard` hint): cycle 1
  returned FAIL with 9 findings (1 high, 3 medium, 2 low-confirmed, 1 low-cosmetic-deferred, plus
  clean bills for weakened-tests/scope-creep). All medium+high findings were fixed; cycle 2
  re-reviewed the fixes against the real code (not the claims) and returned PASS.

**Decisions made during the build (beyond what `## Decisions (Sprint)` already fixed)**

- The forward-marker table lives inside `loose-ends.ts` itself and only recognizes German
  relative phrases plus language-neutral dated forms (a bare `am <weekday>` is deliberately
  _not_ a marker, since `findDates` always projects weekdays forward and an invented loose end
  is the costlier error than a missed one); English relative phrasing beyond a real date is left
  to the model pass, per the story's own decision.
- `LooseEndCard.tsx` recovers the day and quote for display by parsing the fixed `: "<quote>"`
  suffix `labels.ts`/`gardener-labels.ts` always produce, rather than carrying `LooseEnd.day`/
  `.quote` as first-class fields on `GardenerFinding` — reviewed and accepted as inelegant but
  not fragile (no colon/quote character precedes the anchor in either language's label prefix).
- German curly-quote inconsistency (`„…"` vs `„…"`) in the two new label strings was left
  matching the repo's existing majority convention (335 vs 4 occurrences) rather than fixed in
  isolation — fixing only 020's three strings would have made the inconsistency worse, not
  better; a repo-wide normalization is a separate, unrelated piece of work.
- D4's model pass (`modelLooseEnds`) is wired into `runGardener` (used by tests) and, after the
  cycle-1 fix, also into `runWithProgress` in `src/main/ipc/gardener-deps.ts` (the actual live
  path the app and `gardener-autorun.ts` call) — the initial build had wired only the former,
  which the review caught before this story could be called done.

**Open points / known limitations (accepted, not blockers)**

- `findLooseEnds` re-parses every journal day's stream on every dashboard load and every
  interview open, with no caching and no day-count bound on the reminder/interview paths (the
  model pass itself is bounded to the 14 most recent past days). Flagged by review as a low-
  severity efficiency note on the hot dashboard path; left as-is since it is well within the
  seeded demo vault's and any reasonably sized real vault's performance envelope, and adding a
  cache would be a second, separable change.
- `journal:interviewPlan` now hard-depends on the gardener index view being derivable; a low-
  probability new coupling (`IndexService` already satisfies the contract in every code path) is
  documented rather than defended against defensively, to avoid speculative error handling for a
  case that cannot currently occur.
