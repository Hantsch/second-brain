/* Werkzeug der Gardener-Tests.
 *
 * Zwei Arten von Bestand:
 * - `demoFixture()` — der Demo-Vault in Klein (`demo-vault.ts`), mit genau den
 *   sechs absichtlichen Mängeln von `npm run seed`.
 * - `moduleFixture(pages)` — ein einzelnes Modul, das ein Test selbst füllt. Für
 *   jeden Check gibt es damit ein Fixture, das ihn auslöst, und eines, das ihn
 *   nicht auslöst.
 *
 * Der Index läuft in beiden Fällen **echt** (`IndexService` über
 * `MemoryVaultStore`) — kein handgeschriebenes Index-Objekt. Damit prüfen die
 * Tests denselben Graphen, dieselben Todos und dieselben Rohquellen, die die App
 * auch benutzt. Die Uhr steht auf `NOW` (2026-08-10). */

import { IndexService } from '@core/index/service';
import { buildContext } from '@core/gardener';
import type {
  GardenerContext,
  GardenerDeps,
  GardenerRunOptions,
  GardenerSettingsLike,
} from '@core/gardener';
import type { LlmGateway } from '@core/llm';
import { serialize } from '@core/vault/frontmatter';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { WikiPageType } from '@shared/types';
import { NOW_MS, day } from '../../helpers/time';
import { emptyGateway } from '../../helpers/llm';
import { demoVaultFiles } from './demo-vault';

/**
 * Die Schwellen des Demo-Vaults, ausgeschrieben: 120 Tage bis „angestaubt",
 * 14 Tage bis „liegengeblieben" (dieselben Zahlen wie `scripts/seed/check.mjs`).
 * Ausgeschrieben, damit ein geänderter Standardwert einen Test nicht stillschweigend
 * verschiebt.
 */
export const SETTINGS: GardenerSettingsLike = {
  gardener: { reviewAfterDays: 120, useLlm: false },
  overview: { staleAfterDays: 14 },
};

export interface GardenerFixture {
  store: MemoryVaultStore;
  /** Erfüllt `GardenerIndexView` strukturell. */
  index: IndexService;
  /** Nach eigenen Schreibvorgängen nachziehen. */
  refresh(): Promise<void>;
  /** Dateiinhalt; wirft, wenn die Datei fehlt — ein leerer String verschleiert nur. */
  text(path: string): Promise<string>;
  deps(gateway?: LlmGateway): GardenerDeps;
  ctx(options?: GardenerRunOptions, gateway?: LlmGateway): GardenerContext;
}

export async function gardenerFixture(files: Record<string, string>): Promise<GardenerFixture> {
  const store = new MemoryVaultStore({ files, now: new Date(NOW_MS) });
  const index = await IndexService.open(store, { persistence: null, now: () => new Date(NOW_MS) });

  const deps = (gateway: LlmGateway = emptyGateway()): GardenerDeps => ({
    index,
    gateway,
    now: NOW_MS,
  });

  return {
    store,
    index,
    refresh: async () => {
      await index.rebuild();
    },
    text: async (path) => {
      const content = await store.readText(path);
      if (content === null) throw new Error(`Datei fehlt: ${path}`);
      return content;
    },
    deps,
    ctx: (options = {}, gateway = emptyGateway()) => buildContext(deps(gateway), options),
  };
}

/** Der Demo-Vault in Klein. */
export function demoFixture(): Promise<GardenerFixture> {
  return gardenerFixture(demoVaultFiles());
}

export interface FixturePage {
  type: WikiPageType;
  slug: string;
  title: string;
  body: string;
  /** Tage relativ zu heute, negativ ist Vergangenheit. */
  created?: number;
  reviewed?: number;
  /** `reviewed` weglassen — für den Fall „Seite ohne Prüfdatum". */
  withoutReviewed?: boolean;
  sources?: string[];
  extra?: Record<string, unknown>;
  /** Einzeiler im Katalog; ohne ihn steht die Seite nicht drin. */
  summary?: string;
}

const DIRS: Record<WikiPageType, string> = {
  source: 'sources/',
  entity: 'entities/',
  concept: 'concepts/',
  overview: '',
};

/** Pfad einer Seite in einem Test-Modul. */
export function pagePathOf(module: string, page: { type: WikiPageType; slug: string }): string {
  const name = page.type === 'overview' ? 'overview' : page.slug;
  return `modules/${module}/wiki/${DIRS[page.type]}${name}.md`;
}

const HEADINGS: Record<WikiPageType, string> = {
  source: 'Quellen',
  entity: 'Entitäten',
  concept: 'Begriffe',
  overview: 'Synthese',
};

function catalogOf(module: string, pages: readonly FixturePage[]): string {
  const lines = [`# Katalog — ${module}`, ''];
  for (const type of ['source', 'entity', 'concept', 'overview'] as WikiPageType[]) {
    const listed = pages.filter((page) => page.type === type && page.summary !== undefined);
    if (listed.length === 0) continue;
    lines.push(`## ${HEADINGS[type]}`, '');
    for (const page of listed) lines.push(`- [[${page.slug}]] — ${page.summary ?? ''}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export interface ModuleFilesOptions {
  /** Katalogtext selbst setzen; `null` heißt: es gibt kein `index.md`. */
  catalog?: string | null;
  /** Weitere Dateien im Vault (Dumps, Projekte, Rohquellen). */
  extraFiles?: Record<string, string>;
}

/**
 * Ein Modul mit Katalog und Chronik. Ohne eigenen Katalog entsteht einer, in dem
 * jede Seite mit `summary` steht — was keinen hat, fehlt darin und ist Index-Drift.
 */
export function moduleFiles(
  module: string,
  pages: readonly FixturePage[],
  options: ModuleFilesOptions = {},
): Record<string, string> {
  const files: Record<string, string> = {
    [`modules/${module}/module.md`]: serialize(
      {
        type: 'note',
        title: module,
        slug: module,
        description: 'Testmodul',
        created: day(-60),
        updated: day(0),
        tags: [],
        lang: 'de',
      },
      'Ein Modul für die Tests.\n',
    ),
    [`modules/${module}/wiki/log.md`]: '# Chronik\n',
  };
  const catalog = options.catalog === undefined ? catalogOf(module, pages) : options.catalog;
  if (catalog !== null) files[`modules/${module}/wiki/index.md`] = catalog;

  for (const page of pages) {
    files[pagePathOf(module, page)] = serialize(
      {
        type: page.type,
        title: page.title,
        module,
        created: day(page.created ?? -30),
        updated: day(page.reviewed ?? -30),
        ...(page.withoutReviewed === true ? {} : { reviewed: day(page.reviewed ?? -30) }),
        tags: [],
        sources: page.sources ?? [],
        lang: 'de',
        ...(page.extra ?? {}),
      },
      page.body,
    );
  }
  return { ...files, ...(options.extraFiles ?? {}) };
}

/** Ein Fixture mit genau einem Modul. */
export function moduleFixture(
  module: string,
  pages: readonly FixturePage[],
  options: ModuleFilesOptions = {},
): Promise<GardenerFixture> {
  return gardenerFixture(moduleFiles(module, pages, options));
}
