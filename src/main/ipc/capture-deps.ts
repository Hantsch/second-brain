/* Die Nahtstellen des Erfassens zum Kern: welcher Store, welcher Index.

   Der Store der Shell (`VaultStoreLike`) kann alles, was Ablegen und Zurücknehmen
   brauchen — er ist dafür erweitert worden. Beim Index geht das nicht: seine
   abgeleiteten Listen sind ausdrücklich optional, weil ein Index ohne sie immer
   noch suchen und zählen kann. Ob dieser Index Ablageziele kennt, entscheidet
   deshalb eine Prüfung zur Laufzeit — und wenn nicht, sagt der Kanal es ehrlich,
   statt eine leere Liste zu behaupten.

   Das Gateway steht nicht hier: es wird für alle Aufgaben an einer Stelle gebaut
   (`createGateway` in `../llm-bridge`), sonst gäbe es zwei Fassungen davon. */

import type { CaptureIndex } from '@core/capture';
import { fail } from './errors';
import type { IndexLike, VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/** Was das Einordnen am Store braucht — die Sicht der Shell genügt dafür. */
export type CaptureStore = VaultStoreLike;

const INDEX_METHODS: readonly string[] = ['projects', 'modules', 'index', 'search'];

/** Leitet ein Index die Ablageziele ab? `IndexService` tut es, ein Notindex nicht. */
function knowsTargets(index: IndexLike): index is IndexLike & CaptureIndex {
  const record = index as unknown as Record<string, unknown>;
  return INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** Der Store des offenen Vaults. */
export function captureStore(services: Services): CaptureStore {
  return services.requireStore();
}

/** Der Index als Entscheidungsgrundlage der Einordnung. */
export function captureIndex(services: Services): CaptureIndex {
  const index = services.requireIndex();
  if (!knowsTargets(index)) throw fail('io', 'der Index liefert keine Ablageziele');
  return index;
}
