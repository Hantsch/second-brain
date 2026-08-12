/**
 * Oeffentliche Oberflaeche des Pflege-Kerns. Andere Module importieren von hier.
 *
 *   `report`   ein Lauf: Checks, optionale Deutung, Gesundheit, Ordnung
 *   `checks/`  die deterministischen Pruefungen, eine Datei je Befundart
 *   `audit`    die optionale LLM-Deutung, hart gegen den Index geprueft
 *   `health`   der Gesundheitswert 0..100 mit seiner Aufschluesselung
 *   `fixes`    die Ein-Klick-Korrekturen — jede rueckgaengig machbar
 *   `labels`   die einsetzbaren Beschriftungen, Vorgabe Deutsch
 *
 * Der Kern liest den Bestand nur ueber den Index und schreibt nur ueber den Store.
 * Ohne Modell fehlt das Urteil, nicht die Pflege.
 */

export {
  MAX_ADVICE_CHARS,
  MAX_AUDIT_PAGES,
  MAX_NOTE_CHARS,
  auditFindings,
  auditPages,
  type AuditOptions,
  type AuditResult,
} from './audit';
export {
  MAX_SUMMARY_CHARS,
  catalogEntry,
  catalogLine,
  catalogSummary,
  summaryOfBody,
} from './catalog';
export {
  CHECKS,
  MAX_CANDIDATE_TERMS,
  MAX_PAGES_PER_SHINGLE,
  MAX_PAIRS_PER_MODULE,
  MAX_SHINGLES_PER_PAGE,
  MAX_TERMS_PER_MODULE,
  MAX_TERM_WORDS,
  MIN_SHINGLES,
  MIN_TERM_CHARS,
  MIN_TERM_PAGES,
  NEAR_DUPLICATE_THRESHOLD,
  brokenLinkCheck,
  checkedDay,
  indexDriftCheck,
  missingPageCheck,
  nearDuplicateCheck,
  orphanCheck,
  projectWithoutNextStepCheck,
  stalePageCheck,
  unfiledDumpCheck,
  unprocessedSourceCheck,
} from './checks';
export { applyFix, type FixDeps, type FixResult } from './fixes';
export { FULL_ROT_PENALTY_PER_UNIT, healthScore, vaultSize, type HealthResult } from './health';
export {
  GERMAN_GARDENER_LABELS,
  type FindingText,
  type GardenerLabels,
  type IndexDriftKind,
} from './labels';
export {
  CONTRADICTION_HEADINGS,
  RELATION_FIELDS,
  contradictionLine,
  namesContradiction,
  pageSlugOf,
  relatedLine,
  relationSlugs,
} from './relations';
export {
  buildContext,
  moduleViews,
  runGardener,
  sortFindings,
  type GardenerDeps,
  type GardenerRunOptions,
} from './report';
export {
  MIN_WORD_CHARS,
  SHINGLE_SIZE,
  boldSpans,
  contentWords,
  isContentWord,
  jaccard,
  linkTexts,
  plainText,
  shingles,
  termKey,
} from './similarity';
export {
  DEFAULT_REVIEW_AFTER_DAYS,
  DEFAULT_UNFILED_AFTER_DAYS,
  GardenerError,
  SEVERITY_ORDER,
  SEVERITY_WEIGHT,
  buildFinding,
  buildFix,
  findingId,
  limits,
  type Check,
  type FindingInput,
  type GardenerContext,
  type GardenerIndexData,
  type GardenerIndexView,
  type GardenerLimits,
  type GardenerModuleView,
  type GardenerSettingsLike,
} from './types';
export {
  fixJournalPath,
  parseFixJournal,
  undoFix,
  writeFixJournal,
  type FixJournal,
  type FixStep,
  type UndoFixResult,
} from './undo';
export { WordIndex } from './word-index';
