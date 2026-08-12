/* Lange Quellen schneiden. Zwei Dinge muessen stimmen: an Ueberschriften wird
   geschnitten, wo es welche gibt, und ohne Ueberschriften wandert genug Text ueber
   die Nahtstelle, dass kein Gedanke dort verschwindet. */

import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARS, splitForSummary } from '@core/wiki';

function paragraphs(count: number, chars = 400): string {
  return Array.from({ length: count }, (_unused, index) =>
    `Absatz ${index + 1}. ${'wort '.repeat(Math.max(1, Math.round(chars / 5)))}`.trim(),
  ).join('\n\n');
}

describe('splitForSummary', () => {
  it('laesst einen kurzen Text ein einziges Stueck', () => {
    expect(splitForSummary('Kurzer Text.')).toEqual(['Kurzer Text.']);
    expect(splitForSummary('   ')).toEqual([]);
  });

  it('schneidet an Ueberschriften', () => {
    const text = [
      `# Kapitel eins\n\n${paragraphs(8)}`,
      `# Kapitel zwei\n\n${paragraphs(8)}`,
      `# Kapitel drei\n\n${paragraphs(8)}`,
    ].join('\n\n');

    const chunks = splitForSummary(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(chunks[0]).toContain('# Kapitel eins');
    expect(chunks.join('\n')).toContain('# Kapitel drei');
  });

  it('schneidet ohne Ueberschriften absatzweise, mit Ueberlappung', () => {
    const chunks = splitForSummary(paragraphs(40));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    // Der Anfang des zweiten Stuecks steht schon im ersten: das ist die Naht.
    const overlap = (chunks[1] ?? '').slice(0, 40);
    expect(chunks[0]).toContain(overlap);
  });

  it('teilt einen einzelnen Bandwurm-Absatz hart, statt ihn abzuschicken', () => {
    const chunks = splitForSummary('x'.repeat(20_000));
    expect(chunks.length).toBe(4);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });

  it('haelt die eigene Grenze ein, wenn sie kleiner gesetzt wird', () => {
    const chunks = splitForSummary(paragraphs(10), { maxChars: 1200, overlap: 100 });
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1200);
    expect(chunks.length).toBeGreaterThan(2);
  });
});
