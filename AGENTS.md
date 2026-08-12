# Agent rules — Second Brain

Electron + React knowledge vault. Markdown files are the source of truth; the index is
derived and disposable. Full context: CLAUDE.md — read it only if this file is not enough.

Keep this file short. It is prepended to every run.

## Boundaries

- `src/core/` is plain TypeScript and must never import Electron.
- The renderer never touches the filesystem. Everything goes through the channels in
  `src/shared/ipc.ts`, called via `src/renderer/lib/api.ts`.
- `src/preload/` only forwards channels listed in `IPC_CHANNELS`.
- No write path may overwrite a file whose hash is stale — that returns `conflict`.

## UI — Gaston design system

- Use the `gs-*` atoms in `src/renderer/atoms/`. Never ad-hoc markup for something an
  atom already covers.
- Colors, spacing, radii **only** via tokens: `bg-[--gs-surface]`, not `bg-slate-800`.
  A raw Tailwind palette class is a bug.
- Dark-first. One teal accent (`#4FD1C5`) per screen, on the focal point only.
- Sentence case everywhere. No emoji. Tone is technical and calm: "Source captured.
  243 sections indexed." — not "Awesome!".
- No hardcoded user-facing strings. Every string goes through `t()` from
  `src/renderer/i18n/`, with the key added to both `de.ts` and `en.ts`.

## Product guardrails

- The app must work with no LLM configured — every LLM path needs an honest empty state.
- The AI proposes, the human confirms. Nothing is moved or rewritten silently.
- Answers cite vault files. No evidence means saying so, never guessing.
- Journal and project content never goes into logs, errors, or the repo.

## Code

- Comments, docs, and identifiers in English. Comments explain **why**.
- Soft limit ~300 lines per file. One file, one responsibility.
- Check for an existing helper before writing a new one.
- No `console.log` (`warn`/`error` are fine).
- No `any`, `@ts-expect-error`, or `eslint-disable` without a justification comment on
  the same line.
- Never delete, skip, or weaken a test to make it pass. Fix the code, or say why the
  test is wrong.
- Tests never hit the network or a real LLM. Fakes live in `tests/fakes/`.

## Done means

`npm run verify` is green (format:check, lint, typecheck, test, build).
Run it before reporting success. If it fails, fix it — do not report done.
