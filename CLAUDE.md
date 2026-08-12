# Second Brain

An Electron app that offloads the real brain. The user dumps thoughts into it — ideas,
work states, worries, sources — and the app files them, organizes them, and makes them
findable again. It's a knowledge base, a journal, and a worklog in one.

It must be able to answer three questions at any time:

- "What did I last work on, and where did I leave off?"
- "What do I still need to do, by when, and who am I waiting on?"
- "What do I know about X?" — backed by my own notes, not guessed.

## The files are the truth

The vault is a folder of Markdown files plus YAML frontmatter (format:
[docs/VAULT-FORMAT.md](docs/VAULT-FORMAT.md)). From that follows:

- **The index is derived.** `.secondbrain/index/` can be deleted at any time and rebuilt
  from the files. If it's lost, nothing is lost.
- **The user may edit the files directly** — in Obsidian, VS Code, Notepad. External
  changes are detected via hash and re-read. No write path silently overwrites the
  user's edits; writing with a stale hash gets a `conflict`.
- **Everything stays portable.** The vault can live on a USB stick or an external drive
  and works there fully. No database, no Docker, no server.
- **Keys never travel with it.** API keys live encrypted in `userData` (Electron
  `safeStorage`), never in the vault, never in the repo, never in logs.

## Tech stack

| Area     | Choice                                                                                 |
| -------- | --------------------------------------------------------------------------------------- |
| Shell    | Electron 41, electron-vite, TypeScript strict                                          |
| Renderer | React 19, react-router, TanStack Query, Tailwind 4 + Gaston Design System              |
| Core     | Plain TypeScript in `src/core/` — knows nothing about Electron                         |
| Search   | MiniSearch over an index built from the files (no native module)                       |
| LLM      | Own gateway: Anthropic + OpenAI-compatible (Ollama, LM Studio, OpenRouter, OpenAI)     |
| Tests    | Vitest (core + renderer), Playwright `_electron` for screenshots                       |

No Postgres, no embeddings, no native module. Full-text search plus LLM rerank is
enough; vector search only arrives once a concrete requirement needs it.

## Non-negotiable guardrails

1. **The app starts and is useful without an LLM.** Every LLM task has an honest
   "no model configured" state and, where possible, a heuristic fallback. Never a
   dead screen, never a silent failure.
2. **The AI proposes, the human confirms.** Filing suggestions, extracted todos,
   status changes, and wiki edits are proposals with visible reasoning until the
   user accepts them. Nothing gets moved or rewritten silently.
3. **No hallucinations.** Answers to questions come exclusively from the vault, with
   citation and file path. If there's no evidence, the app says so — it doesn't guess.
4. **Interface first.** `LlmGateway`, `VaultStore`, `SourceIngestor`, and `SessionReader`
   are interfaces. Concrete implementations are swappable; no code outside those
   modules knows which one is running.
5. **`src/core/` never imports Electron** (enforced via ESLint). The renderer never
   touches the filesystem — everything goes through the channels in
   [src/shared/ipc.ts](src/shared/ipc.ts).
6. **Privacy is substance.** Journal and project content never belongs in the repo,
   in logs, in error messages, or in a request it isn't meant for. Sensitive tasks
   (`journal-chat`, `classify-dump`) recommend local models.
7. **Two languages, separately configurable.** UI language and document language are
   independent (`languages.ui`, `languages.documents`). No German string hardcoded
   in the renderer — everything goes through `t()` from `src/renderer/i18n/`.

## Directories

```
src/
├─ core/        plain TypeScript, no Electron — this is where the logic lives
│  ├─ vault/      paths, layout, frontmatter, atomic writes, watcher
│  ├─ index/      index build, search, todo/project derivation
│  ├─ llm/        gateway, providers, task routing, prompts
│  ├─ capture/    dump → proposal → filing
│  ├─ wiki/       Karpathy wiki: ingest, page maintenance, lint
│  ├─ ingest/     YouTube, files, URLs → raw/
│  ├─ journal/    daily entries, coaching modes
│  ├─ overview/   projects, todos, reminders, recent work
│  ├─ gardener/   maintenance against knowledge rot
│  └─ claude/     Claude Code sessions from ~/.claude/projects
├─ main/        Electron: windows, tray, hotkey, IPC handlers, secrets, settings
├─ preload/     the only bridge; lets through only channels from IPC_CHANNELS
├─ renderer/    React; pure view
│  ├─ atoms/      Gaston atoms (gs-* wrappers) — never ad-hoc markup
│  ├─ components/ composed building blocks
│  ├─ screens/    one folder per screen
│  ├─ i18n/       de.ts / en.ts, flat keys
│  └─ lib/        api.ts (typed IPC client), hooks, formatting
└─ shared/      types and the IPC contract — used by both sides
```

In addition: `docs/` (concept, architecture, vault format), `scripts/` (seed,
screenshots, launcher), `tests/` (Vitest, fixtures).

## Design system: Gaston

Mandatory for all frontend work. Vendored under
[src/renderer/styles/gaston/](src/renderer/styles/gaston/) (tokens + `components.css`)
and [src/renderer/atoms/](src/renderer/atoms/) (the `gs-*` wrappers).

- Dark-first: ink surfaces (`#0A0F16` page), fog text, **one** teal accent (`#4FD1C5`)
  that belongs to the focal point. Not two accents on one screen.
- Type: IBM Plex Sans for UI, IBM Plex Mono for data (numbers, IDs, timestamps, overlines).
- **Sentence case everywhere. No emoji.**
- Colors, spacing, radii **only** via tokens — no raw Tailwind palette
  (`bg-slate-800` is a bug, `bg-[--gs-surface]` or the `gs-*` class is correct).
- Tone: technical, precise, calm. Statements over enthusiasm ("Source captured. 243
  sections indexed." instead of "Awesome! 🎉").

Read `src/renderer/styles/gaston/README.md` before any new screen or component.

## Quality gates

`npm run verify` must be green before any work counts as done:

```
npm run format:check   # prettier
npm run lint           # eslint
npm run typecheck      # tsc for the Node side and the renderer
npm test               # vitest
npm run build          # electron-vite build
```

Plus, for every UI change:

```
npm run seed           # builds .demo-vault/ with realistic sample content
npm run shot           # starts the app via Playwright and drops PNGs in .screenshots/
```

Mandatory tests:

- **File round-trip**: write → edit externally → re-read, without data loss.
- **Conflict**: writing with a stale hash fails instead of overwriting.
- **Without LLM**: every LLM path has a test with the fake provider _and_ one with
  "no model configured".
- **Answers without evidence**: the answer honestly says nothing was found.
- Tests **never** call real LLM APIs or the network. Fakes live in `tests/fakes/`.

## QA rules (non-negotiable)

- Never delete, skip, or weaken tests to make them pass. If a test fails: fix the
  code, or explain why the test is wrong.
- No `// @ts-expect-error`, `eslint-disable`, or `any` without a justifying comment
  on the same line.
- No `console.log` in production code (`no-console` is on; `warn`/`error` are allowed).

## Code quality

- **Soft limit of ~300 lines per file.** Above that, check whether the file has more
  than one responsibility, and split it.
- One file, one responsibility. No god modules.
- Reuse instead of copying. Before writing a new helper, check whether one already
  exists.
- Readability beats cleverness. Comments explain **why**, not what.
- Comments, documentation, and code identifiers are all in English.

## Provenance

Neighbor repos this project deliberately draws from:

- `../ai-diary` — Gaston atoms, LLM gateway setup, dialog ideas, frontmatter thinking
- `../ai-assisted-knowledge-tool` — chat UI, citations, ingest pipeline
- `../godot-RAG` — the Karpathy wiki schema (`AGENTS.md`) for the knowledge modules
- `../yougrab` — YouTube pipeline (yt-dlp + fallback provider, transcript preparation)
- `../claude-control` — reading Claude Code sessions from `~/.claude/projects`
