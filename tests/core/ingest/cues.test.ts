/* Untertitel-Rohformate → Cues. Zwei Dinge muessen stimmen, sonst ist das Transcript
   fuer eine Verdichtung wertlos: Umlaute (Entities!) und die Rolling-Duplikate der
   auto-generierten Spuren. */

import { describe, expect, it } from 'vitest';
import {
  countWords,
  dedupeCues,
  normalizeCueList,
  parseJson3,
  parseSrt,
  parseSubtitles,
  parseVtt,
  stripNonSpeech,
  stripNonSpeechCues,
} from '@core/ingest';
import { ingestFixture } from './fakes';

describe('parseJson3', () => {
  it('liest Zeiten in Sekunden und verwirft Rolling-Umbrueche', () => {
    const cues = parseJson3(ingestFixture('captions.json3'));
    expect(cues[0]).toEqual({ start: 0, end: 3.2, text: '[Music]' });
    expect(cues[1]?.text).toBe('Wir sprechen über Größe und Übersicht.');
    expect(cues[1]?.start).toBeCloseTo(3.2, 5);
    expect(cues.some((cue) => cue.text.includes('\n'))).toBe(false);
  });

  it('uebergeht Events ohne Segmente', () => {
    const cues = parseJson3(
      '{"events":[{"tStartMs":0,"dDurationMs":10},{"tStartMs":10,"segs":[{"utf8":"da"}]}]}',
    );
    expect(cues).toHaveLength(1);
  });
});

describe('parseVtt', () => {
  it('entfernt Tags, loest Entities auf und wirft Rolling-Duplikate weg', () => {
    const cues = parseVtt(ingestFixture('captions-auto.vtt'));
    const texts = cues.map((cue) => cue.text);
    expect(texts).toEqual([
      'Der erste Satz rollt herein.',
      'Und der zweite schiebt nach.',
      'Größe ist kein Maß für Qualität.',
      '[Musik]',
    ]);
    expect(cues[0]?.start).toBe(1);
    expect(cues[0]?.end).toBe(3);
  });
});

describe('parseSrt', () => {
  it('liest nummerierte Bloecke mit Komma-Millisekunden', () => {
    const cues = parseSrt(
      '1\n00:00:01,000 --> 00:00:02,500\nHallo Welt\n\n2\n00:00:02,500 --> 00:00:04,000\nZweite Zeile',
    );
    expect(cues).toEqual([
      { start: 1, end: 2.5, text: 'Hallo Welt' },
      { start: 2.5, end: 4, text: 'Zweite Zeile' },
    ]);
  });
});

describe('parseSubtitles', () => {
  it('erkennt das Format am Inhalt, nicht an der Endung', () => {
    expect(parseSubtitles(ingestFixture('captions.json3'), 'vtt')).not.toHaveLength(0);
    expect(parseSubtitles(ingestFixture('captions-auto.vtt'), 'json3')).not.toHaveLength(0);
    expect(parseSubtitles('', 'json3')).toEqual([]);
    expect(parseSubtitles('nur text ohne zeiten')).toEqual([]);
  });
});

describe('stripNonSpeech', () => {
  it('filtert Sound-Marker, laesst echte Klammern stehen', () => {
    expect(stripNonSpeech('[Music] Wir fangen an.')).toBe('Wir fangen an.');
    expect(stripNonSpeech('mit PixArt [music] 3D')).toBe('mit PixArt 3D');
    expect(stripNonSpeech('das war [ __ ] schwierig')).toBe('das war [ __ ] schwierig');
    expect(stripNonSpeech('ein Ansatz (siehe oben) hilft')).toBe('ein Ansatz (siehe oben) hilft');
    expect(stripNonSpeech('♪ gesungene Zeile ♪')).toBe('gesungene Zeile');
    expect(stripNonSpeech('[Geräusche]')).toBe('');
  });

  it('wirft Cues weg, die nur aus einem Marker bestanden', () => {
    const cues = stripNonSpeechCues(parseJson3(ingestFixture('captions.json3')));
    expect(cues.map((cue) => cue.text)).not.toContain('[Music]');
    expect(cues.map((cue) => cue.text)).not.toContain('[Applause]');
    expect(cues[0]?.text).toBe('Wir sprechen über Größe und Übersicht.');
  });
});

describe('normalizeCueList', () => {
  it('erkennt Millisekunden an der typischen Cue-Dauer', () => {
    const millis = normalizeCueList([
      { start_ms: 0, end_ms: 2000, text: 'eins' },
      { start_ms: 2000, end_ms: 4000, text: 'zwei' },
    ]);
    expect(millis).toEqual([
      { start: 0, end: 2, text: 'eins' },
      { start: 2, end: 4, text: 'zwei' },
    ]);

    const seconds = normalizeCueList([
      { start: 0, duration: 2, text: 'eins' },
      { start: 2, duration: 2, text: 'zwei' },
    ]);
    expect(seconds[1]?.start).toBe(2);
  });

  it('vertraegt leere und kaputte Eingaben', () => {
    expect(normalizeCueList(null)).toEqual([]);
    expect(normalizeCueList([{ text: '   ' }])).toEqual([]);
  });
});

describe('dedupeCues', () => {
  it('sortiert und entfernt unmittelbare Wiederholungen', () => {
    const cues = dedupeCues([
      { start: 2, end: 3, text: 'b' },
      { start: 0, end: 1, text: 'a' },
      { start: 2.4, end: 3, text: 'b' },
      { start: 9, end: 10, text: 'b' },
    ]);
    expect(cues.map((cue) => `${cue.start}:${cue.text}`)).toEqual(['0:a', '2:b', '9:b']);
  });
});

describe('countWords', () => {
  it('zaehlt Woerter, nicht Zeichen', () => {
    expect(countWords('drei kurze Wörter')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
