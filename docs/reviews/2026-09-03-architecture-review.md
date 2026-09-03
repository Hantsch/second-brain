# Solution architect review — 2026-09-03

An external, critical pass over the concept and the code, requested by the user. Method: the
four core documents (CONCEPT, ARCHITECTURE, VAULT-FORMAT, ROADMAP) read in full, plus four
independent code explorations (query/ask path, ingest/knowledge pipeline, capture/journal/
overview, architecture/quality). Every claim below carries a `path:line` reference from those
explorations. Improvement proposals are cut as stories 050–065 in [requirements/](../requirements/);
this document is the reasoning behind them.

## 1. Verdict on the concept

The concept is understood, coherent, and — unusually — actually enforced in code. The primary
idea (a UI-based, file-first second brain: dump anything in, query it on demand, three pillars —
personal notes + journal, projects with agent sessions, knowledge base from YouTube and
articles) holds together. The load-bearing decisions are right:

- **Files as truth, index derived.** The correct call for portability, external editing, and
  trust. The hash-guarded write and the trash/undo mechanism are genuinely implemented, not
  aspirational (`src/core/vault/compose.ts:24`, `src/core/vault/trash.ts`).
- **The honesty guardrails are real.** No invented health score, citations validated against
  retrieved files, "no model configured" as a tested success path (~20 dedicated tests), day
  close as a proposal that writes nothing. This is the app's identity and it survives contact
  with the code.
- **MiniSearch + LLM rerank instead of embeddings** is the right scope for this phase — the
  rerank exists (`src/core/wiki/rerank.ts:19`), the claim in CLAUDE.md is accurate.
- **The condensed layer** is the correct answer to "a second brain that is only filled rots."
  Two of three levels are built.

The concept needs no clarifying questions. What it needs is captured in three tensions:

1. **The "query" half is weaker than the "dump" half.** Capture, filing, and journal are
   polished through several correction rounds (M15 exists because the journal was really
   used). Ask/search has never had that round, and it shows: a scoped question silently
   searches the whole vault first (finding 3.3-1), long transcripts under-retrieve
   (3.3-2), and a search hit ejects the user into Notepad (3.6-1). Of the three questions
   the app must answer, "What do I know about X?" is currently the weakest.
2. **Ingest is where the no-hallucination guardrail leaks.** The answer path is strict, but
   the knowledge pipeline can write hollow source pages (no-transcript videos, consent-wall
   pages) and duplicate pages (non-idempotent retry) into the vault — and later answers will
   cite them. Guardrail 3 is enforced at the exit and not at the entrance (3.1).
3. **The vault grows monotonically; the index does not scale with it.** Every save re-walks,
   re-derives, and re-persists the entire vault on the main thread (3.2). For a journal +
   transcript vault this is the first thing that will make the app feel broken — before any
   feature gap does.

## 2. What is good and must not be traded away

Named explicitly so later work does not erode it:

- Zero core→Electron violations across 255 files, enforced by ESLint and by construction
  (`eslint.config.js:29`). Renderer has zero filesystem access across 300 files.
- The anti-placeholder IPC coverage test (`tests/main/ipc-coverage.test.ts:76`) — all 161
  channels implemented, none stubbed, none dead.
- Vault safety: atomic tmp+rename with Windows retry, sha256 conflict detection with 192
  adopting call sites, trash with a delete/snapshot distinction and traversal-safe tokens.
- Secrets handling: encrypted in userData, degrades honestly without a keyring, key IDs only
  in logs — no finding.
- Filing undo as a journalled transaction with reverse rollback that survives a restart
  (`src/core/capture/apply.ts:143`, `src/core/capture/undo.ts:48`).
- Claude session reading: head+tail windows, never whole files, honest `messageCountExact`,
  partial-line handling (`src/core/claude/jsonl.ts:131`).
- Test discipline: 251 test files, every screen covered, fake provider + no-model as first-class
  cases. Zero TODO/FIXME debt in 665 source files. No native modules, current dependency tree.

## 3. Findings

Ranked within each group. Story numbers refer to [requirements/](../requirements/).

### 3.1 Data integrity — the knowledge pillar's trust problem

1. **Digestion is neither atomic nor idempotent.** `markRawProtocol` runs last
   (`src/core/wiki/ingest.ts:238`); any throw after `createPage` leaves source page, entity
   pages, index, and log written while the protocol still says "undigested". A retry then
   creates a second source page via `freeSlug` (`src/core/wiki/pages.ts:239`). With
   concurrency 2, two sources digesting into the same module collide on `wiki/index.md`
   (conflict → the same partial state) and on `wiki/log.md` (appended without `expectedHash`
   → the loser's chronicle entry silently lost, `src/core/wiki/ingest.ts:217`). Quitting the
   app mid-digestion produces the same partial state — `close-guard.ts` only protects gardener
   runs. This is the most likely way a real vault silently rots. → **Story 050.**
2. **A video without a transcript gets a fake digestion.** The placeholder line
   `_Kein Transcript verfuegbar._` becomes `outcome.text`
   (`src/core/ingest/youtube/transcript.ts:198`), passes the empty-text guard
   (`src/core/ingest/queue.ts:276`), and the LLM condenses a placeholder into a hollow source
   page that later answers cite. The video's description and chapters are never passed to
   digestion. → **Story 051.**
3. **URL ingest cannot tell "the page had nothing" from "no model configured".** No
   User-Agent header is sent (`src/core/ingest/url.ts:134` — bot walls 403 or serve
   interstitials), a consent page converts to near-empty Markdown and is written as a
   legitimate source, and the empty-text job ends as `awaiting-llm` with a `null` message
   (`src/core/ingest/queue.ts:280`). There is also no "ingest anyway" escape hatch when the
   duplicate check blocks a changed page. → **Story 064.**
4. **Long transcripts lose their tail silently.** Chunk summaries are clamped at 12,000 chars
   before the merge call (`src/core/llm/prompts/summarize-source.ts:166`); a 2–3 h talk
   exceeds that and the truncation is invisible. The same run makes 10–18 sequential LLM
   calls with no progress reporting. → folded into **story 050** (visibility) and **053**
   (retrieval); the truncation honesty is 050's AC.

### 3.2 Scalability — the index hot path

1. **Every change costs the whole vault.** One changed file → full tree walk with a stat per
   file (`src/core/index/service.ts:172`), full re-derivation over all documents
   (`src/core/index/build.ts:134`), full re-serialization of every document body plus the
   MiniSearch state into `index.json` (`src/core/index/persist.ts:89`) — with a read of the
   old file first (`src/core/vault/fs-store.ts:97`). One keystroke-save in Obsidian costs a
   read + write of a file roughly the size of the whole vault text, on the main thread (no
   worker exists anywhere in `src/main`). Startup does this unconditionally on top of
   chokidar's own full scan (`src/core/index/service.ts:88`, `src/main/core-bridge.ts:40`).
   No document-size guard exists; each doc is resident twice (body + lowercased copy,
   `src/core/index/types.ts:31`). The only perf test is 5,000 × 200-byte docs without the
   persistence step. → **Story 054.**
2. **A sustained bulk change starves the watcher.** The 250 ms debounce is trailing-only with
   no maximum wait (`src/core/vault/watch.ts:76`): a OneDrive sync or slow `git checkout`
   producing events more often than every 250 ms means the flush never fires, the index stays
   stale for the duration, and the pending set grows unbounded. No `awaitWriteFinish`, so bulk
   copies can be read half-written. → **Story 055.**
3. **The loose-end derivation is the hottest recomputation in the app.** `findLooseEnds` does
   two stream parses per journal day plus ~13 regex passes per sentence plus an O(days) scan
   per candidate — and runs uncached from five call sites: `journal:get` (result then filtered
   to one day, `src/main/ipc/journal.ts:210`), `journal:interviewPlan`, `reminders()` (which
   itself runs for both `dashboard:data` and `reminders:list`), the gardener check, and the
   hourly notifier. A blanket query invalidation on every write amplifies it. Two roadmap gap
   notes (M6, M8) already flagged this; it is worse than the notes suggest. → **Story 056.**

### 3.3 Retrieval quality — the "what do I know about X" question

1. **A scoped ask searches the whole vault, then throws the scope away.** `scope` and
   `project` filters are applied after the top-24 candidate cut (`src/core/wiki/ask.ts:82`
   vs `:69`); in a grown vault a project-scoped question can return 0–2 excerpts — or an
   honest "nothing found" — while the relevant project files sit at rank 25+. This breaks the
   scoped-ask feature exactly when the vault is big enough to need it, silently. → **Story 052.**
2. **Long documents under-retrieve.** There is no chunking in the query path
   (`src/core/wiki/chunk.ts` is used only by condensation): a 40k-char YouTube transcript is
   one index document competing for one candidate slot with one ≤700-char excerpt window
   (`src/core/wiki/excerpts.ts:81`). The knowledge pillar's richest content is structurally
   disadvantaged in answers. Raw transcripts also index as `type: note` (no frontmatter), so
   they are indistinguishable from user notes. → **Story 053.**
3. **Citation verification covers paths and verbatim quotes only.** Paraphrase inside a
   correctly-cited paragraph is never checked, and quotes under 12 chars pass
   (`src/core/wiki/citations.ts:23`). Acceptable as a mechanism limit, but the guardrail's
   wording ("no hallucinations") is stronger than its enforcement — worth stating in
   CONCEPT.md rather than fixing. **No story; documentation note.**
4. **Follow-up questions retrieve on their raw words only** ("and what about the deadline?"),
   with no query rewriting from the thread (`src/core/wiki/ask.ts:180`). Real quality cost,
   medium effort. Folded into **story 052** as an optional AC; refine may split it out.
5. **The no-evidence marker is hardcoded German in the prompt**
   (`src/core/llm/prompts/query-answer.ts:33`) while the deterministic path is localised.
   → folded into **story 061.**

### 3.4 Security — the trust boundary between renderer and main

1. **`shell:openPath` passes absolute paths through unvalidated** (`src/main/ipc/shell.ts:13`).
   Combined with the fact that a rejected (hallucinated) citation path still renders as a
   clickable file button (`src/renderer/components/Markdown.tsx:83`), model-authored text
   becomes a one-click `shell.openPath` on an arbitrary absolute path. The `..` guard covers
   only the relative branch.
2. **`capture:apply` trusts the renderer's proposal object.** `normalize` checks shape only
   (`src/main/ipc/capture-proposal.ts:103`); the write goes to a renderer-chosen path and an
   unknown section name is honoured literally (`src/core/capture/sections.ts:76`). Traversal
   is blocked one layer down, so the blast radius is "any existing vault file" — an integrity
   hole, not an escape, but it undoes the exemplary `verifyTarget` on the model side.
3. **`will-navigate` allows any `file://` URL** (`src/main/window.ts:125`).

All three are one theme — main re-validating what the renderer sends — and cut as **story 057.**
No runtime payload validation library exists (acknowledged at `src/main/ipc/registry.ts:42`);
that is a defensible choice given `assertSafeVaultPath`, and is not a story.

### 3.5 The background half — the app is strictly foreground

**There is no tray, and the app quits when the window closes** (`src/main/index.ts:89`,
`:122`). Consequences: the global quick-capture hotkey — the concept's principle 1, "dumping
costs nothing, even when the app isn't in the foreground" — only works while the main window
is open; the hourly reminder notifier dies with the window, so a deadline that falls due
overnight is announced whenever the app next opens; M13's close-during-run door has no live
path (already noted in the roadmap). Aggravating: `startMinimized: true` hides the window with
no tray and no `show()` in the second-instance handler — a soft-locked, invisible app
(`src/main/window.ts:65`, `src/main/index.ts:93`). And `docs/ARCHITECTURE.md:16` claims a tray
exists — documentation drift. → **Story 058.**

### 3.6 Product gaps per pillar

1. **Search cannot be read in the app.** No search screen; Ctrl+K shows at most 6 hits and a
   non-area hit opens the OS default editor (`src/renderer/components/CommandPalette.tsx:120`
   — the comment says it: "as long as the app doesn't have its own reading view"). Snippets
   are computed but not rendered; scope/type filters exist in the engine but are not exposed.
   For a knowledge app, ejecting the user into Notepad to read their own note is the single
   most visible product gap. → **Story 059.**
2. **PDF is not read at all** (`src/core/ingest/file.ts:48` — copied with `pdf-not-read`).
   For an "articles" knowledge base this excludes the second most common article format; the
   file lands in `raw/` as a permanently undigestable source. → **Story 060.**
3. **The heuristic floor is German-only in a two-language app.** Mood/task/scope lexicons,
   infinitive morphology, relative dates, and loose-end phrasing are all German
   (`src/core/capture/lexicon.ts`, `src/core/capture/dates.ts:123`,
   `src/core/journal/loose-ends.ts:25`); an English vault gets near-zero heuristic filing with
   German reason strings. One aggressive misfire on top: any URL-bearing dump files into the
   single existing module without a mention (`src/core/capture/mentions.ts:130`). → **Story 061.**
4. **Codex work is invisible to "what did I last work on".** Readers, browser, and linking
   exist for both CLIs, but `applyExternalTouches` is only reached from `claudeSessions()`
   (`src/main/ipc/overview-deps.ts:188`); `dashboardData`/`recentWork` are Claude-typed. A
   project worked on via Codex counts as stale and never appears in recent work — the
   dashboard actively misreports. → **Story 062.**
5. **Module lifecycle is create-only.** No rename, delete, or merge exists
   (`src/shared/ipc.ts:639`); a mis-named module must be fixed in the file system, where the
   slug is embedded in page frontmatter, `AGENTS.md`, `.ingest.json`, and wikilink targets.
   → **Story 063.**
6. **Smaller, noted without stories:** dashboard tiles truncate silently (12 recent / 10
   todos / 20 sessions, no "+N more" — `src/core/overview/types.ts:44`), which contradicts
   the honesty pattern used elsewhere; done todos have data (`@done:`) but no "what did I
   finish" view; recurring todos don't exist as a concept (relevant when the medication
   tracker ripens); `event:reminder` is declared and subscribed but never emitted
   (`src/shared/ipc.ts:1440`); 9 dead exports incl. the known `applyFiling` pair plus
   `fetchOpenRouterPrices` (an unused network call); `src/shared/ipc.ts` at 1500 lines is 5×
   the soft limit (~890 lines are interface declarations that belong in `src/shared/types/`).

### 3.7 Process

1. **The acceptance backlog is the number-one project risk, ahead of any code finding.**
   Eight milestones (M4, M6, M9, M10, M11, M12, M13, M14) are "built, acceptance pending".
   These include write paths into the real vault (finding resolution, loose ends, condensation
   accept/delete) exercised only by fake-provider tests and demo-vault smoke runs. Every
   further feature sprint adds surface on top of unwalked writes. Recommendation: before the
   condensed module level or M15 part two, spend one session walking the pending test plans —
   the roadmap already says this; this review seconds it with emphasis. **Not a story; a
   scheduling decision.**
2. **No CI.** 251 test files, a strict verify pipeline, an anti-placeholder coverage test —
   and nothing runs any of it on push. A red commit lands silently. → **Story 065.**
3. **The renderer is only ever tested against `mock-bridge.ts`** (780 lines mirroring 161
   channels). Compile-time typing guarantees presence, not semantics; screens can pass green
   against a mock that drifted from the real handler. The Playwright scripts exist but sit
   outside `verify`. Noted; a thin e2e smoke lane could ride along with story 065.

## 4. Story map

| Priority     | Story                                                                           | One line                                                             |
| ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| P0 — trust   | [050](../requirements/050-a-digestion-completes-whole-or-leaves-no-trace.md)    | Digestion becomes atomic and idempotent; truncation becomes visible  |
| P0 — trust   | [051](../requirements/051-a-video-without-a-transcript-is-an-honest-failure.md) | No hollow source pages from transcript-less videos                   |
| P0 — trust   | [057](../requirements/057-main-revalidates-what-the-renderer-sends.md)          | shell/openPath, capture:apply, file:// — main re-checks the renderer |
| P1 — scale   | [054](../requirements/054-saving-one-file-costs-one-file.md)                    | Index refresh, persist, and startup scale with the change            |
| P1 — scale   | [055](../requirements/055-a-bulk-change-reaches-the-index.md)                   | Watcher survives sync storms                                         |
| P1 — scale   | [056](../requirements/056-loose-ends-are-derived-once-per-index.md)             | One loose-end pass per index generation, not five per screen         |
| P1 — query   | [052](../requirements/052-a-scoped-question-searches-its-scope.md)              | Scope/project filters move into retrieval                            |
| P1 — query   | [053](../requirements/053-long-sources-answer-by-passage-not-by-file.md)        | Chunk-level retrieval; raw sources get a type                        |
| P1 — query   | [059](../requirements/059-a-search-hit-opens-in-the-app.md)                     | Reading view + real results list                                     |
| P1 — reach   | [058](../requirements/058-gaston-stays-reachable-from-the-tray.md)              | Tray; hotkey and reminders outlive the window                        |
| P2 — pillar  | [060](../requirements/060-a-pdf-becomes-a-readable-source.md)                   | PDF text extraction                                                  |
| P2 — pillar  | [061](../requirements/061-the-heuristic-floor-speaks-the-document-language.md)  | English heuristics parity; localized reasons                         |
| P2 — pillar  | [062](../requirements/062-codex-work-counts-as-work.md)                         | Codex sessions reach dashboard and staleness                         |
| P2 — pillar  | [063](../requirements/063-a-module-can-be-renamed-and-deleted.md)               | Module lifecycle beyond create                                       |
| P2 — pillar  | [064](../requirements/064-a-fetched-page-that-yields-nothing-says-so.md)        | URL ingest honesty + escape hatch                                    |
| P2 — process | [065](../requirements/065-the-gate-runs-on-every-push.md)                       | CI for the existing verify pipeline                                  |

## 5. Deliberately not cut as stories

- **Vault history/backup beyond per-action trash.** Condensation deletes by design; the trash
  is the only net, per action. The file-first answer ("git or copy the folder yourself") is
  legitimate, but the app never says it. Recommendation: a concept round on whether Gaston
  documents a backup recipe or offers an optional snapshot — a product decision, not a story.
- **Mobile/phone capture.** Out of scope by CONCEPT.md, and rightly so. The cheap bridge is
  the already-agreed "data import merges into an existing day" open item: a watched import
  folder would let a synced phone note become a dump. Name the source first, as the roadmap
  says.
- **Embeddings/vector search.** Still the right thing to defer. Stories 052/053 (retrieval
  scoping + chunking) are the cheaper 80% and should come first; if quality is still short
  after them, that is the concrete requirement CLAUDE.md asks for.
- **Paraphrase-level citation checking** (3.3-3): a research problem, not a story. State the
  mechanism's limit in CONCEPT.md instead.
- **The acceptance backlog** (3.7-1): a scheduling decision the user has already framed in the
  roadmap; a story would just duplicate it.
