/**
 * Public surface of the agent-neutral layer. Other modules import from here.
 *
 *   `types`       AgentFileSystem, AgentSessionSource — the contract per AgentKind
 *   `registry`    AgentSessionRegistry — kind → read surface
 *   `projects`    aggregateAgentProjects — sessions → AgentProject[]
 *   `transcript`  readTranscriptPage — one page of course, from both formats
 *
 * Concrete sources (Claude, Codex) live outside this module; what stands here is
 * only the skeleton they dock onto.
 */

export type { AgentFileSystem, AgentSessionSource } from './types';
export { AgentSessionRegistry } from './registry';
export { aggregateAgentProjects, type AgentProjectInput } from './projects';
export {
  MAX_TOOL_TARGET_CHARS,
  TRANSCRIPT_PAGE_BYTES,
  readTranscriptPage,
  type TranscriptPageOptions,
  type TranscriptSource,
} from './transcript';
