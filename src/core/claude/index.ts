/**
 * Oeffentliche Oberflaeche der Claude-Spur. Andere Module importieren von hier.
 *
 *   `types`         SessionReader, ClaudeFileSystem, SessionFacts
 *   `paths`         Ordnername ↔ Arbeitsverzeichnis (verlustbehaftet, deshalb geprueft)
 *   `records`       Deutung einer JSONL-Zeile, Prompt-Bereinigung
 *   `jsonl`         Kopf und Ende lesen, ohne die Datei zu laden
 *   `reader`        ClaudeSessionReader
 *   `link`          Zuordnung zu Vault-Projekten, Spuren fuer den Index
 *   `node-adapters` der echte Datei-Adapter (nicht in Tests)
 */

export {
  DEFAULT_SESSION_LIMIT,
  HEAD_BYTES,
  HEAD_LINES,
  MAX_FIRST_PROMPT_CHARS,
  MAX_SESSION_FILES,
  MAX_SUMMARY_CHARS,
  READ_CONCURRENCY,
  TAIL_BYTES,
  TRANSCRIPT_EXTENSION,
  emptyFacts,
  type ClaudeFileInfo,
  type ClaudeFileSystem,
  type SessionFacts,
  type SessionListOptions,
  type SessionReader,
} from './types';
export {
  isPathInside,
  normalizePath,
  pathCandidates,
  pathKey,
  projectNameOf,
  resolveProjectPath,
  slugForPath,
  slugMatchesDir,
  vaultPath,
  type ResolveProjectOptions,
  type ResolvedProject,
} from './paths';
export {
  PATH_FIELDS,
  cleanPromptText,
  clip,
  isPrompt,
  isSemantic,
  isToolResult,
  recordText,
  summaryOf,
  toolCallsOf,
  toolFilePaths,
  toolResultOf,
  type ClaudeContentBlock,
  type ClaudeRecord,
  type ClaudeToolCall,
} from './records';
export {
  parseJsonlChunk,
  readSessionFacts,
  type FactsOptions,
  type JsonlChunk,
  type ParseOptions,
} from './jsonl';
export { ClaudeSessionReader, claudeProjectsDir, type ClaudeReaderOptions } from './reader';
export {
  linkSessions,
  sessionTouches,
  type LinkMatch,
  type LinkOptions,
  type LinkableProject,
  type SessionLinking,
} from './link';
export { nodeClaudeFileSystem } from './node-adapters';
