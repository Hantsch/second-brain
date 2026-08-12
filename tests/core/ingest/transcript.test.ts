/* Cues → die zwei Transcript-Dateien.
 *
 * `transcript.md` ist die Datei, die die Verdichtung liest: Absaetze brechen an
 * Sprechpausen, Kapitel werden Ueberschriften. `transcript.timestamped.md` ist die
 * zitierfaehige Fassung — ihr Zeilenformat ist Vertrag, denn Wiki-Seiten verlinken
 * darauf. */

import { describe, expect, it } from 'vitest';
import {
  buildParagraphs,
  buildTimestampedLines,
  renderProseTranscript,
  renderTimestampedTranscript,
  splitByChapters,
  type Cue,
} from '@core/ingest';

const ID = 'xOFkpf9KgKg';

/** Ein Satz mit 74 Zeichen — vier davon reissen die Mindestlaenge fuer einen Absatz. */
function sentence(index: number): string {
  return `Satz ${index} traegt genuegend Zeichen, damit die Absatzlaenge erreicht wird.`;
}

const CUES: Cue[] = [
  { start: 0, end: 2.5, text: sentence(1) },
  { start: 3, end: 5.5, text: sentence(2) },
  { start: 6, end: 8.5, text: sentence(3) },
  { start: 9, end: 11.5, text: sentence(4) },
  // 3,5 Sekunden Pause: hier darf umgebrochen werden.
  { start: 15, end: 17.5, text: 'Nach der Pause geht es mit Groesse und Uebersicht weiter.' },
];

const CHAPTERS = [
  { start_time: 0, end_time: 12, title: 'Einleitung' },
  { start_time: 12, end_time: 40, title: 'Nach der Pause' },
];

describe('buildParagraphs', () => {
  it('bricht an der Sprechpause um, sobald der Absatz lang genug ist', () => {
    const paragraphs = buildParagraphs(CUES);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.start).toBe(0);
    expect(paragraphs[0]?.text.startsWith('Satz 1')).toBe(true);
    expect(paragraphs[1]?.start).toBe(15);
    expect(paragraphs[1]?.text).toBe('Nach der Pause geht es mit Groesse und Uebersicht weiter.');
  });

  it('bricht kurze Absaetze nicht auf, auch nicht bei langer Pause', () => {
    const paragraphs = buildParagraphs([
      { start: 0, end: 1, text: 'Kurz.' },
      { start: 30, end: 31, text: 'Und noch kurz.' },
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.text).toBe('Kurz. Und noch kurz.');
  });

  it('zieht die Notbremse bei Captions ohne jede Interpunktion', () => {
    const endless: Cue[] = Array.from({ length: 40 }, (_, index) => ({
      start: index,
      end: index + 1,
      text: 'und dann noch etwas ohne jeden Punkt am Ende der Aussage',
    }));
    const paragraphs = buildParagraphs(endless);
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const paragraph of paragraphs) expect(paragraph.text.length).toBeLessThan(1800);
  });
});

describe('splitByChapters', () => {
  it('teilt die Cues an den Kapitelgrenzen', () => {
    const sections = splitByChapters(CUES, [
      { start: 0, end: 12, title: 'Einleitung' },
      { start: 12, end: 40, title: 'Nach der Pause' },
    ]);
    expect(sections.map((section) => section.title)).toEqual(['Einleitung', 'Nach der Pause']);
    expect(sections[0]?.cues).toHaveLength(4);
    expect(sections[1]?.cues).toHaveLength(1);
  });

  it('verliert keine Cues vor dem ersten Kapitel', () => {
    const sections = splitByChapters(CUES, [{ start: 6, end: 40, title: 'Spaeter' }]);
    expect(sections[0]?.title).toBeNull();
    expect(sections[0]?.cues).toHaveLength(2);
  });
});

describe('renderProseTranscript', () => {
  it('schreibt Kapitel als Ueberschriften und Absaetze als Prosa', () => {
    const markdown = renderProseTranscript(CUES, {
      videoId: ID,
      title: 'Größe und Übersicht',
      channel: 'Beispielkanal',
      duration: 40,
      chapters: CHAPTERS,
      language: 'de',
      kind: 'manual',
      provider: 'yt-dlp',
    });

    expect(markdown.startsWith('---\n')).toBe(true);
    expect(markdown).toContain('doc_type: transcript');
    expect(markdown).toContain(`video_id: ${ID}`);
    expect(markdown).toContain('transcript_style: prose');
    expect(markdown).toContain('transcript_provider: yt-dlp');
    expect(markdown).toContain('cue_count: 5');
    expect(markdown).toContain('# Größe und Übersicht — Transcript');
    expect(markdown).toContain('## 00:00 — Einleitung');
    expect(markdown).toContain('## 00:12 — Nach der Pause');
    expect(markdown).toContain('Nach der Pause geht es mit Groesse und Uebersicht weiter.');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('behaelt Umlaute wortwoertlich', () => {
    const markdown = renderProseTranscript(
      [{ start: 0, end: 2, text: 'Größe ist kein Maß für Qualität — höchstens für Mühe.' }],
      { videoId: ID, title: 'Umlaute' },
    );
    expect(markdown).toContain('Größe ist kein Maß für Qualität — höchstens für Mühe.');
  });

  it('sagt ehrlich, wenn es kein Transcript gibt', () => {
    const markdown = renderProseTranscript([], { videoId: ID, title: 'Ohne Untertitel' });
    expect(markdown).toContain('_Kein Transcript verfuegbar._');
    expect(markdown).toContain('cue_count: 0');
  });
});

describe('renderTimestampedTranscript', () => {
  it('haelt das Zeilenformat exakt ein', () => {
    const markdown = renderTimestampedTranscript(CUES, {
      videoId: ID,
      title: 'Größe und Übersicht',
      duration: 40,
      chapters: CHAPTERS,
    });
    const lines = markdown.split('\n').filter((line) => line.startsWith('- ['));

    expect(lines[0]).toBe(`- [\`00:00:00\`](https://youtu.be/${ID}?t=0) ${sentence(1)}`);
    expect(lines[4]).toBe(
      `- [\`00:00:15\`](https://youtu.be/${ID}?t=15) Nach der Pause geht es mit Groesse und Uebersicht weiter.`,
    );
    expect(markdown).toContain('transcript_style: timestamped');
    expect(markdown).toContain('## 00:12 — Nach der Pause');
  });

  it('buendelt wortweise Cues zu lesbaren Zeilen', () => {
    const words: Cue[] = 'so kommen auto generierte Captions oft herein'
      .split(' ')
      .map((word, index) => ({
        start: index * 0.4,
        end: index * 0.4 + 0.4,
        text: word,
      }));
    const lines = buildTimestampedLines(words);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe('so kommen auto generierte Captions oft herein');
  });

  it('setzt eine Stunde als HH:MM:SS und die Sekunde in den Deep-Link', () => {
    const markdown = renderTimestampedTranscript(
      [{ start: 3723, end: 3725, text: 'Spaet im Video.' }],
      { videoId: ID },
    );
    expect(markdown).toContain(`- [\`01:02:03\`](https://youtu.be/${ID}?t=3723) Spaet im Video.`);
  });
});
