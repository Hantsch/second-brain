---
id: 102
title: Test and config drift drive-bys
status: done # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

The maintainer wants three small drifts between tests, config and their sources removed, so that a
deliberate edit (a retuned prompt cap, a changed installer target, a new Node floor) does not
break a test with no user-visible change, and so that `engines.node` says what CI actually runs.
All three are low severity (P3) and ship as drive-bys.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F10, F11, F14):

- F10: `tests/scripts/build-config.test.ts:45` pins `win.target` to `['nsis', 'portable']`, and
  `tests/scripts/e2e-wiring.test.ts:153-154` asserts that README.md mentions `npm run test:e2e`.
  Both fail on a deliberate edit, not on a defect a user would notice. The deliberate guards stay:
  `build.files` (`build-config.test.ts:23`), the publish pin (`:53`) and
  `tests/main/architecture-doc.test.ts` (story 058 AC6).
- F11: `package.json:10-12` has `engines.node` `>=20.19`, `.nvmrc` is `24`, and
  `vitest.config.ts:18-24` preloads a shim (`:30`, used at `:70`) only for Node < 22.10, a major
  CI never runs. `npm install` on Node 20 is accepted.
- F14: 3 tests repeat a builder's cap: `tests/core/llm/prompts.test.ts:33`
  (`toBeLessThan(4200)`), `tests/core/wiki/prompts.test.ts:103` (`9000`) and
  `tests/core/ingest/transcript.test.ts:66` (`1800`). `tests/core/claude/jsonl.test.ts:158`
  (`5000`) is not a prompt cap and is out of scope.

## Acceptance Criteria

- [x] **AC1** — `tests/scripts/build-config.test.ts` no longer contains the literal
      `['nsis', 'portable']`; if the win target is still asserted, it asserts a property (for
      example that targets are non-empty, or no space in artifact names), and a test fails when
      that property is seeded broken.
- [x] **AC2** — `tests/scripts/e2e-wiring.test.ts` no longer asserts that README.md mentions
      `npm run test:e2e` (`grep -n "README" tests/scripts/e2e-wiring.test.ts` returns nothing
      about that sentence); the `test:e2e` invokes `playwright test` check (`:38-41`) stays.
- [x] **AC3** — The `build.files` assertion, the `publish` pin in `build-config.test.ts` and
      `tests/main/architecture-doc.test.ts` are unchanged, and `npx vitest run
tests/scripts/build-config.test.ts tests/scripts/e2e-wiring.test.ts
tests/main/architecture-doc.test.ts` exits 0.
- [x] **AC4** — `package.json` `engines.node` is `>=24`, and a test or `npm install` check fails
      for a value whose major differs from the `.nvmrc` major (a seeded `>=20.19` turns it red).
- [x] **AC5** — `vitest.config.ts` still starts, `npm test` exits 0, and the Node 25 Web Storage
      flag (`:32-37`) is unchanged by this story.
- [x] **AC6** — Each of `tests/core/llm/prompts.test.ts:33`, `tests/core/wiki/prompts.test.ts:103`
      and `tests/core/ingest/transcript.test.ts:66` no longer contains a bare numeric
      `toBeLessThan(<literal>)` on prompt length; each asserts against an exported cap constant of
      the builder, or is replaced by a content-level truncation assertion.
- [x] **AC7** — Truncation is still proven by content in each of the 3 files: a test fails when
      the builder is seeded to stop truncating long input (the output then contains the tail of the
      input that should have been cut).
- [x] **AC8** — `tests/core/claude/jsonl.test.ts` has no diff, and `refresh-paths.test.ts:79` has
      no diff.
- [x] **AC9** — No test is deleted or skipped; every removed assertion is named, with the reason,
      in the commit message or the Done section.

## Open Questions

- ~~Undici shim: this story, a follow-up, or never?~~ Answered (User): keep it, see Decisions.
- ~~F11 enforcement: `engines.node` plus the `.nvmrc` warning, or a test?~~ Answered: a test that
  pins a relation (same major), not a value; see Decisions.
- ~~F10: drop `win.target` or replace it with a property?~~ Answered: properties; see Decisions.
- ~~F14: export each cap, or a content-level truncation check?~~ Answered: content-level; see
  Decisions.
- ~~Confirm per builder whether each cap mirrors a constant.~~ Confirmed: none is an exported
  constant. `titleTagsPrompt` clamps with an inline `4000`
  (`src/core/llm/prompts/title-tags.ts:43`), `summarizeSourcePrompt` with
  `input.maxChars ?? 8000` (`src/core/llm/prompts/summarize-source.ts:128`), `buildParagraphs`
  with the module-private `PROSE_DEFAULTS.hardMaxChars: 1600`
  (`src/core/ingest/youtube/transcript.ts:29`).

## Decisions (Sprint)

- **(User)** Undici shim: keep it; deleting it is a separate later decision.
- F11: `engines.node` becomes `>=24` and one test in `tests/scripts/ci-gate.test.ts` asserts its
  floor major equals the `.nvmrc` major — it pins a relation between two sources, so a deliberate
  Node bump edits both and stays green, unlike the value mirrors F10 removes.
- F11: no `engine-strict`; AC4's "test or `npm install` check" is met by the test, and a hard
  install block would contradict the kept shim that still supports older majors locally.
- F10: the `win.target` literal (and the literal `package` script that repeats the same target
  list) is replaced by properties — targets non-empty, each target's `artifactName` has no
  whitespace, the `package` script builds exactly those targets with `--publish never` — because
  the test title already promises the no-space property and a dropped assertion would leave an
  empty target list unguarded.
- F14: content-level truncation checks instead of exported caps — no builder exports its cap,
  and exporting three constants only for tests would touch `src/` in a tests-only sprint; a tail
  marker beyond any plausible cap proves truncation independent of the number.
- F14 inputs sit far above the current caps (100 000 chars, 400 cues), so a retune of a cap
  within an order of magnitude stays green.
- The `it` "README.md mentions test:e2e in the development section" held only the assertion AC2
  removes; it goes with it and is named in Done — AC9 is read as "nothing beyond what AC1/AC2
  name is deleted", since AC2 mandates this one.

## Plan

Tests-only drive-by: three independent fixes, no `src/` change in the commit. Order D1 → D3, each
verified with its own `npx vitest run <files>`.

1. **F10 (D1)** — `tests/scripts/build-config.test.ts`: the `win.target` literal and the literal
   `scripts.package` string become properties; `build.files`, `extraResources`, `nsis`,
   `portable.artifactName` and `publish` assertions stay byte-identical.
   `tests/scripts/e2e-wiring.test.ts`: drop the `readme` constant, the README `it`, and README
   from the describe title and the header comment.
2. **F11 (D2)** — `package.json` and `package-lock.json` (root `packages[""].engines`) to `>=24`;
   one new `it` in the `.nvmrc` describe of `tests/scripts/ci-gate.test.ts`. `vitest.config.ts`
   untouched (User decision: shim stays).
3. **F14 (D3)** — three tests rewritten to tail-marker / no-text-lost assertions in
   `tests/core/llm/prompts.test.ts`, `tests/core/wiki/prompts.test.ts`,
   `tests/core/ingest/transcript.test.ts`; each proven red once by a temporary, uncommitted seed
   in its builder.

The Done section lists every removed assertion with its reason (AC9).

## Deliverables

- [x] D1 — **F10: build-config and e2e-wiring tests stop pinning deliberate edits.** Files:
      `tests/scripts/build-config.test.ts`, `tests/scripts/e2e-wiring.test.ts`, nothing else.
      In `build-config.test.ts`, inside the `it` at line 36: remove
      `expect(build.win.target).toEqual(['nsis', 'portable'])` and
      `expect(scripts.package).toBe('npm run build && electron-builder --win nsis portable --publish never')`.
      Add instead: `build.win.target` is a non-empty array of strings; for every target `t`,
      `build[t].artifactName` is a string that does not match `/\s/` (this replaces the two
      hard-coded `not.toMatch(/\s/)` lines; keep the "A space breaks the asset URL" comment); the
      targets after `--win` in `scripts.package` (the tokens up to the next `--` flag) equal
      `build.win.target` in order, and `scripts.package` contains `--publish never`. Rename the
      `it` to what it now checks, e.g. "every win target has a space-free artifact name, the
      package script builds exactly those targets without publishing, and releases publish to
      Hantsch/second-brain". Do **not** change the `build.files` test (lines 22-24), the
      `extraResources` test, the `build.artifactName` undefined check, the `nsis` /
      `portable.artifactName` pins, or the `publish` pin (line 53).
      In `e2e-wiring.test.ts`: delete `const readme = read('README.md');` (line 35) and the `it`
      "README.md mentions test:e2e in the development section" (lines 153-155); rename the
      describe at line 145 to "the profile sets e2e: npm run test:e2e"; in the header comment
      (line 15) AC8's line becomes `the profile sets "e2e: npm run test:e2e".` — afterwards
      `grep -n README tests/scripts/e2e-wiring.test.ts` returns nothing. Keep the `test:e2e`
      invokes `playwright test` check (lines 38-42).
      Acceptance: a temporary edit of `package.json` to `"target": []`, and separately a space in
      `portable.artifactName`, each turns the renamed test red; revert both.
      `npx vitest run tests/scripts/build-config.test.ts tests/scripts/e2e-wiring.test.ts tests/main/architecture-doc.test.ts`
      exits 0; `git diff tests/main/architecture-doc.test.ts` is empty.
- [x] D2 — **F11: `engines.node` says what CI runs, and a test keeps it on the `.nvmrc` major.**
      Files: `package.json` (`engines.node` → `">=24"`), `package-lock.json` (the root
      `packages[""].engines.node`, around line 60, → `">=24"`; edit by hand, do not run
      `npm install`), `tests/scripts/ci-gate.test.ts`. Do **not** touch `vitest.config.ts` or
      `.nvmrc`. In `ci-gate.test.ts`, inside the existing describe "every workflow takes its Node
      version from .nvmrc" (line 129), add one `it` "package.json engines.node has the .nvmrc
      major as its floor": read `.nvmrc`, take its major (`trim().split('.')[0]`), read
      `engines.node` from package.json (widen the `packageJson` type at line 16 with
      `engines: { node: string }`), assert it matches `/^>=\s*(\d+)/` and that the captured major
      equals the `.nvmrc` major. Add one sentence to the comment above that describe:
      `engines.node` is the third place the Node major lives.
      Acceptance: a temporary `engines.node` of `">=20.19"` turns the new test red; revert.
      `npx vitest run tests/scripts/ci-gate.test.ts` exits 0; `git diff vitest.config.ts` empty.
- [x] D3 — **F14: truncation is proven by content, not by a copied cap.** Files:
      `tests/core/llm/prompts.test.ts`, `tests/core/wiki/prompts.test.ts`,
      `tests/core/ingest/transcript.test.ts`. No `src/` file in the commit. Keep the three test
      names unchanged.
      (a) `tests/core/llm/prompts.test.ts` › "kürzt sehr lange Texte" (lines 30-34): input
      `'x'.repeat(100_000) + 'TEXTENDE'`; keep `toContain('gekürzt')`; replace
      `toBeLessThan(4200)` with `expect(lastUserOf(turns)).not.toContain('TEXTENDE')`.
      (b) `tests/core/wiki/prompts.test.ts` › "sagt beim Teilstueck, dass es eines ist, und kuerzt
      lange Texte" (lines 95-104): text `'x'.repeat(100_000) + 'QUELLENENDE'`; keep the other
      assertions; replace `toBeLessThan(9000)` with `not.toContain('QUELLENENDE')`.
      (c) `tests/core/ingest/transcript.test.ts` › "zieht die Notbremse bei Captions ohne jede
      Interpunktion" (lines 57-66): 400 cues instead of 40 (same punctuation-free text, still 1 s
      apart so no pause break fires); keep `paragraphs.length > 1`; replace the per-paragraph
      `toBeLessThan(1800)` loop with: the paragraph texts joined by `' '` equal the cue texts
      joined by `' '` (nothing lost), and no single paragraph's text equals that whole joined
      text.
      Acceptance, each seed temporary and reverted before commit: for (a) and (b), make `clamp`
      in `src/core/llm/prompts/shared.ts` return the trimmed text uncut → both tests red; for
      (c), set `breakOnLength` in `src/core/ingest/youtube/transcript.ts` to `false` → test red.
      `npx vitest run tests/core/llm/prompts.test.ts tests/core/wiki/prompts.test.ts tests/core/ingest/transcript.test.ts`
      exits 0; `git diff --stat` shows nothing under `src/` and no change to
      `tests/core/claude/jsonl.test.ts` or `tests/core/index/refresh-paths.test.ts`.

## Model Hints

All Ds default tier: each is a bounded test edit with its seed check spelled out.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/scripts/build-config.test.ts` › the renamed win-target `it` (D1); red with
  `win.target: []` or a spaced `artifactName`.
- AC2 → unit `tests/scripts/e2e-wiring.test.ts` › "package.json has a test:e2e script that runs
  playwright" stays green, and `grep -n README tests/scripts/e2e-wiring.test.ts` is empty (D1).
- AC3 → unit `tests/scripts/build-config.test.ts` › "ships exactly out/\*\* and package.json —
  nothing wider" plus the publish assertion in the renamed `it`, and
  `tests/main/architecture-doc.test.ts`, all green via the three-file `npx vitest run` in D1;
  the diff leaves those lines untouched (D1).
- AC4 → unit `tests/scripts/ci-gate.test.ts` › "package.json engines.node has the .nvmrc major as
  its floor"; red with `>=20.19` (D2).
- AC5 → `npm test` exits 0 in the sprint's regression gate; `git diff vitest.config.ts` empty
  (D2).
- AC6 → the three tests named under AC7 carry no `toBeLessThan(<literal>)` on length (D3).
- AC7 → unit `tests/core/llm/prompts.test.ts` › "kürzt sehr lange Texte";
  unit `tests/core/wiki/prompts.test.ts` › "sagt beim Teilstueck, dass es eines ist, und kuerzt
  lange Texte"; unit `tests/core/ingest/transcript.test.ts` › "zieht die Notbremse bei Captions
  ohne jede Interpunktion" — each red under its seed (D3).
- AC8 → `git diff --stat` shows no change to `tests/core/claude/jsonl.test.ts` and
  `tests/core/index/refresh-paths.test.ts`; checked by the review (D3).
- AC9 → the Done section names each removed assertion with its reason (`win.target` literal,
  `scripts.package` literal, the README `it`, three length literals); checked by the review
  (D1-D3).

## Done

Tests-only drive-by, no `src/` change. F10: `win.target` / `scripts.package` literals became properties
(non-empty targets, space-free artifactName per target, package script builds exactly those targets with
`--publish never`). F11: `engines.node` `>=24` (package.json + lock root), ci-gate test pins its major to `.nvmrc`.
F14: three truncation tests assert by content (tail marker / nothing lost), no length literal.

Commit message: `102: win-target + engines.node pinned by property, README e2e assert dropped, prompt caps proven by content`

Verification (narrow gate): lint, format:check, typecheck, build green; `npx vitest run --changed HEAD` 405 files / 4938 tests green;
no e2e mapped. Typecheck TS18048 in build-config.test.ts found by verify, fixed (`String(scripts.package)`), re-run green.
AC -> test: AC1 build-config renamed win-target `it` (red with `target: []` / spaced artifactName, seeded); AC2 e2e-wiring, grep README empty;
AC3 build-config files/publish + architecture-doc, no diff; AC4 ci-gate "engines.node has the .nvmrc major as its floor" (red with `>=20.19`, seeded);
AC5 vitest.config.ts no diff; AC6/7 the three truncation tests (red under clamp / breakOnLength seeds); AC8/9 no diff on jsonl/refresh-paths. No manual residue.
Removed assertions (AC9): `win.target` toEqual literal and `scripts.package` toBe literal (deliberate-edit mirrors, replaced by properties);
the README `it` "mentions test:e2e in the development section" (AC2 mandates it); three `toBeLessThan(4200/9000/1800)` length literals (replaced by content checks).
Review (default): PASS. Unfixed minor findings: redundant `not.toBe(whole)` in transcript test (cheap guard, kept); single-space join assumption in transcript test (current builder contract).
Decisions: undici shim kept; no engine-strict; no exported caps (see Decisions section).

tiers: D 3 / hard 0 · review default · cycles 0 · agents 5
