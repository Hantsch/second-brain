/**
 * Oeffentliche Oberflaeche des Wissens-Kerns. Andere Module importieren von hier,
 * nicht aus den Einzeldateien.
 *
 * Der Weg einer Quelle, in dieser Reihenfolge:
 *   `module`     Modul anlegen — Ordner, Katalog, Chronik, Synthese, AGENTS.md
 *   `chunk`      lange Quellen in verdichtbare Stuecke schneiden
 *   `summarize`  einmal verdichten (oder ehrlich nichts, wenn kein Modell steht)
 *   `ingest`     Source-Seite, Entitaeten, Konzepte, Katalog, Chronik
 *                — je Modul serialisiert (`module-lock`), jeder Schreibvorgang
 *                  mit Hash und begrenztem zweiten Versuch (`write-retry`)
 *   `ask`        Frage → Ausschnitte → Antwort mit gepruefeten Belegen
 *   `file-back`  gute Antwort als Seite ablegen — so fuettern Fragen das Wissen
 */

export { MODULE_SCHEMA_TEMPLATE, SCHEMA_TITLE_LINE, renderAgentsMd } from './agents-md';
export { CHUNK_OVERLAP_CHARS, MAX_CHUNK_CHARS, splitForSummary, type ChunkOptions } from './chunk';
export {
  MIN_QUOTE_CHARS,
  citationsFromExcerpts,
  citedTargets,
  lineOfQuote,
  quotedSpans,
  validateCitations,
  type CitationCheck,
  type CitationSource,
} from './citations';
export {
  EXCERPT_CHARS,
  EXCERPT_LINES,
  buildExcerpt,
  questionTerms,
  type ExcerptOptions,
  type ExcerptSlice,
} from './excerpts';
export {
  diffIndex,
  entryLine,
  parseIndex,
  removeEntries,
  upsertEntries,
  type IndexDiff,
  type IndexDiffPage,
  type RemoveOptions,
  type UpsertOptions,
  type WikiIndexEntry,
} from './index-md';
export {
  appendLog,
  formatLogEntry,
  lastIngestDay,
  logHeader,
  parseLog,
  type AppendLogOptions,
  type ParsedLogEntry,
  type WikiLogEntry,
  type WikiLogKind,
} from './log-md';
export { withModuleLock } from './module-lock';
export {
  MAX_WRITE_ATTEMPTS,
  writeTextWithRetry,
  type CurrentText,
  type WriteRetryOptions,
} from './write-retry';
export {
  agentsPath,
  createModule,
  listModules,
  type CreateModuleInput,
  type CreateModuleOptions,
  type CreateModuleResult,
} from './module';
export {
  appendParagraph,
  appendUnderSection,
  createPage,
  findPage,
  findSourcePageForRaw,
  mergeSources,
  pageFrontmatter,
  pageKey,
  pagePath,
  pageRefOf,
  readPage,
  writePage,
  type CreatePageInput,
  type FindPageDeps,
  type FindSourcePageDeps,
  type WikiPageDoc,
  type WritePageInput,
} from './pages';
export {
  MAX_PATCH_CHARS,
  MAX_SUGGESTIONS,
  cleanPatch,
  readIngestReply,
  suggestionSlug,
  type IngestReply,
  type WikiSuggestion,
} from './suggestions';
export {
  applySuggestions,
  sourceRef,
  type AppliedPage,
  type ApplySuggestionsInput,
  type ApplySuggestionsResult,
} from './apply-suggestions';
export {
  cleanMarkdown,
  condenseSource,
  summarySections,
  type CondenseInput,
  type CondenseResult,
} from './summarize';
export { isRawDigestedInto, markRawProtocol, protocolPaths } from './raw-protocol';
export { WikiTransaction, type WikiRollbackResult } from './transaction';
export { ingestSource, knownPages, type IngestSourceInput } from './ingest';
export {
  CANDIDATE_FACTOR,
  DEFAULT_RETRIEVE_LIMIT,
  MAX_CANDIDATES,
  askQuestion,
  retrieve,
  type AskInput,
  type RetrieveOptions,
} from './ask';
export { QUERY_RERANK_SCHEMA, applyOrder, rerankPrompt, type RerankCandidate } from './rerank';
export { fileBack, linkifyAnswer, type FileBackInput, type FileBackResult } from './file-back';
export { CATEGORY_ORDER, categoryHeading, categoryTypeOf, phrases, type WikiPhrases } from './text';
export {
  WikiError,
  type PageRef,
  type WikiAnswer,
  type WikiContradiction,
  type WikiDeps,
  type WikiExcerpt,
  type WikiIndexView,
  type WikiIngestDeps,
  type WikiIngestResult,
  type WikiOptions,
  type WikiStore,
  type WikiTxStore,
  type WikiWriteInput,
} from './types';
