/* Der Legacy-Fold (011, D5): der alte „Gespräch"-Abschnitt wandert in den
   Tagesstrom. Es ist der einzige Schreibweg des Tagebuchs, der Zeilen entfernt —
   geprüft wird deshalb härter als sonst:

   - **Nichts zu falten heisst nichts anfassen**: ohne Gesprächsabschnitt kommt
     derselbe String zurück, Byte für Byte.
   - **Jede Runde genau einmal**, in der Reihenfolge der Datei, meine als Prosa
     und die der App als Antwortblock.
   - **„Fakten" bleibt unberührt** — Überschrift, Inhalt und Position.
   - **Der Abschnitt ist danach wirklich weg**, nicht nur umbenannt:
     `parseDialog` findet nichts mehr, ein zweiter Fold ändert nichts. */

import { describe, expect, it } from 'vitest';
import {
  foldLegacyDay,
  formatAnswer,
  formatTurn,
  isSectionOf,
  parseDialog,
  parseStream,
} from '@core/journal';
import type { JournalSectionKind } from '@core/journal';
import { findSections } from '@core/vault/sections';
import { DAY_PATH, journalFixture } from './fixtures';

function bodyOf(content: string): string {
  const end = content.indexOf('\n---\n', 4);
  return end < 0 ? content : content.slice(end + 5);
}

/** Ein Abschnitt wortwörtlich, samt Überschriftenzeile und Abstand danach. */
function rawSection(body: string, kind: JournalSectionKind): string {
  const lines = body.split('\n');
  const range = findSections(body, 2).find((section) => isSectionOf(section.heading, kind));
  if (range === undefined) throw new Error(`Abschnitt fehlt: ${kind}`);
  return lines.slice(range.headingLine, range.end).join('\n');
}

/** Die Überschriften des Rumpfs, in Dokumentreihenfolge. */
function headings(body: string): string[] {
  return findSections(body, 2).map((section) => section.heading.trim());
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const FACTS = ['## Fakten', '', '- [ ] Interceptor zusammenlegen @due:2026-08-17 #work', ''];

function legacyBody(day: readonly string[], dialogue: readonly string[]): string {
  return ['## Tag', ...day, '## Gespräch', '', ...dialogue, '', ...FACTS].join('\n');
}

describe('foldLegacyDay ohne Gesprächsabschnitt', () => {
  it('gibt denselben Rumpf zurück, Byte für Byte', () => {
    const body = [
      '## Tag',
      '',
      'Erster Absatz.',
      '',
      formatAnswer('Ich höre.', '10:00'),
      '',
      ...FACTS,
    ].join('\n');

    expect(foldLegacyDay(body)).toBe(body);
  });

  it('normalisiert auch einen von Hand geschriebenen Rumpf nicht', () => {
    /* Bewusst schief: keine Überschrift, Leerzeilen am Anfang, Einrückung.
       Ein Fold, der nichts zu falten hat, darf nichts davon glattziehen. */
    const body = '\n\n   Nur ein Gedanke.\n\n\n';

    expect(foldLegacyDay(body)).toBe(body);
    expect(foldLegacyDay(body, 'en')).toBe(body);
  });
});

describe('foldLegacyDay', () => {
  it('faltet den Fixture-Tag in den Strom und lässt „Fakten" unberührt', async () => {
    const fixture = await journalFixture();
    const before = bodyOf(await fixture.text(DAY_PATH));

    const after = foldLegacyDay(before);

    /* Die Prosa des Tages und meine gefaltete Runde stehen als zwei Absätze
       hintereinander — `parseStream` fasst einen zusammenhängenden Prosa-Lauf
       zu *einem* `entry` zusammen, genau wie bei selbst getipptem Text. */
    const blocks = parseStream(after);
    expect(blocks.map((block) => block.kind)).toEqual(['entry', 'answer']);
    expect(blocks[0]?.text).toContain('Vormittag im Testsystem');
    expect(blocks[0]?.text).toContain('Der Sprint fühlt sich unmöglich an.');
    expect(blocks[1]).toMatchObject({
      kind: 'answer',
      text: 'Zwei der drei offenen Punkte warten auf andere. Was heute an dir hing, ist fertig.',
      at: '18:40',
    });

    /* Der Abschnitt ist weg — Überschrift und Reihenfolge der übrigen. */
    expect(after).not.toMatch(/^ {0,3}##\s*(Gespr|Conversation)/im);
    expect(headings(after)).toEqual(['Tag', 'Fakten']);
    expect(rawSection(after, 'facts')).toBe(rawSection(before, 'facts'));

    /* Genau einmal, nicht zweimal. */
    expect(occurrences(after, 'Der Sprint fühlt sich unmöglich an.')).toBe(1);
    expect(occurrences(after, 'Was heute an dir hing, ist fertig.')).toBe(1);
    expect(occurrences(after, 'Vormittag im Testsystem')).toBe(1);
  });

  it('hält die Reihenfolge über mehrere Runden hinweg', () => {
    const before = legacyBody(
      ['', 'Prosa des Tages.', ''],
      [
        formatTurn('user', 'Erste Frage.', '08:10'),
        '',
        formatTurn('assistant', 'Erste Antwort.', '08:11'),
        '',
        formatTurn('user', 'Zweite Frage.', '09:20'),
        '',
        formatTurn('assistant', 'Zweite Antwort.', '09:21'),
      ],
    );

    const after = foldLegacyDay(before);
    const blocks = parseStream(after);

    expect(blocks.map((block) => `${block.kind}:${block.text}`)).toEqual([
      'entry:Prosa des Tages.\n\nErste Frage.',
      'answer:Erste Antwort.',
      'entry:Zweite Frage.',
      'answer:Zweite Antwort.',
    ]);
    for (const text of ['Erste Frage.', 'Erste Antwort.', 'Zweite Frage.', 'Zweite Antwort.']) {
      expect(occurrences(after, text)).toBe(1);
    }
    expect(rawSection(after, 'facts')).toBe(rawSection(before, 'facts'));
  });

  it('lässt „Fakten" auch dann in Ruhe, wenn es vor dem Gespräch steht', () => {
    const before = [
      '## Tag',
      '',
      'Prosa des Tages.',
      '',
      ...FACTS,
      '## Gespräch',
      '',
      formatTurn('user', 'Späte Runde.', '22:00'),
      '',
      formatTurn('assistant', 'Späte Antwort.', '22:01'),
      '',
    ].join('\n');

    const after = foldLegacyDay(before);

    expect(rawSection(after, 'facts')).toBe(rawSection(before, 'facts'));
    expect(headings(after)).toEqual(['Tag', 'Fakten']);
    expect(parseStream(after).map((block) => block.kind)).toEqual(['entry', 'answer']);
    expect(parseStream(after)[0]?.text).toBe('Prosa des Tages.\n\nSpäte Runde.');
  });

  it('wirft kaputte und fremde Blöcke mit dem Abschnitt weg, faltet den Rest', () => {
    /* Dieselben Formen wie in `dialog.test.ts` („überspringt kaputte und fremde
       Blöcke"): `parseDialog` liest sie nicht, und mit dem Abschnitt sind sie
       weg. Dokumentierter Verlust — der Fold ist eine bestätigte Aktion. */
    const before = legacyBody(
      ['', 'Prosa des Tages.', ''],
      [
        '> Ein Blockquote ohne Sprecher.',
        '',
        '> **Notiz** — 12:00',
        '> Von Hand ergänzt, kein Sprecher des Gesprächs.',
        '',
        formatTurn('user', 'Das hier zählt.', '12:05'),
        '',
        formatTurn('assistant', 'Verstanden.', '12:06'),
      ],
    );

    const after = foldLegacyDay(before);

    expect(after).not.toContain('Ein Blockquote ohne Sprecher.');
    expect(after).not.toContain('**Notiz**');
    expect(after).not.toContain('Von Hand ergänzt');
    expect(parseStream(after).map((block) => `${block.kind}:${block.text}`)).toEqual([
      'entry:Prosa des Tages.\n\nDas hier zählt.',
      'answer:Verstanden.',
    ]);
  });

  it('entfernt einen Abschnitt ohne lesbare Runde und lässt „Tag" unverändert', () => {
    const before = legacyBody(
      ['', 'Prosa des Tages.', ''],
      ['> Nur ein Zitat ohne Sprecher.', '', 'Eine Randnotiz.'],
    );

    const after = foldLegacyDay(before);

    expect(headings(after)).toEqual(['Tag', 'Fakten']);
    expect(rawSection(after, 'day')).toBe(rawSection(before, 'day'));
    expect(rawSection(after, 'facts')).toBe(rawSection(before, 'facts'));
  });

  it('füllt einen leeren „Tag"-Abschnitt ohne Leerzeilen-Reste', () => {
    const before = legacyBody(
      [''],
      [
        formatTurn('user', 'Erster Satz.', '08:10'),
        '',
        formatTurn('assistant', 'Ich höre.', '08:11'),
      ],
    );

    const after = foldLegacyDay(before);

    expect(rawSection(after, 'day')).toBe(
      ['## Tag', '', 'Erster Satz.', '', '> **Second Brain** — 08:11', '> Ich höre.', ''].join(
        '\n',
      ),
    );
    expect(parseStream(after).map((block) => `${block.kind}:${block.text}`)).toEqual([
      'entry:Erster Satz.',
      'answer:Ich höre.',
    ]);
    expect(after).not.toMatch(/\n\n\n/);
  });

  it('legt einen „Tag"-Abschnitt an, wenn die Datei keinen hat', () => {
    const before = [
      '## Gespräch',
      '',
      formatTurn('user', 'Nur Gespräch, kein Tagestext.', '09:00'),
      '',
      ...FACTS,
    ].join('\n');

    const after = foldLegacyDay(before);

    expect(headings(after)).toEqual(['Tag', 'Fakten']);
    expect(parseStream(after).map((block) => `${block.kind}:${block.text}`)).toEqual([
      'entry:Nur Gespräch, kein Tagestext.',
    ]);
    expect(rawSection(after, 'facts')).toBe(rawSection(before, 'facts'));
  });

  it('arbeitet auch mit englischen Überschriften und behält deren Schreibweise', () => {
    const before = [
      '## Day',
      '',
      'Prose of the day.',
      '',
      '## Conversation',
      '',
      formatTurn('user', 'Rough day.', '20:00', 'en'),
      '',
      formatTurn('assistant', 'I hear you.', '20:01', 'en'),
      '',
      '## Facts',
      '',
      '- [ ] Call Stefan @due:2026-08-20',
      '',
    ].join('\n');

    const after = foldLegacyDay(before, 'en');

    expect(headings(after)).toEqual(['Day', 'Facts']);
    expect(after).not.toContain('## Conversation');
    expect(rawSection(after, 'facts')).toBe(rawSection(before, 'facts'));
    expect(parseStream(after).map((block) => `${block.kind}:${block.text}`)).toEqual([
      'entry:Prose of the day.\n\nRough day.',
      'answer:I hear you.',
    ]);
  });

  it('setzt für eine Antwort ohne Uhrzeit den sichtbaren Platzhalter 00:00', () => {
    /* Die Sprecherzeile darf ohne Uhrzeit stehen (`parseDialog` ist tolerant).
       Der Antwortblock braucht eine — erfunden wird keine plausible, sondern der
       dokumentierte Platzhalter aus `legacy.ts`. */
    const before = legacyBody([''], ['> **Second Brain**', '> Ohne Uhrzeit notiert.']);

    const after = foldLegacyDay(before);

    expect(after).toContain('> **Second Brain** — 00:00');
    expect(parseStream(after)[0]).toMatchObject({
      kind: 'answer',
      text: 'Ohne Uhrzeit notiert.',
      at: '00:00',
    });
  });

  it('normalisiert die Sprecher-Bezeichnung der App auf „Second Brain"', () => {
    /* „Coach" gilt `parseDialog` als App-Sprecher. Gefaltet muss der Block als
       Antwort zurücklesbar sein — dafür zählt nur der kanonische Name. */
    const before = legacyBody([''], ['> **Coach** — 17:30', '> Alte Bezeichnung.']);

    const after = foldLegacyDay(before);

    expect(after).not.toContain('**Coach**');
    expect(parseStream(after)[0]).toMatchObject({
      kind: 'answer',
      text: 'Alte Bezeichnung.',
      at: '17:30',
    });
  });

  it('faltet beide Schreibweisen, wenn eine Datei zwei Gesprächsabschnitte hat', () => {
    const before = [
      '## Tag',
      '',
      'Prosa des Tages.',
      '',
      '## Gespräch',
      '',
      formatTurn('user', 'Deutsche Runde.', '10:00'),
      '',
      '## Conversation',
      '',
      formatTurn('user', 'Englische Runde.', '11:00', 'en'),
      '',
      ...FACTS,
    ].join('\n');

    const after = foldLegacyDay(before);

    expect(headings(after)).toEqual(['Tag', 'Fakten']);
    expect(parseStream(after).map((block) => block.text)).toEqual([
      'Prosa des Tages.\n\nDeutsche Runde.\n\nEnglische Runde.',
    ]);
  });
});

describe('foldLegacyDay, danach', () => {
  it('lässt keinen Gesprächsabschnitt zurück und ist ein zweites Mal wirkungslos', async () => {
    const fixture = await journalFixture();
    const before = bodyOf(await fixture.text(DAY_PATH));

    const after = foldLegacyDay(before);

    expect(parseDialog(before)).toHaveLength(2);
    expect(parseDialog(after)).toEqual([]);
    expect(foldLegacyDay(after)).toBe(after);
  });
});
