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

/* ── Verdichtungs-Artefakt (additiv) ───────────────────────────────────────
 *
 * Das Artefakt zum Bereich `Gesundheit`: eine vom Modell geschriebene
 * Zusammenfassung von `areas/gesundheit.md`. Es liegt bewusst **nicht** in
 * `tests/fixtures/vault/` — der Bestand dort ist auf Zaehlungen und
 * Pflege-Befunde festgelegt. Wer den Beleg-Ausschluss prueft, legt es ueber
 * `wikiFixture(condensedAreaFiles())` obendrauf.
 *
 * Sein Wortlaut ist absichtlich der bessere Volltexttreffer zu
 * `CONDENSED_QUESTION`: die Frage steht darin fast woertlich, in
 * `AREA_PATH` nur verteilt. Ohne Ausschluss stuende es also vorn.
 */

/** Die Primaerdatei, aus der das Artefakt verdichtet wurde. */
export const AREA_PATH = 'areas/gesundheit.md';
export const CONDENSED_PATH = 'areas/gesundheit.condensed.md';

/** Frage, deren bester Treffer das Artefakt ist — `AREA_PATH` trifft auch. */
export const CONDENSED_QUESTION = 'Was hilft dem Rücken bei langen Sitzungen?';

/**
 * Frage, die **nur** im Artefakt einen Treffer hat: das Wort ist die Synthese
 * des Modells und steht in keiner Datei des Nutzers.
 */
export const CONDENSED_ONLY_QUESTION = 'Regenerationsfenster';

/** Das Artefakt als „vault-relativer Pfad → Inhalt". */
export function condensedAreaFiles(): Record<string, string> {
  return {
    [CONDENSED_PATH]: [
      '---',
      'type: condensed',
      'title: Gesundheit — verdichtet',
      'condensed_at: 2026-08-10T09:15:00+02:00',
      'sources:',
      `  - ${AREA_PATH}`,
      'source_hashes:',
      `  ${AREA_PATH}: 9f2c1b`,
      'created: 2026-08-10',
      'updated: 2026-08-10',
      'scope: private',
      'lang: de',
      '---',
      '',
      '## Stand',
      '',
      'Dem Rücken hilft bei langen Sitzungen eine kurze Pause: Pausen bei langen',
      'Sitzungen helfen dem Rücken mehr als jede neue Übung.',
      '',
      '## Muster',
      '',
      'Das Regenerationsfenster vor Mitternacht wirkt stärker als eine Stunde',
      'länger liegen zu bleiben.',
      '',
      '## Offen',
      '',
      'Der Termin beim Physiotherapeuten steht weiter aus.',
      '',
      '## Direktiven',
      '',
      '- Keine Trainingspläne vorschlagen.',
      '',
    ].join('\n'),
  };
}

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
