/**
 * Haeufig genannte Begriffe ohne eigene Seite.
 *
 * Deterministisch ueber Haeufigkeit, nicht ueber ein Urteil: Kandidaten sind
 * Begriffe, die der Autor selbst hervorgehoben hat — **fett** oder als Text eines
 * Wikilinks. Gemeldet wird ein Kandidat erst, wenn er in mindestens drei Seiten
 * desselben Moduls vorkommt (gezaehlt ueber das Wortverzeichnis, also auch dort, wo
 * er nur im Fliesstext steht) und keine Seite auf seinen Namen laeuft.
 *
 * Gefiltert wird streng, weil ein falscher Kandidat den Nutzer Arbeit kostet:
 * - Funktionswoerter und Woerter unter vier Zeichen fallen weg.
 * - Hoechstens drei Woerter je Begriff — laenger ist ein Satz, kein Begriff.
 * - Begriffe, zu denen es eine Seite gibt (nach Slug **oder** Titel, unscharf ueber
 *   `pageKey`), fallen weg.
 * - Ziele kaputter Wikilinks fallen weg: die meldet `broken-link` schon, und
 *   zweimal derselbe Sachverhalt ist Rauschen.
 *
 * Der Befund hat keinen Fix: eine Seite anzulegen heisst, sie zu schreiben. Das
 * Modell darf den Kandidaten im Audit bestaetigen oder verwerfen — angelegt wird
 * er von Hand oder beim naechsten Ingest.
 */

import type { GardenerFinding, WikiPage } from '@shared/types';
import { pageKey } from '@core/wiki';
import { buildFinding } from '../types';
import type { Check, GardenerContext, GardenerModuleView } from '../types';
import { boldSpans, contentWords, linkTexts } from '../similarity';
import { WordIndex } from '../word-index';

/** In so vielen Seiten muss ein Begriff stehen. */
export const MIN_TERM_PAGES = 3;

/** Kuerzere Begriffe sind Abkuerzungen ohne Trennschaerfe. */
export const MIN_TERM_CHARS = 4;

/** Mehr Woerter sind ein Satzteil, kein Begriff. */
export const MAX_TERM_WORDS = 3;

/** Hoechstzahl geprueefter Kandidaten je Modul — haeufigste zuerst. */
export const MAX_CANDIDATE_TERMS = 200;

/** Hoechstzahl gemeldeter Begriffe je Modul. */
export const MAX_TERMS_PER_MODULE = 20;

/** Hoechstzahl genannter Belegseiten je Befund. */
const MAX_LISTED_PAGES = 5;

interface Candidate {
  /** Anzeigeform, wie sie in der Datei steht. */
  term: string;
  words: string[];
  /** Wie oft hervorgehoben — nur die Reihenfolge der Pruefung. */
  hits: number;
}

function keyOf(words: readonly string[]): string {
  return words.join(' ');
}

/** Begriffe, die der Autor hervorgehoben hat, je Modul zusammengefasst. */
function candidatesOf(module: GardenerModuleView, bodyOf: (page: WikiPage) => string): Candidate[] {
  const found = new Map<string, Candidate>();
  for (const page of module.pages) {
    const body = bodyOf(page);
    for (const raw of [...boldSpans(body), ...linkTexts(body)]) {
      const words = contentWords(raw);
      if (words.length === 0 || words.length > MAX_TERM_WORDS) continue;
      const key = keyOf(words);
      if (key.length < MIN_TERM_CHARS) continue;
      const known = found.get(key);
      if (known === undefined) found.set(key, { term: raw.trim(), words, hits: 1 });
      else known.hits += 1;
    }
  }
  return [...found.values()]
    .sort((a, b) => b.hits - a.hits || keyOf(a.words).localeCompare(keyOf(b.words)))
    .slice(0, MAX_CANDIDATE_TERMS);
}

/** Namen, unter denen es im Modul schon eine Seite gibt. */
function knownKeys(module: GardenerModuleView, brokenTargets: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>(brokenTargets);
  for (const page of module.pages) {
    keys.add(pageKey(page.slug));
    keys.add(pageKey(page.title));
  }
  return keys;
}

export const missingPageCheck: Check = {
  kind: 'missing-page',

  run(ctx: GardenerContext): GardenerFinding[] {
    const { byPath, brokenLinks } = ctx.index.index();
    const bodyOf = (page: WikiPage): string => byPath.get(page.path)?.body ?? '';
    const findings: GardenerFinding[] = [];

    for (const module of ctx.modules) {
      const brokenTargets = new Set(
        brokenLinks
          .filter((link) => link.from.startsWith(`${module.slug}/`))
          .map((link) => pageKey(link.target)),
      );
      const known = knownKeys(module, brokenTargets);
      const candidates = candidatesOf(module, bodyOf).filter(
        (candidate) => !known.has(pageKey(candidate.term)),
      );
      if (candidates.length === 0) continue;

      const words = WordIndex.from(
        module.pages.map((page) => ({ path: page.path, body: bodyOf(page) })),
      );
      const hits: { candidate: Candidate; pages: string[] }[] = [];
      for (const candidate of candidates) {
        const pages = words.pagesWith(candidate.words);
        if (pages.length >= MIN_TERM_PAGES) hits.push({ candidate, pages });
      }
      hits.sort(
        (a, b) =>
          b.pages.length - a.pages.length ||
          keyOf(a.candidate.words).localeCompare(keyOf(b.candidate.words)),
      );

      for (const hit of hits.slice(0, MAX_TERMS_PER_MODULE)) {
        const text = ctx.labels.missingPage(hit.candidate.term, hit.pages.length);
        findings.push(
          buildFinding(ctx, {
            kind: 'missing-page',
            severity: 'info',
            title: text.title,
            detail: text.detail,
            paths: hit.pages.slice(0, MAX_LISTED_PAGES),
            module: module.slug,
            key: [module.slug, keyOf(hit.candidate.words)],
          }),
        );
      }
    }
    return findings;
  },
};
