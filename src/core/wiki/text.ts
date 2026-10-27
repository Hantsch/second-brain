/**
 * Wortlaute, die in den Vault geschrieben werden.
 *
 * Der Kern kennt keine Oberflaechensprache — `src/renderer/i18n/` gilt fuer die
 * Oberflaeche. Was in eine Vault-Datei wandert, steht dagegen in der
 * **Dokumentsprache** (`languages.documents`), und die ist ein Parameter. Deshalb
 * liegen Ueberschriften und Startsaetze hier und nicht in de.ts/en.ts.
 *
 * Kategorien in `wiki/index.md` werden beim Lesen tolerant erkannt: ein Vault, der
 * seine Begriffe „Begriffe" nennt, behaelt seine Ueberschrift (siehe index-md.ts).
 */

import type { DocLanguage, WikiPageType } from '@shared/types';
import { fold } from '@core/index/text';

/** Alle Bausteine, aus denen der Wissens-Kern Dateien schreibt. */
export interface WikiPhrases {
  /** Titelzeile von `AGENTS.md`: `# <moduleLabel>: <Titel>`. */
  moduleLabel: string;
  /** Ueberschrift von `wiki/index.md`. */
  catalog: string;
  catalogIntro: string;
  /** Ueberschrift von `wiki/log.md`. */
  chronicle: string;
  chronicleIntro: string;
  categorySource: string;
  categoryEntity: string;
  categoryConcept: string;
  categorySynthesis: string;
  /** Titelzusatz von `wiki/overview.md`. */
  synthesis: string;
  decided: string;
  open: string;
  /** Abschnitt des Katalogs `wiki/index.md`, in dem der Ingest neue Seiten auflistet. */
  pages: string;
  moduleIntro: string;
  moduleScope: string;
  /** Startzeile unter „Abgrenzung": eine Frage, die der Mensch beantwortet. */
  moduleScopeEmpty: string;
  /** Abschnitte einer Source-Seite. */
  about: string;
  claims: string;
  novel: string;
  contradictions: string;
  rawSource: string;
  /** Steht auf einer Source-Seite, die noch kein Modell gesehen hat. */
  notCondensed: string;
  /** Einzeiler im Katalog, solange keine Verdichtung vorliegt. */
  notCondensedShort: string;
  /** Steht auf einer Source-Seite, die aus Beschreibung/Kapiteln statt einem Transcript entstand. */
  builtFromMetadata: string;
  /** Ehrliche Absage, wenn die Suche nichts findet. */
  noEvidence: string;
  /** Ehrliche Absage, wenn kein Modell zugeordnet ist. */
  noModel: string;
  evidence: string;
  /** Einleitung des Widerspruch-Eintrags: `[[s-…]] <contradicts> …`. */
  contradicts: string;
}

const DE: WikiPhrases = {
  moduleLabel: 'Wissens-Modul',
  catalog: 'Katalog',
  catalogIntro:
    'Jede Seite dieses Moduls mit einem Einzeiler. Eigene Zeilen bleiben stehen — die App ergaenzt nur.',
  chronicle: 'Chronik',
  chronicleIntro: 'Append-only: jeder Ingest, jede Frage, jeder Pflegelauf.',
  categorySource: 'Quellen',
  categoryEntity: 'Entitäten',
  categoryConcept: 'Konzepte',
  categorySynthesis: 'Synthese',
  synthesis: 'Synthese',
  decided: 'Was entschieden ist',
  open: 'Was offen ist',
  pages: 'Seiten',
  moduleIntro: 'Was in diesem Modul belegt ist und was noch offen ist.',
  moduleScope: 'Abgrenzung',
  moduleScopeEmpty: 'Noch nicht festgelegt: was gehört hier nicht hinein?',
  about: 'Worum es geht',
  claims: 'Tragende Aussagen',
  novel: 'Was neu ist',
  contradictions: 'Widersprüche',
  rawSource: 'Rohquelle',
  notCondensed: 'Noch nicht verdichtet — braucht ein Modell.',
  notCondensedShort: 'noch nicht verdichtet',
  builtFromMetadata: 'Aus Beschreibung und Kapiteln erstellt, es gab kein Transcript.',
  noEvidence: 'Dazu steht nichts im Vault.',
  noModel:
    'Ich kann die Antwort nicht formulieren — für diese Aufgabe ist kein Modell zugeordnet. Hier sind die Stellen, die zur Frage passen.',
  evidence: 'Belege',
  contradicts: 'widerspricht dieser Seite:',
};

const EN: WikiPhrases = {
  moduleLabel: 'Knowledge module',
  catalog: 'Catalogue',
  catalogIntro:
    'Every page of this module with a one-liner. Your own lines stay — the app only adds.',
  chronicle: 'Chronicle',
  chronicleIntro: 'Append-only: every ingest, every query, every maintenance run.',
  categorySource: 'Sources',
  categoryEntity: 'Entities',
  categoryConcept: 'Concepts',
  categorySynthesis: 'Synthesis',
  synthesis: 'Synthesis',
  decided: 'What is settled',
  open: 'What is open',
  pages: 'Pages',
  moduleIntro: 'What is evidenced in this module and what is still open.',
  moduleScope: 'Scope',
  moduleScopeEmpty: 'Not decided yet: what does not belong here?',
  about: 'What it is about',
  claims: 'Load-bearing claims',
  novel: 'What is new',
  contradictions: 'Contradictions',
  rawSource: 'Raw source',
  notCondensed: 'Not condensed yet — needs a model.',
  notCondensedShort: 'not condensed yet',
  builtFromMetadata: 'Built from the description and chapters — there was no transcript.',
  noEvidence: 'Nothing in the vault covers that.',
  noModel:
    'I cannot phrase an answer — no model is routed to this task. Here are the passages that match the question.',
  evidence: 'Evidence',
  contradicts: 'contradicts this page:',
};

/** Bausteine in der Dokumentsprache. Unbekannte Sprachen fallen auf Deutsch zurueck. */
export function phrases(language: DocLanguage = 'de'): WikiPhrases {
  return language === 'en' ? EN : DE;
}

/** Kategorie-Ueberschrift eines Seitentyps in `wiki/index.md`. */
export function categoryHeading(type: WikiPageType, language: DocLanguage = 'de'): string {
  const text = phrases(language);
  if (type === 'source') return text.categorySource;
  if (type === 'entity') return text.categoryEntity;
  if (type === 'concept') return text.categoryConcept;
  return text.categorySynthesis;
}

/** Reihenfolge der Kategorien im Katalog — stabil, damit Diffs klein bleiben. */
export const CATEGORY_ORDER: readonly WikiPageType[] = ['source', 'entity', 'concept', 'overview'];

/* Geschriebene Ueberschriften beider Sprachen plus gewachsene Varianten. Der
   Seed und der Fixture-Vault nennen die Begriffe „Begriffe" — solche Vaults
   behalten ihre Ueberschrift, statt umbenannt zu werden. */
const ALIASES: Record<string, WikiPageType> = {
  quellen: 'source',
  quelle: 'source',
  sources: 'source',
  source: 'source',
  entitaeten: 'entity',
  entitaet: 'entity',
  entities: 'entity',
  entity: 'entity',
  konzepte: 'concept',
  konzept: 'concept',
  begriffe: 'concept',
  begriff: 'concept',
  concepts: 'concept',
  concept: 'concept',
  synthese: 'overview',
  synthesis: 'overview',
  overview: 'overview',
  uebersicht: 'overview',
};

/** Seitentyp hinter einer Katalog-Ueberschrift; `null`, wenn es eine Nutzerrubrik ist. */
export function categoryTypeOf(heading: string): WikiPageType | null {
  return ALIASES[fold(heading).replace(/[^a-z]/g, '')] ?? null;
}
