/* Tageseinträge aus den indizierten Dokumenten. Der Dialog wird gezählt, nicht
   gedeutet: zwei Sprecherzeilen sind eine Runde. */

import { describe, expect, it } from 'vitest';
import { countTurns, deriveJournalDays, toJournalDay } from '@core/index/journal';
import { makeDoc } from './fixtures';

const BODY = [
  '## Tag',
  '',
  'Vormittag mit dem Rollenkonzept verbracht, nachmittags Kundenportal.',
  '',
  '## Gespräch',
  '',
  '> **Ich** — 18:40',
  '> Der Sprint fühlt sich unmöglich an.',
  '',
  '> **Second Brain** — 18:40',
  '> Was davon ist heute wirklich fällig?',
  '',
  '> **Ich** — 18:44',
  '> Eigentlich nur das Rollenkonzept.',
  '',
  '## Fakten',
  '',
  '- [ ] Stefan wegen Rollenkonzept nachfassen @due:2026-08-12',
  '',
].join('\n');

function journalDoc(overrides: Record<string, unknown> = {}) {
  return makeDoc({
    path: 'journal/2026/08/2026-08-10.md',
    docType: 'journal',
    title: 'Montag, 10. August 2026',
    body: BODY,
    frontmatter: {
      type: 'journal',
      title: 'Montag, 10. August 2026',
      date: '2026-08-10',
      mood: 3,
      energy: 2,
      people: ['Stefan', 'Anna'],
      projects: ['nyota-auth0-migration'],
      ...overrides,
    },
  });
}

describe('deriveJournalDays', () => {
  it('liest Datum, Stimmung, Personen und Projekte', () => {
    const day = toJournalDay(journalDoc());

    expect(day.date).toBe('2026-08-10');
    expect(day.mood).toBe(3);
    expect(day.energy).toBe(2);
    expect(day.people).toEqual(['Stefan', 'Anna']);
    expect(day.projects).toEqual(['nyota-auth0-migration']);
  });

  it('nimmt den ersten Absatz unter „Tag" als Auszug — nicht den Dialog', () => {
    expect(toJournalDay(journalDoc()).excerpt).toContain('Rollenkonzept verbracht');
    expect(toJournalDay(journalDoc()).excerpt).not.toContain('Sprint');
  });

  it('zählt eine angefangene Runde mit', () => {
    /* Drei Sprecherzeilen: zwei Runden, die zweite noch unbeantwortet. */
    expect(countTurns(BODY)).toBe(2);
    expect(countTurns('## Tag\n\nOhne Gespräch.\n')).toBe(0);
  });

  it('fällt für das Datum auf den Dateinamen zurück', () => {
    const doc = makeDoc({
      path: 'journal/2026/07/2026-07-30.md',
      docType: 'journal',
      body: '## Tag\n\nKurz.\n',
    });
    expect(toJournalDay(doc).date).toBe('2026-07-30');
  });

  it('sortiert den jüngsten Tag nach vorne', () => {
    const days = deriveJournalDays([
      makeDoc({ path: 'journal/2026/07/2026-07-30.md', docType: 'journal' }),
      makeDoc({ path: 'journal/2026/08/2026-08-10.md', docType: 'journal' }),
      makeDoc({ path: 'areas/gesundheit.md', docType: 'area' }),
    ]);

    expect(days.map((day) => day.date)).toEqual(['2026-08-10', '2026-07-30']);
  });

  it('lässt fehlende Stimmung null, statt sie zu raten', () => {
    const day = toJournalDay(journalDoc({ mood: undefined, energy: 'zwei' }));
    expect(day.mood).toBeNull();
    expect(day.energy).toBeNull();
  });
});
