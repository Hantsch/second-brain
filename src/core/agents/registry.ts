/**
 * Kind → read surface. A narrow lookup table, not a factory: who builds the
 * `ClaudeSessionReader` or Codex instance is decided by the IPC handler in
 * `src/main/`, not by this module (guardrail 5 — the core knows nothing about
 * Electron). `Record<AgentKind, AgentSessionSource>` demands both kinds at
 * construction time; a missing entry is therefore a compile error, not a
 * runtime case.
 */

import type { AgentKind } from '@shared/types';
import type { AgentSessionSource } from './types';

export class AgentSessionRegistry {
  constructor(private readonly sources: Record<AgentKind, AgentSessionSource>) {}

  get(kind: AgentKind): AgentSessionSource {
    return this.sources[kind];
  }
}
