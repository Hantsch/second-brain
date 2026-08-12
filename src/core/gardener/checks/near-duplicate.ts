/**
 * Beinahe-Dubletten: zwei Seiten desselben Moduls sagen fast dasselbe.
 *
 * Deterministisch, ohne Modell: normalisierte Woerter (deutsche und englische
 * Funktionswoerter entfernt, Umlaute gefaltet, Code-Zaeune weg) werden zu
 * Dreier-Wortfolgen (Shingles) gebuendelt, und verglichen wird die
 * Jaccard-Aehnlichkeit dieser Mengen.
 *
 * **Warum 0,30?** Zwei unabhaengige Seiten zum selben Thema teilen einzelne
 * Woerter, aber kaum dieselben Dreierfolgen — gemessen liegen sie unter 0,10. Eine
 * Seite, die aus einer anderen entstanden und dann umformuliert wurde, behaelt
 * dagegen einen grossen Teil ihrer Wortfolgen und liegt ueber 0,40. Die Schwelle
 * dazwischen meldet Kandidaten, ohne jedes Themenpaar zu melden.
 *
 * Drei Einschraenkungen, jede aus einem falschen Positiv gelernt:
 * - Verglichen wird nur **innerhalb desselben Seitentyps**. Eine Concept-Seite
 *   uebernimmt Formulierungen ihrer Quelle — das ist Verdichtung, keine Dublette.
 * - **`overview.md` bleibt aussen vor.** Die Synthese wiederholt jede Seite des
 *   Moduls; sie waere zu allem aehnlich.
 * - **Sehr kurze Seiten** liefern zu wenige Wortfolgen fuer ein Urteil.
 *
 * Zusammengefuehrt wird nie etwas. Der Fix oeffnet beide Seiten zum Vergleich.
 */

import type { GardenerFinding, WikiPage, WikiPageType } from '@shared/types';
import { buildFinding, buildFix } from '../types';
import type { Check, GardenerContext } from '../types';
import { contentWords, jaccard, shingles } from '../similarity';

/** Ab hier gilt ein Paar als Kandidat. */
export const NEAR_DUPLICATE_THRESHOLD = 0.3;

/** Weniger Wortfolgen tragen kein Urteil. */
export const MIN_SHINGLES = 20;

/** Mehr Wortfolgen je Seite bringen kein besseres Urteil, nur Laufzeit. */
export const MAX_SHINGLES_PER_PAGE = 400;

/**
 * Wortfolgen, die in mehr Seiten stehen, sind Textbaustein („beide Fassungen
 * bleiben stehen") und kein Hinweis auf eine Dublette. Sie zaehlen nicht mit —
 * das haelt die Paarbildung auch in grossen Modulen linear.
 */
export const MAX_PAGES_PER_SHINGLE = 12;

/** Hoechstzahl gemeldeter Paare je Modul, staerkste zuerst. */
export const MAX_PAIRS_PER_MODULE = 50;

interface Candidate {
  page: WikiPage;
  shingles: Set<string>;
}

interface Pair {
  first: WikiPage;
  second: WikiPage;
  similarity: number;
}

function candidatesOf(pages: readonly WikiPage[], bodyOf: (page: WikiPage) => string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const page of pages) {
    const words = contentWords(bodyOf(page));
    const set = shingles(words);
    if (set.size < MIN_SHINGLES) continue;
    const capped =
      set.size <= MAX_SHINGLES_PER_PAGE ? set : new Set([...set].slice(0, MAX_SHINGLES_PER_PAGE));
    candidates.push({ page, shingles: capped });
  }
  return candidates;
}

/** Paare mit gemeinsamen Wortfolgen, ueber ein umgekehrtes Verzeichnis gefunden. */
function sharedCounts(candidates: readonly Candidate[]): Map<string, number> {
  const postings = new Map<string, number[]>();
  for (const [at, candidate] of candidates.entries()) {
    for (const shingle of candidate.shingles) {
      const list = postings.get(shingle);
      if (list === undefined) postings.set(shingle, [at]);
      else list.push(at);
    }
  }
  const shared = new Map<string, number>();
  for (const list of postings.values()) {
    if (list.length < 2 || list.length > MAX_PAGES_PER_SHINGLE) continue;
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const key = `${list[a]}|${list[b]}`;
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
    }
  }
  return shared;
}

function pairsOf(candidates: readonly Candidate[]): Pair[] {
  const pairs: Pair[] = [];
  for (const [key, count] of sharedCounts(candidates)) {
    const [left = '', right = ''] = key.split('|');
    const first = candidates[Number(left)];
    const second = candidates[Number(right)];
    if (first === undefined || second === undefined) continue;
    const similarity = jaccard(first.shingles.size, second.shingles.size, count);
    if (similarity < NEAR_DUPLICATE_THRESHOLD) continue;
    pairs.push({ first: first.page, second: second.page, similarity });
  }
  pairs.sort(
    (a, b) =>
      b.similarity - a.similarity ||
      a.first.path.localeCompare(b.first.path) ||
      a.second.path.localeCompare(b.second.path),
  );
  return pairs.slice(0, MAX_PAIRS_PER_MODULE);
}

/** Typen, die verglichen werden. `overview` waere zu allem aehnlich. */
const COMPARED: readonly WikiPageType[] = ['source', 'entity', 'concept'];

export const nearDuplicateCheck: Check = {
  kind: 'near-duplicate',

  run(ctx: GardenerContext): GardenerFinding[] {
    const { byPath } = ctx.index.index();
    const bodyOf = (page: WikiPage): string => byPath.get(page.path)?.body ?? '';
    const findings: GardenerFinding[] = [];

    for (const module of ctx.modules) {
      for (const type of COMPARED) {
        const pages = module.pages.filter((page) => page.type === type);
        if (pages.length < 2) continue;
        for (const pair of pairsOf(candidatesOf(pages, bodyOf))) {
          const [first, second] =
            pair.first.path <= pair.second.path
              ? [pair.first, pair.second]
              : [pair.second, pair.first];
          const text = ctx.labels.nearDuplicate(first.title, second.title, pair.similarity);
          findings.push(
            buildFinding(ctx, {
              kind: 'near-duplicate',
              severity: 'info',
              title: text.title,
              detail: text.detail,
              paths: [first.path, second.path],
              module: module.slug,
              key: [first.path, second.path],
              fix: buildFix(ctx, 'merge'),
            }),
          );
        }
      }
    }
    return findings;
  },
};
