---
id: 012
title: Journal — the interview, for when I do not know what to write
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The hardest part of keeping a journal is the empty field. I sit in front of "How was
your day?" and nothing comes, and then the day does not get written down at all.

I want an **interview** button. It asks me, one structured question at a time, until
the day is roughly covered — what I worked on, what came up, who I dealt with, what is
still open, how it felt. Short questions, one at a time, so I only ever have to answer
what is in front of me.

It is a **starting aid**, not the format of the journal. As soon as I am writing on my
own, I should be able to walk out of it and keep going in my own words. Everything I
answered stays — it belongs to the day like anything else I wrote.

Depends on [011](011-journal-one-entry-not-two.md): the interview writes into whatever
surface that story settles on. Refine 011 first, or this one has to guess a target.

## Acceptance Criteria

- [ ] A visible "Interview" button on the day, most prominent when the day is still
      empty — that is when I need it.
- [ ] It asks one question at a time. I answer, the next one comes. No wall of
      questions.
- [ ] It covers a day roughly: work, events, people, what is still open, how it felt.
      The coverage is a stated set, not whatever the model feels like asking.
- [ ] It ends by itself when the day is covered, and it says so. It does not keep
      asking until I close the window.
- [ ] I can leave at any point and keep writing freely, and what I answered so far is
      already in the file — leaving early loses nothing.
- [ ] I can skip a question without ending the interview.
- [ ] My answers land in the day entry as my own text, attributed to me. The questions
      are legible as the app's — my words and its words never blur.
- [ ] Every answer reaches the file before the next question is asked. Nothing is held
      in memory waiting for an end that may not come.
- [ ] **Without a model it still works**: a fixed set of questions in the document
      language, asked in order. This is the case where the heuristic fallback is
      genuinely as good as the model, and the screen says which one is running.
- [ ] Questions never assert facts about me. No "you seemed stressed yesterday" unless
      it is actually in an entry, with the entry as evidence.
- [ ] Starting the interview on a day that already has text picks up from there and
      does not ask what I have just written.
- [ ] All questions go through `t()` / the document language, in `de` and `en`;
      sentence case, no emoji, calm tone — no cheerleading.

## Open Questions

- ~~**Fixed question set or model-driven follow-ups?**~~ answered → Decisions (Sprint)
- ~~Does it run **inline** on the day~~ answered → Decisions (Sprint)
- ~~Is one interview per day~~ answered → Decisions (Sprint)
- ~~Does the interview know the day's context~~ answered → Decisions (Sprint)
- ~~Do the answers get **condensed into prose**~~ answered → Decisions (Sprint)
- ~~Should the interview also be the thing that fills mood and energy~~ answered →
  Decisions (Sprint)
- ~~Privacy: this is the most personal path in the app~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Fixed backbone question set, with an optional model-driven follow-up per
  answer when a model is configured. Works without a model using the fixed set alone.
- **(User)** Runs as a focused overlay, not inline on the day — removes the empty page
  that causes the problem in the first place.
- **(User)** Repeatable — can be run again later the same day for the second half,
  consistent with 011's "one growing text" decision.
- **(User)** Uses the day's context (projects touched, todos due) to ask targeted
  follow-up questions when a model is available.
- **(User)** Answers land as question/answer pairs in the file, not condensed into
  prose — no unconfirmed rewriting of the user's words (guardrail 2).
- **(User)** Does not fill mood/energy — those stay on the existing separate pickers,
  interview stays focused on text.
- **(User)** Privacy: recommends a local model, the same way `journal-chat` does; does
  not force one — the fixed question set already works without any model.
- Writes through the day-stream append that [011](011-journal-one-entry-not-two.md)
  leaves behind — the question as the app's blockquote turn via `formatTurn`, the answer
  as my own plain prose directly below it. Reason: reuses the existing
  my-words/its-words distinction instead of inventing a third format, and the answers
  stay part of the day's one growing text.
- No new `TaskKind`: follow-up questions run on `journal-chat`. Reason: same sensitivity
  and same category, so the interview inherits the local-model recommendation and the
  user's existing routing without a new settings row.
- The question texts live in the core as a document-language table (like
  `journalSections`), and the overlay shows exactly the string it will write; only the
  surrounding chrome (buttons, labels, progress) goes through `t()`. Reason: UI and file
  must never carry two different wordings of the same question.
- The IPC is stateless — three channels (plan / answer / follow-up); interview progress
  is ephemeral renderer state, no session file under `.secondbrain/`. Reason: the day
  file is already the only persistence, and a later run derives coverage from it.
- One append per answer, at submit time: question and answer land together; a skipped or
  unanswered question writes nothing. Reason: satisfies "every answer reaches the file
  before the next question" without leaving orphan questions behind when I walk out.
- The append carries no `expectedHash`. Reason: appending adds and rewrites no user line
  — the same trade-off `appendTurn` already makes; a conflict here would be pure friction.
- Without a model, "what the day already covers" comes only from hard signals
  (frontmatter `projects` / `people` / `mood` / `energy`, and topics already answered in
  an earlier run of the same day), never from a guess; the overlay shows the existing day
  text as context. Reason: guardrail 3 — no claim about my day that the file cannot back.
- A model follow-up is accepted only if it is a single interrogative sentence within a
  length limit; anything else is discarded and the backbone continues. Reason: makes
  "questions never assert facts about me" testable without asking a model.
- At most one follow-up per backbone answer, and the five topics are never extended by
  the model. Reason: the coverage set is a stated set, and the interview has to end by
  itself.
- The overlay is the `Dialog` atom (size `lg`), not a shell overlay like `AskOverlay` /
  `CaptureOverlay`; its one teal accent is "answer and continue". Reason: the interview
  belongs to the open day, not to the shell — and Gaston allows one accent per surface,
  exactly as `CloseDialog` does it.
- The closing panel names the day's existing mood/energy pickers as the remaining step
  instead of asking for them. Reason: honours the decision that the interview stays text
  only, without leaving the day half-filled.

## Plan

The interview is a stateless core function plus a dialog. Nothing new is stored: the day
file is the only persistence, so a run that is abandoned loses nothing and a second run
reads its own starting point back out of the file.

1. **Core, pure** (`src/core/journal/interview.ts`): the stated coverage set
   `INTERVIEW_TOPICS = ['work', 'events', 'people', 'open', 'feeling']`, the question
   table per `DocLanguage`, and `planInterview(day)` → ordered steps + `mode`
   (`fixed` | `model`). Topics the day already covers by hard signal are dropped.
2. **Core, write** (same module): `recordAnswer()` appends question + answer as one
   block through the day-stream append 011 settles on — the question via `formatTurn`
   as the app's turn, the answer as my prose below it. Per answer, before anything else.
3. **Core, model** (`src/core/llm/prompts/journal-interview.ts` + `interview-followup.ts`):
   one optional follow-up per answer on task `journal-chat`, fed the answer plus the day's
   context (project names, due todos). Validated to a single question; `LlmUnavailableError`
   → `{ question: null, noModel: true }`, never a throw.
4. **IPC** (`src/shared/ipc.ts`, `src/main/ipc/journal.ts`, `src/renderer/lib/api.ts`):
   `journal:interviewPlan`, `journal:interviewAnswer`, `journal:interviewFollowUp`.
   The renderer's order is answer → file → follow-up → next question.
5. **Overlay** (`src/renderer/screens/journal/InterviewDialog.tsx`): one question, one
   field, three ways on (answer and continue / skip / leave and write myself), progress
   in mono, a line saying which engine is running, a closing panel when the set is done.
6. **Entry point** (`JournalScreen.tsx` / the day surface 011 leaves): the interview
   button — primary when the day has no prose, secondary otherwise.
7. **Format + smoke**: the Q/A shape documented in `docs/VAULT-FORMAT.md`, a seeded demo
   day, a screenshot of the overlay.

Order matters: 1 → 2 before 3, and 4 before 5/6. D2 waits on 011's append surface.

**Coverage — every acceptance criterion and the deliverable that delivers it:**

| Criterion                                          | D            |
| -------------------------------------------------- | ------------ |
| Visible button, most prominent on an empty day     | D6           |
| One question at a time                             | D5           |
| Covers a stated set (work/events/people/open/felt) | D1           |
| Ends by itself and says so                         | D1 + D5      |
| Leave any time, nothing lost                       | D2 + D5/D6   |
| Skip without ending                                | D1 + D5      |
| My text as mine, questions legible as the app's    | D2           |
| In the file before the next question               | D2 + D4      |
| Works without a model, screen says which engine    | D1 + D3 + D5 |
| Questions never assert facts about me              | D3           |
| A day that already has text is picked up           | D1 + D3      |
| `t()` / document language, `de` and `en`           | D1 + D5      |

## Deliverables

**D1 — the coverage set and the plan (core, pure)**
Files: `src/core/journal/interview.ts` (new), `src/core/journal/types.ts`,
`src/core/journal/index.ts`, `tests/core/journal/interview.test.ts` (new).
Mirror: `src/core/journal/sections.ts` (document-language string tables),
`src/core/journal/streak.ts` (pure derivation), `src/core/journal/facts.ts`
(`knownPeople`, `heuristicFacts` — reuse instead of a second heuristic);
fixtures from `tests/core/journal/fixtures.ts`.
Accepted when: an empty day yields five steps in the document language, `de` and `en`
both filled, sentence case, no emoji; a day whose frontmatter carries `people` and
`projects` does not get those two questions; the plan reports `mode` and reports itself
as finished when every topic is answered or skipped.

**D2 — one Q/A pair into the day, per answer (core, write)**
Files: `src/core/journal/interview.ts`, `tests/core/journal/interview-write.test.ts` (new).
Mirror: `src/core/journal/dialog.ts` (`appendTurn`, `formatTurn`).
Accepted when: submitting an answer appends question + answer in one write through 011's
day-stream append (no new section, no new format); a skip writes nothing; an empty answer
is refused; round-trip holds (write → edit the file externally → re-read, nothing lost);
the question is recognisable as the app's and the answer as mine, in the file.

**D3 — the optional follow-up (core, model)**
Files: `src/core/llm/prompts/journal-interview.ts` (new),
`src/core/llm/prompts/index.ts`, `src/core/journal/interview-followup.ts` (new),
`tests/core/journal/interview-followup.test.ts` (new).
Mirror: `src/core/journal/coach.ts` (gateway call, `LlmUnavailableError` → `noModel`),
`src/core/llm/prompts/journal-chat.ts` (forbidden-phrase list as the test's checklist);
tests use `emptyGateway()` / `gatewayWithReplies()` from `tests/helpers/llm.ts`.
Accepted when: with the fake provider a valid follow-up comes back; a statement, an
empty answer or an over-long reply is discarded and the backbone continues; with no model
configured the result is `noModel: true` without a throw and without a dead state; the
prompt forbids asserting anything about the user and the test asserts the forbidden
phrases are in it.

**D4 — the three channels**
Files: `src/shared/ipc.ts`, `src/main/ipc/journal.ts`, `src/renderer/lib/api.ts`,
`tests/main/journal-ipc.test.ts`.
Mirror: the `journal:close` / `journal:applyClose` pair in the same files;
`docLanguage(services)` from `src/main/ipc/wiki-bridge.ts` supplies the question language.
Accepted when: the three channels exist in `IPC_CHANNELS` and in `api.journal.*`,
`tests/main/ipc-coverage.test.ts` stays green, `interviewAnswer` settles the index
(`settle(services, [...], 'journal')`) and returns the new hash, and an invalid date or
unknown topic is refused on the call (`fail('invalid', …)`) rather than inside a run.

**D5 — the interview overlay**
Files: `src/renderer/screens/journal/InterviewDialog.tsx` (new),
`src/renderer/lib/queries/journal.ts`, `src/renderer/i18n/en-journal.ts`,
`src/renderer/i18n/de-journal.ts`, `tests/renderer/journal.test.tsx`
(`tests/renderer/i18n.test.ts` enforces de/en key parity).
Mirror: `src/renderer/screens/journal/CloseDialog.tsx` (Dialog atom, one teal action),
`src/renderer/screens/journal/CoachComposer.tsx` (field + stance row).
Accepted when: exactly one question is on screen at a time; "answer and continue" writes
before the next question appears; "skip" moves on without ending; "leave and write myself"
and Esc both close it; a mono line shows progress; a line names the running engine (fixed
question set, or model-assisted with the provider from `useCoachRoute` plus the local
hint); the closing panel states the day is covered and points at the mood/energy pickers;
every chrome string in `de` and `en` via `t()`, sentence case, no emoji.

**D6 — the entry point on the day**
Files: `src/renderer/screens/journal/JournalScreen.tsx`,
`src/renderer/screens/journal/DayEntry.tsx`, `src/renderer/i18n/{de,en}-journal.ts`.
Accepted when: the button is visible on every day, primary (teal) while the day has no
prose and secondary once it has; closing the overlay leaves the writing surface focused
and editable; the day reloads so the answers are visible in the surface at once; the
button is reachable by keyboard.

**D7 — format, seed, screenshot**
Files: `docs/VAULT-FORMAT.md`, `scripts/seed/*`, `scripts/shot.mjs`.
Accepted when: VAULT-FORMAT describes the interview's Q/A shape inside the day stream;
the demo vault contains one day that visibly came out of an interview; `npm run seed &&
npm run shot` produces a screenshot of the overlay.

## Model Hints

D2 → deliverable-hard — it writes into the day file on top of the format 011 has just
changed; getting the append wrong reintroduces a second format and breaks the day
round-trip and conflict guarantees.

All other deliverables → default.

Review: → story-review-hard — this story adds a write path into the most sensitive file in
the vault while riding on 011's in-flight format change, so the review has to check
"my words vs. its words" and "written before the next question" against the real diff.

## Test Plan (manual acceptance)

Preparation: `npm run seed && npm run build`, start the app, open journal, select today
(no entry yet).

1. The interview button is the prominent action on the empty day. Click it.
2. Answer the first question, confirm with "answer and continue" — the second question
   appears. Open `journal/2026/…/<today>.md` in an editor: question one and your answer
   are already in the file, the question recognisably the app's, the answer your prose.
3. Skip the next question. The interview continues; nothing about the skipped question is
   in the file.
4. Choose "leave and write myself". The overlay closes, the day surface shows what you
   answered, the cursor is in the field — type a sentence of your own and save it.
5. Start the interview again on the same day. It does not re-ask what is already covered,
   runs to the end of the set, and says the day is covered instead of asking on.
6. Settings → models: remove the route for `journal-chat`. Start the interview: it runs
   the fixed question set and the overlay says so. Route a local model again: the overlay
   names it and marks it as running on this machine.
7. Settings → languages: switch the document language. A fresh interview asks and writes
   in that language; the old day's questions stay in the language they were written in.

## Done

<Filled by `/ai-scrum:build 012`.>
