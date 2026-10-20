/**
 * Die deterministischen Pruefungen, in der Reihenfolge, in der sie laufen.
 *
 * Jede ist eine eigene Datei, klein und einzeln testbar; jede rechnet nur auf dem
 * Kontext und liest keine Datei. Die Reihenfolge hier ist nur die Reihenfolge der
 * Berechnung — sortiert wird das Ergebnis in `report.ts` nach Schwere und Modul.
 *
 * Ein Kind fehlt in dieser Liste: `contradiction`. Widersprueche sind ein Urteil
 * ueber Inhalt und kommen, wenn ueberhaupt, aus der LLM-Deutung (`audit.ts`).
 */

import type { Check } from '../types';
import { brokenLinkCheck } from './broken-link';
import { condensationDueCheck } from './condensation-due';
import { indexDriftCheck } from './index-drift';
import { looseEndCheck } from './loose-end';
import { missingPageCheck } from './missing-page';
import { nearDuplicateCheck } from './near-duplicate';
import { orphanCheck } from './orphan';
import { projectWithoutNextStepCheck } from './project-without-next-step';
import { stalePageCheck } from './stale-page';
import { unfiledDumpCheck } from './unfiled-dump';
import { unprocessedSourceCheck } from './unprocessed-source';

export const CHECKS: readonly Check[] = [
  brokenLinkCheck,
  orphanCheck,
  indexDriftCheck,
  stalePageCheck,
  nearDuplicateCheck,
  missingPageCheck,
  unprocessedSourceCheck,
  unfiledDumpCheck,
  projectWithoutNextStepCheck,
  looseEndCheck,
  condensationDueCheck,
];

export { brokenLinkCheck } from './broken-link';
export { condensationDueCheck } from './condensation-due';
export { indexDriftCheck } from './index-drift';
export {
  MAX_CANDIDATE_TERMS,
  MAX_TERMS_PER_MODULE,
  MIN_TERM_CHARS,
  MIN_TERM_PAGES,
  MAX_TERM_WORDS,
  missingPageCheck,
} from './missing-page';
export {
  MAX_PAGES_PER_SHINGLE,
  MAX_PAIRS_PER_MODULE,
  MAX_SHINGLES_PER_PAGE,
  MIN_SHINGLES,
  NEAR_DUPLICATE_THRESHOLD,
  nearDuplicateCheck,
} from './near-duplicate';
export { looseEndCheck, looseEndFinding, looseEndInput } from './loose-end';
export { orphanCheck } from './orphan';
export { projectWithoutNextStepCheck } from './project-without-next-step';
export { checkedDay, stalePageCheck } from './stale-page';
export { unfiledDumpCheck } from './unfiled-dump';
export { unprocessedSourceCheck } from './unprocessed-source';
