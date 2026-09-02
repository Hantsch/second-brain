import { describe, expect, it } from 'vitest';
import { agentRef, parseAgentRef } from '@core/condense/agent-ref';
import { pathKey } from '@core/claude/paths';

describe('agentRef', () => {
  it('builds the agent:<kind>/<pathKey> citation form', () => {
    const key = pathKey('c:/development/demo');
    expect(agentRef('claude', key)).toBe(`agent:claude/${key}`);
  });

  it('round-trips through parseAgentRef', () => {
    const key = pathKey('c:/development/demo');
    const ref = agentRef('claude', key);
    expect(parseAgentRef(ref)).toEqual({ kind: 'claude', pathKey: key });
  });

  it('is stable across cwd variants that pathKey normalizes identically', () => {
    const a = agentRef('claude', pathKey('C:\\Development\\Demo\\'));
    const b = agentRef('claude', pathKey('c:/development/demo'));
    expect(a).toBe(b);
  });

  it('round-trips a POSIX cwd, whose pathKey keeps a leading slash (review fix)', () => {
    // pathKey('/home/me/demo') stays '/home/me/demo' (src/core/claude/paths.ts
    // normalizePath does not strip a leading separator), so the citation is
    // 'agent:claude//home/me/demo' — a double slash by construction. The parser
    // must still recover the exact original pathKey, leading slash included,
    // because attribution.ts (D8) compares the raw ref string, not a
    // re-normalized one.
    const key = pathKey('/home/me/demo');
    expect(key).toBe('/home/me/demo');
    const ref = agentRef('claude', key);
    expect(ref).toBe('agent:claude//home/me/demo');
    expect(parseAgentRef(ref)).toEqual({ kind: 'claude', pathKey: key });
  });
});

describe('parseAgentRef', () => {
  it('returns null for a plain vault path', () => {
    expect(parseAgentRef('projects/work/nyota/notes/x.md')).toBeNull();
  });

  it('returns null for a token missing the agent: prefix', () => {
    expect(parseAgentRef('claude/c:/development/demo')).toBeNull();
  });

  it('returns null for a token missing the separator', () => {
    expect(parseAgentRef('agent:claude')).toBeNull();
  });

  it('returns null for an empty kind', () => {
    expect(parseAgentRef('agent:/c:/development/demo')).toBeNull();
  });

  it('returns null for an empty pathKey', () => {
    expect(parseAgentRef('agent:claude/')).toBeNull();
  });
});
