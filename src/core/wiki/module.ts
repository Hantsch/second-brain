/**
 * Ein Wissens-Modul anlegen und auflisten.
 *
 * Ein Modul ist ein Ordner mit fuenf Startdateien (docs/MODULE-SCHEMA.md):
 * `module.md`, `wiki/index.md`, `wiki/log.md`, `wiki/overview.md` und `AGENTS.md` —
 * das Schema selbst, mit eingesetztem Modulnamen, damit auch ein fremdes LLM das
 * Modul pflegen kann.
 *
 * **Entscheidung zum Frontmatter von `module.md`:** `type: note`.
 * docs/VAULT-FORMAT.md legt das fest („`module` ist kein Dokumenttyp") und der
 * Seed schreibt es so. `overview` waere falsch — diesen Typ traegt `wiki/overview.md`,
 * die Synthese *im* Wiki; `module.md` beschreibt dagegen das Modul und ist keine
 * Wiki-Seite (der Seitengraph in `core/index/pages` sieht nur Dateien unter
 * `modules/<slug>/wiki/`).
 * Dazu kommen `slug`, `description` und `module` — Letzteres, damit jede Datei des
 * Moduls ihre Zugehoerigkeit selbst traegt.
 *
 * `createModule` ist idempotent: eine vorhandene Datei wird nie ueberschrieben, ein
 * zweiter Aufruf legt nur an, was fehlt.
 */

import type { DocLanguage, KnowledgeModule } from '@shared/types';
import {
  isoDay,
  moduleDir,
  modulePath,
  slugify,
  wikiIndexPath,
  wikiLogPath,
} from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { renderAgentsMd } from './agents-md';
import { lastIngestDay, logHeader } from './log-md';
import { pageFrontmatter, pagePath } from './pages';
import { categoryHeading, phrases } from './text';
import { WikiError } from './types';
import type { WikiIndexView, WikiStore } from './types';

/** `modules/<slug>/AGENTS.md` — das Schema im Vault. */
export function agentsPath(module: string): string {
  return `${moduleDir(module)}/AGENTS.md`;
}

export interface CreateModuleInput {
  title: string;
  description?: string;
  tags?: readonly string[];
  /** Slug vorgeben, statt ihn aus dem Titel zu bilden. */
  slug?: string;
}

export interface CreateModuleResult {
  slug: string;
  /** Pfade, die dieser Aufruf tatsaechlich angelegt hat. */
  created: string[];
  /** Das Modul, wie die Oberflaeche es erwartet — Zaehlungen noch bei null. */
  module: KnowledgeModule;
}

export interface CreateModuleOptions {
  docLanguage?: DocLanguage;
  now?: DateLike;
}

/** Rumpf von `module.md`: Zweck, Abgrenzung — kurz, damit der Mensch weiterschreibt. */
function moduleBody(description: string, language: DocLanguage): string {
  const text = phrases(language);
  const intro = description.trim().length > 0 ? description.trim() : text.moduleIntro;
  return `${intro}\n\n## ${text.moduleScope}\n\n${text.moduleScopeEmpty}\n`;
}

/** Startinhalt von `wiki/index.md`: Kopf, Erklaerung, die Synthese als erster Eintrag. */
function indexBody(title: string, language: DocLanguage): string {
  const text = phrases(language);
  return [
    `# ${text.catalog} — ${title}`,
    '',
    text.catalogIntro,
    '',
    `## ${categoryHeading('overview', language)}`,
    '',
    `- [[overview]] — ${text.synthesis}`,
    '',
  ].join('\n');
}

/**
 * Startinhalt von `wiki/overview.md`: die beiden Fragen, die eine Synthese traegt —
 * und sonst nichts. Ein Platzhaltersatz („noch nichts verdichtet") waere falsch,
 * sobald Wissen da ist; der Ingest schreibt hier nicht mehr, erst die erste
 * Verdichtung ersetzt den Inhalt — und die bestaetigt der Mensch.
 */
function overviewBody(language: DocLanguage): string {
  const text = phrases(language);
  return [`## ${text.decided}`, '', `## ${text.open}`, ''].join('\n');
}

/**
 * Modul anlegen. Der Slug kommt aus dem Titel; gibt es das Modul schon, wird es
 * weitergefuehrt (idempotent) — zwei Module mit demselben Slug waeren dasselbe Modul.
 */
export async function createModule(
  store: WikiStore,
  input: CreateModuleInput,
  options: CreateModuleOptions = {},
): Promise<CreateModuleResult> {
  const title = (input.title ?? '').trim();
  if (title.length === 0) throw new WikiError('invalid', 'Ein Modul braucht einen Titel.');
  const slug = slugify(input.slug ?? title);
  const language = options.docLanguage ?? 'de';
  const day = isoDay(options.now ?? new Date());
  const created: string[] = [];

  /* Bestand gewinnt: ein zweiter Aufruf uebernimmt Titel, Beschreibung und Datum aus
     der Datei, statt sie mit den Eingaben zu ueberschreiben. */
  const existing = await store.read(modulePath(slug));
  const knownTitle = textField(existing?.frontmatter['title']) ?? title;
  const description =
    textField(existing?.frontmatter['description']) ?? (input.description ?? '').trim();
  const createdDay = textField(existing?.frontmatter['created']) ?? day;

  await createIfMissing(store, created, modulePath(slug), {
    frontmatter: {
      type: 'note',
      title,
      slug,
      module: slug,
      description,
      created: day,
      updated: day,
      tags: [...(input.tags ?? [])],
      lang: language,
    },
    body: moduleBody(description, language),
  });

  await createIfMissing(store, created, pagePath(slug, 'overview', 'overview'), {
    frontmatter: pageFrontmatter({
      type: 'overview',
      title: `${knownTitle} — ${phrases(language).synthesis}`,
      module: slug,
      day,
      language,
    }),
    body: overviewBody(language),
  });

  await writeTextIfMissing(store, created, wikiIndexPath(slug), indexBody(knownTitle, language));
  await writeTextIfMissing(store, created, wikiLogPath(slug), logHeader(language));
  await writeTextIfMissing(
    store,
    created,
    agentsPath(slug),
    renderAgentsMd(slug, knownTitle, language),
  );

  return {
    slug,
    created,
    module: {
      slug,
      title: knownTitle,
      description,
      created: createdDay,
      updated: day,
      counts: { sources: 0, entities: 0, concepts: 0 },
      findingCount: 0,
      lastIngest: null,
      tags: [...(input.tags ?? [])],
    },
  };
}

/** Ein Frontmatter-Feld als nicht-leerer Text, sonst `null`. */
function textField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function createIfMissing(
  store: WikiStore,
  created: string[],
  path: string,
  content: { frontmatter: Record<string, unknown>; body: string },
): Promise<void> {
  if (await store.exists(path)) return;
  await store.create(path, content.frontmatter, content.body);
  created.push(path);
}

async function writeTextIfMissing(
  store: WikiStore,
  created: string[],
  path: string,
  content: string,
): Promise<void> {
  if (await store.exists(path)) return;
  await store.writeText(path, content);
  created.push(path);
}

/**
 * Alle Module mit Zaehlungen. Grundlage ist die Ableitung des Index; `lastIngest`
 * kommt aus `wiki/log.md` — die Chronik ist die Wahrheit darueber, wann zuletzt
 * verdichtet wurde, nicht der Zeitstempel einer Rohquelle.
 *
 * `findingCount` bleibt 0: die Zahl sagt „keine bekannten Befunde", nicht „geprueft
 * und sauber". Sie fuellt sich, sobald der Pflegelauf existiert.
 */
export function listModules(index: WikiIndexView): KnowledgeModule[] {
  const byPath = index.index().byPath;
  return index.modules().map((module) => {
    const day = lastIngestDay(byPath.get(wikiLogPath(module.slug))?.body ?? null);
    return {
      ...module,
      findingCount: 0,
      lastIngest: pickIngest(day, module.lastIngest),
    };
  });
}

/**
 * Der Zeitpunkt des letzten Ingests. Die Chronik nennt den Tag, die Rohquelle den
 * Zeitstempel — passen beide zusammen, gewinnt der genauere.
 */
function pickIngest(day: string | null, fromSources: string | null): string | null {
  if (day === null) return fromSources;
  if (fromSources !== null && fromSources.slice(0, 10) === day) return fromSources;
  if (fromSources !== null && fromSources.slice(0, 10) > day) return fromSources;
  return day;
}
