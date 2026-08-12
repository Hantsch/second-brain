/* Die Verdrahtung des Wissens-Kerns — an genau einer Stelle.
 *
 * Drei Bereiche hängen an `@core/wiki`: Module (Seiten lesen und schreiben),
 * Quellen (verdichten) und Fragen (antworten, zurückschreiben). Sie brauchen
 * dieselben vier Dinge — Store, Index, Gateway, Dokumentsprache — und denselben
 * Nachlauf nach einem Schreibvorgang. Vorher stand das dreimal da; eine Kopie,
 * die sich verschiebt, ist ein Fehler, der erst beim Nutzer auffällt.
 *
 * Zwei Entscheidungen, die man im Code sonst nicht sieht:
 * - **Der Kern bekommt einen vollen `VaultStore`,** nicht die schmale Sicht der
 *   Shell (`VaultStoreLike` kennt `writeText` ohne Hash und `append` ohne
 *   `frontmatterIfNew`). Dieselbe Stelle wie in `core-bridge.ts` beim Index:
 *   `FsVaultStore` hält keinen Zustand, ein zweiter kostet nichts.
 * - **Der Index-Nachlauf darf nichts kosten.** Er ist abgeleitet: schlägt er
 *   fehl, bleibt der Schreibvorgang gültig und der Renderer wird trotzdem
 *   geweckt.
 */

import { FsVaultStore } from '@core/vault';
import type { VaultStore } from '@core/vault/types';
import type { WikiDeps, WikiIndexView } from '@core/wiki';
import type { DocLanguage, UiLanguage } from '@shared/types';
import { fail } from './registry';
import { createGateway } from '../llm-bridge';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** Was der Wissens-Kern am Index braucht — `IndexService` erfüllt es. */
const WIKI_INDEX_METHODS: readonly string[] = ['index', 'search', 'pages', 'modules'];

/**
 * Der Store, wie der Kern ihn braucht: Katalog und Chronik werden als roher Text
 * mit Hash geschrieben, und ein neues Modul legt Ordner an.
 */
export function wikiStore(services: Services): VaultStore {
  return new FsVaultStore(services.requireVaultRoot());
}

function knowsPages(index: IndexLike): index is IndexLike & WikiIndexView {
  const record = index as unknown as Record<string, unknown>;
  return WIKI_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** Der Index als Lesesicht des Kerns. Fehlt eine Ableitung, sagt der Kanal es. */
export function wikiIndex(services: Services): WikiIndexView {
  const index = services.requireIndex();
  if (!knowsPages(index)) throw fail('io', 'der Index liefert keine Wiki-Ableitungen');
  return index;
}

/** Die Dokumentsprache des offenen Vaults — in ihr werden Seiten geschrieben. */
export function docLanguage(services: Services): DocLanguage {
  return services.settings.vault()?.languages.documents ?? 'de';
}

/** Die Sprache, in der dem Nutzer geantwortet wird. */
export function replyLanguage(services: Services): UiLanguage {
  const languages = services.settings.vault()?.languages;
  return languages?.conversation ?? languages?.ui ?? 'de';
}

/** Alles, was Ingest, Frage und Zurückschreiben brauchen. */
export function wikiDeps(services: Services, signal?: AbortSignal): WikiDeps {
  return {
    store: wikiStore(services),
    index: wikiIndex(services),
    gateway: createGateway(services),
    docLanguage: docLanguage(services),
    /* `languages.translateSources`: aus heisst, die Verdichtung bleibt in der
       Sprache der Quelle. Ohne Vault gilt die Vorgabe (übersetzen). */
    translateSources: services.settings.vault()?.languages.translateSources !== false,
    now: new Date(),
    ...(signal === undefined ? {} : { signal }),
  };
}

/**
 * Nach jedem Schreibvorgang: Index nachziehen, dann den Renderer wecken.
 * `area` steht nur in der Warnung — sie soll sagen, wessen Nachlauf ausfiel.
 */
export async function settle(
  services: Services,
  paths: readonly string[],
  area = 'wiki',
): Promise<void> {
  const touched = [...new Set(paths)];
  const index = services.index();
  if (index?.refresh) {
    try {
      await index.refresh(touched);
      await services.refreshIndexState();
    } catch (error) {
      /* Der Index ist abgeleitet: sein Nachlauf darf einen gelungenen
         Schreibvorgang nicht nachträglich zum Fehler machen. */
      console.warn(`[${area}] Index-Nachlauf fehlgeschlagen:`, error);
    }
  }
  services.sendEvent('event:vault-changed', { paths: touched, external: false });
}
