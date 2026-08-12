/* Aus einer verdichteten Quelle werden Wiki-Seiten: Entitaeten und Konzepte
   anlegen oder ergaenzen, Querverweise setzen, Widersprueche benennen.

   Die harte Regel dieses Prompts — dieselbe wie beim Einordnen eines Dumps:
   **nur Seiten aus der mitgegebenen Liste duerfen ergaenzt werden.** Ein erfundener
   Slug ist keine Verknuepfung, sondern eine Halluzination; der Aufrufer verwirft
   sie (`core/wiki/ingest.ts`). Und: `patch` **ergaenzt** — bestehender Text wird
   nie ueberschrieben, nie umgeschrieben, nie geloescht.

   „Vor jeder neuen Seite im Wiki suchen": eine bestehende Seite ergaenzen ist fast
   immer besser als eine Beinahe-Dublette anzulegen (docs/MODULE-SCHEMA.md). */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';
import type { KnownPageHint } from './summarize-source';

/** Hoechstzahl vorgeschlagener Seiten, wenn der Aufrufer keine nennt. */
export const DEFAULT_MAX_PAGES = 8;

const MAX_KNOWN = 40;

export const WIKI_INGEST_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      description: 'Seiten, die diese Quelle beruehrt. Typisch drei bis acht.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'type', 'title', 'action', 'patch'],
        properties: {
          slug: {
            type: 'string',
            description:
              'Dateiname ohne Endung, klein und mit Bindestrichen. Bei action=extend ' +
              'wortwoertlich ein Slug aus der Bestandsliste.',
          },
          type: { type: 'string', enum: ['entity', 'concept'] },
          title: { type: 'string', description: 'Sprechender Titel der Seite.' },
          action: {
            type: 'string',
            enum: ['create', 'extend'],
            description: 'extend nur fuer Seiten aus der Bestandsliste.',
          },
          patch: {
            type: 'string',
            description:
              'Der Text, der auf die Seite kommt: bei create die ganze Seite, bei extend ' +
              'ein eigener Absatz, der etwas hinzufuegt. Verlinke andere Seiten als [[slug]].',
          },
          tags: { type: 'array', items: { type: 'string' } },
          contradicts: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['page', 'note'],
            description: 'Nur wenn diese Quelle einer bestehenden Seite widerspricht.',
            properties: {
              page: { type: 'string', description: 'Slug der widersprochenen Seite.' },
              note: { type: 'string', description: 'Ein Satz: worin der Konflikt besteht.' },
            },
          },
        },
      },
    },
    overviewChange: {
      type: ['string', 'null'],
      description:
        'Nur wenn sich die Synthese des Moduls wirklich geaendert hat: ein bis zwei Saetze ' +
        'fuer overview.md. Sonst null — eine Quelle allein aendert die Synthese selten.',
    },
  },
};

export interface WikiIngestInput {
  module: string;
  /** Slug der Source-Seite (`s-YYYY-MM-DD-…`) — jeder Patch belegt damit. */
  sourceSlug: string;
  sourceTitle: string;
  /** Die **Verdichtung**, nicht der Rohtext: verdichtet wird nur einmal. */
  summary: string;
  /** Seiten, die es im Modul schon gibt. Nur daraus darf `extend` kommen. */
  pages?: readonly KnownPageHint[];
  maxPages?: number;
  maxChars?: number;
}

function pageLine(page: KnownPageHint): string {
  const excerpt = page.excerpt === undefined ? '' : ` — ${page.excerpt}`;
  return `- ${page.slug} (${page.title})${excerpt}`;
}

export function wikiIngestPrompt(input: WikiIngestInput, docLanguage: DocLanguage): ChatTurn[] {
  const pages = (input.pages ?? []).slice(0, MAX_KNOWN);
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;

  return turns(
    [
      'Du pflegst ein Wiki aus verdichteten Quellen: Entitaeten (Personen, Firmen, Produkte, Systeme, Werkzeuge) und Konzepte (Muster, Verfahren, Begriffe, Techniken).',
      documentLanguageRule(docLanguage),
      `Schlage hoechstens ${maxPages} Seiten vor. Nimm nur, was die Quelle wirklich traegt.`,
      'Suche zuerst im Bestand: gibt es die Seite schon, ist action=extend und slug wortwoertlich der Slug aus der Liste. Eine Beinahe-Dublette anzulegen ist ein Fehler.',
      'Bei action=extend ist patch ein eigener Absatz, der etwas hinzufuegt. Schreibe nichts um, wiederhole nichts, loesche nichts — der bestehende Text bleibt stehen.',
      'Bei action=create ist patch die ganze neue Seite als Prosa mit Stichpunkten, ohne Frontmatter und ohne Titelzeile.',
      'Verlinke grosszuegig: andere Seiten des Moduls als [[slug]]. Verlinke nur Slugs, die in der Bestandsliste stehen oder die du in derselben Antwort anlegst.',
      `Jede nicht-triviale Aussage traegt ihren Beleg: (source: [[${input.sourceSlug}]]).`,
      'Widerspricht die Quelle einer bestehenden Seite, setze contradicts mit deren Slug und einem Satz zum Konflikt. Beide Fassungen bleiben stehen; nichts wird geglaettet.',
      `Erfinde keine Slugs, keine Module und keine Quellen. Das Modul ist ${input.module} — ein anderer Modulname existiert fuer dich nicht.`,
      'overviewChange nur, wenn sich die Synthese des Moduls wirklich verschoben hat. Im Zweifel null.',
      'Keine Einleitung, kein Lob, keine Emoji.',
    ],
    [
      `Modul: ${input.module}`,
      `Quelle: [[${input.sourceSlug}]] — ${input.sourceTitle.trim()}`,
      '',
      'Bestand im Modul:',
      pages.length > 0 ? pages.map(pageLine).join('\n') : '- (noch keine Seiten)',
      '',
      'Verdichtung der Quelle:',
      clamp(input.summary, input.maxChars ?? 8000),
    ],
  );
}
