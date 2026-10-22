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
  noEvidenceMarker,
  NO_EVIDENCE_MARKER,
  type QueryAnswerInput,
  type QueryExcerpt,
} from './query-answer';
export {
  summarizeSourcePrompt,
  mergeSummariesPrompt,
  mergeSummariesClampedChars,
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
  type JournalChatInput,
  type JournalChatMode,
} from './journal-chat';
export { journalClosePrompt, JOURNAL_CLOSE_SCHEMA, type JournalCloseInput } from './journal-close';
export {
  journalLooseEndsPrompt,
  JOURNAL_LOOSE_ENDS_SCHEMA,
  MAX_LOOSE_END_DAY_CHARS,
  MAX_LOOSE_END_PROPOSALS,
  MAX_LOOSE_END_SUBJECT_WORDS,
  type JournalLooseEndsInput,
  type KnownLooseEndInput,
  type LooseEndDayInput,
} from './journal-loose-ends';
export {
  journalInterviewFollowupPrompt,
  type JournalInterviewFollowupInput,
} from './journal-interview';
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
  condenseAreaPrompt,
  CONDENSE_AREA_SCHEMA,
  CONDENSE_AREA_TARGET_CHARS,
  CONDENSE_AREA_TARGET_WORDS,
  type CondenseAreaInput,
  type CondenseAreaSourceItem,
} from './condense-area';
export {
  condenseProjectPrompt,
  CONDENSE_PROJECT_ITEM_CHARS,
  CONDENSE_PROJECT_SCHEMA,
  promptItemsClampedChars,
  type CondenseProjectInput,
  type CondenseProjectSourceItem,
} from './condense-project';
export {
  condenseModulePrompt,
  CONDENSE_MODULE_SCHEMA,
  type CondenseModuleInput,
  type CondenseModuleSourceItem,
} from './condense-module';
export {
  clamp,
  CONDENSE_SOFT_CAP_CHARS,
  CONDENSE_SOFT_CAP_WORDS,
  documentLanguageRule,
  formatExcerpts,
  replyLanguageRule,
  turns,
  type PromptExcerpt,
} from './shared';
