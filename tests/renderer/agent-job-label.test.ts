import { describe, expect, it } from 'vitest';
import type { AgentJobView, KnowledgeModule } from '@shared/types';
import { setLanguage } from '@renderer/i18n';
import { labelAgentJobs } from '@renderer/lib/agent-job-label';

function job(patch: Partial<AgentJobView>): AgentJobView {
  return {
    id: 'job-1',
    kind: 'curate-module',
    subject: 'auth0',
    label: 'auth0',
    module: 'auth0',
    state: 'with-agent',
    reason: null,
    createdAt: '2026-10-27T10:00:00.000Z',
    finishedAt: null,
    ...patch,
  };
}

const MODULES = [{ slug: 'auth0', title: 'Auth0 notes' }] as KnowledgeModule[];

describe('labelAgentJobs', () => {
  it('a module job is named by the module title', () => {
    setLanguage('en');
    expect(labelAgentJobs([job({})], MODULES, 'en')[0]?.label).toBe('Auth0 notes');
  });

  it('a module job keeps its slug while the module list has not arrived', () => {
    setLanguage('en');
    expect(labelAgentJobs([job({})], undefined, 'en')[0]?.label).toBe('auth0');
  });

  it('a maintenance job is named by the run date', () => {
    setLanguage('en');
    const [labelled] = labelAgentJobs(
      [job({ kind: 'gardener-audit', subject: '2026-10-27T10:00:00.000Z', label: 'x' })],
      MODULES,
      'en',
    );
    expect(labelled?.label).toMatch(/^Maintenance run of .*2026/);
  });

  it('a source job keeps the label main gave it', () => {
    setLanguage('en');
    const source = job({ kind: 'condense-source', label: 'Example source' });
    expect(labelAgentJobs([source], MODULES, 'en')[0]?.label).toBe('Example source');
  });
});
