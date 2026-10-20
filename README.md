# Gaston

An Electron app that offloads the real brain. Thoughts, work states, worries, and
sources get dumped in; the app files them, organizes them, and makes them findable
again — a knowledge base, a journal, and a worklog in one.

It must be able to answer three questions at any time:

- "What did I last work on, and where did I leave off?"
- "What do I still need to do, by when, and who am I waiting on?"
- "What do I know about X?" — backed by my own notes, not guessed.

Local, portable, no server. Language models are optional: without one, the app stays
usable, and every LLM task has an honest "no model configured" state.

## The vault

A **vault** is an ordinary folder of Markdown files plus YAML frontmatter — editable
in Obsidian or VS Code, versionable with Git, copyable to a USB stick. The files are
the truth; everything else is derived from them:

```
<vault>/
  inbox/          dumps, not yet filed
  journal/        one day = one file
  projects/       work/<slug>/project.md · private/<slug>/project.md
  areas/          ongoing responsibilities with no end
  modules/        knowledge modules, each a small wiki
  raw/            immutable sources (YouTube, files, web pages)
  .secondbrain/   markers, settings, search index — safe to delete
```

A folder is a vault exactly when `.secondbrain/vault.json` exists. The search index
under `.secondbrain/index/` is loaded on open and updated incrementally; if it's
lost, it's rebuilt from the files. A watcher detects external changes, and no write
ever silently overwrites the user's edits — writing with a stale hash gets a
`conflict`. API keys live encrypted in `userData`, never in the vault.

The binding file format is documented in [docs/VAULT-FORMAT.md](docs/VAULT-FORMAT.md).

## npm scripts

| Script                 | What it does                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start Electron with hot reload                                                                                               |
| `npm run build`        | Type-check and `electron-vite build` into `out/`                                                                             |
| `npm run package`      | Portable Windows EXE into `dist/gaston-<version>-portable.exe`                                                               |
| `npm run handoff`      | Verify, package, and zip a handoff build for someone else                                                                    |
| `npm test`             | Vitest (core, main, renderer)                                                                                                |
| `npm run typecheck`    | `tsc` for the Node side and the renderer                                                                                     |
| `npm run lint`         | ESLint over the whole repo                                                                                                   |
| `npm run format:check` | Check Prettier (`npm run format` writes; line endings are normalized to LF via `.gitattributes`, so this is green on any OS) |
| `npm run verify`       | format:check → lint → typecheck → test → build. Must be green.                                                               |
| `npm run seed`         | Build `.demo-vault/` with realistic sample content                                                                           |
| `npm run verify:ui`    | build → one pass over every screen: PNG and axe-core from the same visit, for any UI work                                    |
| `npm run shot`         | The same pass, screenshots only (PNGs into `.screenshots/`)                                                                  |
| `npm run a11y`         | The same pass, axe-core only (`.screenshots/a11y.json`)                                                                      |
| `npm run test:e2e`     | Flow-level acceptance suite (Playwright) against a disposable, no-model vault                                                |
| `npm run release`      | Run the release flow; `-- --dry-run` does everything except publish (see Releases)                                           |

All three run `scripts/verify.mjs` against the built app. `shot` and `a11y` need
`npm run build` first. Each run rewrites `.demo-vault/` before it starts, so no run
inherits what the previous one wrote. They never touch the real installation: the
vault comes in via `SB_VAULT`, settings live in their own `--user-data-dir`, and
the window stays off the desktop and out of the keyboard focus (set
`SB_UI_VISIBLE=1` to watch). `SB_DEMO=1` marks the run as demo mode. Exit codes:
`0` clean, `1` the harness or the app failed, `2` axe found `serious`/`critical`
or a hit area falls short of `--sb-hit`.

## Continuous integration

Two workflows run in GitHub Actions:

- `verify.yml` — the required gate. Runs `npm run verify` (format check, lint,
  typecheck, test, build) on a Windows runner, on every push and pull request.
- `ui-smoke.yml` — advisory only (`continue-on-error`), on pull requests and pushes
  to `dev`/`main`. Runs seed → build → shot and uploads the screenshots as an
  artifact.

`verify.yml`'s status is the actual required gate; `ui-smoke.yml` never blocks
anything. `npm run test:e2e` is intentionally not part of CI yet — it's a separate,
longer-running suite that drives a real Electron window; wiring it in is future
work once `ui-smoke.yml` has proven that Electron booting on a hosted Windows
runner is stable.

## Handing it on

`npm run handoff` runs the quality gate, packages the app, and writes a single
`dist/gaston-<version>-windows.zip`. Unpacked, it contains exactly two files: the
portable `gaston-<version>-portable.exe` and a `README.txt` for the recipient —
nothing of the sender's, checked twice against a list of forbidden patterns
(`.env`, `.secondbrain`, a real vault, `node_modules`, and the like). Re-running the
command replaces the previous ZIP instead of piling up.

What it deliberately doesn't cover: the `.exe` is unsigned, so Windows SmartScreen
will warn on first start (`README.txt` says how to proceed); there's no
auto-update — a new version is a new ZIP; only Windows x64 is built; settings and
keys stay on the recipient's machine rather than travelling with the app; and the
ZIP ships no starter vault — the recipient creates or opens their own on first
start.

## Releases

Write your line under `## Unreleased` in `CHANGELOG.md` together with the change. A push
to `main` releases from that file. The version is derived from the categories: `Removed` or a
**BREAKING** bullet is a major, `Added` or `Changed` a minor, anything else a patch. A release
with an empty Unreleased refuses to run.

`npm run release -- --dry-run` runs everything locally except publishing. Real releases only
run in CI.

## Status

**All ten screens in the rail are built, and every channel in `IPC_CHANNELS` is
really implemented.** There's no more placeholder area, no "not built yet" card,
and no setting in the settings screen that nobody reads — a test over
`IPC_CHANNELS` tolerates no handler that only throws a rejection.

- **Done and real:** Vault (paths, layout, frontmatter, atomic writes with conflict
  detection, trash with undo, watcher), index (build, incremental catch-up,
  MiniSearch with snippets, todo and project derivation), LLM gateway (per-task
  routing, Anthropic and OpenAI-compatible, retry, abort, fake provider), filing
  (dump → proposal → filing with undo), knowledge modules (ingest, pages, graph,
  questions with verified evidence), source ingestion (YouTube, file, URL, text),
  projects and todos (create, edit, check off, resolve waiting-on, suggest status),
  overview (dashboard with movable modules, reminders with quiet periods,
  Claude Code sessions as a work trace), **journal and coaching** (daily entry as
  an editor with a frozen hash, three coach stances, conversation as a blockquote
  in the daily entry, mood, day close with confirmation and undo), **maintenance
  against rot** (nine checks over the index, a health score with an honest
  "unknown", fixes with a verbatim preview and undo path, contradictions only with
  a model), app shell (frameless window, rail with ten screens, command palette,
  quick-capture window, onboarding, settings, key storage).
- **Wired IPC areas:** `vault:*`, `index:*`, `search:*`, `capture:*`,
  `projects:*`, `todos:*`, `journal:*`, `modules:*`, `chat:*`, `ingest:*`, `llm:*`,
  `dashboard:*`, `reminders:*`, `gardener:*`, `claude:*`, `settings:*`, `window:*`,
  `shell:*`, `app:info`.
- **What needs a model:** contradictions, near-duplicates, and terms without a page
  in maintenance; prose answers with citations when asking questions; the coaching
  reply. Everything else runs deterministically, and where a model is missing, the
  screen says so right at that spot — instead of showing an empty area.

### Claude Code sessions

If a Claude Code session lives in a directory listed under a project's `repos`, it
counts as a work trace: it shows up under "last worked on," keeps `lastTouch`
fresh, and keeps the project from going stale. Only the head and tail of each
history file are read, strictly read-only, without touching the mtime. Can be
turned off under Settings → Behavior; the location is configurable there
(`overview.claudeProjectsDir`). The demo vault ships its **own** history store —
the verification runs never read the real `~/.claude`.

Concept, architecture, and format: [docs/](docs/README.md). The rules for working
on the code live in [CLAUDE.md](CLAUDE.md).
