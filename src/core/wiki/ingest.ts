/**
 * Der Kern: eine Rohquelle kommt herein und wird **einmal** verdichtet.
 *
 * Der Ablauf ist der aus docs/MODULE-SCHEMA.md, in dieser Reihenfolge:
 * 1. Source-Seite in `wiki/sources/` — worum es geht, die tragenden Aussagen mit
 *    Belegstellen, was neu ist, was dem Bestand widerspricht.
 * 2. Entitaeten und Konzepte anlegen oder ergaenzen, Widersprueche benennen.
 * 3. `wiki/index.md` nachziehen, `wiki/log.md` ergaenzen.
 * 4. `wiki/overview.md` nur, wenn sich die Synthese wirklich geaendert hat.
 *
 * **Ohne Modell geht nichts verloren.** Dann entsteht die Source-Seite trotzdem —
 * mit Kopf, erstem Absatz und dem Hinweis „noch nicht verdichtet"; sie steht im
 * Katalog und in der Chronik, traegt `condensed: false` und wartet auf ein Modell.
 * Ein Pflegelauf kann sie spaeter aufgreifen.
 */

import type { DocLanguage } from '@shared/types';
import type { KnownPageHint } from '@core/llm';
import { WIKI_INGEST_SCHEMA, isAbortError, parseJsonLoose, wikiIngestPrompt } from '@core/llm';
import { excerpt } from '@core/vault/doc';
import {
  MAX_SLUG_LENGTH,
  isoDay,
  moduleDir,
  slugify,
  sourceSlug as sourceSlugOf,
  wikiIndexPath,
} from '@core/vault/paths';
import { applySuggestions, sourceRef } from './apply-suggestions';
import { upsertEntries, type WikiIndexEntry } from './index-md';
import { appendLog } from './log-md';
import { appendUnderSection, createPage, pagePath, writePage } from './pages';
import { markRawProtocol } from './raw-protocol';
import { condenseSource } from './summarize';
import { readIngestReply, type IngestReply } from './suggestions';
import { phrases } from './text';
import { WikiError } from './types';
import type { WikiDeps, WikiIndexView, WikiIngestResult } from './types';

/** Laenge des Katalog-Einzeilers. */
const SUMMARY_CHARS = 120;
/** So viel Rohtext steht auf einer unverdichteten Source-Seite. */
const RAW_LEAD_CHARS = 700;
/** Wie viele Bestandsseiten das Modell zu sehen bekommt. */
const KNOWN_LIMIT = 40;

export interface IngestSourceInput {
  /** Rohquelle, vault-relativ: Ordner unter `raw/` oder Datei. */
  rawPath: string;
  module: string;
  title: string;
  /** Der Text der Quelle (Transcript, Artikel, Datei-Inhalt). */
  text: string;
  /** Herkunft, falls bekannt: URL oder Ursprungspfad. */
  origin?: string | null;
  tags?: readonly string[];
  /** Slug-Grundlage der Source-Seite; Vorgabe ist der Titel. */
  slug?: string;
}

/** Seiten des Moduls als Hinweis fuer das Modell — Slug, Titel, erster Absatz. */
export function knownPages(index: WikiIndexView, module: string): KnownPageHint[] {
  return index
    .pages()
    .filter((page) => page.module === module && page.type !== 'overview')
    .slice(0, KNOWN_LIMIT)
    .map((page) => ({ slug: page.slug, title: page.title, excerpt: page.excerpt }));
}

/** Rumpf der Source-Seite: die Verdichtung, dann der Weg zurueck zur Rohquelle. */
function sourceBody(
  markdown: string | null,
  input: IngestSourceInput,
  language: DocLanguage,
): string {
  const text = phrases(language);
  const origin = input.origin ?? null;
  const lead = markdown ?? `${excerpt(input.text, RAW_LEAD_CHARS)}\n\n${text.notCondensed}`.trim();
  const raw = [
    `## ${text.rawSource}`,
    '',
    `- [${input.rawPath}](${input.rawPath})`,
    ...(origin === null || origin.length === 0 || origin === input.rawPath ? [] : [`- ${origin}`]),
  ].join('\n');
  return `${lead}\n\n${raw}\n`;
}

/** Inhalt und Hash einer Datei ohne Frontmatter — Konfliktschutz fuer `writeText`. */
async function readRaw(
  deps: WikiDeps,
  path: string,
): Promise<{ content: string; hash: string } | null> {
  const doc = await deps.store.read(path);
  if (doc === null) return null;
  const content = await deps.store.readText(path);
  return content === null ? null : { content, hash: doc.hash };
}

/** Die Vorschlaege des Modells holen. Ohne Modell bleibt die Liste leer. */
async function askForPages(
  deps: WikiDeps,
  input: { module: string; sourceSlug: string; sourceTitle: string; summary: string },
): Promise<IngestReply> {
  const empty: IngestReply = { suggestions: [], overviewChange: null };
  if (!deps.gateway.isAvailable('wiki-ingest')) return empty;
  try {
    const result = await deps.gateway.complete({
      task: 'wiki-ingest',
      messages: wikiIngestPrompt(
        { ...input, pages: knownPages(deps.index, input.module) },
        deps.docLanguage ?? 'de',
      ),
      schema: WIKI_INGEST_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    return readIngestReply(parseJsonLoose(result.text), input.module);
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Kein Modell, kaputtes JSON, abgelehnte Anfrage: die Source-Seite steht schon.
    return empty;
  }
}

/**
 * Eine Quelle in ein Modul aufnehmen. Wirft nur, wenn das Modul fehlt oder der
 * Aufrufer abbricht — alles andere ist ein Ergebnis, kein Fehler.
 */
export async function ingestSource(
  deps: WikiDeps,
  input: IngestSourceInput,
): Promise<WikiIngestResult> {
  // Vor dem Slugify pruefen: `slugify('  ')` waere 'notiz' und damit ein Modul,
  // das niemand gemeint hat.
  const named = (input.module ?? '').trim();
  if (named.length === 0) throw new WikiError('invalid', 'Ingest ohne Modul.');
  const module = slugify(named);
  if (!(await deps.store.exists(moduleDir(module)))) {
    throw new WikiError('not-found', `Es gibt kein Modul "${module}".`);
  }
  const language = deps.docLanguage ?? 'de';
  const text = phrases(language);
  const now = deps.now ?? new Date();
  const day = isoDay(now);
  const title = (input.title ?? '').trim().length > 0 ? input.title.trim() : input.rawPath;

  const condensed = await condenseSource(deps, {
    title,
    text: input.text,
    origin: input.origin ?? input.rawPath,
    known: knownPages(deps.index, module),
  });

  // Platz fuer 's-JJJJ-MM-TT-': sonst kappt slugify genau die Datumsmarke wieder weg.
  const slugBase = sourceSlugOf(day, slugify(input.slug ?? title, MAX_SLUG_LENGTH - 14));
  const source = await createPage(deps.store, {
    module,
    type: 'source',
    title,
    slug: slugBase,
    body: sourceBody(condensed.markdown, input, language),
    tags: input.tags ?? [],
    now,
    language,
    extra: {
      raw: input.rawPath,
      ...(input.origin === undefined || input.origin === null ? {} : { origin: input.origin }),
      ...(condensed.markdown === null ? { condensed: false } : {}),
    },
  });

  const reply =
    condensed.markdown === null
      ? { suggestions: [], overviewChange: null }
      : await askForPages(deps, {
          module,
          sourceSlug: source.ref.slug,
          sourceTitle: title,
          summary: condensed.markdown,
        });
  const applied = await applySuggestions(deps, {
    module,
    sourceSlug: source.ref.slug,
    suggestions: reply.suggestions,
  });

  const overviewUpdated = await updateOverview(deps, module, source.ref.slug, reply.overviewChange);
  const touched = [
    source.ref.path,
    ...applied.written,
    ...(overviewUpdated ? [pagePath(module, 'overview', 'overview')] : []),
  ];

  const entries: WikiIndexEntry[] = [
    {
      type: 'source',
      slug: source.ref.slug,
      summary:
        condensed.markdown === null
          ? text.notCondensedShort
          : excerpt(condensed.markdown, SUMMARY_CHARS),
    },
    ...applied.pages.map((page) => ({
      type: page.ref.type,
      slug: page.ref.slug,
      summary: page.summary,
    })),
  ];
  const indexPath = wikiIndexPath(module);
  const known = await readRaw(deps, indexPath);
  const before = known?.content ?? `# ${text.catalog}\n\n${text.catalogIntro}\n`;
  await deps.store.writeText(indexPath, upsertEntries(before, entries, { language }), {
    ...(known === null ? {} : { expectedHash: known.hash }),
  });
  touched.push(indexPath);

  const log = await appendLog(
    deps.store,
    module,
    {
      kind: 'ingest',
      title,
      day,
      summary: source.ref.path,
      touched: [...applied.pages.map((page) => `[[${page.ref.slug}]]`), 'index.md'],
      ...(applied.contradictions.length === 0
        ? {}
        : {
            notes: applied.contradictions
              .map((entry) => `[[${entry.page}]]: ${entry.note}`)
              .join(' · '),
          }),
    },
    { now, language },
  );
  touched.push(log.path);

  await markRawProtocol(deps.store, input.rawPath, source.ref.slug, module);

  return {
    module,
    sourcePage: source.ref.path,
    sourceSlug: source.ref.slug,
    touchedPages: touched,
    createdPages: [
      source.ref.path,
      ...applied.pages.filter((page) => page.action === 'create').map((page) => page.ref.path),
    ],
    contradictions: applied.contradictions,
    usedLlm: condensed.usedLlm,
    overviewUpdated,
    model: condensed.model,
  };
}

/**
 * `overview.md` nachziehen — nur wenn das Modell eine wesentliche Aenderung meldet.
 * Eine Quelle allein verschiebt die Synthese selten; jeder Ingest wuerde sie sonst
 * zu einer zweiten Chronik machen.
 */
async function updateOverview(
  deps: WikiDeps,
  module: string,
  slug: string,
  change: string | null,
): Promise<boolean> {
  if (change === null || change.trim().length === 0) return false;
  const path = pagePath(module, 'overview', 'overview');
  const doc = await deps.store.read(path);
  if (doc === null) return false;
  const text = phrases(deps.docLanguage ?? 'de');
  const line = `- ${change.trim()} ${sourceRef(slug)}`;
  if (doc.body.includes(change.trim())) return false;
  await writePage(
    deps.store,
    path,
    {
      body: appendUnderSection(doc.body, text.decided, line),
      addSources: [slug],
      expectedHash: doc.hash,
      ...(deps.now === undefined ? {} : { now: deps.now }),
    },
    deps.docLanguage ?? 'de',
  );
  return true;
}
