/* Der "Tag"-Strom (011): Prosa und Antworten der App leben ab jetzt in einem
   Abschnitt statt zwei. Drei Zusicherungen werden hart geprüft:

   - **Reihenfolge**: Prosa und Antwort kommen in Schreibreihenfolge zurück.
   - **Roundtrip**: was `formatAnswer` schreibt, liest `parseStream` unverändert
     zurück — auch mehrzeilig.
   - **Alte Dateien brechen nicht**: ein Tag mit separatem "Gespräch"-Abschnitt
     liefert nur die Prosa aus "Tag", ohne den alten Abschnitt zu lesen. */

import { describe, expect, it } from 'vitest';
import { formatAnswer, formatTurn, parseStream } from '@core/journal';

describe('parseStream', () => {
  it('liefert Prosa und eine eingebettete Antwort in Schreibreihenfolge', () => {
    const body = [
      '## Tag',
      '',
      'Erster Absatz.',
      '',
      formatAnswer('Ich höre.', '10:00'),
      '',
      'Zweiter Absatz.',
      '',
    ].join('\n');

    const blocks = parseStream(body);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ kind: 'entry', text: 'Erster Absatz.' });
    expect(blocks[1]).toMatchObject({ kind: 'answer', text: 'Ich höre.', at: '10:00' });
    expect(blocks[2]).toMatchObject({ kind: 'entry', text: 'Zweiter Absatz.' });
  });

  it('ist ein Roundtrip mit formatAnswer — auch mehrzeilig', () => {
    const body = ['## Tag', '', formatAnswer('Erste Zeile.\n\nZweiter Absatz.', '09:05'), ''].join(
      '\n',
    );

    const blocks = parseStream(body);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'answer',
      text: 'Erste Zeile.\n\nZweiter Absatz.',
      at: '09:05',
    });
  });

  it('liest einen alten Tag mit separatem Gespräch nur aus "Tag"', () => {
    const body = [
      '## Tag',
      '',
      'Nur Prosa hier.',
      '',
      '## Gespräch',
      '',
      formatTurn('user', 'Alte Runde.', '18:40'),
      '',
      formatTurn('assistant', 'Alte Antwort.', '18:41'),
      '',
    ].join('\n');

    const blocks = parseStream(body);

    expect(blocks).toEqual([{ kind: 'entry', text: 'Nur Prosa hier.', line: 2 }]);
  });

  it('lässt einen Blockquote ohne erkannten Sprecher stehen, statt ihn zu deuten', () => {
    /* Dokumentierte Entscheidung (siehe stream.ts): ein fremder oder kaputter
       Block wird weder zum Fehler noch zur Antwort — er bleibt wörtlich im
       umgebenden `entry`-Block stehen, Anführungszeichen inklusive. */
    const body = [
      '## Tag',
      '',
      'Text davor.',
      '',
      '> **Notiz** — 09:30',
      '> Von Hand ergänzt, kein Sprecher des Stroms.',
      '',
      'Text danach.',
      '',
    ].join('\n');

    const blocks = parseStream(body);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('entry');
    expect(blocks[0]?.text).toContain('Text davor.');
    expect(blocks[0]?.text).toContain('> **Notiz** — 09:30');
    expect(blocks[0]?.text).toContain('Von Hand ergänzt, kein Sprecher des Stroms.');
    expect(blocks[0]?.text).toContain('Text danach.');
  });

  it('ist leer für einen Rumpf ohne "Tag"-Abschnitt', () => {
    expect(parseStream('## Gespräch\n\n> **Ich** — 08:00\n> Hm.\n')).toEqual([]);
  });
});

describe('formatAnswer', () => {
  it('erzeugt genau das Blockzitat von formatTurn für "assistant"', () => {
    expect(formatAnswer('Ich höre.', '10:00')).toBe(formatTurn('assistant', 'Ich höre.', '10:00'));
    expect(formatAnswer('Rough day.', '20:00', 'en')).toBe(
      formatTurn('assistant', 'Rough day.', '20:00', 'en'),
    );
  });
});
