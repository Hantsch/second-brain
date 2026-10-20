/**
 * How a condensation run states that it read only **part** of its inputs
 * (AC 5). Extracted from `run.ts` and `src/main/ipc/condense.ts` (story 044,
 * D11) so the sentence exists once for both levels instead of a third time.
 *
 * Two shapes, on purpose:
 *
 * - `areaTruncationNotice()` / `projectTruncationNotice()` go into the artifact
 *   **body**, prefixed with `TRUNCATION_MARKER` so the next run can strip the
 *   previous one instead of stacking notices onto the preamble the artifact
 *   module carries through verbatim.
 * - `partialInputsNote()` is the same fact for a **proposal** shown in the UI
 *   (`CondenseProposal.partialInputs`) — no marker, because it never lands in a
 *   file, and it speaks of the proposal rather than of the condensation.
 *
 * Every sentence is written from the deterministic selector's own report, never
 * asked of the model (Decision D8 of story 037, restated for 044), and always
 * in the **document** language — the artifact is a vault file, not UI.
 */

import type { DocLanguage } from '@shared/types';
import { CONDENSE_DAY_WINDOW_DAYS } from './inputs';
import type { CondenseTruncationReport } from './inputs';
import { CONDENSE_SESSION_LIMIT, CONDENSE_SESSION_TAIL_CHARS } from './inputs-project';
import type { CondenseProjectTruncationReport } from './inputs-project';

/**
 * Marks a run's own truncation sentence in the artifact preamble. An HTML
 * comment because it must be invisible when the file is rendered, yet
 * recognisable to the next run.
 */
export const TRUNCATION_MARKER = '<!-- condense:truncation -->';

/** `<marker> <lead>: <detail>` — the notice as it stands in the artifact body. */
function notice(detail: string, docLanguage: DocLanguage): string {
  const lead =
    docLanguage === 'en'
      ? 'This condensation did not read every available input'
      : 'Diese Verdichtung hat nicht alle verfügbaren Eingaben gelesen';
  return `${TRUNCATION_MARKER} ${lead}: ${detail}`;
}

/**
 * The one sentence for "characters trimmed to fit the model's input budget" —
 * shared by `projectTruncationNotice()` (condense/project level) and the source
 * page's own notice (story 050, D6): both cut on the same reason, a prompt-level
 * per-item or per-merge clamp, not the deterministic selector's read bound.
 * Returns `''` when nothing was cut, so a caller can fold the result straight
 * into a `parts` list without an extra `> 0` check at the call site.
 */
function promptClampDetail(clampedChars: number, docLanguage: DocLanguage): string {
  if (clampedChars <= 0) return '';
  return docLanguage === 'en'
    ? `${clampedChars} characters trimmed from what was shown to the model, to fit its input budget`
    : `${clampedChars} Zeichen beim Einreichen ans Modell gekürzt, um dessen Eingabe-Budget einzuhalten`;
}

/**
 * The full notice line for a prompt-level clamp alone — the source page's case,
 * where there is no selector report to combine it with (unlike
 * `projectTruncationNotice`, which folds this same sentence in among others).
 * Empty when nothing was cut, for the same reason `projectTruncationNotice`
 * defends against an empty `parts`: a future caller should get `''`, not a
 * malformed "…: were left out.".
 */
export function promptClampNotice(clampedChars: number, docLanguage: DocLanguage): string {
  const detail = promptClampDetail(clampedChars, docLanguage);
  return detail === '' ? '' : notice(leftOut([detail], docLanguage), docLanguage);
}

/** The closing verb of a detail: "… were left out." / „… blieben außen vor.“ */
function leftOut(parts: readonly string[], docLanguage: DocLanguage): string {
  return docLanguage === 'en'
    ? `${parts.join(', ')} were left out.`
    : `${parts.join(', ')} blieben außen vor.`;
}

function dayPart(count: number, docLanguage: DocLanguage): string {
  return docLanguage === 'en'
    ? `${count} day ${count === 1 ? 'entry' : 'entries'} older than ${CONDENSE_DAY_WINDOW_DAYS} days`
    : `${count} ${count === 1 ? 'Tageseintrag' : 'Tageseinträge'} älter als ${CONDENSE_DAY_WINDOW_DAYS} Tage`;
}

/** The area run's notice: only the 90-day window can cut anything there. */
export function areaTruncationNotice(
  report: CondenseTruncationReport,
  docLanguage: DocLanguage,
): string {
  return notice(leftOut([dayPart(report.count, docLanguage)], docLanguage), docLanguage);
}

/**
 * The project run's notice. Four bounds can cut (D14/D15, plus the prompt's own
 * per-item cap added after the story-review found it silently un-counted): the
 * detail names each one that did — a single count would leave the reader
 * guessing which material is missing.
 *
 * `report` is the selector's own read-side bound (D6); `promptClampedChars` is
 * a second, independent bound — how much of what was read verbatim the prompt
 * still had to shorten to fit the model's input budget (`CONDENSE_PROJECT_ITEM_CHARS`
 * in `llm/prompts/condense-project.ts`). Either alone, or both together, can
 * make this notice non-empty, so `report` may be `null` while
 * `promptClampedChars` is still positive.
 */
export function projectTruncationNotice(
  report: CondenseProjectTruncationReport | null,
  docLanguage: DocLanguage,
  promptClampedChars = 0,
): string {
  const parts: string[] = [];
  if (report !== null) {
    if (report.days > 0) parts.push(dayPart(report.days, docLanguage));
    if (report.sessions > 0) {
      parts.push(
        docLanguage === 'en'
          ? `${report.sessions} session${report.sessions === 1 ? '' : 's'} beyond the ${CONDENSE_SESSION_LIMIT} most recent`
          : `${report.sessions} Session${report.sessions === 1 ? '' : 's'} jenseits der ${CONDENSE_SESSION_LIMIT} jüngsten`,
      );
    }
    if (report.clampedSessions > 0) {
      parts.push(
        docLanguage === 'en'
          ? `${report.transcriptChars} transcript characters past ${CONDENSE_SESSION_TAIL_CHARS} per session`
          : `${report.transcriptChars} Transkriptzeichen jenseits von ${CONDENSE_SESSION_TAIL_CHARS} je Session`,
      );
    }
  }
  const promptClampDetailText = promptClampDetail(promptClampedChars, docLanguage);
  if (promptClampDetailText !== '') parts.push(promptClampDetailText);
  // A defensive empty check: every current caller only invokes this when it
  // already knows something was cut, but the function is re-exported from
  // `condense/index.ts` — a future caller that skips that check should get an
  // empty string, not the malformed "…: were left out." (review fix).
  if (parts.length === 0) return '';
  return notice(leftOut(parts, docLanguage), docLanguage);
}

/**
 * Preamble without the previous run's notice, so notices do not stack up. Only
 * the marked line goes — everything a human wrote above the first heading stays.
 */
export function preambleWithoutNotice(preamble: string): string {
  return preamble
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(TRUNCATION_MARKER))
    .join('\n')
    .trim();
}

/**
 * The same fact for `CondenseProposal.partialInputs`: a short, honest sentence
 * for the UI, without the marker and without naming the window — the count comes
 * from the selector's report, never from the model.
 */
export function partialInputsNote(count: number, docLanguage: DocLanguage): string {
  return docLanguage === 'en'
    ? `This proposal did not read every available input: ${count} day ${count === 1 ? 'entry' : 'entries'} were left out.`
    : `Dieser Vorschlag hat nicht alle verfügbaren Eingaben gelesen: ${count} ${count === 1 ? 'Tageseintrag' : 'Tageseinträge'} blieben außen vor.`;
}
