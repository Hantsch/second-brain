/**
 * Die Beschriftungen der Befunde.
 *
 * `GardenerFinding.title`/`detail` und `GardenerFix.label` sind im IPC-Vertrag
 * fertige Saetze, kein Code — der Screen soll einen Befund vorlesen koennen, ohne
 * ihn zu deuten. Der Kern waehlt aber keine Sprache: deshalb sind die Texte
 * **einsetzbar** (genau wie `RecentWorkLabels` im Ueberblick), mit Deutsch als
 * Vorgabe. Das englische Gegenstueck liegt im Main (`src/main/gardener-labels.ts`),
 * weil `src/core/` die Sprache der Oberflaeche nicht kennt.
 *
 * Ton wie ueberall: Aussagen statt Ausrufe, Sentence case, keine Emoji. Jeder Satz
 * nennt die Sache und, wo es hilft, die Folge — nie eine Vermutung.
 */

import type { GardenerFindingKind, GardenerFix } from '@shared/types';

/** Titel und Erklaerung eines Befunds. */
export interface FindingText {
  title: string;
  detail: string;
}

/** Welche Art von Katalog-Drift vorliegt. */
export type IndexDriftKind =
  /** Das Modul hat gar keinen Katalog — `wiki/index.md` fehlt. */
  | 'no-catalog'
  /** Die Seite gibt es, im Katalog fehlt sie. */
  | 'missing'
  /** Der Eintrag steht da, aber ohne Einzeiler. */
  | 'summary'
  /** Der Eintrag steht in einer Rubrik, die nicht zum Seitentyp passt. */
  | 'category'
  /** Der Eintrag zeigt auf eine Seite, die es nicht mehr gibt. */
  | 'stale-entry';

export interface GardenerLabels {
  orphan(page: string): FindingText;
  brokenLink(page: string, target: string, line: number | null): FindingText;
  indexDrift(page: string, drift: IndexDriftKind): FindingText;
  stalePage(page: string, reviewed: string, ageDays: number): FindingText;
  unfiledDump(dump: string, ageDays: number): FindingText;
  unprocessedSource(source: string): FindingText;
  projectWithoutNextStep(project: string, status: string): FindingText;
  nearDuplicate(first: string, second: string, similarity: number): FindingText;
  missingPage(term: string, pages: number): FindingText;
  contradiction(first: string, second: string, note: string, named: boolean): FindingText;
  /**
   * Beschriftung des Knopfs. Sie sagt, was **passiert** — die drei Aktionen, die
   * nichts schreiben, heissen deshalb „oeffnen" und nicht „einordnen".
   */
  fix(action: GardenerFix['action'], kind?: GardenerFindingKind): string;
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/**
 * Tage nach „seit" — also im Dativ. Beide Verwender schreiben „seit X", und
 * „seit 19 Tage" ist ein Satz, den niemand so sagt; auf dem Pflege-Screen stand
 * er in jeder zweiten Zeile.
 */
function daysAgo(count: number): string {
  return count === 1 ? '1 Tag' : `${count} Tagen`;
}

const GERMAN_FIX_LABELS: Record<GardenerFix['action'], string> = {
  'add-to-index': 'In den Katalog eintragen',
  'add-links': 'Verweis eintragen',
  'mark-reviewed': 'Als geprüft markieren',
  /* Führt zusammen wird nichts — die beiden Seiten gehen nur auf. */
  merge: 'Beide Seiten vergleichen',
  /* Ordnet nichts ein und verdichtet nichts: öffnet den Ort, an dem es passiert. */
  'open-classify': 'Zum Einordnen öffnen',
  'open-ingest': 'Zum Verdichten öffnen',
};

const GERMAN_DRIFT: Record<IndexDriftKind, (page: string) => FindingText> = {
  'no-catalog': (module) => ({
    title: `Modul ohne Katalog: ${module}`,
    detail:
      'Die Datei wiki/index.md fehlt. Ohne Katalog ist der Einstieg in das Modul nur die Ordnerliste.',
  }),
  missing: (page) => ({
    title: `Fehlt im Katalog: ${page}`,
    detail:
      'Die Seite gibt es, im index.md des Moduls steht sie nicht. Wer den Katalog liest, findet sie nicht.',
  }),
  summary: (page) => ({
    title: `Katalogeintrag ohne Einzeiler: ${page}`,
    detail:
      'Der Eintrag im index.md nennt nur den Namen. Ein Einzeiler sagt, was auf der Seite steht.',
  }),
  category: (page) => ({
    title: `Katalogeintrag in der falschen Rubrik: ${page}`,
    detail:
      'Der Eintrag steht unter einer Rubrik, die nicht zum Seitentyp passt. Verschieben tut das nur ein Mensch.',
  }),
  'stale-entry': (page) => ({
    title: `Katalogeintrag ohne Seite: ${page}`,
    detail:
      'Im index.md steht ein Eintrag, zu dem es keine Seite gibt. Die Zeile bleibt stehen, bis jemand entscheidet.',
  }),
};

/** Vorgabe auf Deutsch. */
export const GERMAN_GARDENER_LABELS: GardenerLabels = {
  orphan(page: string): FindingText {
    return {
      title: `Verwaiste Seite: ${page}`,
      detail:
        'Keine andere Wiki-Seite verlinkt hierher. Der Katalog zählt nicht als Verweis — über Links wird die Seite nicht gefunden.',
    };
  },

  brokenLink(page: string, target: string, line: number | null): FindingText {
    const place = line === null ? page : `${page}, Zeile ${line}`;
    return {
      title: `Kaputter Wikilink: [[${target}]]`,
      detail: `${place} verweist auf [[${target}]] — diese Seite gibt es im Modul nicht.`,
    };
  },

  indexDrift(page: string, drift: IndexDriftKind): FindingText {
    return GERMAN_DRIFT[drift](page);
  },

  stalePage(page: string, reviewed: string, ageDays: number): FindingText {
    return {
      title: `Seit ${daysAgo(ageDays)} nicht geprüft: ${page}`,
      detail: `Zuletzt geprüft am ${reviewed}. Ob der Stand noch gilt, weiß nur ein Mensch.`,
    };
  },

  unfiledDump(dump: string, ageDays: number): FindingText {
    return {
      title: `Liegt seit ${daysAgo(ageDays)} in der Inbox: ${dump}`,
      detail:
        'Noch nicht eingeordnet. Ein Dump, den niemand ablegt, ist ein Gedanke, der verfällt.',
    };
  },

  unprocessedSource(source: string): FindingText {
    return {
      title: `Quelle ohne Verdichtung: ${source}`,
      detail:
        'Die Rohquelle liegt unter raw/, eine Source-Seite im Wiki gibt es nicht. Unverdichtet ist sie nicht zitierfähig.',
    };
  },

  projectWithoutNextStep(project: string, status: string): FindingText {
    return {
      title: `Projekt ohne nächsten Schritt: ${project}`,
      detail: `Status ${status}. Ohne nächsten Schritt fehlt der Satz, der den Wiedereinstieg trägt.`,
    };
  },

  nearDuplicate(first: string, second: string, similarity: number): FindingText {
    return {
      title: `Beinahe-Dublette: ${first} und ${second}`,
      detail: `${percent(similarity)} gemeinsame Wortfolgen. Zusammengeführt wird nichts automatisch — das entscheidet ein Mensch.`,
    };
  },

  missingPage(term: string, pages: number): FindingText {
    return {
      title: `Begriff ohne eigene Seite: ${term}`,
      detail: `Kommt in ${pages} Seiten des Moduls vor, hat aber keine Seite. Ein Kandidat, kein Auftrag.`,
    };
  },

  contradiction(first: string, second: string, note: string, named: boolean): FindingText {
    return {
      title: `Widerspruch: ${first} und ${second}`,
      detail: named
        ? `${note} Der Widerspruch ist auf der Seite benannt und bleibt stehen.`
        : `${note} Beide Fassungen bleiben stehen; benannt wird der Konflikt, nicht geglättet.`,
    };
  },

  fix(action: GardenerFix['action'], kind?: GardenerFindingKind): string {
    /* Dieselbe Aktion, zwei Anlässe: bei einem Widerspruch wird nicht „ein
       Verweis" eingetragen, sondern der Konflikt benannt. */
    if (action === 'add-links' && kind === 'contradiction') return 'Widerspruch benennen';
    return GERMAN_FIX_LABELS[action];
  },
};
