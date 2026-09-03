---
id: 048
title: The field I write in is visible, and sends when I say so
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

Part of M15. Two of the user's feedback points about the same thing — the text fields in the
journal: they do not stand out from the page, and a keypress can file an entry the user was still
writing. Touches [DayText.tsx](../../src/renderer/screens/journal/DayText.tsx),
[CoachComposer.tsx](../../src/renderer/screens/journal/CoachComposer.tsx) and the shared
[ChatComposer.tsx](../../src/renderer/components/ChatComposer.tsx). Read
`src/renderer/styles/gaston/README.md` first — the contrast comes from tokens, not from a
hand-picked colour. Sibling: [[047-the-day-view-reads-in-the-order-i-write-in]].

## Requirement

I have to be able to see where I am supposed to write, and I decide when something is filed.

Today both journal fields sit on the page with almost no surface of their own, so the writing
area is not visibly a writing area. And in the coach field, `Shift+Enter` (and `Ctrl+Enter`)
files the entry — which means a stray keypress in the middle of a thought sends it. Enter should
do what it does in every editor: break the line. Filing happens when I click "Sagen".

The same holds for the day's own text field. It saves on `Ctrl+Enter` today; from now on it
behaves exactly like the coach field — `Enter`, `Shift+Enter` and `Ctrl/Cmd+Enter` all insert a
line break, and the visible "Speichern" button is the only way to commit the text (decided with
the user at the sprint cut; this supersedes the earlier draft assumption that the shortcut
stays). No keypress in either journal field writes anything to the vault, and none throws text
away either: `Esc` only leaves the field, discarding stays an explicit button.

This story changes only how the two fields look and which keys they honour. Where they sit on
the page is [[047-the-day-view-reads-in-the-order-i-write-in]]'s business and is assumed done.

## Acceptance Criteria

- [x] The day's text field and the coach field both sit on a surface that is clearly
      distinguishable from the page background, with a visible border and focus state, built only
      from Gaston tokens — no raw Tailwind palette class, no hex value.
- [x] Contrast and focus visibility hold in the app's real theme and are recorded (the
      accessibility report from `npm run a11y` shows no new finding on the journal screen).
- [x] In the coach field, `Enter` inserts a line break. So does `Shift+Enter`. So does
      `Ctrl/Cmd+Enter`. Nothing but the "Sagen" button files the entry.
- [x] The same holds for the day's own text field: `Enter`, `Shift+Enter` and `Ctrl/Cmd+Enter`
      all insert a line break, and only the "Speichern" button writes the text. The `Ctrl Enter`
      hint below it is gone with the shortcut.
- [x] No keypress in either journal field destroys a draft either: `Esc` leaves the field
      without discarding what is written; discarding stays an explicit action.
- [x] The hint next to both fields states what actually happens now — no line still promising
      a key that submits or saves.
- [x] The button stays reachable without a mouse: it is in the field's tab order, and the story
      says in one sentence how a keyboard-only user files an entry.
- [x] The change is confined to the journal: the Ask screen and every other `ChatComposer` user
      keep submitting on `Enter` exactly as before, pinned by a test.
- [x] A test covers that a keypress in the journal's coach field files nothing, and one that a
      keypress in the day's text field saves nothing.

## Open Questions

- ~~Q1: The day's own text field currently saves on `Ctrl+Enter` (with a visible `Ctrl Enter`
  hint) and is a save, not a send. Does that shortcut stay?~~ answered → Decisions (Sprint)
- ~~Q2: `ChatComposer` needs a third `submitKey` state ("nothing submits"). Proposal: extend the
  existing union with `'none'` rather than adding a second flag, so one prop keeps deciding
  key behaviour and hint text together.~~ answered → Decisions (Sprint)
- ~~Q3: How much surface? Proposal: the existing input/field token surface used elsewhere in the
  app, not a new one — the fields should look like Gaston fields, just actually visible.~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** The day's own text field drops the `Ctrl+Enter` save shortcut and behaves exactly
  like the coach field: `Enter`, `Shift+Enter` and `Ctrl/Cmd+Enter` all insert a line break, and
  a visible button (e.g. "Speichern") is the only way to commit the text. Reason: the user does
  not experience "save" and "send" as different actions, and wants exactly one button on the
  day field, consistent with the coach field this same story changes.
- **(User)** `ChatComposer`'s new "nothing submits" state extends the existing `submitKey` union
  with `'none'` rather than adding a second flag.
- **(User)** Field surface reuses the existing input/field tokens already used elsewhere in the
  app — no new surface design.
- The surface goes on the shared `.sb-composer-field` rule, not on a journal-only override, so
  the Ask composer gets the same visible writing box — a field that looks like a field on one
  screen and flat on another would be the same complaint again next sprint.
- Concretely the field reuses what `.gs-input` already defines (`--surface-sunken` background,
  `--border-subtle` border, `--border-focus` + `--accent-soft` focus ring); `.sb-composer-field`
  today explicitly sets `border: none; background: transparent; box-shadow: none`, and removing
  exactly those three suppressions is the change.
- `.sb-daytext` gets the same frame as `.sb-composer` (`--surface-card`, `--border-subtle`,
  `--radius-lg`), so the day's field and the coach field read as the same kind of writing area
  instead of one being framed and the other loose on the page.
- The focus ring sits on the field, not on the container: `.sb-composer:focus-within` keeps its
  subtle border tint, and a second ring around the frame would read as two focus states.
- `Esc` in the day field no longer discards the draft; it blurs, exactly as `ChatComposer`'s
  `Esc` does, and "Abbrechen" stays the explicit discard — a story about "no keypress files it"
  that leaves a keypress able to delete the text would only move the accident.
- `journal.field.hintSend` and the old `journal.day.hint` wording are replaced rather than kept,
  because a key hint no key honours is worse than none (and orphan i18n keys rot).
- The verification command is `npm run a11y` (report at `.screenshots/a11y.json`, journal is
  already in `scripts/lib/screens.mjs`), not `npm run shot` — `shot.mjs` only takes pictures;
  `npm run verify:ui` runs both.
- Keyboard-only path, for the record (AC 5): the button already follows the textarea in DOM
  order, so from the field it is `Tab` (coach field: `Tab` past the stance switch) and then
  `Enter`/`Space` on the button — no new focus handling, only a test that pins the order.
- 047 makes the day field always editable; this story does not re-add or remove that. Where
  `DayText` freezes value and hash stays untouched — the conflict guard is not this story's
  subject and must still pass its existing tests.

## Plan

Renderer-only, five small steps, in order. Depends on 047 having already moved the sections and
made the day field always editable (`DayText.tsx`, `CoachComposer.tsx` stay where 047 put them).

1. `ChatComposer.tsx`: extend `submitKey` to `'enter' | 'shift-enter' | 'none'`. In `onKeyDown`,
   when `submitKey === 'none'`, no `Enter` combination — plain, `Shift`, `Ctrl`, `Cmd` — calls
   `onSubmit`; all of them fall through to the textarea. `Esc` behaviour is unchanged. The hint
   block gets a third shape for `'none'`: `Enter` breaks the line, `Esc` leaves the field, and a
   plain sentence naming the button, overridable via a new `ComposerTexts.hintNoSubmit`.
2. `CoachComposer.tsx`: pass `submitKey="none"`, replace the `journal.field.hintSend` text with
   the new "only the button says it" line, adjust the module comment (it currently documents
   Shift+Enter as filing).
3. `DayText.tsx`: drop the `Ctrl/Cmd+Enter` branch from `onKeyDown`, let `Esc` blur instead of
   calling `stop()`, and replace the `<Kbd keys={['Ctrl','Enter']} />` footer hint with a line
   that names "Speichern". Everything about `base`/`frozen`/conflict stays exactly as it is.
4. CSS, tokens only: in `styles/app/ask.css` remove the three suppressions on
   `.sb-composer-field` and give it the `.gs-input` surface/border/focus ring; in
   `styles/app/journal.css` give `.sb-daytext` the `.sb-composer` frame.
5. Tests + acceptance: journal tests for "no keypress files/saves anything" and for the honest
   hints, a tab-order test, the Ask regression pin, then `npm run verify` and `npm run verify:ui`.

Affected files: `src/renderer/components/ChatComposer.tsx`,
`src/renderer/screens/journal/CoachComposer.tsx`, `src/renderer/screens/journal/DayText.tsx`,
`src/renderer/styles/app/ask.css`, `src/renderer/styles/app/journal.css`,
`src/renderer/i18n/{de,en}-screens.ts`, `src/renderer/i18n/{de,en}-journal.ts`,
`tests/renderer/journal.test.tsx`, `tests/renderer/ask.test.tsx`.

## Deliverables

### D1 — `ChatComposer` learns "nothing submits" [x]

Files: `src/renderer/components/ChatComposer.tsx`,
`src/renderer/i18n/de-screens.ts`, `src/renderer/i18n/en-screens.ts`.

- `submitKey?: 'enter' | 'shift-enter' | 'none'`; default stays `'enter'`.
- With `'none'`, no `Enter` variant (plain / `Shift` / `Ctrl` / `Cmd`) calls `onSubmit` — the key
  reaches the textarea and breaks the line. `Esc` unchanged.
- Hint for `'none'`: `Enter` + `ask.field.hintBreak`, `Esc` + `ask.field.hintEscape`, plus a new
  overridable line (`ComposerTexts.hintNoSubmit`, default a new key such as
  `ask.field.hintNoSubmit`, de „Abgelegt wird nur über den Knopf“ / en "only the button files
  it"). No `Kbd` in that hint may name a submitting key.
- Mirror the existing `onShift` branch rather than adding a second flag or a parallel handler.

Acceptance: `'enter'` and `'shift-enter'` behave bit-for-bit as before; with `'none'` no
keypress reaches `onSubmit`; `npm run lint`, `typecheck`, `test` green.

### D2 — The coach field only files on the button [x]

Files: `src/renderer/screens/journal/CoachComposer.tsx`,
`src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`,
`tests/renderer/journal.test.tsx`.

- `submitKey="none"`; `journal.field.hintSend` replaced by a `hintNoSubmit` text naming the
  button ("Sagen" / "Speichern und fragen" depending on stance — keep the existing `send` logic).
- Module comment updated: it currently claims Shift+Enter files the entry.
- Tests: `Enter`, `Shift+Enter` and `Ctrl+Enter` each only insert a line break and produce no
  `journal:append` call; the button still appends. Rewrite the two existing tests at
  `tests/renderer/journal.test.tsx:609` and `:628` (they assert the old binding and its hint) —
  they are not weakened, they are re-pointed at the decided behaviour.

Acceptance: covers AC 3, AC 7 (coach half) and the coach half of AC 6's counterpart.

### D3 — The day's text field only saves on the button [x]

Files: `src/renderer/screens/journal/DayText.tsx`,
`src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`,
`tests/renderer/journal.test.tsx`.

- Remove the `Ctrl/Cmd+Enter` save branch in `onKeyDown`; `Esc` blurs the textarea instead of
  discarding (mirror `ChatComposer.tsx:149-159`), "Abbrechen" stays the discard.
- Footer hint: drop `<Kbd keys={['Ctrl','Enter']} />`, rewrite `journal.day.hint` to state that
  only "Speichern" commits and that `Esc` just leaves the field. German uses `„…“`; the English
  string must not contain `„`.
- Leave `stored` / `base` / `expected` / `frozen` and both alert cards untouched.
- Tests: typing `Enter`, `Shift+Enter`, `Ctrl+Enter` in the day field produces no
  `journal:setDay` call and keeps the draft; the existing hash-freeze, external-change and
  conflict tests (`tests/renderer/journal.test.tsx:533-602`) still pass.

Acceptance: covers the day-field ACs and AC 7 (day half).

### D4 — Both fields are visibly fields (tokens only) [x]

Files: `src/renderer/styles/app/ask.css`, `src/renderer/styles/app/journal.css`.

- `.sb-composer-field`: drop `border: none`, `background: transparent` and the
  `:focus/:focus-visible { box-shadow: none }` block; add the `.gs-input` surface
  (`--surface-sunken`), `1px solid var(--border-subtle)`, `var(--radius-md)`, padding from a
  space token, and the focus ring `border-color: var(--border-focus)` +
  `box-shadow: 0 0 0 3px var(--accent-soft)`. Mirror
  `src/renderer/styles/gaston/components/components.css:134-165`.
- `.sb-daytext`: add the frame `.sb-composer` uses (`--surface-card`, `--border-subtle`,
  `--radius-lg`, padding) so both fields read the same.
- Not one hex value, not one raw Tailwind palette class, no new token.

Acceptance: covers AC 1. Visual check on the Ask screen too — its composer changes with it and
must not lose the container/field distinction.

### D5 — Pinned: keyboard reachability, Ask untouched, a11y clean [x]

Files: `tests/renderer/ask.test.tsx`, `tests/renderer/journal.test.tsx`.

- Ask pin: extend `tests/renderer/ask.test.tsx:674` so it explicitly states it guards 048 —
  `Enter` still asks, `Shift+Enter` still breaks, and the hint still names `Enter` as the
  submitting key.
- Tab order: from the coach textarea, `Tab` reaches the send button (past the stance switch);
  from the day textarea, `Tab` reaches "Speichern". Assert via DOM order / `tabIndex`, not a
  screenshot.
- `npm run seed && npm run build && npm run shot && npm run a11y` (i.e. `npm run verify:ui`):
  `.screenshots/a11y.json` shows no new finding for the `journal` screen, and the journal
  screenshots show the framed fields.

Acceptance: covers AC 2, AC 5, AC 6.

## Model Hints

- `D1 → deliverable-hard` — it is the one shared component both the Ask screen and the journal
  render, and a wrong condition in `onKeyDown` silently breaks asking a question on the other
  screen rather than failing loudly.
- D2, D3, D4, D5 → default (Sonnet, effort `medium`): each is a bounded edit in one or two files
  with its own test.
- `Review: → default` — the whole diff is renderer + CSS + i18n, and the one real regression risk
  (the Ask composer) is pinned by a test in D5.

## Test Plan (manual acceptance)

Run `npm run seed`, then start the app and open Journal → today.

1. Click into the day's text field, type a sentence, press `Enter`, `Shift+Enter` and
   `Ctrl+Enter` in turn: each inserts a line break, nothing is saved (no "Gespeichert." note).
   Press `Esc`: focus leaves the field, the text is still there. Click "Speichern": now the
   note appears.
2. Do the same in the coach field at the bottom: all three key combinations only break the line,
   no turn appears in the history. Click "Sagen": the turn appears.
3. Both fields: with the field unfocused, the writing area is a visibly darker box with its own
   border, distinguishable from the page. Tab into it — a teal focus ring appears.
4. From the day field press `Tab` once and `Enter`: that saves. From the coach field press `Tab`
   twice (stance switch, then button) and `Enter`: that files the turn.
5. Read the hint lines at both fields: no line names a key that submits or saves.
6. Open the Ask screen, type a question, press `Enter`: it still asks. `Shift+Enter` still
   breaks the line.
7. `npm run a11y` — `.screenshots/a11y.json` has no new finding for the `journal` screen.

## Done

Both journal fields now sit on a proper Gaston surface (`.gs-input`-style token frame reused via
`.sb-composer-field` and `.sb-daytext`) and file/save only through their button. `ChatComposer`
gained a third `submitKey: 'none'` mode used by the coach field; `DayText.tsx` dropped its
`Ctrl/Cmd+Enter` save branch and now blurs (not discards) on `Esc`, mirroring `ChatComposer`.
Hints were rewritten to name the button instead of a key. Ask and every other `ChatComposer`
consumer keep `submitKey="enter"` and are pinned by a regression test.

**Commit message:**
`048: journal fields are visibly fields and only send on the button`

**Verification:** `npm run build`, `npm test` (251 files / 3564 tests), `npm run lint`,
`npm run typecheck` all green. `npm run format:check` shows pre-existing warnings on 241
unrelated files (repo-wide, not touched by this story) — none of the files changed here are
flagged. Live smoke via `npm run seed && npm run build && npm run shot && npm run a11y`: journal
screen a11y report clean ("ohne Verstoß", no new finding), journal screenshots show the framed
fields. Clean-agent review verdict: PASS on all 9 acceptance criteria, no test weakening, no
scope creep, no guardrail violations found.

**Decisions:**
- AC 2 (a11y) was verified via the D5 deliverable's own pipeline run (`.screenshots/a11y.json`
  is a build artifact, not tracked/diffable) rather than re-run again at story-level, per the
  "run each command once" verify rule — the tree was untouched between D5 and this closing pass.
- The pre-existing `npm run format:check` warnings across 241 unrelated files were checked
  against every file this story touched (none flagged) and treated as a known repo-wide
  condition, not a story regression.
- No changelog entry: `changelog-path` is not set in `.claude/ai-scrum.md`, so this step is
  skipped per the profile.
