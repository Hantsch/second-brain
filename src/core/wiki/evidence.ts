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
import { ALL_DOC_TYPES, VAULT_DIRS } from '@shared/types';
import { baseName, dirName, joinVaultPath, wikiIndexPath, wikiLogPath } from '@core/vault/paths';
import { YOUTUBE_FILES } from '@core/ingest/youtube/writer';
import { agentsPath } from './module';

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

/**
 * Files that are machinery, not knowledge: a module's schema (`AGENTS.md`), its
 * catalog (`wiki/index.md`) and its chronicle (`wiki/log.md`). They name every
 * topic of their module, so they match every question about it and answer none.
 */
function isModuleMachinery(path: string): boolean {
  const [root, slug] = path.split('/');
  if (root !== VAULT_DIRS.modules || slug === undefined) return false;
  return path === agentsPath(slug) || path === wikiIndexPath(slug) || path === wikiLogPath(slug);
}

/**
 * The prose transcript of a YouTube source, when its timestamped twin exists: both
 * hold the same words, and the timestamped one is the file meant for citing — every
 * line links to its second in the video. Two copies of one sentence are one excerpt
 * too many.
 */
function isShadowedTranscript(path: string, exists: (path: string) => boolean): boolean {
  if (baseName(path) !== YOUTUBE_FILES.transcript) return false;
  return exists(joinVaultPath(dirName(path), YOUTUBE_FILES.transcriptTimestamped));
}

/** Whether a file never counts as evidence, whatever its type. `exists` looks up the index. */
export function isEvidenceExcludedPath(path: string, exists: (path: string) => boolean): boolean {
  return isModuleMachinery(path) || isShadowedTranscript(path, exists);
}

/**
 * The source a file belongs to: a raw source kept as a folder (`raw/youtube/<id>/`,
 * `raw/files/<dir>/`) is one source however many files it holds; any other file is
 * its own. The per-document excerpt cap counts per source.
 */
export function evidenceSourceOf(path: string): string {
  const segments = path.split('/');
  if (segments[0] !== VAULT_DIRS.raw || segments.length < 4) return path;
  return segments.slice(0, 3).join('/');
}
