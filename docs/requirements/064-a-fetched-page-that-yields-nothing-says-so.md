---
id: 064
title: A fetched page that yields nothing says so
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.1-3](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: the fetch sends no User-Agent header (`src/core/ingest/url.ts:134` sends only
`accept`) — bot walls 403 or serve interstitials; a consent page or SPA shell converts to
near-empty Markdown and is written as a legitimate source; an empty-text job ends `awaiting-llm`
with `message: null` (`src/core/ingest/queue.ts:280`), indistinguishable on screen from "no
model configured"; the duplicate check offers no "ingest anyway" (`SourcesTab.tsx:66` shows only
a toast), so a changed page cannot be re-fetched from the UI.

## Requirement

When I paste a URL, three failure shapes currently masquerade as success or as each other. A
site that blocks clients without a User-Agent fails where a browser would succeed. A cookie
wall or JavaScript-only page converts to a near-empty Markdown file that gets written as a
legitimate source — a hollow page later answers can cite. And when extraction genuinely yields
nothing, the job shows the same state as "no model configured", so I cannot tell a broken page
from a missing setting. On top of that, a page that changed since I first ingested it cannot be
fetched again: the duplicate check has no override.

Fetching should look like a normal client, a page that yielded no real content should be a
named, visible outcome instead of a hollow source, and re-ingesting deliberately should be
possible.

## Acceptance Criteria

- [ ] **AC1** — The fetch sends a reasonable User-Agent; a test pins the header.
- [ ] **AC2** — A fetch whose extracted content is empty or trivially small ends in a named state ("page
      yielded no content"), distinct from "no model configured" and from network errors — and
      writes no digestible source that pretends otherwise.
- [ ] **AC3** — The duplicate detection gains an explicit "ingest again" path that creates a new dated
      raw source, never overwriting the old one (raw stays immutable).
- [ ] **AC4** — Content-type rejections and truncations keep their existing behaviour; existing tests are
      unweakened.
- [ ] **AC5** — Tests cover: a consent-wall-shaped page, an empty extraction, and the re-ingest path —
      all offline against fixtures.

## Open Questions

_None — every detail decision of this refine is recorded under `## Decisions (Sprint)`._

## Decisions (Sprint)

Taken during the S16 refine without the user (automated sprint), against the ACs, CLAUDE.md
and `docs/sprints/S16/sprint.md`.

- **User-Agent is truthful, not a browser disguise:**
  `FETCH_USER_AGENT = 'Mozilla/5.0 (compatible; Gaston/1.0)'` — the conventional
  `Mozilla/5.0 (compatible; …)` form gets past clients-without-UA walls, and naming the app
  keeps us from claiming to be Chrome (guardrail 3's honesty, applied outward).
- **Only the UA is added**, no `accept-language` or cookie handling — AC1 asks for one header,
  and a consent wall is not defeated by pretending to have consented.
- **"Trivially small" is `< 200` non-whitespace characters** of the extracted Markdown —
  the same 200-char bar `pickMainContent` (`src/core/ingest/html.ts:105`) already uses to
  decide whether a candidate is real content, so the entrance has one threshold, not two.
- **The raw file is still written**, with the note in the ingest log: `raw/` is never indexed
  or citable (`src/core/index/build.ts:260` keeps only `.md` from `modules/`), so the fetched
  bytes stay as evidence of what the wall returned, while no wiki source page is created —
  which is the citable thing AC2 protects.
- **No notice text inside the raw file**: raw is a faithful record of the response; the reason
  lives on the job and in `.ingest.json`, not as our prose in the user's raw folder.
- **The named reason is a field, not a new stage:** `IngestJob.notDigestedReason` carries an
  `IngestNoteCode` (`no-content` here), `null` means "no model configured" — reusing 051's
  terminal-state shape as sprint.md demands. If 051 landed an equivalent field under another
  name, extend **that** one; never two mechanisms (CLAUDE.md "reuse instead of copying").
- **Re-ingest is a flag on the existing channel** (`ingest:start` req `force?: boolean`), not a
  new IPC channel — same request, one explicit override, no second entry point to keep in sync.
- **The new dated raw source needs no new code:** `freeRawPath` (`src/core/ingest/raw.ts:58`)
  already suffixes `-2`, `-3`, … and never overwrites, so AC3's "raw stays immutable" is proven
  by test, not by a new mechanism.
- **The trigger sits on the duplicate job row** (`JobList.tsx`), where the duplicate is
  announced — not in the source detail dialog, which is about an existing source, not a re-fetch.
- **e2e fetches from a fixture, never from the network:** a new seam
  `SB_E2E_FETCH_FIXTURE` mirrors `SB_E2E_FAKE_PROVIDER` / `SB_E2E_TASKS_FIXTURE`; no local HTTP
  server, no socket, per CLAUDE.md "tests never call … the network".
- **Gardener and the undigested filter stay out of scope** — 051's AC4 owns that surface for
  the whole "not digested, and here is why" family; 064 only writes the log note it reads.

## Plan

Build order inside the sprint is 050 → 051 → 064. 051 establishes the "not digested, and the
reason is named" terminal shape; 064 adds the URL case to it.

1. **Fetch looks like a client** — `src/core/ingest/url.ts`: one `FETCH_USER_AGENT` constant,
   added to the existing `headers` in `fetchPage` (line 137). Nothing else in the request changes.
2. **Emptiness is detected where the Markdown is made** — still `url.ts`: after
   `htmlToArticle`, measure the extracted Markdown. Below `MIN_CONTENT_CHARS` the outcome gets
   the note `no-content` (new `IngestNoteCode` in `src/core/ingest/types.ts`) and `text: ''`,
   the raw file and the ingest log are written as before. Truncation and content-type rejection
   keep their paths — the new check runs after them, so a truncated but substantial page is
   unaffected (AC4).
3. **The queue names the reason** — `src/core/ingest/queue.ts:273-284`: the terminal branch
   already covers three cases in one `if`; it now records **why** it did not digest in
   `IngestJob.notDigestedReason` (`src/shared/types/knowledge.ts`, default `null` in
   `createJob`). `no-content` ≠ `null` ("no model configured"); a fetch that failed still ends
   in `error` via `fail()`, untouched. **Reuse 051's field if it landed one.**
4. **"Ingest again"** — `src/shared/ipc.ts`: `ingest:start` req gains `force?: boolean`;
   `src/main/ipc/ingest.ts:355-375` skips the in-session lookup and `findDuplicate` when it is
   set and calls `queue.add`. `freeRawPath` supplies the new dated path by itself.
5. **The renderer offers it** — `JobList.tsx`: the `duplicate` note block gets a secondary
   "Ingest again" button; the `awaiting-llm` block splits, so a `no-content` job shows its own
   statement instead of "set up a model". `SourcesTab.tsx` passes the handler and calls
   `start` with `force: true`. New keys in `i18n/de.ts` + `en.ts`, sentence case, tokens only.
6. **Real-surface acceptance** — new seam `src/main/ipc/fetch-e2e-fixture.ts` (mirror
   `tasks-e2e-fixture.ts`), used by `environment()` in `src/main/ipc/ingest.ts` instead of
   `fetch` when `SB_E2E_FETCH_FIXTURE` points at a fixture manifest; `tests/e2e/fixtures/app.ts`
   gains a worker option for it; one spec drives paste-URL → "page yielded no content" and
   duplicate → "ingest again" → second raw file.

## Deliverables

- **D1 — The fetch identifies itself.** `src/core/ingest/url.ts` (exported
  `FETCH_USER_AGENT`, added to `fetchPage`'s `headers`) plus its test in
  `tests/core/ingest/url.test.ts` (mirror the existing `fakeFetch` cases in that file, which
  already capture the request init). Acceptance: the pinned UA string is asserted verbatim;
  every existing url test stays green and unchanged.
- **D2 — An empty extraction is a note, not a silent success.** `src/core/ingest/url.ts`
  (`MIN_CONTENT_CHARS = 200`, non-whitespace count of the extracted Markdown, note
  `no-content`, `text: ''` in the outcome), `src/core/ingest/types.ts` (`'no-content'` in
  `IngestNoteCode`, mirroring `'no-transcript'`), tests in `tests/core/ingest/url.test.ts`
  (consent-wall-shaped HTML fixture inline next to the existing ones, plus an SPA shell with an
  empty `<body>`). Acceptance: raw file and `.ingest.json` are written and carry the note, the
  outcome's text is empty, a truncated-but-substantial page and a rejected content type behave
  exactly as before.
- **D3 — The terminal state says which of the three happened.** `src/shared/types/knowledge.ts`
  (`IngestJob.notDigestedReason: IngestNoteCode | null`), `src/core/ingest/job.ts` (`createJob`
  default, `copyJob`), `src/core/ingest/queue.ts` (terminal branch sets it; `retry` clears it),
  plus tests in `tests/core/ingest/queue.test.ts`. **Reuse the field 051 introduced if the name
  differs — do not add a second one.** Acceptance: an empty-text outcome ends with reason
  `no-content`, a substantial outcome without a model ends with reason `null`, an unreachable
  host still ends in `error`; all existing queue tests green and unweakened.
- **D4 — The override exists on the real path.** `src/shared/ipc.ts` (`force?: boolean` on
  `ingest:start`; no new channel, no preload change), `src/main/ipc/ingest.ts` (`'ingest:start'`
  handler), `src/renderer/lib/mock-bridge.ts` if the request shape needs it, plus tests in
  `tests/main/ingest-ipc.test.ts` (mirror the existing duplicate test there). Acceptance: with
  `force`, a second start of the same URL produces a fresh job that writes a second dated raw
  file; the first raw file's bytes are byte-identical afterwards; without `force`, the duplicate
  behaviour is unchanged.
- **D5 — The duplicate row offers "ingest again", the no-content job explains itself.**
  `src/renderer/screens/sources/JobList.tsx` (button in the `duplicate` block, `no-content` in
  `NOTE_CODES`, own note block when `notDigestedReason === 'no-content'` — without the
  "set up a model" call to action), `src/renderer/screens/sources/SourcesTab.tsx` (handler →
  `start` with `force: true`), `src/renderer/i18n/de.ts` + `en.ts`
  (`sources.duplicate.again`, `sources.noContent.title`, `sources.noContent.body`,
  `ingest.note.no-content`). Gaston rules apply: existing `Button` atom, sentence case, tokens
  only, German `„…“`. Acceptance: `npm run shot` shows both states; no raw Tailwind palette class
  and no hardcoded string added.
- **D6 — Offline fetch seam plus the e2e that uses it.** `src/main/ipc/fetch-e2e-fixture.ts`
  (new; mirror `src/main/ipc/tasks-e2e-fixture.ts` for the env-var shape and the "off unless set"
  guard), `src/main/ipc/ingest.ts` (`environment()` picks it over `fetch`),
  `tests/main/fetch-fixture-seam.test.ts` (mirror `tests/main/fake-provider-seam.test.ts`:
  without the env var the seam is inert), `tests/e2e/fixtures/app.ts` (worker option +
  manifest writer, mirroring `fakeProvider`/`writeFakeProviderScript`),
  `tests/e2e/fixtures/pages/consent-wall.html` + `article.html`,
  `tests/e2e/url-no-content.spec.ts` (`test.use({ specId: 'url-no-content' })`). Acceptance:
  the spec passes against the built app, and the suite's `noNetworkCalls` guard stays green.

## Model Hints

- D3 → `deliverable-hard` — it rewrites the one branch in `queue.ts` that three S16 stories
  converge on, and getting the reason wrong silently re-enables digesting hollow pages while
  every existing queue test still passes.
- D1, D2, D4, D5, D6 → default.
- Review: → `story-review-hard` — the story spans core, IPC, renderer and the e2e harness, and
  its central risk (a `no-content` job that still reaches the condense step, or a `force` flag
  that overwrites the old raw source) is only visible when spec and diff are read together.

## Test Plan (manual acceptance)

### Acceptance tests

- AC1 → unit `tests/core/ingest/url.test.ts` › "the fetch sends a User-Agent" (D1)
- AC2 → unit `tests/core/ingest/url.test.ts` › "a consent wall yields no content" and
  `tests/core/ingest/queue.test.ts` › "an empty extraction ends with the reason no-content, not
  as no model configured" (D2/D3); user-visible half → e2e
  `tests/e2e/url-no-content.spec.ts` › "a page that yields nothing says so, not that a model is
  missing" (D6)
- AC3 → e2e `tests/e2e/url-no-content.spec.ts` › "ingest again writes a second raw source and
  leaves the first one alone" (D6), plus unit `tests/main/ingest-ipc.test.ts` › "force ingests
  again into a new dated raw source" (D4)
- AC4 → unit `tests/core/ingest/url.test.ts` › "a truncated but substantial page still digests"
  and "a PDF is still rejected by content type" (D2) — the existing content-type and truncation
  tests in that file stay unchanged and green
- AC5 → covered by the three test lines above; all fixtures are offline
  (`tests/core/ingest/fakes.ts`'s `fakeFetch` for unit, `SB_E2E_FETCH_FIXTURE` for e2e) and
  `tests/main/fetch-fixture-seam.test.ts` › "without the env var no fixture fetch is wired"
  proves the seam cannot leak into a real run (D6)

Coverage gate: AC1 → D1, AC2 → D2+D3+D6, AC3 → D4+D5+D6, AC4 → D2, AC5 → D2+D4+D6. No manual
residue.

## Done
