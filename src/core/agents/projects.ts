/**
 * Sessions → `AgentProject[]`. Pure aggregation, no file I/O: a per-file reader
 * (Claude's own list, Codex's D5) hands in the raw sessions it found; this module
 * groups them into the working-directory rows the browser's project list shows.
 *
 * The grouping key is `(agent, pathKey(cwd))`, not `pathKey(cwd)` alone. A Codex
 * session and a Claude session can share a cwd — the same repo, worked on by both
 * CLIs — but the browser filters by agent kind first (see the story's
 * "## Requirement": which CLI you look at is a filter, not a second screen), so
 * they must stay two separate `AgentProject` rows.
 */

import { normalizePath, pathKey, projectNameOf } from '@core/claude';
import type { AgentKind, AgentProject } from '@shared/types';

/**
 * What a per-agent reader produces per session, before grouping. Intentionally
 * narrower than `AgentSessionSummary`: it carries the raw, unnormalized `cwd` and
 * no `projectKey` yet — that field is assigned by `aggregateAgentProjects` below.
 * Wiring outside this module (not this deliverable's concern) takes the `key` of
 * the resulting `AgentProject` and stamps it back onto each session as
 * `AgentSessionSummary.projectKey`.
 */
export interface AgentProjectInput {
  agent: AgentKind;
  /** Raw working directory as the reader saw it — not yet normalized. */
  cwd: string;
  sessionId: string;
  startedAt: string;
  lastActivity: string;
  vaultProject: string | null;
}

/** One group of inputs sharing an `(agent, pathKey(cwd))` identity. */
interface Group {
  agent: AgentKind;
  inputs: AgentProjectInput[];
}

/**
 * Sessions grouped into projects, sorted by last activity descending (newest
 * first), ties broken by `path` for determinism — same house style as
 * `ClaudeSessionReader.list()` in `src/core/claude/reader.ts`.
 */
export function aggregateAgentProjects(inputs: readonly AgentProjectInput[]): AgentProject[] {
  const groups = new Map<string, Group>();
  for (const input of inputs) {
    const groupKey = `${input.agent}:${pathKey(input.cwd)}`;
    const group = groups.get(groupKey);
    if (group === undefined) {
      groups.set(groupKey, { agent: input.agent, inputs: [input] });
    } else {
      group.inputs.push(input);
    }
  }

  const projects = Array.from(groups.values()).map((group) => toProject(group));

  projects.sort((a, b) =>
    a.lastActivity === b.lastActivity
      ? a.path.localeCompare(b.path)
      : a.lastActivity < b.lastActivity
        ? 1
        : -1,
  );
  return projects;
}

function toProject(group: Group): AgentProject {
  const key = pathKey(group.inputs[0]!.cwd);
  const path = normalizePath(group.inputs[0]!.cwd);

  let firstActivity = group.inputs[0]!.startedAt;
  let lastActivity = group.inputs[0]!.lastActivity;
  // Most recent session wins the vaultProject if sessions disagree (some linked,
  // some not, or linked to different projects) — simplest tie-break, matches what
  // the browser cares about: the current state of the link, not its history.
  let vaultProject = group.inputs[0]!.vaultProject;
  let mostRecentActivity = group.inputs[0]!.lastActivity;

  for (const input of group.inputs.slice(1)) {
    if (input.startedAt < firstActivity) firstActivity = input.startedAt;
    if (input.lastActivity > lastActivity) lastActivity = input.lastActivity;
    if (input.lastActivity > mostRecentActivity) {
      mostRecentActivity = input.lastActivity;
      vaultProject = input.vaultProject;
    }
  }

  return {
    key,
    path,
    name: projectNameOf(path),
    agent: group.agent,
    sessionCount: group.inputs.length,
    firstActivity,
    lastActivity,
    vaultProject,
  };
}
