/**
 * Deterministic input selection for condensing a project (story 044, D6).
 *
 * `condenseProject()` must not let a model decide what it may read, so this
 * module picks the inputs itself. Four groups, each with its own stated bound:
 *
 * 1. **The project's own text** — `project.md`'s state section (`stateSection()`,
 *    shared with the status suggestion) plus **every** note under
 *    `projects/<scope>/<slug>/notes/`, read **verbatim**: the whole file body,
 *    never an excerpt. Bound: none. Reading an excerpt while `sources:` claims
 *    the file is exactly the gap story 037 had to fix afterwards (D16).
 * 2. **Todos and `waiting_on`, open *and* closed/resolved**, with their dates.
 *    Bound: none — the artifact is a re-entry briefing, so what got done and
 *    what stopped waiting are part of the state (D17). `openTodosOf()` and
 *    `openWaiting()` next door are therefore the wrong helpers here.
 * 3. **Journal days mentioning the project**, in full text, bounded to the last
 *    `CONDENSE_DAY_WINDOW_DAYS` (90) days from `now` — the area selector's
 *    constant, not a second number. The match is `projectMentionTest()`, the
 *    very predicate `mentions()` uses, but without its 3-entry/400-character
 *    preview clamp: that clamp serves the status suggestion and would silently
 *    under-read here (D15).
 * 4. **The linked agent sessions**, bounded to the `CONDENSE_SESSION_LIMIT` (3)
 *    most recently active ones, each transcript tail clamped to
 *    `CONDENSE_SESSION_TAIL_CHARS` characters (D14).
 *
 * Everything a bound cuts away is **excluded from the result and counted** in
 * `CondenseProjectTruncationReport`, so the run can state it (AC 5). A bound
 * that dropped material silently would leave `sources:` claiming inputs the run
 * never saw. `now` is injectable — never `Date.now()` directly — so the window
 * is testable without mocking global time.
 *
 * No model and no gateway anywhere in this file, and no file opened either: the
 * vault side is selection over already-indexed data, and the one input that
 * lives outside the vault — a session transcript — arrives through the injected
 * `readTranscriptTail` reader.
 */

import type { ClaudeSession, JournalDay, Project, Todo, WaitingOn } from '@shared/types';
import { isPathInside, pathKey } from '@core/claude/paths';
import { ageInDays } from '@core/index/dates';
import { toJournalDay } from '@core/index/journal';
import type { IndexedDoc } from '@core/index/types';
import { projectMentionTest, stateSection } from '@core/overview/status';
import { dirName } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { agentRef } from './agent-ref';
import { CONDENSE_DAY_WINDOW_DAYS } from './inputs';
import type { CondenseInput, CondenseInputsOptions } from './inputs';

/**
 * How many linked sessions a run reads, most recently active first. Mirrors
 * `MAX_CONTEXT_ENTRIES` in `@core/overview/status` — the status suggestion
 * already settled that three work traces are what a re-entry needs (D14).
 */
export const CONDENSE_SESSION_LIMIT = 3;

/**
 * How much of one session's transcript tail a run reads, in characters.
 *
 * `condense-project` has an input budget of 8000 tokens (story 044, Q3) —
 * roughly 24000-32000 characters for *everything*: the prompt, the project's own
 * text, its notes, todos, waiting-on entries and up to 90 days of journal.
 * `CONDENSE_SESSION_LIMIT * CONDENSE_SESSION_TAIL_CHARS` = 6000 characters is
 * about a quarter of that, leaving the vault inputs — what the artifact is
 * actually about — the majority.
 *
 * Deliberately **not** `TRANSCRIPT_PAGE_BYTES` (128 KiB): one such page is on
 * the order of 40000 tokens, so a single session would blow the budget five
 * times over. The transcript view can afford that page because it renders it; a
 * prompt cannot.
 *
 * The clamp keeps the **end** of the tail — in a transcript the last turns are
 * the ones that say where the work stopped.
 */
export const CONDENSE_SESSION_TAIL_CHARS = 2000;

/** One note under `projects/<scope>/<slug>/notes/`, read whole. */
export interface CondenseProjectNote {
  path: string;
  title: string;
  /** mtime of the file, ISO — the only date a note reliably carries. */
  updated: string;
  /** The note's **full** body, character for character. Never an excerpt. */
  text: string;
}

/** One journal day mentioning the project, read whole. */
export interface CondenseProjectMention {
  path: string;
  date: string;
  /** The day entry's **full** body. Not `JournalDay.excerpt` (D15). */
  text: string;
}

/** One linked agent session a run read. */
export interface CondenseProjectSession {
  /** `agent:claude/<pathKey>` of the session's agent project (D12, D13). */
  ref: string;
  id: string;
  /** `ClaudeSession.lastActivity`, ISO. */
  at: string;
  branch: string | null;
  /** The session's own summary, else its first prompt — as `traces()` uses it. */
  text: string;
  /** Tail of the transcript, clamped to `CONDENSE_SESSION_TAIL_CHARS`. */
  tail: string;
  /** Characters the clamp dropped from this session's tail. */
  droppedChars: number;
}

/**
 * What each bound left out. Days that never mention the project and sessions of
 * other projects are **not** truncation — they were never candidates, the same
 * way `daysOfArea()` simply never returns them. Only material that was a
 * candidate and got cut by a bound is counted here. `null` when nothing was.
 */
export interface CondenseProjectTruncationReport {
  /** Day entries dropped for being older than `CONDENSE_DAY_WINDOW_DAYS`. */
  days: number;
  /** Linked sessions dropped beyond `CONDENSE_SESSION_LIMIT`. */
  sessions: number;
  /** Sessions whose transcript tail hit the clamp, so was read in part. */
  clampedSessions: number;
  /** Characters the clamp dropped across all read sessions. */
  transcriptChars: number;
  /**
   * Inputs not read in full: dropped days plus dropped sessions plus clamped
   * sessions. Same meaning as `CondenseTruncationReport.count`, so the run's
   * truncation notice can be written from either report.
   */
  count: number;
  reason: string;
}

/** The vault-side sources of a project's condensation. */
export interface CondenseProjectVaultSources {
  /**
   * The project as the index derived it. Taken whole rather than re-parsed
   * because `deriveProjects()` already validated `waiting_on` entry by entry —
   * a second parser over the same frontmatter would be a second truth.
   */
  project: Project;
  docs: readonly IndexedDoc[];
  /** The index's todos. Filtered to this project's folder here. */
  todos: readonly Todo[];
}

export interface CondenseProjectSources extends CondenseProjectVaultSources {
  /** Sessions with `vaultProject` already filled in (`linkSessions`). */
  sessions?: readonly ClaudeSession[];
  /**
   * Reads the tail of one session's transcript. Injected, so this module opens
   * no file. Contract, mirroring `readTranscriptPage()`: an empty, unreadable or
   * missing session file yields `''` rather than an error.
   */
  readTranscriptTail?: (session: ClaudeSession) => Promise<string>;
}

/** The four deterministic input groups of one project's condensation run. */
export interface CondenseProjectInputSelection {
  scope: string;
  slug: string;
  title: string;
  /** `project.md`'s state section, or its whole body when it has none. */
  state: string;
  /** Every note under `notes/`, path-ascending, read verbatim. */
  notes: CondenseProjectNote[];
  /** All todos of the project folder, open and done, path then line. */
  todos: Todo[];
  /** All `waiting_on` entries, resolved and unresolved, in file order. */
  waitingOn: WaitingOn[];
  /** Journal days mentioning the project, within the window, oldest first. */
  days: CondenseProjectMention[];
  /** At most `CONDENSE_SESSION_LIMIT` sessions, most recently active first. */
  sessions: CondenseProjectSession[];
  /**
   * One `agent:claude/<pathKey>` per **distinct agent project** the run read,
   * in the order the sessions were read — not one per session (D12).
   */
  agentRefs: string[];
  truncated: CondenseProjectTruncationReport | null;
}

/** `projects/<scope>/<slug>` — the folder everything of this project lives in. */
function folderOf(project: Project): string {
  return dirName(project.path);
}

/**
 * Documents of the project folder, by kind. A `condensed` document is skipped
 * everywhere: the artifact is this run's own output, and reading it back in
 * would let a run feed on what a previous run wrote — todos included, since the
 * indexer parses checkboxes out of every document it sees.
 */
function notesOf(sources: CondenseProjectVaultSources): CondenseProjectNote[] {
  const prefix = `${folderOf(sources.project)}/notes/`;
  return sources.docs
    .filter((doc) => doc.path.startsWith(prefix) && doc.docType !== 'condensed')
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((doc) => ({
      path: doc.path,
      title: doc.title,
      updated: doc.updated,
      text: doc.body,
    }));
}

/**
 * Todos of the project folder — **open and done**, with whatever dates they
 * carry (`due`, `neededBy`, `createdAt`, `doneAt`).
 *
 * Selected by path rather than by `Todo.project`, which is only the folder's
 * slug segment: two projects in different scopes could carry the same slug, and
 * a briefing that mixed them up would be worse than one that is empty.
 */
function todosOf(sources: CondenseProjectVaultSources): Todo[] {
  const folder = folderOf(sources.project);
  const condensed = new Set(
    sources.docs.filter((doc) => doc.docType === 'condensed').map((doc) => doc.path),
  );
  return sources.todos
    .filter(
      (todo) =>
        (todo.path === sources.project.path || todo.path.startsWith(`${folder}/`)) &&
        !condensed.has(todo.path),
    )
    .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/** Journal days mentioning the project, oldest first, plus what the window cut. */
function mentionedDays(
  sources: CondenseProjectVaultSources,
  now: DateLike,
): { kept: CondenseProjectMention[]; dropped: number } {
  const isMention = projectMentionTest(sources.project);
  const candidates: { day: JournalDay; text: string }[] = [];
  for (const doc of sources.docs) {
    if (!isMention(doc)) continue;
    candidates.push({ day: toJournalDay(doc), text: doc.body });
  }
  candidates.sort((a, b) =>
    a.day.date === b.day.date
      ? a.day.path.localeCompare(b.day.path)
      : a.day.date < b.day.date
        ? -1
        : 1,
  );

  const kept: CondenseProjectMention[] = [];
  let dropped = 0;
  for (const { day, text } of candidates) {
    if (ageInDays(day.date, now) > CONDENSE_DAY_WINDOW_DAYS) dropped += 1;
    else kept.push({ path: day.path, date: day.date, text });
  }
  return { kept, dropped };
}

/**
 * Does this session actually belong to *this* project, not just to a project
 * with the same slug in a different scope?
 *
 * `ClaudeSession.vaultProject` (set by `link.ts`) carries only the slug, so two
 * projects sharing a slug across scopes (`projects/private/nyota`,
 * `projects/work/nyota`) cannot be told apart from the slug alone — unlike
 * `todosOf()` above, which matches by folder path. When the project names
 * `repos` (the same field `link.ts`'s own `repoMatch` uses to link a session in
 * the first place), a session only counts here if its `cwd` actually lies under
 * one of them. A project with no `repos` configured keeps the slug-only match:
 * `link.ts` itself falls back to the same fuzzy name match in that case, so
 * this selector cannot be more precise than the link it is reading.
 */
function belongsToProject(session: ClaudeSession, project: Project): boolean {
  if (session.vaultProject !== project.slug) return false;
  if (project.repos.length === 0) return true;
  const key = pathKey(session.cwd);
  return project.repos.some(
    (repo) => repo.trim().length > 0 && (pathKey(repo) === key || isPathInside(session.cwd, repo)),
  );
}

/** Linked sessions, most recently active first. Ties break on the id, not on luck. */
function linkedSessions(sources: CondenseProjectSources): ClaudeSession[] {
  return (sources.sessions ?? [])
    .filter((session) => belongsToProject(session, sources.project))
    .sort(
      (a, b) =>
        (a.lastActivity === b.lastActivity ? 0 : a.lastActivity < b.lastActivity ? 1 : -1) ||
        a.id.localeCompare(b.id),
    );
}

/** Reads and clamps the tail of the sessions that made the cut. */
async function readSessions(
  sources: CondenseProjectSources,
  candidates: readonly ClaudeSession[],
): Promise<CondenseProjectSession[]> {
  const read: CondenseProjectSession[] = [];
  for (const session of candidates) {
    const full =
      sources.readTranscriptTail === undefined ? '' : await sources.readTranscriptTail(session);
    const droppedChars = Math.max(0, full.length - CONDENSE_SESSION_TAIL_CHARS);
    read.push({
      ref: agentRef('claude', pathKey(session.cwd)),
      id: session.id,
      at: session.lastActivity,
      branch: session.gitBranch,
      text: session.summary ?? session.firstPrompt,
      tail: droppedChars === 0 ? full : full.slice(full.length - CONDENSE_SESSION_TAIL_CHARS),
      droppedChars,
    });
  }
  return read;
}

/** The report, or `null` when every bound came out empty. */
function reportOf(
  days: number,
  sessions: number,
  read: readonly CondenseProjectSession[],
): CondenseProjectTruncationReport | null {
  const clampedSessions = read.filter((session) => session.droppedChars > 0).length;
  const transcriptChars = read.reduce((sum, session) => sum + session.droppedChars, 0);
  const count = days + sessions + clampedSessions;
  if (count === 0) return null;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(
      `${days} day entr${days === 1 ? 'y' : 'ies'} older than ${CONDENSE_DAY_WINDOW_DAYS} days`,
    );
  }
  if (sessions > 0) {
    parts.push(
      `${sessions} session${sessions === 1 ? '' : 's'} beyond the ${CONDENSE_SESSION_LIMIT} most recent`,
    );
  }
  if (clampedSessions > 0) {
    parts.push(
      `${transcriptChars} transcript characters past ${CONDENSE_SESSION_TAIL_CHARS} per session`,
    );
  }
  return {
    days,
    sessions,
    clampedSessions,
    transcriptChars,
    count,
    reason: `${parts.join(', ')} were left out.`,
  };
}

/**
 * The **document** inventory of one project's condensation: the vault documents
 * the selection reads, each with the content hash it has right now — for
 * `source_hashes` (D19; mirrors `areaInputs()`).
 *
 * Vault documents **only**. An agent session lives outside the vault and has no
 * vault hash, so it appears in `sources:` but never here (D18); the staleness
 * check compares hashes for these documents and activity timestamps for the
 * sessions.
 *
 * One entry per document, never per note or per todo — `project.md` holds the
 * state section, the `waiting_on` entries and usually some todos, and its one
 * hash covers all three. It is listed even when it holds nothing yet: it was
 * read, and text added later has to register as new material.
 *
 * Deterministic order, mirroring the selection: `project.md`, its notes
 * path-ascending, any further document a selected todo lives in, then the
 * in-window days oldest first — so a digest over the inventory identifies a
 * state and not a shuffle.
 */
export function projectInputs(
  sources: CondenseProjectVaultSources,
  options: CondenseInputsOptions = {},
): CondenseInput[] {
  const now = options.now ?? new Date();
  const byPath = new Map(sources.docs.map((doc) => [doc.path, doc]));
  const inputs: CondenseInput[] = [];
  const seen = new Set<string>();
  const add = (path: string): void => {
    const doc = byPath.get(path);
    // A selection always comes from a document, so this cannot miss. Skipping
    // rather than substituting an empty hash keeps "no hash" meaning exactly one
    // thing: nothing was recorded for this path.
    if (doc === undefined || seen.has(path)) return;
    seen.add(path);
    inputs.push({ path: doc.path, hash: doc.hash });
  };

  add(sources.project.path);
  for (const note of notesOf(sources)) add(note.path);
  for (const todo of todosOf(sources)) add(todo.path);
  for (const day of mentionedDays(sources, now).kept) add(day.path);
  return inputs;
}

/**
 * Selects the deterministic inputs of one project. Same sources in, same
 * output — same order, same bounds, no randomness, no model, no gateway.
 *
 * Asynchronous for one reason only: a session transcript is a file outside the
 * vault, so it cannot come out of the index like everything else. Without a
 * `readTranscriptTail` reader the sessions still contribute their own facts
 * (summary, branch, last activity) and their `agent:` citation, and their tails
 * are empty — the honest result of not having been read.
 */
export async function selectProjectCondenseInputs(
  sources: CondenseProjectSources,
  options: CondenseInputsOptions = {},
): Promise<CondenseProjectInputSelection> {
  const now = options.now ?? new Date();
  const { project } = sources;
  const doc = sources.docs.find((candidate) => candidate.path === project.path);

  const { kept, dropped } = mentionedDays(sources, now);
  const candidates = linkedSessions(sources);
  const read = await readSessions(sources, candidates.slice(0, CONDENSE_SESSION_LIMIT));
  const droppedSessions = Math.max(0, candidates.length - CONDENSE_SESSION_LIMIT);

  const agentRefs: string[] = [];
  for (const session of read) {
    if (!agentRefs.includes(session.ref)) agentRefs.push(session.ref);
  }

  return {
    scope: project.scope,
    slug: project.slug,
    title: project.title,
    state: doc === undefined ? '' : stateSection(doc.body),
    notes: notesOf(sources),
    todos: todosOf(sources),
    waitingOn: [...project.waitingOn],
    days: kept,
    sessions: read,
    agentRefs,
    truncated: reportOf(dropped, droppedSessions, read),
  };
}
