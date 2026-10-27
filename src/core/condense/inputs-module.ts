/**
 * The document inventory of one module's overview condensation: every wiki page of
 * the module except the overview itself, each with the content hash it has right
 * now. `index.md` and `log.md` are catalogue and chronicle, not pages, and
 * `isWikiPage()` already leaves them out.
 *
 * This is the **one** selector both sides of the freshness question share:
 * `condenseModule()` records these hashes into the overview, and the maintenance
 * check compares the recorded ones against a fresh call. A second list would make
 * the overview permanently due or permanently fresh — silently, because a hash
 * comparison cannot tell a wrong pairing from a real change. The overview is
 * excluded because it is the run's own output: counting it would make every
 * accepted proposal change its own inputs.
 *
 * Sorted by path, so a digest over the inventory identifies a state and not a
 * shuffle. Index-only: no file is opened here.
 */

import { isWikiPage, moduleOfPath } from '@core/index/pages';
import type { IndexedDoc } from '@core/index/types';
import type { CondenseInput } from './inputs';
import { moduleOverviewPath } from './paths';

export function moduleInputs(docs: readonly IndexedDoc[], slug: string): CondenseInput[] {
  const overview = moduleOverviewPath(slug);
  return docs
    .filter((doc) => doc.path !== overview && moduleOfPath(doc.path) === slug && isWikiPage(doc))
    .map((doc) => ({ path: doc.path, hash: doc.hash }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
