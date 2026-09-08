/**
 * Wiki-Seiten lesen und schreiben — die einzige Stelle, an der Seitenpfade und
 * Seiten-Frontmatter entstehen.
 *
 * Drei Regeln aus docs/VAULT-FORMAT.md und docs/MODULE-SCHEMA.md:
 * - **Nichts wird ueberschrieben.** `writePage` mergt Frontmatter und haengt Text an
 *   (`appendBody`); bestehende Absaetze bleiben Wort fuer Wort stehen.
 * - **`updated` setzt nur die App**, und nur wenn sie selbst schreibt.
 * - **Vor jeder neuen Seite wird gesucht** (`findPage`) — eine bestehende Seite
 *   ergaenzen ist fast immer besser als eine Beinahe-Dublette anzulegen.
 */

import type { DocLanguage, VaultDoc, WikiPage, WikiPageType, WriteResult } from '@shared/types';
import { fold } from '@core/index/text';
import type { IndexedDoc } from '@core/index/types';
import { isoDay, modulePagePath, slugify } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { appendToSection, findSections } from '@core/vault/sections';
import { phrases } from './text';
import { WikiError } from './types';
import type { PageRef, WikiStore } from './types';

/** Ordner unter `wiki/` je Seitentyp — die Umkehrung von `modulePagePath`. */
const TYPE_OF_DIR: Record<string, WikiPageType> = {
  sources: 'source',
  entities: 'entity',
  concepts: 'concept',
};

/** Hoechstzahl an Versuchen, einen freien Slug zu finden. */
const MAX_SLUG_TRIES = 50;

/** Eine gelesene Seite: der Verweis auf sie und ihr Inhalt. */
export interface WikiPageDoc {
  ref: PageRef;
  doc: VaultDoc;
}

/** Pfad einer Seite. `overview` hat genau eine Seite je Modul. */
export function pagePath(module: string, type: WikiPageType, slug: string): string {
  return modulePagePath(module, type, slug);
}

/**
 * Verweis auf eine Seite aus ihrem Pfad. `null`, wenn der Pfad keine Wiki-Seite
 * ist — `index.md` und `log.md` sind Struktur, keine Seiten.
 */
export function pageRefOf(path: string, frontmatter: Record<string, unknown> = {}): PageRef | null {
  const match = /^modules\/([^/]+)\/wiki\/(?:(sources|entities|concepts)\/)?([^/]+)\.md$/.exec(
    path,
  );
  if (match === null) return null;
  const [, module = '', dir, name = ''] = match;
  const type = dir === undefined ? (name === 'overview' ? 'overview' : null) : TYPE_OF_DIR[dir];
  if (type === undefined || type === null) return null;
  const declared = frontmatter['title'];
  return {
    path,
    module,
    slug: name,
    type,
    title: typeof declared === 'string' && declared.trim().length > 0 ? declared.trim() : name,
  };
}

/** Seite lesen. `null`, wenn es die Datei nicht gibt; wirft bei fremden Pfaden. */
export async function readPage(store: WikiStore, path: string): Promise<WikiPageDoc | null> {
  const doc = await store.read(path);
  if (doc === null) return null;
  const ref = pageRefOf(path, doc.frontmatter);
  if (ref === null) throw new WikiError('invalid', `Keine Wiki-Seite: ${path}`);
  return { ref, doc };
}

export interface WritePageInput {
  /** Frontmatter-Felder, die gesetzt werden. Unbekannte Felder bleiben erhalten. */
  frontmatter?: Record<string, unknown>;
  /** Rumpf ersetzen. Nur fuer Seiten, die die App selbst gebaut hat. */
  body?: string;
  /** Absatz am Ende des Rumpfs anhaengen — der schonende Weg. */
  appendBody?: string;
  /** Hash, den der Aufrufer gelesen hat. Fehlt er, gilt der frisch gelesene. */
  expectedHash?: string;
  /** Source-Slugs, die zu `sources` dazukommen. Bestehende bleiben. */
  addSources?: readonly string[];
  now?: DateLike;
}

/**
 * Seite schreiben: Frontmatter mergen, `updated` setzen, Konflikt melden statt
 * ueberschreiben. Ein Anhang landet vor dem Widerspruchs-Abschnitt, damit die
 * benannten Konflikte am Ende der Seite zusammenbleiben.
 */
export async function writePage(
  store: WikiStore,
  path: string,
  input: WritePageInput,
  language: DocLanguage = 'de',
): Promise<WriteResult> {
  const existing = await store.read(path);
  const day = isoDay(input.now ?? new Date());
  const frontmatter: Record<string, unknown> = { ...(input.frontmatter ?? {}), updated: day };
  if (input.addSources !== undefined && input.addSources.length > 0) {
    frontmatter['sources'] = mergeSources(existing?.frontmatter['sources'], input.addSources);
  }

  const body =
    input.appendBody === undefined
      ? input.body
      : appendParagraph(
          input.body ?? existing?.body ?? '',
          input.appendBody,
          phrases(language).contradictions,
        );

  return store.write({
    path,
    frontmatter,
    ...(body === undefined ? {} : { body }),
    expectedHash: input.expectedHash ?? existing?.hash,
  });
}

/** `sources` ergaenzen, ohne Bestand zu verlieren und ohne Dubletten. */
export function mergeSources(existing: unknown, added: readonly string[]): string[] {
  const list = Array.isArray(existing)
    ? existing.filter((entry): entry is string => typeof entry === 'string')
    : typeof existing === 'string'
      ? [existing]
      : [];
  for (const slug of added) if (slug.length > 0 && !list.includes(slug)) list.push(slug);
  return list;
}

/**
 * Einen Absatz anhaengen. Gibt es einen Abschnitt `beforeSection` (die
 * Widersprueche), wird davor eingesetzt — sonst am Dateiende. Bestehender Text
 * bleibt unangetastet.
 */
export function appendParagraph(body: string, block: string, beforeSection?: string): string {
  const text = block.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) return body;
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const cut =
    beforeSection === undefined
      ? -1
      : (findSections(normalized, 2).find(
          (range) => range.heading.trim().toLowerCase() === beforeSection.trim().toLowerCase(),
        )?.headingLine ?? -1);

  if (cut < 0) {
    const kept = [...lines];
    while (kept.length > 0 && (kept[kept.length - 1] ?? '').trim().length === 0) kept.pop();
    return kept.length === 0 ? `${text}\n` : `${kept.join('\n')}\n\n${text}\n`;
  }
  const head = lines.slice(0, cut);
  while (head.length > 0 && (head[head.length - 1] ?? '').trim().length === 0) head.pop();
  return [...head, '', text, '', ...lines.slice(cut)].join('\n');
}

/**
 * Text unter einer Abschnitts-Ueberschrift des Rumpfs anhaengen; fehlt der
 * Abschnitt, entsteht er am Ende. Derselbe Weg, den `VaultStore.append` geht — hier
 * auf dem Rumpf, damit Frontmatter und Rumpf in einem Schreibvorgang zusammenkommen.
 */
export function appendUnderSection(body: string, heading: string, block: string): string {
  return appendToSection(body, heading, block).content;
}

/** Frontmatter einer neuen Seite nach docs/VAULT-FORMAT.md. */
export function pageFrontmatter(input: {
  type: WikiPageType;
  title: string;
  module: string;
  day: string;
  tags?: readonly string[];
  sources?: readonly string[];
  language?: DocLanguage;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    type: input.type,
    title: input.title,
    module: input.module,
    created: input.day,
    updated: input.day,
    tags: [...(input.tags ?? [])],
    sources: [...(input.sources ?? [])],
    lang: input.language ?? 'de',
    ...(input.extra ?? {}),
  };
}

export interface CreatePageInput {
  module: string;
  type: WikiPageType;
  title: string;
  /** Rumpf der neuen Seite. */
  body?: string;
  tags?: readonly string[];
  sources?: readonly string[];
  /** Slug vorgeben, statt ihn aus dem Titel zu bilden. */
  slug?: string;
  now?: DateLike;
  language?: DocLanguage;
  /** Weitere Frontmatter-Felder, etwa `origin` oder `raw` einer Source-Seite. */
  extra?: Record<string, unknown>;
}

/**
 * Neue Seite anlegen. Der Slug kommt aus dem Titel; ist er belegt, haengt ein
 * Zaehler an — eine bestehende Seite wird nie ueberschrieben.
 */
export async function createPage(
  store: WikiStore,
  input: CreatePageInput,
): Promise<{ ref: PageRef; write: WriteResult }> {
  const base = slugify(input.slug ?? input.title);
  const slug = input.type === 'overview' ? 'overview' : await freeSlug(store, input, base);
  const path = pagePath(input.module, input.type, slug);
  const write = await store.create(
    path,
    pageFrontmatter({
      type: input.type,
      title: input.title.trim(),
      module: input.module,
      day: isoDay(input.now ?? new Date()),
      ...(input.tags === undefined ? {} : { tags: input.tags }),
      ...(input.sources === undefined ? {} : { sources: input.sources }),
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.extra === undefined ? {} : { extra: input.extra }),
    }),
    input.body ?? '',
  );
  const ref: PageRef = { path, module: input.module, slug, type: input.type, title: input.title };
  return { ref, write };
}

async function freeSlug(store: WikiStore, input: CreatePageInput, base: string): Promise<string> {
  for (let suffix = 1; suffix <= MAX_SLUG_TRIES; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (!(await store.exists(pagePath(input.module, input.type, candidate)))) return candidate;
  }
  throw new WikiError('conflict', `Kein freier Slug fuer "${input.title}" in ${input.module}.`);
}

/** Suchform eines Seitennamens: 'Auth0', 'auth0' und 'Auth 0' treffen sich hier. */
export function pageKey(value: string): string {
  return fold(slugify(value)).replace(/-/g, '');
}

export interface FindPageDeps {
  store: WikiStore;
  /** Seiten aus dem Index — sie tragen die Titel, ueber die unscharf gesucht wird. */
  pages?: readonly WikiPage[];
}

/**
 * Eine Seite eines Moduls finden, unscharf: Slug, Titel und beliebige
 * Schreibweisen davon fuehren auf dieselbe Seite („Auth0" = „auth0" = „Auth 0").
 *
 * Zwei Quellen, in dieser Reihenfolge: der Store (er sieht auch, was gerade
 * geschrieben wurde) und der Index (er kennt die Titel). Deshalb findet ein Ingest
 * seine eigenen frischen Seiten, ohne auf den naechsten Indexlauf zu warten.
 */
export async function findPage(
  deps: FindPageDeps,
  module: string,
  titleOrSlug: string,
): Promise<PageRef | null> {
  const raw = (titleOrSlug ?? '').trim();
  if (raw.length === 0) return null;
  // Ein Wikilink darf hereingegeben werden: '[[modul/slug]]' zaehlt wie 'slug'.
  const cleaned = raw.replace(/^\[\[|\]\]$/g, '').split('|')[0] ?? raw;
  const scoped = cleaned.includes('/') ? (cleaned.split('/').pop() ?? cleaned) : cleaned;
  const slug = slugify(scoped);
  const key = pageKey(scoped);

  // 'overview' hat je Modul genau einen Pfad — es waere sonst der Treffer fuer jeden
  // unbekannten Namen. Nur der ausdrueckliche Slug fuehrt dorthin.
  const types: WikiPageType[] = ['entity', 'concept', 'source'];
  if (slug === 'overview') types.push('overview');
  for (const type of types) {
    const path = pagePath(module, type, slug);
    const doc = await deps.store.read(path);
    if (doc !== null) return pageRefOf(path, doc.frontmatter);
  }

  for (const page of deps.pages ?? []) {
    if (page.module !== module) continue;
    if (pageKey(page.slug) === key || pageKey(page.title) === key) {
      return { path: page.path, module, slug: page.slug, type: page.type, title: page.title };
    }
  }
  return null;
}

export interface FindSourcePageDeps {
  store: WikiStore;
  /**
   * Indizierte Dateien — nur sie kennen die Seiten eines Moduls samt Frontmatter.
   * Der Store kann nicht auflisten, und `WikiPage` traegt `raw` nicht.
   */
  docs?: readonly IndexedDoc[];
}

/**
 * Die Source-Seite eines Moduls zu einer Rohquelle finden: die Seite, deren
 * Frontmatter `raw` **genau** auf diesen Pfad zeigt.
 *
 * Gebraucht wird sie nach einem harten Abbruch — dann steht die Seite schon, ohne
 * dass das Protokoll sie kennt, und ein zweiter Versuch soll in sie zurueckschreiben
 * statt eine zweite daneben zu legen (Story 050, D-c).
 *
 * Der Index liefert nur die Kandidaten; entschieden wird am Store, denn er ist die
 * Wahrheit und sein Hash ist der, mit dem zurueckgeschrieben wird. Eine Seite, die
 * es nicht mehr gibt oder deren `raw` inzwischen anders lautet, faellt damit heraus:
 * die Seite einer **anderen** Quelle wird nie wiederverwendet.
 */
export async function findSourcePageForRaw(
  deps: FindSourcePageDeps,
  module: string,
  rawPath: string,
): Promise<WikiPageDoc | null> {
  const wanted = (rawPath ?? '').trim();
  if (wanted.length === 0 || (module ?? '').trim().length === 0) return null;

  for (const doc of deps.docs ?? []) {
    if (doc.module !== module || rawOf(doc.frontmatter) !== wanted) continue;
    const ref = pageRefOf(doc.path, doc.frontmatter);
    if (ref === null || ref.type !== 'source') continue;
    const page = await readPage(deps.store, doc.path);
    if (page === null || page.ref.type !== 'source') continue;
    if (rawOf(page.doc.frontmatter) === wanted) return page;
  }
  return null;
}

/** Der Weg zurueck zur Rohquelle, wie er im Frontmatter steht. */
function rawOf(frontmatter: Record<string, unknown>): string | null {
  const value = frontmatter['raw'];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
