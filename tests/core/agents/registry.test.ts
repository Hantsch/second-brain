import { describe, expect, it } from 'vitest';
import type { AgentProject, AgentSessionSummary, TranscriptPage } from '@shared/types';
import { AgentSessionRegistry } from '@core/agents';
import type { AgentSessionSource } from '@core/agents';

/** Faelscht `AgentSessionSource` fuer einen Kind, ohne Datei oder Netz zu beruehren. */
function fakeSource(): AgentSessionSource {
  return {
    listProjects: async (): Promise<AgentProject[]> => [],
    listSessions: async (): Promise<AgentSessionSummary[]> => [],
    transcript: async (): Promise<TranscriptPage> => ({
      entries: [],
      nextCursor: null,
      totalKnown: true,
    }),
  };
}

describe('AgentSessionRegistry', () => {
  it('loest beide Kinds ueber Identitaet auf', () => {
    const claude = fakeSource();
    const codex = fakeSource();
    const registry = new AgentSessionRegistry({ claude, codex });

    expect(registry.get('claude')).toBe(claude);
    expect(registry.get('codex')).toBe(codex);
  });
});
