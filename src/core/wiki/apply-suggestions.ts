/**
 * Gepruefte Vorschlaege in Seiten verwandeln.
 *
 * Zwei Zusagen, die diese Datei einhaelt:
 * - **`extend` haengt an.** Der Patch wird ein eigener Absatz mit Quellenangabe;
 *   bestehender Text wird nie ueberschrieben und nie umgeschrieben.
 * - **Widersprueche bleiben stehen.** Sie kommen als benannte Zeile in den Abschnitt
 *   „Widersprueche" der widersprochenen Seite — mit Beleg, ohne die alte Aussage
 *   anzutasten (docs/MODULE-SCHEMA.md, „Widersprueche").
 *
 * Ob eine Seite existiert, entscheidet der Store: er sieht auch, was dieser Lauf
 * gerade geschrieben hat. Ein Vorschlag auf eine Seite, die es nicht gibt, wird
 * angelegt — ein Widerspruch auf eine Seite, die es nicht gibt, wird verworfen.
 *
 * `deps.store` may be a digestion's `WikiTransaction` (`ingest.ts` hands one in):
 * it reads through unchanged, so the paragraph above still holds, and every page
 * written here is part of what a failed digestion takes back.
 */

import { excerpt } from '@core/vault/doc';
import { appendUnderSection, createPage, findPage, writePage } from './pages';
import { phrases } from './text';
import type { PageRef, WikiContradiction, WikiDeps } from './types';
import type { WikiSuggestion } from './suggestions';

/** Laenge des Einzeilers, der in den Katalog wandert. */
const SUMMARY_CHARS = 120;

export interface ApplySuggestionsInput {
  module: string;
  /** Slug der Source-Seite — jeder Patch belegt damit. */
  sourceSlug: string;
  suggestions: readonly WikiSuggestion[];
}

/** Eine Seite, die dieser Lauf angelegt oder ergaenzt hat. */
export interface AppliedPage {
  ref: PageRef;
  action: 'create' | 'extend';
  /** Einzeiler fuer `index.md`. */
  summary: string;
}

export interface ApplySuggestionsResult {
  pages: AppliedPage[];
  contradictions: WikiContradiction[];
  /** Alle geschriebenen Pfade, in Reihenfolge. */
  written: string[];
}

/** Der Beleg, den jede nicht-triviale Aussage traegt (docs/VAULT-FORMAT.md). */
export function sourceRef(sourceSlug: string): string {
  return `(source: [[${sourceSlug}]])`;
}

/** Patch mit Beleg. Steht der Beleg schon drin, wird er nicht doppelt gesetzt. */
function withSource(patch: string, sourceSlug: string): string {
  return patch.includes(`[[${sourceSlug}]]`) ? patch : `${patch}\n\n${sourceRef(sourceSlug)}`;
}

/**
 * Die Vorschlaege ausfuehren. Ein einzelner Fehlschlag (Konflikt, fremde Datei)
 * bricht den Ingest nicht ab: die Quelle ist dann trotzdem eingetragen, und der
 * Pflegelauf findet, was fehlt.
 */
export async function applySuggestions(
  deps: WikiDeps,
  input: ApplySuggestionsInput,
): Promise<ApplySuggestionsResult> {
  const language = deps.docLanguage ?? 'de';
  const now = deps.now ?? new Date();
  const lookup = { store: deps.store, pages: deps.index.pages() };
  const pages: AppliedPage[] = [];
  const written: string[] = [];

  for (const suggestion of input.suggestions) {
    const block = withSource(suggestion.patch, input.sourceSlug);
    const existing = await findPage(lookup, input.module, suggestion.slug);
    if (existing !== null) {
      await writePage(
        deps.store,
        existing.path,
        { appendBody: block, addSources: [input.sourceSlug], now },
        language,
      );
      pages.push({ ref: existing, action: 'extend', summary: excerpt(block, SUMMARY_CHARS) });
      written.push(existing.path);
      continue;
    }
    const created = await createPage(deps.store, {
      module: input.module,
      type: suggestion.type,
      title: suggestion.title,
      slug: suggestion.slug,
      body: block,
      tags: suggestion.tags,
      sources: [input.sourceSlug],
      now,
      language,
    });
    pages.push({ ref: created.ref, action: 'create', summary: excerpt(block, SUMMARY_CHARS) });
    written.push(created.ref.path);
  }

  const contradictions = await writeContradictions(deps, input, written);
  return { pages, contradictions, written };
}

/**
 * Widersprueche eintragen — erst nachdem alle Seiten stehen, damit ein Widerspruch
 * auch auf eine Seite zeigen darf, die dieser Lauf gerade angelegt hat.
 */
async function writeContradictions(
  deps: WikiDeps,
  input: ApplySuggestionsInput,
  written: string[],
): Promise<WikiContradiction[]> {
  const language = deps.docLanguage ?? 'de';
  const text = phrases(language);
  const now = deps.now ?? new Date();
  const lookup = { store: deps.store, pages: deps.index.pages() };
  const found: WikiContradiction[] = [];

  for (const suggestion of input.suggestions) {
    const conflict = suggestion.contradicts;
    if (conflict === null) continue;
    const target = await findPage(lookup, input.module, conflict.page);
    // Eine erfundene Gegenseite ist kein Widerspruch, sondern eine Halluzination.
    if (target === null) continue;
    const doc = await deps.store.read(target.path);
    if (doc === null) continue;
    const line = `- [[${input.sourceSlug}]] ${text.contradicts} ${conflict.note}`;
    if (doc.body.includes(conflict.note)) continue;
    await writePage(
      deps.store,
      target.path,
      {
        body: appendUnderSection(doc.body, text.contradictions, line),
        addSources: [input.sourceSlug],
        expectedHash: doc.hash,
        now,
      },
      language,
    );
    if (!written.includes(target.path)) written.push(target.path);
    found.push({ page: target.slug, source: input.sourceSlug, note: conflict.note });
  }
  return found;
}
