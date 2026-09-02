/* Wiring for the overview — in exactly one place.

   Three channel groups hang off `@core/overview` and `@core/claude`: the
   dashboard, the reminders, and the sessions. They need the same four things —
   the index as a narrow view, the thresholds from the vault settings, the
   session list, and the snooze state.

   Two decisions that aren't otherwise visible in the code:

   - **Sessions are briefly cached.** A dashboard call, a reminders call, and
     the sessions tile all query within one second; reading `~/.claude` three
     times would be wasteful. The cache lasts only seconds and is discarded
     after `claude:link`.
   - **After the session run, the index catches up without sending an event.**
     `lastTouch` and `stale` need to know about the sessions; an
     `event:vault-changed` would invalidate the dashboard that's currently
     querying — a loop. */

import { readTranscriptPage } from '@core/agents';
import { ClaudeSessionReader, linkSessions, nodeClaudeFileSystem } from '@core/claude';
import type { OverviewIndex } from '@core/overview';
import type { ClaudeSession, OverviewSettings } from '@shared/types';
import { fail } from './errors';
import { gardenerReport } from './gardener-deps';
import { applyExternalTouches } from '../claude-touches';
import type { IndexLike } from '../contracts';
import { recentWorkLabels } from '../messages';
import { overviewState } from '../overview-state';
import type { OverviewState } from '../overview-state';
import type { Services } from '../services';

/** How long a read session list counts as fresh. */
export const SESSION_CACHE_MS = 4000;

/** How many sessions a run reads when no one specifies a number. */
export const SESSION_LIMIT = 20;

/** What the overview needs from the index — `IndexService` satisfies it structurally. */
const OVERVIEW_INDEX_METHODS: readonly string[] = ['projects', 'todos', 'sources', 'index'];

interface SessionCache {
  root: string;
  at: number;
  limit: number;
  sessions: ClaudeSession[];
}

let cache: SessionCache | null = null;

/** Discards the session cache — after `claude:link` and on vault switch. */
export function forgetSessions(): void {
  cache = null;
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
 * The most recent sessions, linked to the vault's projects.
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
    /* Without reading them in, no traces may remain in the index either. */
    if (applyExternalTouches(new Map())) await catchUp(services);
    return [];
  }

  const want = Math.max(1, limit);
  const fresh =
    cache !== null &&
    cache.root === root &&
    cache.limit >= want &&
    Date.now() - cache.at < SESSION_CACHE_MS;
  if (fresh && cache !== null) return cache.sessions.slice(0, want);

  const read = Math.max(want, SESSION_LIMIT);
  const sessions = await claudeReader(services).list({ limit: read });
  const index = overviewIndex(services);
  const linked = linkSessions(sessions, index.projects());

  cache = { root, at: Date.now(), limit: read, sessions: linked.sessions };
  if (applyExternalTouches(linked.touches)) await catchUp(services);
  return linked.sessions.slice(0, want);
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
