/**
 * Lange Quellen in verdichtbare Stuecke schneiden.
 *
 * Ein YouTube-Transcript hat 40.000 Zeichen und keine Absaetze — ein Kontextfenster
 * hat weniger. Zwei Grenzen, in dieser Reihenfolge:
 *
 * 1. **Ueberschriften.** Kapitel sind die Grenzen, die der Autor selbst gesetzt hat.
 *    Wer dort schneidet, zerreisst keinen Gedanken und braucht keine Ueberlappung.
 * 2. **Absaetze mit Ueberlappung.** Ohne Ueberschriften wird bei ~6000 Zeichen
 *    geschnitten; die letzten Zeichen des vorigen Stuecks wandern mit, damit ein
 *    Gedanke an der Nahtstelle nicht verloren geht.
 *
 * „Nie mehr als noetig ans Modell schicken": ein Text unter der Grenze bleibt ein
 * einziges Stueck und kostet genau einen Aufruf.
 */

import { contentLines } from '@core/index/text';

/** Hoechstlaenge eines Stuecks in Zeichen. */
export const MAX_CHUNK_CHARS = 6000;

/** So viel Text wandert an der Nahtstelle mit. */
export const CHUNK_OVERLAP_CHARS = 400;

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

const HEADING = /^ {0,3}#{1,6}\s+\S/;

/** Zeilennummern aller Ueberschriften ausserhalb von Code-Zaeunen. */
function headingLines(text: string): number[] {
  const lines: number[] = [];
  for (const { line, index } of contentLines(text)) {
    if (HEADING.test(line)) lines.push(index);
  }
  return lines;
}

/** Bloecke zwischen Ueberschriften — der erste Block ist der Text davor. */
function blocksByHeading(text: string): string[] {
  const lines = text.split('\n');
  const starts = headingLines(text);
  if (starts.length === 0) return [];
  const bounds = starts[0] === 0 ? starts : [0, ...starts];
  const blocks: string[] = [];
  for (let index = 0; index < bounds.length; index += 1) {
    const from = bounds[index] ?? 0;
    const to = bounds[index + 1] ?? lines.length;
    const block = lines.slice(from, to).join('\n').trim();
    if (block.length > 0) blocks.push(block);
  }
  return blocks;
}

/** Bloecke zu Stuecken packen, ohne die Grenze zu ueberschreiten. */
function pack(blocks: readonly string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    if (current.length === 0) {
      current = block;
      continue;
    }
    if (current.length + block.length + 2 <= maxChars) {
      current = `${current}\n\n${block}`;
      continue;
    }
    chunks.push(current);
    current = block;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Der Schwanz eines Stuecks, an einer Absatz- oder Satzgrenze abgeschnitten. */
function overlapTail(chunk: string, overlap: number): string {
  if (overlap <= 0 || chunk.length <= overlap) return chunk.trim();
  const tail = chunk.slice(chunk.length - overlap);
  const paragraph = tail.indexOf('\n\n');
  if (paragraph >= 0) return tail.slice(paragraph + 2).trim();
  const sentence = tail.search(/(?<=[.!?])\s/);
  return (sentence >= 0 ? tail.slice(sentence + 1) : tail).trim();
}

/** Absatzweise schneiden, mit Ueberlappung an jeder Nahtstelle. */
function byParagraph(text: string, maxChars: number, overlap: number): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim().length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const piece = paragraph.trim();
    if (current.length > 0 && current.length + piece.length + 2 > maxChars) {
      chunks.push(current);
      current = overlapTail(current, overlap);
    }
    // Ein einzelner Absatz jenseits der Grenze wird hart geteilt: besser ein Schnitt
    // mitten im Satz als ein Aufruf, den das Modell abweist.
    if (piece.length > maxChars) {
      if (current.trim().length > 0) chunks.push(current);
      for (let at = 0; at < piece.length; at += maxChars) {
        chunks.push(piece.slice(at, at + maxChars));
      }
      current = '';
      continue;
    }
    current = current.length === 0 ? piece : `${current}\n\n${piece}`;
  }
  if (current.trim().length > 0) chunks.push(current);
  return chunks;
}

/**
 * Der Text in Stuecke, die einzeln verdichtet werden koennen. Ein kurzer Text
 * kommt als einzelnes Stueck zurueck — dann gibt es nichts zusammenzufuehren.
 */
export function splitForSummary(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(500, options.maxChars ?? MAX_CHUNK_CHARS);
  const overlap = Math.max(0, Math.min(options.overlap ?? CHUNK_OVERLAP_CHARS, maxChars / 2));
  const normalized = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) return [normalized];

  const blocks = blocksByHeading(normalized);
  if (blocks.length > 1) {
    const packed = pack(blocks, maxChars);
    // Ein Kapitel kann selbst zu lang sein; solche Stuecke werden nachgeteilt.
    return packed.flatMap((chunk) =>
      chunk.length <= maxChars ? [chunk] : byParagraph(chunk, maxChars, overlap),
    );
  }
  return byParagraph(normalized, maxChars, overlap);
}
