/* Wiring for the overview — in exactly one place.

   Three channel groups hang off `@core/overview` and `@core/claude`: the
   dashboard, the reminders, and the sessions. They need the same four things —
   the index as a narrow view, the thresholds from the vault settings, the
   session lists of both agent CLIs (Claude Code and Codex), and the snooze
   state. Both CLIs are read, cached and linked here; `agents.ts` reuses these
   read paths instead of building its own.

   Three decisions that aren't otherwise visible in the code:

   - **Sessions are briefly cached.** A dashboard call, a reminders call, and
     the sessions tile all query within one second; reading `~/.claude` or
     `~/.codex` three times would be wasteful. The caches last only seconds and
     are discarded after a link.
   - **One touches map holds both CLIs.** `applyExternalTouches` replaces the
     map wholesale, so Claude's and Codex's traces are merged first and applied
     once, from `claudeSessions()` — the one call every overview channel makes.
     Applying them one after the other would let the second erase the first.
   - **After the session run, the index catches up without sending an event.**
     `lastTouch` and `stale` need to know about the sessions; an
     `event:vault-changed` would invalidate the dashboard that's currently
     querying — a loop. */

import { readTranscriptPage } from '@core/agents';
import {
  ClaudeSessionReader,
  linkSessions,
  nodeClaudeFileSystem,
  pathKey,
  projectNameOf,
} from '@core/claude';
import { CodexSessionReader } from '@core/codex';
import type { CodexSessionSummary } from '@core/codex';
import type { ExternalTouch } from '@core/index/types';
import type { OverviewIndex } from '@core/overview';
import type { AgentWorkSession, ClaudeSession, OverviewSettings } from '@shared/types';
import { fail } from './errors';
import { gardenerReport } from './gardener-deps';
import { applyExternalTouches, mergeTouches } from '../claude-touches';
import type { IndexLike } from '../contracts';
import { recentWorkLabels } from '../messages';
import { overviewState } from '../overview-state';
import type { OverviewState } from '../overview-state';
import type { Services } from '../services';

/** How long a read session list counts as fresh — for both CLIs. */
export const SESSION_CACHE_MS = 4000;

/* The two limits differ on purpose. `lastTouch` and `stale` are derived from
   what a run *reads*, and the touches map is shared by every channel — so the
   read must be the same size no matter whether the dashboard or the session
   browser ran last, or a project's `stale` flag would flip with the call
   order. What the dashboard *shows* is a separate, small slice of that read. */

/** How many sessions each CLI's run reads, whichever channel asks. */
export const AGENT_SESSION_LIMIT = 100;

/** How many sessions the dashboard payload carries — display only, not the read. */
export const SESSION_LIMIT = 20;

/** What the overview needs from the index — `IndexService` satisfies it structurally. */
const OVERVIEW_INDEX_METHODS: readonly string[] = ['projects', 'todos', 'sources', 'index'];

type Touches = ReadonlyMap<string, ExternalTouch>;

/** One shared empty map, so "no Codex traces" keeps a stable identity. */
const NO_TOUCHES: Touches = new Map();

interface SessionCache {
  root: string;
  at: number;
  limit: number;
  sessions: ClaudeSession[];
  touches: Touches;
  /** The Codex traces that were merged in with these Claude traces. */
  codexTouches: Touches;
}

let cache: SessionCache | null = null;

/** Discards the session cache — after `claude:link` and on vault switch. */
export function forgetSessions(): void {
  cache = null;
}

/** A Codex session together with the vault project it was linked to. */
export interface LinkedCodexSession extends CodexSessionSummary {
  vaultProject: string | null;
}

interface CodexCache {
  root: string;
  at: number;
  sessions: LinkedCodexSession[];
  touches: Touches;
}

let codexCache: CodexCache | null = null;

/** Discards the Codex cache — after `agents:link` for Codex, and for tests. */
export function forgetCodexSessions(): void {
  codexCache = null;
}

function knowsOverview(index: IndexLike): index is IndexLike & OverviewIndex {
  const record = index as unknown as Record<string, unknown>;
  return OVERVIEW_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/**
 * The index as the overview's read view. If a derivation is missing, the
 * channel says so — an empty answer would be a claim about a vault that no
 * one has read.
 */
export function overviewIndex(services: Services): IndexLike & OverviewIndex {
  const index = services.requireIndex();
  if (!knowsOverview(index)) throw fail('io', 'der Index liefert keine Überblicks-Ableitungen');
  return index;
}

/** The open vault's thresholds. `undefined` means: the core's defaults. */
export function overviewSettings(services: Services): OverviewSettings | undefined {
  return services.settings.vault()?.overview;
}

/** Labels for "recent work" in the UI's language. */
export function overviewLabels(services: Services): ReturnType<typeof recentWorkLabels> {
  return recentWorkLabels(services.settings.uiLanguage());
}

/** This vault's snooze state, from `.secondbrain/overview.json`. */
export function overviewStateFor(services: Services, today: string): Promise<OverviewState> {
  return overviewState(services.requireVaultRoot(), today);
}

/**
 * The health value from the last maintenance run (`.secondbrain/gardener.json`).
 *
 * As long as no run exists, the answer is `null` — the dashboard then says
 * "not checked yet" instead of claiming a 100. What's counted is exactly the
 * list the maintenance screen also shows: without the findings the user marked
 * as "looks fine" or resolved via a fix.
 */
export async function gardenerSummary(
  services: Services,
): Promise<{ health: number; findingCount: number } | null> {
  const report = await gardenerReport(services);
  if (report === null || report.healthKnown === false) return null;
  return { health: report.health, findingCount: report.findings.length };
}

/** Does the vault read the Claude sessions? */
export function usesClaudeSessions(services: Services): boolean {
  const settings = overviewSettings(services);
  return settings !== undefined && settings.useClaudeSessions;
}

/** Does the vault read the Codex sessions? Same honest-empty convention as Claude's. */
export function usesCodexSessions(services: Services): boolean {
  const settings = overviewSettings(services);
  return settings !== undefined && settings.useCodexSessions;
}

/**
 * The Claude reader for this vault's settings. Exported so `agents.ts` can
 * resolve a session's transcript file (`findFile`) without opening a second,
 * differently-configured reader — same `claudeProjectsDir` override this
 * module's own `claudeSessions()` uses below.
 */
export function claudeReader(services: Services): ClaudeSessionReader {
  return new ClaudeSessionReader({
    fs: nodeClaudeFileSystem(),
    projectsDir: overviewSettings(services)?.claudeProjectsDir ?? null,
  });
}

/** The Codex reader for this vault's settings — the Codex twin of `claudeReader`. */
export function codexReader(services: Services): CodexSessionReader {
  return new CodexSessionReader({
    fs: nodeClaudeFileSystem(),
    sessionsDir: overviewSettings(services)?.codexSessionsDir ?? null,
  });
}

/**
 * How many bytes of a session file the condensation's tail read looks at.
 * `CONDENSE_SESSION_TAIL_CHARS` (2000) is the clamp the selector then applies to
 * the text returned below; 16 KiB of JSONL holds that much message text with
 * room to spare, while staying far below `TRANSCRIPT_PAGE_BYTES` (128 KiB) —
 * one such page per session would blow a prompt's whole input budget
 * (story 044, D14).
 */
const CONDENSE_TAIL_BYTES = 16 * 1024;

/**
 * The tail of one Claude session's transcript as plain text, oldest turn first —
 * what `condenseProject()` reads through `CondenseProjectSources.readTranscriptTail`.
 *
 * That contract says an empty, unreadable or missing session file yields `''`
 * rather than an error: a condensation must not fail because a transcript was
 * rotated away between listing the sessions and reading them.
 *
 * Only `user`/`assistant` message text goes in. Tool calls are left out — they
 * are mostly file paths, and they would spend the prompt's budget on the part of
 * a session that says the least about where the work stopped.
 */
export async function claudeTranscriptTail(
  services: Services,
  session: ClaudeSession,
): Promise<string> {
  try {
    const file = await claudeReader(services).findFile(session.id);
    if (file === null || file.size <= 0) return '';
    const from = Math.max(0, file.size - CONDENSE_TAIL_BYTES);
    const page = await readTranscriptPage(
      nodeClaudeFileSystem(),
      { agent: 'claude', file },
      /* The `+` says "this offset sits inside a line", so the first, half-read
         record of the window is dropped instead of parsed into a broken entry. */
      from === 0 ? null : `${from}+`,
      { pageBytes: CONDENSE_TAIL_BYTES },
    );
    return page.entries
      .filter((entry) => entry.kind === 'user' || entry.kind === 'assistant')
      .map((entry) => (entry.text ?? '').trim())
      .filter((text) => text.length > 0)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * A Codex session in `ClaudeSession` shape, so `linkSessions` — "`repos` first,
 * then a unique name match, otherwise none" (guardrail 3) — stays one piece of
 * logic for both CLIs. The thread title stands in for Claude's summary; the
 * fields Codex doesn't have stay honestly empty.
 */
function asLinkable(session: CodexSessionSummary): ClaudeSession {
  const cwd = session.cwd ?? '';
  return {
    id: session.id,
    cwd,
    projectName: projectNameOf(cwd),
    vaultProject: null,
    gitBranch: session.gitBranch,
    startedAt: session.startedAt,
    lastActivity: session.lastActivity,
    messageCount: session.messageCount,
    firstPrompt: '',
    summary: session.title,
    files: [],
    model: session.model,
    subagents: null,
    contextTokens: session.contextTokens,
  };
}

/** The Codex read — from the cache while it is fresh, otherwise from disk. */
async function readCodex(services: Services): Promise<CodexCache> {
  const root = services.requireVaultRoot();
  const fresh =
    codexCache !== null &&
    codexCache.root === root &&
    Date.now() - codexCache.at < SESSION_CACHE_MS;
  if (fresh && codexCache !== null) return codexCache;

  const raw = await codexReader(services).list({ limit: AGENT_SESSION_LIMIT });
  const linked = linkSessions(raw.map(asLinkable), overviewIndex(services).projects(), {
    source: 'codex-session',
  });
  const sessions: LinkedCodexSession[] = raw.map((session, index) => ({
    ...session,
    vaultProject: linked.sessions[index]!.vaultProject,
  }));

  codexCache = { root, at: Date.now(), sessions, touches: linked.touches };
  return codexCache;
}

/**
 * The Codex sessions, linked to vault projects. The same honesty as
 * `claudeSessions()`: switched off means empty, not "none found".
 */
export async function codexSessions(services: Services): Promise<LinkedCodexSession[]> {
  if (!usesCodexSessions(services)) return [];
  return (await readCodex(services)).sessions;
}

/** Codex's traces — none at all when reading them is switched off. */
async function codexTouches(services: Services): Promise<Touches> {
  if (!usesCodexSessions(services)) return NO_TOUCHES;
  return (await readCodex(services)).touches;
}

/**
 * Codex's traces as far as they are known *without* reading — for the path
 * that serves Claude from its cache. A Codex read another channel made in the
 * meantime is picked up; an empty Codex cache means "not read since", so what
 * was merged last stays.
 */
function knownCodexTouches(services: Services, root: string, merged: Touches): Touches {
  if (!usesCodexSessions(services)) return NO_TOUCHES;
  return codexCache !== null && codexCache.root === root ? codexCache.touches : merged;
}

/** Both CLIs' traces as one map, applied once; the index catches up if anything changed. */
async function applyTouches(services: Services, claude: Touches, codex: Touches): Promise<void> {
  if (applyExternalTouches(mergeTouches(claude, codex))) await catchUp(services);
}

/**
 * The most recent Claude sessions, linked to the vault's projects. Every run
 * also applies the merged Claude + Codex traces — see the file header.
 *
 * If reading them is turned off, the answer is empty — the renderer knows the
 * setting and reports it at the tile, instead of claiming "no sessions".
 */
export async function claudeSessions(
  services: Services,
  limit = SESSION_LIMIT,
): Promise<ClaudeSession[]> {
  const root = services.requireVaultRoot();
  if (!usesClaudeSessions(services)) {
    /* Without reading them in, no Claude traces may remain in the index —
       Codex's stay, as far as Codex is read. */
    await applyTouches(services, NO_TOUCHES, await codexTouches(services));
    return [];
  }

  const want = Math.max(1, limit);
  const fresh =
    cache !== null &&
    cache.root === root &&
    cache.limit >= want &&
    Date.now() - cache.at < SESSION_CACHE_MS;
  if (fresh && cache !== null) {
    /* No read here. Only if another channel has read Codex since do the
       traces change — then the merge is applied again, still complete. */
    const codex = knownCodexTouches(services, root, cache.codexTouches);
    if (codex !== cache.codexTouches) {
      cache.codexTouches = codex;
      await applyTouches(services, cache.touches, codex);
    }
    return cache.sessions.slice(0, want);
  }

  const read = Math.max(want, AGENT_SESSION_LIMIT);
  const sessions = await claudeReader(services).list({ limit: read });
  const linked = linkSessions(sessions, overviewIndex(services).projects());
  const codex = await codexTouches(services);

  cache = {
    root,
    at: Date.now(),
    limit: read,
    sessions: linked.sessions,
    touches: linked.touches,
    codexTouches: codex,
  };
  await applyTouches(services, linked.touches, codex);
  return linked.sessions.slice(0, want);
}

function byRecency(a: AgentWorkSession, b: AgentWorkSession): number {
  if (a.lastActivity === b.lastActivity) return 0;
  return a.lastActivity < b.lastActivity ? 1 : -1;
}

/**
 * The work sessions of both CLIs as one list, newest first. Claude runs first:
 * its run applies the merged traces, so the index knows both CLIs' `lastTouch`
 * before any caller reads the projects.
 */
export async function agentWorkSessions(services: Services): Promise<AgentWorkSession[]> {
  const claude = (await claudeSessions(services, AGENT_SESSION_LIMIT)).map(
    (session): AgentWorkSession => ({
      ...session,
      agent: 'claude',
      projectKey: pathKey(session.cwd),
    }),
  );
  const codex = (await codexSessions(services)).map((session): AgentWorkSession => ({
    ...asLinkable(session),
    vaultProject: session.vaultProject,
    agent: 'codex',
    projectKey: pathKey(session.cwd ?? ''),
  }));
  return [...claude, ...codex].sort(byRecency);
}

/**
 * Catch up the index so `lastTouch` and `stale` know about the sessions. No
 * event: the caller is querying right now and reads the fresh projects
 * afterward. If it fails, the answer stays valid — it just doesn't know about
 * the session traces yet, and that's better than no dashboard.
 */
async function catchUp(services: Services): Promise<void> {
  const index = services.index();
  if (!index?.refresh) return;
  try {
    /* Without a path list: no file changed, only the basis for the computation. */
    await index.refresh();
    await services.refreshIndexState();
  } catch (error) {
    console.warn('[overview] Index catch-up after the session run failed:', error);
  }
}
