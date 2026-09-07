/* Ein echter kleiner Vault für die Tests des Tagebuch-Kerns.
 *
 * Grundlage ist `tests/fixtures/vault/` — darin steht ein Tageseintrag vom
 * 2026-08-10 mit Stimmung, Energie, zwei Personen und einem Coaching-Dialog, dazu
 * ein Arbeits- und ein Privatprojekt. Der Index läuft echt darüber
 * (`IndexService`), damit Suche, Personen und Projektnennungen aus den Dateien
 * kommen und nicht aus einem handgeschriebenen Objekt.
 *
 * Die Uhr steht auf `NOW` (2026-08-10, 14:32 Ortszeit) aus `tests/helpers/time.ts`.
 */

import { IndexService } from '@core/index/service';
import { formatAnswer, journalTitle } from '@core/journal';
import type { CloseDayDeps, CoachDeps, LooseEndDay } from '@core/journal';
import type { LlmGateway } from '@core/llm';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { fixtureVaultFiles } from '../../fixtures';
import { NOW_MS } from '../../helpers/time';

/** Der Tag, den der Fixture-Vault schon kennt. */
export const DAY = '2026-08-10';
export const DAY_PATH = 'journal/2026/08/2026-08-10.md';

/** Ein Tag, den es im Fixture-Vault noch nicht gibt. */
export const FRESH_DAY = '2026-08-11';
export const FRESH_PATH = 'journal/2026/08/2026-08-11.md';

export interface JournalEntryInput {
  mood?: number;
  energy?: number;
  people?: readonly string[];
  projects?: readonly string[];
  tags?: readonly string[];
  /** Roher Rumpf unter „## Gespräch" (legacy). */
  dialogue?: string;
  /**
   * App-Antworten, die (011) in den Strom unter „## Tag" gehören, nach der
   * Prosa aus `tag`. Jede wird als der Blockquote-Block geschrieben, den
   * `stream.ts#appendAnswer` auch schreiben würde — ohne den bestehenden
   * `dialogue`-Aufrufer anzurühren, ist das rein additiv.
   */
  answers?: { text: string; at: string }[];
}

/** Pfad eines Tageseintrags, wie VAULT-FORMAT.md ihn vorsieht. */
export function journalPathOf(date: string): string {
  return `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`;
}

/** Eine Tagesdatei als Text — so, wie sie ein Mensch in Obsidian sehen würde. */
export function journalFile(date: string, tag: string, entry: JournalEntryInput = {}): string {
  const lines = [
    '---',
    'type: journal',
    `title: '${journalTitle(date, 'de')}'`,
    `date: ${date}`,
    ...(entry.mood === undefined ? [] : [`mood: ${entry.mood}`]),
    ...(entry.energy === undefined ? [] : [`energy: ${entry.energy}`]),
    ...(entry.people === undefined ? [] : [`people: [${entry.people.join(', ')}]`]),
    ...(entry.projects === undefined ? [] : [`projects: [${entry.projects.join(', ')}]`]),
    `tags: [${(entry.tags ?? []).join(', ')}]`,
    'lang: de',
    '---',
    '',
    '## Tag',
    '',
    tag.trim(),
    '',
  ];
  for (const answer of entry.answers ?? []) {
    lines.push(formatAnswer(answer.text, answer.at, 'de'), '');
  }
  if (entry.dialogue !== undefined) {
    lines.push('## Gespräch', '', entry.dialogue.trim(), '');
  }
  return `${lines.join('\n')}`;
}

/**
 * 1-based file line of the first body line, as `IndexedDoc.bodyLine` reports it
 * for a day file `journalFile()` writes.
 */
export const LOOSE_END_BODY_LINE = 8;

/**
 * A day as the announcement rules read it (`findLooseEnds`,
 * `findUpcomingMentions`): date, path, body. Only the two fields those rules
 * touch, so a test does not have to fake a whole `JournalDay`.
 */
export function looseEndDay(date: string, ...lines: string[]): LooseEndDay {
  return {
    day: { date, path: journalPathOf(date) },
    doc: { body: ['## Tag', '', ...lines, ''].join('\n'), bodyLine: LOOSE_END_BODY_LINE },
  };
}

export interface JournalFixture {
  store: MemoryVaultStore;
  /** Erfüllt `JournalIndexView` strukturell. */
  index: IndexService;
  /** Nach eigenen Schreibvorgängen nachziehen. */
  refresh(): Promise<void>;
  /** Dateiinhalt; wirft, wenn die Datei fehlt — ein leerer String verschleiert nur. */
  text(path: string): Promise<string>;
  deps(gateway: LlmGateway, patch?: Partial<CoachDeps>): CoachDeps;
  closeDeps(gateway: LlmGateway, patch?: Partial<CloseDayDeps>): CloseDayDeps;
}

export interface JournalFixtureOptions {
  /** Zusätzliche Dateien: vault-relativer Pfad → Inhalt. */
  files?: Record<string, string>;
  /** Den Fixture-Vault mitnehmen. Vorgabe: ja. */
  sample?: boolean;
}

export async function journalFixture(options: JournalFixtureOptions = {}): Promise<JournalFixture> {
  const store = new MemoryVaultStore({
    files: {
      ...(options.sample === false ? {} : fixtureVaultFiles()),
      ...(options.files ?? {}),
    },
    now: new Date(NOW_MS),
  });
  const index = await IndexService.open(store, { persistence: null, now: () => new Date(NOW_MS) });

  return {
    store,
    index,
    refresh: async () => {
      await index.rebuild();
    },
    text: async (path) => {
      const content = await store.readText(path);
      if (content === null) throw new Error(`Datei fehlt: ${path}`);
      return content;
    },
    deps: (gateway, patch = {}) => ({
      store,
      index,
      gateway,
      docLanguage: 'de',
      now: NOW_MS,
      ...patch,
    }),
    closeDeps: (gateway, patch = {}) => ({
      store,
      index,
      gateway,
      docLanguage: 'de',
      now: NOW_MS,
      ...patch,
    }),
  };
}
