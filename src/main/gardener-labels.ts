/* Die englischen Beschriftungen der Pflege-Befunde.

   `GardenerFinding.title`/`detail` und `GardenerFix.label` sind im IPC-Vertrag
   fertige Sätze, kein Code (dieselbe Entscheidung wie bei `RecentWorkItem.detail`,
   siehe `messages.ts`). Der Kern lässt die Texte einsetzen und stellt Deutsch als
   Vorgabe; das englische Gegenstück steht hier, weil `src/core/` die Sprache der
   Oberfläche nicht kennt.

   Eigene Datei und nicht in `messages.ts`: das sind über neunzig Zeilen Text zu
   einem Bereich, und `messages.ts` soll die zwei kurzen Ausnahmen des Main
   bleiben, die man in einem Blick liest.

   Ton wie überall: Aussagen statt Ausrufe, sentence case, keine Emoji. Jeder Satz
   nennt die Sache und, wo es hilft, die Folge — nie eine Vermutung. Und keine
   Beschriftung verspricht mehr, als `core/gardener/fixes.ts` tut: die drei
   Aktionen, die nichts schreiben, heißen „open" und nicht „file". */

import { GERMAN_GARDENER_LABELS } from '@core/gardener';
import type { FindingText, GardenerLabels, IndexDriftKind } from '@core/gardener';
import type { GardenerFindingKind, GardenerFix, UiLanguage } from '@shared/types';

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function days(count: number): string {
  return count === 1 ? '1 day' : `${count} days`;
}

const ENGLISH_FIX_LABELS: Record<GardenerFix['action'], string> = {
  'add-to-index': 'Add to the catalogue',
  'add-links': 'Add a reference',
  'mark-reviewed': 'Mark as reviewed',
  /* Nothing is merged — the two pages only open. */
  merge: 'Compare both pages',
  /* Files nothing and distils nothing: opens the place where that happens. */
  'open-classify': 'Open for sorting',
  'open-ingest': 'Open for distilling',
};

const ENGLISH_DRIFT: Record<IndexDriftKind, (page: string) => FindingText> = {
  'no-catalog': (module) => ({
    title: `Module without a catalogue: ${module}`,
    detail:
      'The file wiki/index.md is missing. Without a catalogue the only way into the module is the folder listing.',
  }),
  missing: (page) => ({
    title: `Missing from the catalogue: ${page}`,
    detail:
      'The page exists, the index.md of the module does not list it. Whoever reads the catalogue will not find it.',
  }),
  summary: (page) => ({
    title: `Catalogue entry without a one-liner: ${page}`,
    detail: 'The entry in index.md names only the page. A one-liner says what is on it.',
  }),
  category: (page) => ({
    title: `Catalogue entry in the wrong section: ${page}`,
    detail:
      'The entry sits under a section that does not match the page type. Only a person moves it.',
  }),
  'stale-entry': (page) => ({
    title: `Catalogue entry without a page: ${page}`,
    detail:
      'The index.md lists an entry with no page behind it. The line stays until someone decides.',
  }),
};

/** Das Gegenstück zu `GERMAN_GARDENER_LABELS`, Satz für Satz. */
export const ENGLISH_GARDENER_LABELS: GardenerLabels = {
  orphan(page: string): FindingText {
    return {
      title: `Orphaned page: ${page}`,
      detail:
        'No other wiki page links here. The catalogue does not count as a reference — through links this page is unreachable.',
    };
  },

  brokenLink(page: string, target: string, line: number | null): FindingText {
    const place = line === null ? page : `${page}, line ${line}`;
    return {
      title: `Broken wikilink: [[${target}]]`,
      detail: `${place} points at [[${target}]] — that page does not exist in the module.`,
    };
  },

  indexDrift(page: string, drift: IndexDriftKind): FindingText {
    return ENGLISH_DRIFT[drift](page);
  },

  stalePage(page: string, reviewed: string, ageDays: number): FindingText {
    return {
      title: `Not reviewed for ${days(ageDays)}: ${page}`,
      detail: `Last reviewed on ${reviewed}. Whether it still holds is a human judgement.`,
    };
  },

  unfiledDump(dump: string, ageDays: number): FindingText {
    return {
      title: `Sitting in the inbox for ${days(ageDays)}: ${dump}`,
      detail: 'Not sorted yet. A dump nobody files is a thought that expires.',
    };
  },

  unprocessedSource(source: string): FindingText {
    return {
      title: `Source without a distillation: ${source}`,
      detail:
        'The raw source sits under raw/, a source page in the wiki does not exist. Undistilled it cannot be cited.',
    };
  },

  looseEnd(quote: string, day: string): FindingText {
    return {
      title: `Loose end from ${day}: "${quote}"`,
      detail: `Announced on ${day}, nothing since. The day has come and gone, and it isn't visibly settled.`,
    };
  },

  projectWithoutNextStep(project: string, status: string): FindingText {
    return {
      title: `Project without a next step: ${project}`,
      detail: `Status ${status}. Without a next step the sentence that carries the return is missing.`,
    };
  },

  nearDuplicate(first: string, second: string, similarity: number): FindingText {
    return {
      title: `Near duplicate: ${first} and ${second}`,
      detail: `${percent(similarity)} of the word sequences are shared. Nothing is merged automatically — a person decides that.`,
    };
  },

  missingPage(term: string, pages: number): FindingText {
    return {
      title: `Term without its own page: ${term}`,
      detail: `Appears on ${pages} pages of the module but has no page. A candidate, not an order.`,
    };
  },

  contradiction(first: string, second: string, note: string, named: boolean): FindingText {
    return {
      title: `Contradiction: ${first} and ${second}`,
      detail: named
        ? `${note} The contradiction is named on the page and stays.`
        : `${note} Both versions stay; the conflict gets named, not smoothed over.`,
    };
  },

  fix(action: GardenerFix['action'], kind?: GardenerFindingKind): string {
    /* Same action, two occasions: for a contradiction it is not „a reference"
       that gets added but the conflict that gets named. */
    if (action === 'add-links' && kind === 'contradiction') return 'Name the contradiction';
    return ENGLISH_FIX_LABELS[action];
  },
};

/** Beschriftungen der Befunde in der Sprache der Oberfläche. */
export function gardenerLabels(language: UiLanguage): GardenerLabels {
  return language === 'en' ? ENGLISH_GARDENER_LABELS : GERMAN_GARDENER_LABELS;
}
