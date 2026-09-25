/* The wiring of the knowledge core — in exactly one place.
 *
 * Three areas hang off `@core/wiki`: modules (read and write pages),
 * sources (condense), and questions (answer, write back). They need the
 * same four things — store, index, gateway, document language — and the
 * same follow-up after a write. Previously this was written out three
 * times; a copy that drifts is a bug that only surfaces for the user.
 *
 * Two decisions you wouldn't otherwise see in the code:
 * - **The core gets a full `VaultStore`,** not the shell's narrow view
 *   (`VaultStoreLike` only knows `writeText` without a hash and `append`
 *   without `frontmatterIfNew`). Same spot as in `core-bridge.ts` for the
 *   index: `FsVaultStore` holds no state, so a second one costs nothing.
 * - **The index follow-up must never cost anything.** It is derived: if it
 *   fails, the write stays valid and the renderer is woken up regardless.
 */

import { FsVaultStore } from '@core/vault';
import type { VaultStore } from '@core/vault/types';
import type { WikiIndexView, WikiIngestDeps } from '@core/wiki';
import type { DocLanguage, UiLanguage } from '@shared/types';
import { fail } from './registry';
import { createGateway } from '../llm-bridge';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** What the knowledge core needs from the index — `IndexService` satisfies it. */
const WIKI_INDEX_METHODS: readonly string[] = [
  'index',
  'search',
  'searchPassages',
  'pages',
  'modules',
];

/**
 * The store as the core needs it: catalog and history are written as raw text
 * with a hash, and a new module creates folders.
 */
export function wikiStore(services: Services): VaultStore {
  return new FsVaultStore(services.requireVaultRoot());
}

function knowsPages(index: IndexLike): index is IndexLike & WikiIndexView {
  const record = index as unknown as Record<string, unknown>;
  return WIKI_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** The index as the core's read view. If a derivation is missing, the channel reports it. */
export function wikiIndex(services: Services): WikiIndexView {
  const index = services.requireIndex();
  if (!knowsPages(index)) throw fail('io', 'der Index liefert keine Wiki-Ableitungen');
  return index;
}

/** The document language of the open vault — pages are written in it. */
export function docLanguage(services: Services): DocLanguage {
  return services.settings.vault()?.languages.documents ?? 'de';
}

/** The language the user is replied to in. */
export function replyLanguage(services: Services): UiLanguage {
  const languages = services.settings.vault()?.languages;
  return languages?.conversation ?? languages?.ui ?? 'de';
}

/**
 * Everything ingest, questions, and write-back need. Typed as `WikiIngestDeps`
 * because the digestion writes through a transaction and its way back is
 * `VaultStore.delete` — the wider of the two contracts, and `FsVaultStore`
 * satisfies it anyway. Questions and write-back only ever see `WikiDeps`.
 */
export function wikiDeps(
  services: Services,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): WikiIngestDeps {
  return {
    store: wikiStore(services),
    index: wikiIndex(services),
    gateway: createGateway(services),
    docLanguage: docLanguage(services),
    /* `languages.translateSources`: off means the condensation stays in the
       source's language. Without a vault, the default applies (translate). */
    translateSources: services.settings.vault()?.languages.translateSources !== false,
    now: new Date(),
    ...(signal === undefined ? {} : { signal }),
    ...(onProgress === undefined ? {} : { onProgress }),
  };
}

/**
 * After every write: bring the index up to date, then wake the renderer.
 * `area` only appears in the warning — it says whose follow-up failed.
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
      /* The index is derived: its follow-up must not retroactively turn a
         successful write into a failure. */
      console.warn(`[${area}] Index-Nachlauf fehlgeschlagen:`, error);
    }
  }
  services.sendEvent('event:vault-changed', { paths: touched, external: false });
}
