/* The module level of `resolveCondenseUnit()`: which overview a module request
 * addresses. Kept apart from `condense-unit.ts` so that file stays one
 * responsibility per level of reading, not one per level of resolving. */

import { CONDENSE_MODULE_TASK, moduleOverviewPath } from '@core/condense';
import { listModules } from '@core/wiki';
import { fail } from './errors';
import type { CondenseTarget } from './condense-unit';
import { wikiIndex } from './wiki-bridge';
import type { Services } from '../services';

/**
 * `modules/<slug>/wiki/overview.md` for a module the index lists — the very list
 * `modules:list` serves. An unknown slug is `invalid`, never a guessed path, and
 * the overview must lie in that module's own `wiki/` folder: `moduleOverviewPath()`
 * slugifies, so a listed slug it would rewrite points into a folder that is not
 * this module's, and a hash guard cannot notice it is guarding the wrong file.
 */
export function moduleTarget(services: Services, slug: string): CondenseTarget {
  if (typeof slug !== 'string' || slug.trim().length === 0) {
    throw fail('invalid', 'slug: darf nicht leer sein');
  }
  const module = listModules(wikiIndex(services)).find((entry) => entry.slug === slug);
  if (module === undefined) throw fail('invalid', `dieses Modul gibt es nicht: „${slug}“`);

  const path = moduleOverviewPath(module.slug);
  if (!path.startsWith(`modules/${module.slug}/wiki/`)) {
    throw fail('invalid', `„${slug}“ meldet einen Ordner, der nicht zum Modul passt`);
  }
  return {
    unit: 'module',
    slug,
    path,
    task: CONDENSE_MODULE_TASK,
    project: null,
    label: module.title,
  };
}
