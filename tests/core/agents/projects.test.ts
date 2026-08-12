import { describe, expect, it } from 'vitest';
import { aggregateAgentProjects } from '@core/agents';
import type { AgentProjectInput } from '@core/agents';

function input(patch: Partial<AgentProjectInput> = {}): AgentProjectInput {
  return {
    agent: 'claude',
    cwd: 'c:/development/Hantsch/second-brain',
    sessionId: 's-1',
    startedAt: '2026-08-10T08:00:00.000Z',
    lastActivity: '2026-08-10T09:00:00.000Z',
    vaultProject: null,
    ...patch,
  };
}

describe('aggregateAgentProjects grouping', () => {
  it('aggregates several sessions with the same cwd into one project', () => {
    const projects = aggregateAgentProjects([
      input({
        sessionId: 's-1',
        startedAt: '2026-08-05T08:00:00.000Z',
        lastActivity: '2026-08-05T09:00:00.000Z',
      }),
      input({
        sessionId: 's-2',
        startedAt: '2026-08-08T08:00:00.000Z',
        lastActivity: '2026-08-08T09:00:00.000Z',
      }),
      input({
        sessionId: 's-3',
        startedAt: '2026-08-01T08:00:00.000Z',
        lastActivity: '2026-08-10T09:00:00.000Z',
      }),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0]?.sessionCount).toBe(3);
    expect(projects[0]?.firstActivity).toBe('2026-08-01T08:00:00.000Z');
    expect(projects[0]?.lastActivity).toBe('2026-08-10T09:00:00.000Z');
  });

  it('collapses case- and slash-differing Windows paths into one project', () => {
    const projects = aggregateAgentProjects([
      input({ sessionId: 's-1', cwd: 'C:\\Users\\x\\project' }),
      input({ sessionId: 's-2', cwd: 'c:/users/x/project' }),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0]?.sessionCount).toBe(2);
    expect(projects[0]?.key).toBe('c:/users/x/project');
  });

  it('keeps a Claude session and a Codex session with the same cwd as two separate projects', () => {
    const projects = aggregateAgentProjects([
      input({ agent: 'claude', sessionId: 's-claude' }),
      input({ agent: 'codex', sessionId: 's-codex' }),
    ]);

    expect(projects).toHaveLength(2);
    const agents = projects.map((project) => project.agent).sort();
    expect(agents).toEqual(['claude', 'codex']);
    for (const project of projects) {
      expect(project.sessionCount).toBe(1);
      expect(project.key).toBe('c:/development/hantsch/second-brain');
    }
  });
});

describe('aggregateAgentProjects sorting', () => {
  it('sorts projects by last activity, newest first', () => {
    const projects = aggregateAgentProjects([
      input({ cwd: 'c:/code/oldest', sessionId: 's-1', lastActivity: '2026-08-01T09:00:00.000Z' }),
      input({ cwd: 'c:/code/newest', sessionId: 's-2', lastActivity: '2026-08-12T09:00:00.000Z' }),
      input({ cwd: 'c:/code/middle', sessionId: 's-3', lastActivity: '2026-08-06T09:00:00.000Z' }),
    ]);

    expect(projects.map((project) => project.name)).toEqual(['newest', 'middle', 'oldest']);
  });
});

describe('aggregateAgentProjects vaultProject', () => {
  it('carries the vault project through when present', () => {
    const projects = aggregateAgentProjects([input({ vaultProject: 'second-brain' })]);
    expect(projects[0]?.vaultProject).toBe('second-brain');
  });

  it('stays null when no session in the group has one', () => {
    const projects = aggregateAgentProjects([
      input({ sessionId: 's-1', vaultProject: null }),
      input({ sessionId: 's-2', vaultProject: null }),
    ]);
    expect(projects[0]?.vaultProject).toBeNull();
  });

  it('picks the most recent session vaultProject when sessions disagree', () => {
    const projects = aggregateAgentProjects([
      input({
        sessionId: 's-old',
        lastActivity: '2026-08-01T09:00:00.000Z',
        vaultProject: 'old-project',
      }),
      input({
        sessionId: 's-new',
        lastActivity: '2026-08-10T09:00:00.000Z',
        vaultProject: 'new-project',
      }),
    ]);
    expect(projects[0]?.vaultProject).toBe('new-project');
  });
});
