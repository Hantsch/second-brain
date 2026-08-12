/* Zugriff auf die abgeleiteten Listen des Index.

   Die Listen sind eine optionale Nahtstelle (`IndexListsLike`): liefert der
   eingehängte Index sie nicht, sagt der Kanal das ehrlich, statt eine leere
   Liste zurückzugeben. „Leer" muss leer heißen. */

import type { IndexLike, IndexListsLike } from '../contracts';
import type { Services } from '../services';
import { fail } from './errors';

const LIST_METHODS: readonly (keyof IndexListsLike)[] = [
  'projects',
  'todos',
  'pages',
  'sources',
  'dumps',
  'journal',
  'modules',
];

function asLists(index: IndexLike): IndexListsLike | null {
  const complete = LIST_METHODS.every((method) => typeof index[method] === 'function');
  return complete ? (index as IndexListsLike) : null;
}

/** Die Listen des offenen Vaults, oder ein Fehler mit klarem Code. */
export function requireLists(services: Services): IndexListsLike {
  const lists = asLists(services.requireIndex());
  if (lists === null) throw fail('io', 'der Index liefert keine abgeleiteten Listen');
  return lists;
}
