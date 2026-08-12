/* Ein kleines, echtes Wiki fuer die Tests des Wissens-Kerns.
 *
 * Der Bestand ist der Fixture-Vault aus `tests/fixtures/vault/`: ein Modul
 * `identity-management` mit Katalog, Chronik, Synthese, einer Source-Seite, zwei
 * Entitaeten und einem Konzept — samt der absichtlichen Pflege-Maengel (kaputter
 * Wikilink, verwaiste Seite, fehlender Katalogeintrag, unverdichtete Quelle).
 *
 * Der Index laeuft echt darueber (`IndexService`), damit Suche, Seitengraph und
 * Zaehlungen geprueft werden und nicht ein handgeschriebenes Objekt. Die Uhr steht
 * auf `NOW` aus `tests/helpers/time.ts` (2026-08-10).
 */

import { IndexService } from '@core/index/service';
import type { LlmGateway } from '@core/llm';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { WikiDeps } from '@core/wiki';
import type { DocLanguage } from '@shared/types';
import { fixtureVaultFiles } from '../../fixtures';
import { NOW_MS } from '../../helpers/time';

export const MODULE = 'identity-management';
export const WIKI_DIR = `modules/${MODULE}/wiki`;
export const OAUTH_PATH = `${WIKI_DIR}/entities/oauth2.md`;
export const SCIM_PATH = `${WIKI_DIR}/entities/scim.md`;
export const TOKEN_PATH = `${WIKI_DIR}/concepts/token-lebensdauer.md`;
export const OVERVIEW_PATH = `${WIKI_DIR}/overview.md`;
export const INDEX_PATH = `${WIKI_DIR}/index.md`;
export const LOG_PATH = `${WIKI_DIR}/log.md`;
export const SOURCE_PATH = `${WIKI_DIR}/sources/s-2026-08-04-token-lifetimes-blog.md`;

/** Die unverdichtete Rohquelle des Fixture-Vaults samt Protokoll. */
export const RAW_PATH = 'raw/web/2026-08-06-digital-gardening-ueberblick.md';
export const PROTOCOL_PATH = 'raw/web/2026-08-06-digital-gardening-ueberblick.ingest.json';

export interface WikiFixture {
  store: MemoryVaultStore;
  /** Erfuellt `WikiIndexView` strukturell. */
  index: IndexService;
  /** Nach eigenen Schreibvorgaengen nachziehen. */
  refresh(): Promise<void>;
  /** Dateiinhalt; wirft, wenn die Datei fehlt — ein leerer String verschleiert nur. */
  text(path: string): Promise<string>;
  deps(gateway: LlmGateway, language?: DocLanguage): WikiDeps;
}

export async function wikiFixture(extra: Record<string, string> = {}): Promise<WikiFixture> {
  const store = new MemoryVaultStore({
    files: { ...fixtureVaultFiles(), ...extra },
    now: new Date(NOW_MS),
  });
  const index = await IndexService.open(store, {
    persistence: null,
    now: () => new Date(NOW_MS),
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
    deps: (gateway, language = 'de') => ({
      store,
      index,
      gateway,
      docLanguage: language,
      now: NOW_MS,
    }),
  };
}
