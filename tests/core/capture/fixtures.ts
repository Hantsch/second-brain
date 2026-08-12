/* Ein kleiner, echter Vault fuer die Capture-Tests.
 *
 * Der Bestand ist der Fixture-Vault aus `tests/fixtures/vault/` — zwei Projekte
 * (Arbeit und privat), ein Bereich, ein Modul, ein Tageseintrag. Der Index laeuft
 * echt darueber, damit auch der Kontextaufbau geprueft wird und nicht nur ein
 * handgeschriebenes Objekt.
 *
 * Die Uhr steht auf `NOW` aus `tests/helpers/time.ts` (2026-08-10, ein Montag).
 */

import { IndexService } from '@core/index/service';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { buildFilingContext, writeDump } from '@core/capture';
import type { CaptureIndex, FilingContext } from '@core/capture';
import type { DumpItem } from '@shared/types';
import { fixtureVaultFiles } from '../../fixtures';
import { NOW_MS } from '../../helpers/time';

export const WORK_PROJECT = 'kundenportal-relaunch';
export const WORK_PROJECT_PATH = 'projects/work/kundenportal-relaunch/project.md';
export const HOME_PROJECT = 'hochbeet-bauen';
export const HOME_PROJECT_PATH = 'projects/private/hochbeet-bauen/project.md';
export const AREA_PATH = 'areas/gesundheit.md';
export const MODULE_SLUG = 'identity-management';
export const JOURNAL_PATH = 'journal/2026/08/2026-08-10.md';

export interface CaptureFixture {
  store: MemoryVaultStore;
  index: CaptureIndex;
  context: FilingContext;
  /** Legt einen Dump in `inbox/` an und gibt ihn zurueck. */
  dump(text: string, options?: { tags?: string[] }): Promise<DumpItem>;
  /** Index nach eigenen Schreibvorgaengen nachziehen. */
  refresh(): Promise<void>;
}

/** Vault, Index und Kontext in einem Griff. */
export async function captureFixture(extra: Record<string, string> = {}): Promise<CaptureFixture> {
  const store = new MemoryVaultStore({
    files: { ...fixtureVaultFiles(), ...extra },
    now: new Date(NOW_MS),
  });
  const service = await IndexService.open(store, {
    persistence: null,
    now: () => new Date(NOW_MS),
  });
  const fixture: CaptureFixture = {
    store,
    index: service,
    context: buildFilingContext(service, { now: NOW_MS }),
    dump: (text, options = {}) =>
      writeDump(
        store,
        { text, origin: 'window', ...(options.tags === undefined ? {} : { tags: options.tags }) },
        { now: NOW_MS },
      ),
    refresh: async () => {
      await service.rebuild();
    },
  };
  return fixture;
}
