/**
 * Oeffentliche Oberflaeche des Erfassens. Andere Module importieren von hier,
 * nicht aus den Einzeldateien.
 *
 * Der Weg eines Gedanken, in dieser Reihenfolge:
 *   `dump`      Text → Datei in `inbox/`
 *   `context`   Was der Vault an Zielen hergibt (klein gehalten, Tokens!)
 *   `heuristic` Einordnung ohne Modell — das Fundament, nicht der Notfall
 *   `classify`  Einordnung mit Modell, hart gegen den Kontext geprueft
 *   `apply`     Vorschlag ausfuehren, mit Rueckweg fuer jeden Teilschritt
 *   `tasks`     Todos und Warte-auf aus Text (auch fuer den Tagesabschluss)
 */

export * from './dump';
export {
  FilingError,
  applyFiling,
  discardDump,
  filingBlock,
  removeBlock,
  revertFiling,
  type FilingEdit,
  type FilingOptions,
  type FilingOutcome,
  type FilingStore,
} from './filing';
export {
  EXCERPT_CHARS,
  MAX_MODULES,
  MAX_PROJECTS,
  MAX_TAGS,
  NEAREST_LIMIT,
  buildFilingContext,
  findArea,
  findModule,
  findProject,
  narrowContext,
  type AreaCandidate,
  type CaptureIndex,
  type FilingContext,
  type FilingContextOptions,
  type ModuleCandidate,
  type ProjectCandidate,
} from './context';
export {
  SECTION_DAY,
  SECTION_FACTS,
  SECTION_NOTES,
  SECTION_STATE,
  SECTION_TODOS,
  buildProposal,
  filingAction,
  newProjectSlug,
  todoActions,
  todoBlock,
  todoLine,
  type ProposalDraft,
} from './actions';
export { resolveSection, sectionFor } from './sections';
export {
  MAX_CONFIDENCE,
  heuristicDraft,
  heuristicProposal,
  type HeuristicInput,
} from './heuristic';
export {
  MENTION_WEIGHT,
  findAreaMention,
  findKnownTags,
  findModuleMention,
  findProjectMentions,
  type AreaMention,
  type ProjectMention,
} from './mentions';
export { classifyDump, type ClassifyDeps, type ClassifyStore } from './classify';
export { applyProposal, mergeWaitingOn, type ApplyOptions, type ProposalStore } from './apply';
export { keepDump, undoFiling, type FilingJournal, type UndoStore } from './undo';
export {
  extractTasks,
  heuristicTasks,
  type ExtractTasksDeps,
  type ExtractedTasks,
  type TaskOptions,
} from './tasks';
export {
  addDays,
  findDates,
  germanDay,
  isCalendarDay,
  primaryDate,
  weekdayOf,
  type DateHit,
} from './dates';
export {
  findEntities,
  findUrls,
  findWaitingOn,
  hostOf,
  isTask,
  moodSignals,
  scopeSignals,
  sentences,
  taskText,
  type ScopeSignals,
  type Sentence,
  type WaitingHit,
} from './signals';
