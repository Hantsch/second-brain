/**
 * The labels of the findings.
 *
 * `GardenerFinding.title`/`detail` and `GardenerFix.label` are finished
 * sentences in the IPC contract, not code — the screen should be able to
 * read a finding aloud without interpreting it. But the core does not choose
 * a language: that's why the texts are **swappable** (exactly like
 * `RecentWorkLabels` in the overview), with German as the default. The
 * English counterpart lives in main (`src/main/gardener-labels.ts`), because
 * `src/core/` does not know the UI language.
 *
 * Tone as everywhere: statements instead of exclamations, sentence case, no
 * emoji. Every sentence names the thing and, where it helps, the consequence
 * — never a guess.
 */

import type { GardenerFindingKind, GardenerFix } from '@shared/types';

/** Title and explanation of a finding. */
export interface FindingText {
  title: string;
  detail: string;
}

/** Which kind of catalog drift is present. */
export type IndexDriftKind =
  /** The module has no catalog at all — `wiki/index.md` is missing. */
  | 'no-catalog'
  /** The page exists, but is missing from the catalog. */
  | 'missing'
  /** The entry is there, but without a one-liner. */
  | 'summary'
  /** The entry is filed under a category that doesn't match the page type. */
  | 'category'
  /** The entry points to a page that no longer exists. */
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
   * Label of the button. It says what **happens** — the three actions that
   * write nothing are therefore called "open" rather than "file".
   */
  fix(action: GardenerFix['action'], kind?: GardenerFindingKind): string;
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/**
 * Days after "seit" (since) — i.e. in the German dative case. Both callers
 * write "seit X", and "seit 19 Tage" is grammatically wrong German that
 * nobody would say; on the maintenance screen it showed up in every other
 * line.
 */
function daysAgo(count: number): string {
  return count === 1 ? '1 Tag' : `${count} Tagen`;
}

const GERMAN_FIX_LABELS: Record<GardenerFix['action'], string> = {
  'add-to-index': 'In den Katalog eintragen',
  'add-links': 'Verweis eintragen',
  'mark-reviewed': 'Als geprüft markieren',
  /* Nothing gets merged — both pages simply get opened. */
  merge: 'Beide Seiten vergleichen',
  /* Files nothing and condenses nothing: opens the place where it happens. */
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

/** Default in German. */
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
    /* Same action, two occasions: for a contradiction, it's not "a
       reference" being added, but the conflict being named. */
    if (action === 'add-links' && kind === 'contradiction') return 'Widerspruch benennen';
    return GERMAN_FIX_LABELS[action];
  },
};
