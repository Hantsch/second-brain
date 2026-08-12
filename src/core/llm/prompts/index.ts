/* Ein Prompt pro Aufgabe. Jede Datei baut aus Eingaben und Sprachen die
   `ChatTurn[]` — und nichts sonst: kein Netz, kein Dateisystem, kein Zustand. */

export { titleTagsPrompt, TITLE_TAGS_SCHEMA, type TitleTagsInput } from './title-tags';
export {
  classifyDumpPrompt,
  CLASSIFY_DUMP_SCHEMA,
  type ClassifyDumpInput,
  type ClassifyModuleHint,
  type ClassifyProjectHint,
} from './classify-dump';
export { extractTasksPrompt, EXTRACT_TASKS_SCHEMA, type ExtractTasksInput } from './extract-tasks';
export {
  queryAnswerPrompt,
  formatQueryExcerpts,
  NO_EVIDENCE_MARKER,
  type QueryAnswerInput,
  type QueryExcerpt,
} from './query-answer';
export {
  summarizeSourcePrompt,
  mergeSummariesPrompt,
  type KnownPageHint,
  type MergeSummariesInput,
  type SummarizeSourceInput,
  type SummarySections,
} from './summarize-source';
export {
  wikiIngestPrompt,
  DEFAULT_MAX_PAGES,
  WIKI_INGEST_SCHEMA,
  type WikiIngestInput,
} from './wiki-ingest';
export {
  journalChatPrompt,
  journalChatSystemPrompt,
  LISTEN_FORBIDDEN,
  type JournalChatInput,
} from './journal-chat';
export { journalClosePrompt, JOURNAL_CLOSE_SCHEMA, type JournalCloseInput } from './journal-close';
export {
  projectStatusPrompt,
  PROJECT_STATUS_SCHEMA,
  type ProjectStatusInput,
  type ProjectStatusMention,
  type ProjectStatusTrace,
} from './project-status';
export {
  gardenerAuditPrompt,
  GARDENER_AUDIT_SCHEMA,
  MAX_ADVICE,
  MAX_EXCERPT_CHARS,
  type AuditFindingInput,
  type AuditPageInput,
  type GardenerAuditInput,
} from './gardener-audit';
export {
  clamp,
  documentLanguageRule,
  formatExcerpts,
  replyLanguageRule,
  turns,
  type PromptExcerpt,
} from './shared';
