/**
 * Welche Dokumenttypen niemals als Beleg zitiert werden.
 *
 * Guardrail 3 in CLAUDE.md ("keine Halluzinationen") und Konzept O9 verlangen, dass
 * eine Antwort nur aus Primaerquellen belegt wird. `condensed`-Dokumente sind vom
 * Modell geschriebene Zusammenfassungen anderer Dateien — wuerde man sie als Beleg
 * zitieren, wuerde eine Maschinen-Zusammenfassung als eigene Notiz des Nutzers
 * ausgegeben. Ein kuenftiger weiterer maschinengeschriebener Typ wird hier als
 * zusaetzlicher Eintrag ergaenzt, nicht als eigene Pruefung an anderer Stelle.
 */
import type { DocType } from '@shared/types';
import { ALL_DOC_TYPES } from '@shared/types';

/** Dokumenttypen, die nie als Beleg fuer eine Antwort zitiert werden duerfen. */
/* `overview`: the module overview is a condensed artifact of its own wiki pages —
   citing it would pass a model's digest off as evidence, the pages themselves are
   the evidence (story 081). */
export const EVIDENCE_EXCLUDED_TYPES: readonly DocType[] = ['condensed', 'overview'];

/** Ob ein Dokumenttyp von der Beleg-Zitierung ausgeschlossen ist. */
export function isEvidenceExcluded(type: DocType): boolean {
  return EVIDENCE_EXCLUDED_TYPES.includes(type);
}

/**
 * Dokumenttypen, die als Beleg in Frage kommen: die angefragten Typen (oder alle,
 * wenn keine angegeben sind) minus die ausgeschlossenen Typen.
 */
export function evidenceTypesFor(requested?: readonly DocType[]): DocType[] {
  return (requested ?? ALL_DOC_TYPES).filter((type) => !isEvidenceExcluded(type));
}
