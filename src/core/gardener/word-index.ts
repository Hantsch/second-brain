/**
 * Ein Wortverzeichnis ueber die Seiten eines Moduls: welches Wort steht in welcher
 * Datei, und steht eine ganze Wortfolge darin?
 *
 * Zwei Checks brauchen genau das: „erwaehnt irgendeine Seite diese verwaiste Seite
 * im Text?" (dann gibt es eine klar bestimmbare Stelle fuer einen Verweis) und
 * „in wie vielen Seiten kommt dieser Begriff vor?" (fehlende Seite). Beide muessen
 * ohne Dateizugriff und in linearer Zeit auskommen — deshalb ein Verzeichnis statt
 * einer Suche je Frage: aufgebaut wird es in einem Durchlauf, gefragt wird darin
 * ueber die Wortliste, nicht ueber Zeichenketten.
 */

import { contentWords } from './similarity';

export class WordIndex {
  /** Datei → ihre bedeutungstragenden Woerter in Reihenfolge. */
  private readonly words = new Map<string, string[]>();
  /** Wort → Dateien, in denen es steht. */
  private readonly postings = new Map<string, Set<string>>();

  static from(entries: readonly { path: string; body: string }[]): WordIndex {
    const index = new WordIndex();
    for (const entry of entries) index.add(entry.path, contentWords(entry.body));
    return index;
  }

  private add(path: string, words: string[]): void {
    this.words.set(path, words);
    for (const word of words) {
      const set = this.postings.get(word);
      if (set === undefined) this.postings.set(word, new Set([path]));
      else set.add(path);
    }
  }

  /** Woerter einer Datei; leer, wenn die Datei nicht im Verzeichnis steht. */
  wordsOf(path: string): readonly string[] {
    return this.words.get(path) ?? [];
  }

  /**
   * Dateien, die **alle** diese Woerter enthalten. Vorauswahl fuer die genaue
   * Pruefung der Reihenfolge; ohne sie muesste jede Datei durchsucht werden.
   */
  candidates(words: readonly string[]): string[] {
    if (words.length === 0) return [];
    let smallest: Set<string> | null = null;
    for (const word of words) {
      const set = this.postings.get(word);
      if (set === undefined) return [];
      if (smallest === null || set.size < smallest.size) smallest = set;
    }
    const start: Set<string> = smallest ?? new Set<string>();
    return [...start].filter((path) =>
      words.every((word) => this.postings.get(word)?.has(path) === true),
    );
  }

  /** Steht die Wortfolge — in dieser Reihenfolge — in der Datei? */
  contains(path: string, words: readonly string[]): boolean {
    if (words.length === 0) return false;
    const haystack = this.words.get(path);
    if (haystack === undefined || haystack.length < words.length) return false;
    const first = words[0];
    for (let at = 0; at + words.length <= haystack.length; at += 1) {
      if (haystack[at] !== first) continue;
      let hit = true;
      for (let offset = 1; offset < words.length; offset += 1) {
        if (haystack[at + offset] !== words[offset]) {
          hit = false;
          break;
        }
      }
      if (hit) return true;
    }
    return false;
  }

  /** Dateien, in denen die Wortfolge wirklich steht — Vorauswahl plus Pruefung. */
  pagesWith(words: readonly string[]): string[] {
    return this.candidates(words)
      .filter((path) => this.contains(path, words))
      .sort((a, b) => a.localeCompare(b));
  }
}
