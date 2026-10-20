/* Tageseinträge aus den indizierten Dokumenten. Gezählt werden die Antworten
   der App, nicht Sprecherzeilen insgesamt — im Strom unter „Tag" (011) genauso
   wie im alten „Gespräch"-Abschnitt. */

import { describe, expect, it } from 'vitest';
import { formatAnswer } from '@core/journal';
import { countTurns, deriveJournalDays, toJournalDay } from '@core/index/journal';
import { makeDoc } from './fixtures';

/* Legacy format (pre-011): "Tag" carries only prose, the dialogue lives in
   its own "Gespräch" section. */
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

/* Current format (011): prose and app answers interleaved inside "Tag"
   itself, in write order — no separate "Gespräch" section. */
const STREAM_BODY = [
  '## Tag',
  '',
  'Vormittag mit dem Rollenkonzept verbracht.',
  '',
  formatAnswer('Was davon ist heute wirklich fällig?', '09:10', 'de'),
  '',
  'Nachmittags Kundenportal.',
  '',
  formatAnswer('Und wie ist das Kundenportal gelaufen?', '15:30', 'de'),
  '',
  '## Fakten',
  '',
].join('\n');

/* A hand-edited day: one app answer in the new stream, one more in a
   left-over legacy "Gespräch" — both must be counted, not just one. */
const MIXED_BODY = [
  '## Tag',
  '',
  'Kurzer Eintrag.',
  '',
  formatAnswer('Magst du das genauer beschreiben?', '08:00', 'de'),
  '',
  '## Gespräch',
  '',
  '> **Ich** — 18:40',
  '> Ein alter Absatz, von Hand ergänzt.',
  '',
  '> **Second Brain** — 18:41',
  '> Eine alte Antwort.',
  '',
].join('\n');

/* 030: a day spanning the rename — one answer still carries the old label
   from before the app was renamed to Gaston, one was written after. Both
   must count; the old label is never rewritten. */
const RENAMED_BODY = [
  '## Tag',
  '',
  'Kurzer Eintrag.',
  '',
  '> **Second Brain** — 08:00',
  '> Alte Antwort vor der Umbenennung.',
  '',
  formatAnswer('Neue Antwort danach.', '09:00', 'de'),
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

  it('nimmt den ersten Absatz unter „Tag" als Auszug — nicht den Dialog (legacy)', () => {
    expect(toJournalDay(journalDoc()).excerpt).toContain('Rollenkonzept verbracht');
    expect(toJournalDay(journalDoc()).excerpt).not.toContain('Sprint');
  });

  it('nimmt den ersten Absatz unter „Tag" als Auszug — ohne die eingestreuten Antworten der App', () => {
    const day = toJournalDay(
      makeDoc({ path: 'journal/2026/08/2026-08-10.md', docType: 'journal', body: STREAM_BODY }),
    );
    expect(day.excerpt).toContain('Rollenkonzept verbracht');
    expect(day.excerpt).not.toContain('fällig');
    expect(day.excerpt).not.toContain('Kundenportal gelaufen');
  });

  it('zählt die Antworten der App im Gespräch (legacy) — nur ihre Zeilen, nicht meine', () => {
    /* Drei Sprecherzeilen, davon nur eine von "Second Brain". */
    expect(countTurns(BODY)).toBe(1);
    expect(countTurns('## Tag\n\nOhne Gespräch.\n')).toBe(0);
  });

  it('zählt die Antworten der App im Strom unter „Tag" (011)', () => {
    /* Zwei eingestreute Antwortblöcke. */
    expect(countTurns(STREAM_BODY)).toBe(2);
  });

  it('zählt Antworten aus Strom und Gespräch zusammen, statt sich gegenseitig zu verdrängen', () => {
    /* Handeditierter Tag: eine Antwort im Strom, eine weitere im alten Abschnitt. */
    expect(countTurns(MIXED_BODY)).toBe(2);
  });

  it('zählt eine alte „Second Brain"-Antwort und eine neue „Gaston"-Antwort im selben Tag', () => {
    /* Die Umbenennung selbst darf keine Antwort verschlucken: beide Labels
       zählen, egal auf welcher Seite der Umbenennung die Antwort steht. */
    expect(countTurns(RENAMED_BODY)).toBe(2);
    const day = toJournalDay(
      makeDoc({ path: 'journal/2026/08/2026-08-10.md', docType: 'journal', body: RENAMED_BODY }),
    );
    /* Und beide Antworten bleiben aus dem Auszug draußen, nicht nur die neue. */
    expect(day.excerpt).not.toContain('Alte Antwort');
    expect(day.excerpt).not.toContain('Neue Antwort');
  });

  it('zählt eine bis zu 3 Leerzeichen eingerückte Antwort genauso wie `parseStream` sie liest', () => {
    /* `dialog.ts#SPEAKER_LINE`/`assistantBlockSpans` tolerieren bis zu 3
       führende Leerzeichen vor dem Blockzitat (CommonMark). Diese Datei
       spiegelt die Erkennung lokal (siehe Kommentar bei `ASSISTANT_LABELS`) —
       eine engere Regex hier würde dieselbe Antwort abweichend zählen. */
    const indented = [
      '## Tag',
      '',
      'Kurzer Eintrag.',
      '',
      '  > **Second Brain** — 09:10',
      '  > Eingerückt, aber gültig.',
      '',
    ].join('\n');
    expect(countTurns(indented)).toBe(1);
    const day = toJournalDay(
      makeDoc({ path: 'journal/2026/08/2026-08-10.md', docType: 'journal', body: indented }),
    );
    expect(day.excerpt).not.toContain('Eingerückt');
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

  it('liest ein gesetztes `closed`-Datum', () => {
    const day = toJournalDay(journalDoc({ closed: '2026-08-12' }));
    expect(day.closed).toBe('2026-08-12');
  });

  it('lässt `closed` null ohne das Feld — Tag gilt als nicht abgeschlossen', () => {
    const day = toJournalDay(journalDoc());
    expect(day.closed).toBeNull();
  });

  it('lässt `closed` null bei explizitem `null`', () => {
    const day = toJournalDay(journalDoc({ closed: null }));
    expect(day.closed).toBeNull();
  });

  it('lässt `closed` null bei einem nicht parsbaren Wert', () => {
    const day = toJournalDay(journalDoc({ closed: 'irgendwann' }));
    expect(day.closed).toBeNull();
  });
});
