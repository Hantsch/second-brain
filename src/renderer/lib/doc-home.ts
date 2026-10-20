/* Where a vault path is "home" in the app — the general answer `targetFor`
   (`screens/garden/targets.ts`) used to compute inline, extracted so any
   opener (search results, citations, the reader itself) can ask the same
   question without going through garden.

   Unlike `targetFor`, this never says "open the file": every path lands on
   an in-app route, down to the generic reader (`/read?path=…`) for anything
   that has no dedicated screen. Garden keeps its own local overrides (plain
   area → condensed tab, `inbox/` → unfiled, `raw/` → sources) on top of this;
   they are deliberately not folded in here because they are garden's own
   reading of a finding, not the vault's general "where does this live". */

import { areaSlugFromCondensedPath, projectRefFromCondensedPath } from '@core/condense/paths';

const WIKI_PAGE = /^modules\/([^/]+)\/wiki\/(sources|entities|concepts)\/[^/]+\.md$/;
const WIKI_OVERVIEW = /^modules\/([^/]+)\/wiki\/overview\.md$/;
const WIKI_LOG = /^modules\/([^/]+)\/wiki\/log\.md$/;
const PROJECT = /^projects\/(?:work|private)\/([^/]+)\/project\.md$/;
/** Plain area file, not its condensed sibling — that one is matched first via
    `areaSlugFromCondensedPath`, so this only ever sees the non-condensed name. */
const AREA = /^areas\/([^/]+)\.md$/;
/** `journal/YYYY/MM/YYYY-MM-DD.md` (`journalPath`, `@core/vault/paths.ts`) —
    the day is the last path segment, without its `.md`. */
const JOURNAL_DAY = /^journal\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})\.md$/;

/** The in-app route this vault path is "home" at. Always a route — anything
    unrecognized falls back to the generic reader instead of an external
    opener, which is the entire point of this function. */
export function homeOf(path: string): string {
  const page = WIKI_PAGE.exec(path) ?? WIKI_OVERVIEW.exec(path);
  if (page !== null) {
    return `/knowledge?m=${encodeURIComponent(page[1] ?? '')}&p=${encodeURIComponent(path)}`;
  }
  const log = WIKI_LOG.exec(path);
  if (log !== null) {
    return `/knowledge?m=${encodeURIComponent(log[1] ?? '')}&tab=log`;
  }
  const project = PROJECT.exec(path);
  if (project !== null) {
    return `/projects?p=${encodeURIComponent(project[1] ?? '')}`;
  }
  const condensedProject = projectRefFromCondensedPath(path);
  if (condensedProject !== undefined) {
    return `/projects?p=${encodeURIComponent(condensedProject.slug)}&tab=knowledge`;
  }
  const condensedArea = areaSlugFromCondensedPath(path);
  if (condensedArea !== undefined) {
    return `/notes?a=${encodeURIComponent(condensedArea)}&tab=condensed`;
  }
  const area = AREA.exec(path);
  if (area !== null) {
    return `/notes?a=${encodeURIComponent(area[1] ?? '')}`;
  }
  const journalDay = JOURNAL_DAY.exec(path);
  if (journalDay !== null) {
    return `/journal?d=${encodeURIComponent(journalDay[1] ?? '')}`;
  }
  return `/read?path=${encodeURIComponent(path)}`;
}
