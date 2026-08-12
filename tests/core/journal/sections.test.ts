/* Die Abschnitte des Tageseintrags. Die eine Regel, die hier festgenagelt wird:
   **die Datei des Nutzers gibt den Ton vor.** Steht darin „## Gespräch", wird
   darunter angehängt — auch wenn die Dokumentsprache inzwischen Englisch ist.
   Sonst stünden zwei Abschnitte für dieselbe Sache in einer Datei. */

import { describe, expect, it } from 'vitest';
import { dayText, isSectionOf, journalSections, sectionIn, sectionText } from '@core/journal';

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
});
