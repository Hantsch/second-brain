/* Agent sessions (Claude Code & Codex CLI) as one unified work trail —
   story 001, D10.

   Both CLIs are read in `overview-deps.ts`: `claudeSessions()` and
   `codexSessions()` read, cache briefly and link via `repos` (`linkSessions`
   from `@core/claude`, the same logic for both). Those are exactly the paths
   the dashboard, the reminders and `claude:sessions` take — they are reused
   here, not built a second time, so the session browser and the overview never
   disagree about which project a session belongs to or when it was last
   touched. This file only shapes both CLIs' sessions for the agent channels. */

import { aggregateAgentProjects, readTranscriptPage } from '@core/agents';
import type { AgentProjectInput } from '@core/agents';
import { nodeClaudeFileSystem, pathKey } from '@core/claude';
import type { AgentKind, AgentSessionSummary, ClaudeSession } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import {
  AGENT_SESSION_LIMIT,
  claudeReader,
  claudeSessions,
  codexReader,
  codexSessions,
  forgetCodexSessions,
  forgetSessions,
  overviewSettings,
  usesClaudeSessions,
  usesCodexSessions,
} from './overview-deps';
import type { LinkedCodexSession } from './overview-deps';
import { linkRepoToProject } from './repo-link';
import type { Services } from '../services';

/* Existing callers (and tests) import the Codex cache reset from here. */
export { forgetCodexSessions };

/** Does this vault read this CLI's sessions? */
function usesSessions(services: Services, agent: AgentKind): boolean {
  return agent === 'claude' ? usesClaudeSessions(services) : usesCodexSessions(services);
}

/** The configured override for this CLI's directory — empty means "default location". */
function configuredDir(services: Services, agent: AgentKind): string {
  const settings = overviewSettings(services);
  const value = agent === 'claude' ? settings?.claudeProjectsDir : settings?.codexSessionsDir;
  return (value ?? '').trim();
}

/**
 * A configured directory that does not exist is a misconfiguration, and only
 * the user can fix it — so it is said out loud, with the path, before anything
 * is read.
 *
 * Only an explicit override counts. With an empty setting, the reader falls
 * back to the default location (`~/.claude/projects`, `~/.codex/sessions`), and
 * a missing default location means "this CLI has never run here" — the honest
 * empty state, not an error. Switched-off reading outranks both: then nothing
 * is read and the path is beside the point.
 */
async function requireSessionsDir(services: Services, agent: AgentKind): Promise<void> {
  if (!usesSessions(services, agent)) return;
  const configured = configuredDir(services, agent);
  if (configured.length === 0) return;
  if (await nodeClaudeFileSystem().exists(configured)) return;
  throw fail('not-found', `dieses Verzeichnis gibt es nicht: ${configured}`, {
    missingDir: configured,
  });
}

/** The raw Claude sessions — empty when reading them is switched off. */
async function claudeRaw(services: Services): Promise<ClaudeSession[]> {
  if (!usesClaudeSessions(services)) return [];
  return claudeSessions(services, AGENT_SESSION_LIMIT);
}

function claudeProjectInputs(sessions: readonly ClaudeSession[]): AgentProjectInput[] {
  return sessions.map((session) => ({
    agent: 'claude' as const,
    cwd: session.cwd,
    sessionId: session.id,
    startedAt: session.startedAt,
    lastActivity: session.lastActivity,
    vaultProject: session.vaultProject,
  }));
}

/** Sessions without a known working directory belong to no project — never guessed. */
function codexProjectInputs(sessions: readonly LinkedCodexSession[]): AgentProjectInput[] {
  return sessions
    .filter((session): session is LinkedCodexSession & { cwd: string } => session.cwd !== null)
    .map((session) => ({
      agent: 'codex' as const,
      cwd: session.cwd,
      sessionId: session.id,
      startedAt: session.startedAt,
      lastActivity: session.lastActivity,
      vaultProject: session.vaultProject,
    }));
}

/**
 * The raw, still ungrouped inputs of one CLI. They carry the one thing
 * `AgentProject` deliberately drops: the untouched `cwd` of each session, which
 * `agents:link` needs in order to write a working directory into `repos`.
 */
async function projectInputs(services: Services, agent: AgentKind): Promise<AgentProjectInput[]> {
  if (agent === 'claude') return claudeProjectInputs(await claudeRaw(services));
  return codexProjectInputs(await codexSessions(services));
}

/** Duration between two ISO timestamps, or `null` when one of them is no good. */
function durationOf(startedAt: string, lastActivity: string): number | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(lastActivity);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return end - start;
}

function claudeToSummary(session: ClaudeSession): AgentSessionSummary {
  return {
    id: session.id,
    agent: 'claude',
    projectKey: pathKey(session.cwd),
    title: session.summary,
    startedAt: session.startedAt,
    lastActivity: session.lastActivity,
    durationMs: durationOf(session.startedAt, session.lastActivity),
    messageCount: session.messageCount,
    gitBranch: session.gitBranch,
    model: session.model,
    subagents: session.subagents,
    contextTokens: session.contextTokens,
    vaultProject: session.vaultProject,
  };
}

function codexToSummary(session: LinkedCodexSession): AgentSessionSummary {
  return {
    id: session.id,
    agent: 'codex',
    projectKey: pathKey(session.cwd ?? ''),
    title: session.title,
    startedAt: session.startedAt,
    lastActivity: session.lastActivity,
    durationMs: session.durationMs,
    messageCount: session.messageCount,
    gitBranch: session.gitBranch,
    model: session.model,
    subagents: null,
    contextTokens: session.contextTokens,
    vaultProject: session.vaultProject,
  };
}

/** Newest first — the same order as `ClaudeSessionReader.list()`. */
function byRecency(a: AgentSessionSummary, b: AgentSessionSummary): number {
  if (a.lastActivity === b.lastActivity) return 0;
  return a.lastActivity < b.lastActivity ? 1 : -1;
}

async function summariesFor(services: Services, agent: AgentKind): Promise<AgentSessionSummary[]> {
  if (agent === 'claude') return (await claudeRaw(services)).map(claudeToSummary);
  return (await codexSessions(services)).map(codexToSummary);
}

export function agentHandlers(services: Services): HandlerMap {
  return defineHandlers({
    /* Switched-off reading means an empty list — the same honest convention as
       `claude:sessions`. The distinction "switched off" vs. "nothing found" is
       shown by the screen (D11+); this channel only delivers the honest empty
       answer. A configured directory that is missing is the one case that does
       become an error: nobody but the user can fix it, and a `[]` would claim
       the CLI had never run. */
    'agents:projects': async ({ agent }) => {
      services.requireVaultRoot();
      await requireSessionsDir(services, agent);
      return aggregateAgentProjects(await projectInputs(services, agent));
    },

    'agents:sessions': async ({ agent, projectKey }) => {
      services.requireVaultRoot();
      await requireSessionsDir(services, agent);
      const summaries = await summariesFor(services, agent);
      return summaries.filter((summary) => summary.projectKey === projectKey).sort(byRecency);
    },

    /* Linking is a property of the working directory, not of a single session:
       every session in that directory shares the link, because `repos` names
       the directory (docs/VAULT-FORMAT.md). Hence project-level, and hence the
       same write as `claude:link` — `repo-link.ts`, once for both. */
    'agents:link': async ({ agent, projectKey, project: slug }) => {
      services.requireVaultRoot();
      if (!usesSessions(services, agent)) {
        throw fail('invalid', 'das Mitlesen der Sitzungen dieser CLI ist abgeschaltet');
      }
      await requireSessionsDir(services, agent);

      /* The working directory comes from the sessions the project was
         aggregated from — `AgentProject.key` is a normalized key, not a path
         that may be written into a file. */
      const source = (await projectInputs(services, agent)).find(
        (input) => pathKey(input.cwd) === projectKey,
      );
      if (source === undefined) {
        throw fail('not-found', `dieses Projekt gibt es nicht: ${projectKey}`);
      }

      await linkRepoToProject(services, slug, source.cwd, 'agents');
      /* The link now lives in the file — the buffers don't know it yet. */
      if (agent === 'claude') forgetSessions();
      else forgetCodexSessions();
    },

    'agents:transcript': async ({ agent, sessionId, cursor }) => {
      services.requireVaultRoot();
      if (agent === 'claude' && !usesClaudeSessions(services)) {
        throw fail('invalid', 'das Mitlesen der Claude-Sitzungen ist abgeschaltet');
      }
      if (agent === 'codex' && !usesCodexSessions(services)) {
        throw fail('invalid', 'das Mitlesen der Codex-Sitzungen ist abgeschaltet');
      }
      const file =
        agent === 'claude'
          ? await claudeReader(services).findFile(sessionId)
          : await codexReader(services).findFile(sessionId);
      if (file === null) throw fail('not-found', 'diese Sitzung gibt es nicht');

      return readTranscriptPage(nodeClaudeFileSystem(), { agent, file }, cursor ?? null);
    },
  });
}
