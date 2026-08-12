/* Die Belegpruefung im Kleinen. Sie ist die letzte Instanz vor der Oberflaeche:
   was hier durchgeht, zeigt die App als Beleg — also darf hier nichts durchgehen,
   was nicht in einer Datei steht. */

import { describe, expect, it } from 'vitest';
import {
  citationsFromExcerpts,
  citedTargets,
  lineOfQuote,
  quotedSpans,
  validateCitations,
} from '@core/wiki';
import type { CitationSource, WikiExcerpt } from '@core/wiki';

const PATH = 'modules/m/wiki/concepts/tokens.md';
const BODY = [
  '',
  'Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei',
  'jeder Nutzung (source: [[s-2026-08-04-blog]]).',
  '',
  '## Widersprüche',
  '',
  '- Der Stand aus dem Erstprojekt nannte 12 Stunden.',
].join('\n');

const SOURCE: CitationSource = { path: PATH, title: 'Tokens', body: BODY, bodyLine: 11 };
const EXCERPT: WikiExcerpt = {
  path: PATH,
  title: 'Tokens',
  module: 'm',
  quote: 'Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei',
  line: 12,
  score: 0.9,
};

describe('Fundstellen lesen', () => {
  it('liest Pfade und Zitate aus einer Antwort', () => {
    expect(citedTargets(`Steht in [[${PATH}]] und nochmal [[${PATH}]].`)).toEqual([PATH]);
    expect(quotedSpans('Er schreibt: „Access-Token 15 Minuten" — mehr nicht.')).toEqual([
      'Access-Token 15 Minuten',
    ]);
    expect(quotedSpans('> Access-Token 15 Minuten\n')).toEqual(['Access-Token 15 Minuten']);
    // Wortfetzen sind kein Zitat.
    expect(quotedSpans('„kurz"')).toEqual([]);
  });

  it('findet die Zeile, in der ein Zitat wirklich beginnt', () => {
    expect(lineOfQuote(SOURCE, 'Access-Token 15 Minuten')).toBe(12);
    // Ueber den Umbruch hinweg zaehlt der Anfang.
    expect(lineOfQuote(SOURCE, 'mit Rotation bei jeder Nutzung')).toBe(12);
    expect(lineOfQuote(SOURCE, 'Der Stand aus dem Erstprojekt')).toBe(17);
    expect(lineOfQuote(SOURCE, 'steht nirgends')).toBeNull();
  });
});

describe('validateCitations', () => {
  it('nimmt ein woertliches Zitat samt Fundstelle', () => {
    const check = validateCitations(
      `15 Minuten [[${PATH}]]. Wörtlich: „Access-Token 15 Minuten, Refresh-Token 8 Stunden"`,
      [EXCERPT],
      [SOURCE],
    );

    expect(check.unsupported).toBe(false);
    expect(check.rejected).toEqual([]);
    expect(check.citations).toEqual([
      {
        path: PATH,
        title: 'Tokens',
        quote: 'Access-Token 15 Minuten, Refresh-Token 8 Stunden',
        line: 12,
      },
    ]);
  });

  it('nimmt einen Pfad ohne Zitat mit dem Ausschnitt als Beleg', () => {
    const check = validateCitations(`Kurz gesagt: 15 Minuten [[${PATH}]].`, [EXCERPT], [SOURCE]);
    expect(check.citations[0]?.quote).toBe(EXCERPT.quote);
    expect(check.citations[0]?.line).toBe(12);
    expect(check.unsupported).toBe(false);
  });

  it('verwirft ein erfundenes Zitat und markiert die Antwort', () => {
    const check = validateCitations(
      `[[${PATH}]] Wörtlich: „Access-Token leben zwölf Stunden, sicher"`,
      [EXCERPT],
      [SOURCE],
    );
    expect(check.rejected).toContain('Access-Token leben zwölf Stunden, sicher');
    expect(check.unsupported).toBe(true);
    expect(check.citations.map((entry) => entry.quote)).toEqual([EXCERPT.quote]);
  });

  it('verwirft einen Pfad, der nicht gelesen wurde', () => {
    const check = validateCitations('Steht in [[modules/m/wiki/concepts/erfunden.md]].', [], []);
    expect(check.citations).toEqual([]);
    expect(check.unsupported).toBe(true);
    expect(check.rejected).toEqual(['modules/m/wiki/concepts/erfunden.md']);
  });

  it('nennt eine Antwort ohne jeden Beleg unbelegt', () => {
    expect(validateCitations('Dazu steht nichts im Vault.', [EXCERPT], [SOURCE])).toMatchObject({
      citations: [],
      unsupported: true,
    });
  });

  it('erkennt einen Pfad auch am Dateinamen, wenn er eindeutig ist', () => {
    const check = validateCitations('Siehe [[tokens.md]].', [EXCERPT], [SOURCE]);
    expect(check.citations.map((entry) => entry.path)).toEqual([PATH]);
  });

  it('macht aus Ausschnitten Belege, wenn kein Modell formuliert hat', () => {
    expect(citationsFromExcerpts([EXCERPT])).toEqual([
      { path: PATH, title: 'Tokens', quote: EXCERPT.quote, line: 12 },
    ]);
  });
});
