/**
 * Public surface of the Codex trail's record/facts layer. Other modules
 * import from here.
 *
 *   `records`  interpreting one JSONL line
 *   `jsonl`    reading head and tail windows without loading the whole file
 *   `reader`   CodexSessionReader — directory walk, session listing
 */

export {
  contextWindowOf,
  cwdOf,
  gitBranchOf,
  isReasoning,
  isSemantic,
  isSessionMeta,
  isTokenCountEvent,
  isTurnContext,
  isUserMessageEvent,
  isUserTurn,
  modelOf,
  recordText,
  sessionIdOf,
  toolCallOf,
  toolOutputOf,
  totalTokensOf,
  type CodexRecord,
  type CodexToolCall,
} from './records';
export {
  CODEX_HEAD_BYTES,
  CODEX_HEAD_LINES,
  CODEX_TAIL_BYTES,
  emptyCodexFacts,
  parseJsonlChunk,
  readSessionFacts,
  type CodexSessionFacts,
  type FactsOptions,
  type JsonlChunk,
  type ParseOptions,
} from './jsonl';
export {
  CODEX_INDEX_BYTES,
  CodexSessionReader,
  codexSessionsDir,
  type CodexReaderOptions,
  type CodexSessionSummary,
} from './reader';
