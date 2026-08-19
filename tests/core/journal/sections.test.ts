/* Die Abschnitte des Tageseintrags. Die eine Regel, die hier festgenagelt wird:
   **die Datei des Nutzers gibt den Ton vor.** Steht darin „## Gespräch", wird
   darunter angehängt — auch wenn die Dokumentsprache inzwischen Englisch ist.
   Sonst stünden zwei Abschnitte für dieselbe Sache in einer Datei. */

import { describe, expect, it } from 'vitest';
import {
  dayText,
  formatAnswer,
  isSectionOf,
  journalSections,
  rawDayText,
  sectionIn,
  sectionText,
} from '@core/journal';

const GERMAN = [
  '## Tag',
  '',
  'Zäher Tag im Sprint.',
  '',
  '## Gespräch',
  '',
  '> **Ich** — 20:00',
  '> Zu viel.',
  '',
  '## Fakten',
  '',
  '- [ ] Etwas tun',
  '',
].join('\n');

describe('journalSections', () => {
  it('kennt beide Dokumentsprachen', () => {
    expect(journalSections('de')).toEqual({ day: 'Tag', dialogue: 'Gespräch', facts: 'Fakten' });
    expect(journalSections('en')).toEqual({
      day: 'Day',
      dialogue: 'Conversation',
      facts: 'Facts',
    });
  });
});

describe('isSectionOf', () => {
  it('vergleicht gefaltet — „Gespräch" und „Gespraech" sind dasselbe', () => {
    expect(isSectionOf('Gespräch', 'dialogue')).toBe(true);
    expect(isSectionOf(' gespraech ', 'dialogue')).toBe(true);
    expect(isSectionOf('Conversation', 'dialogue')).toBe(true);
    expect(isSectionOf('Notizen', 'dialogue')).toBe(false);
  });
});

describe('sectionIn', () => {
  it('nimmt die vorhandene Überschrift, nicht die der Einstellung', () => {
    expect(sectionIn(GERMAN, 'dialogue', 'en')).toBe('Gespräch');
    expect(sectionIn(GERMAN, 'facts', 'en')).toBe('Fakten');
  });

  it('nimmt die Dokumentsprache, wenn die Datei den Abschnitt nicht hat', () => {
    expect(sectionIn('## Tag\n\nNur Prosa.\n', 'dialogue', 'en')).toBe('Conversation');
    expect(sectionIn('', 'facts', 'de')).toBe('Fakten');
  });
});

describe('sectionText', () => {
  it('gibt den Text eines Abschnitts ohne Überschrift', () => {
    expect(sectionText(GERMAN, 'day')).toBe('Zäher Tag im Sprint.');
    expect(sectionText(GERMAN, 'facts')).toBe('- [ ] Etwas tun');
    expect(sectionText(GERMAN, 'dialogue')).toContain('> **Ich** — 20:00');
    expect(sectionText('## Tag\n', 'facts')).toBe('');
  });
});

describe('dayText', () => {
  it('lässt Gespräch und Fakten weg — beides gehört nicht dem Tag', () => {
    expect(dayText(GERMAN)).toBe('Zäher Tag im Sprint.');
  });

  it('nimmt einen Rumpf ohne Überschriften vollständig', () => {
    expect(dayText('Einfach hingeschrieben.\n')).toBe('Einfach hingeschrieben.');
  });

  it('ist leer, wenn nur leere Abschnitte dastehen', () => {
    expect(dayText('## Tag\n\n## Gespräch\n\n## Fakten\n')).toBe('');
  });

  it('behält Prosa vor der ersten Überschrift', () => {
    const body = [
      'Vorspann ohne Überschrift.',
      '',
      '## Gespräch',
      '',
      '> **Ich** — 08:00',
      '> Hm.',
      '',
    ].join('\n');
    expect(dayText(body)).toBe('Vorspann ohne Überschrift.');
  });

  it('lässt eine eingebettete Antwort im Tag-Abschnitt weg (011)', () => {
    const body = [
      '## Tag',
      '',
      'Prosa davor.',
      '',
      formatAnswer('Eine Antwort der App.', '09:00'),
      '',
      'Prosa danach.',
      '',
    ].join('\n');

    const result = dayText(body);

    expect(result).toContain('Prosa davor.');
    expect(result).toContain('Prosa danach.');
    expect(result).not.toContain('Second Brain');
    expect(result).not.toContain('Eine Antwort der App.');
  });
});

describe('rawDayText', () => {
  it('lässt Gespräch und Fakten weg, behält aber eine eingebettete Antwort (011)', () => {
    const body = [
      '## Tag',
      '',
      'Prosa davor.',
      '',
      formatAnswer('Eine Antwort der App.', '09:00'),
      '',
      'Prosa danach.',
      '',
      '## Gespräch',
      '',
      '> **Ich** — 08:00',
      '> Hm.',
      '',
      '## Fakten',
      '',
      '- [ ] Etwas tun',
      '',
    ].join('\n');

    const result = rawDayText(body);

    expect(result).toContain('Prosa davor.');
    expect(result).toContain('Prosa danach.');
    expect(result).toContain('> **Second Brain** — 09:00');
    expect(result).toContain('> Eine Antwort der App.');
    expect(result).not.toContain('Hm.');
    expect(result).not.toContain('Etwas tun');
  });

  it('nimmt einen Rumpf ohne Überschriften vollständig, Antworten eingeschlossen', () => {
    const body = ['Prosa ohne Überschrift.', '', formatAnswer('Antwort.', '10:00'), ''].join('\n');
    expect(rawDayText(body)).toBe(
      ['Prosa ohne Überschrift.', '', '> **Second Brain** — 10:00', '> Antwort.'].join('\n'),
    );
  });

  it('ist die Grundlage von dayText — dayText streicht daraus zusätzlich die Antworten', () => {
    const body = [
      '## Tag',
      '',
      'Nur Prosa, keine Antwort.',
      '',
      '## Fakten',
      '',
      '- [ ] Etwas tun',
      '',
    ].join('\n');
    // Ohne eingebettete Antwort sind beide Funktionen deckungsgleich.
    expect(dayText(body)).toBe(rawDayText(body));
  });
});
