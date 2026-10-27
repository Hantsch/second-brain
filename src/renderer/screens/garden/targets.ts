/* Where a finding's path leads.

   A finding names files; the screen should be able to open them without
   guessing. For the four places where the app itself has a view, the click
   leads there — for everything else there's the path through the operating
   system, and the button is named accordingly.

   The general "which route does this vault path belong to" question is
   `homeOf` (`lib/doc-home.ts`) — garden only adds its own local
   readings on top: a finding lists the plain area path first even when the
   condensed artifact is what's due, `inbox/` reads as unfiled, and `raw/` as
   a source, none of which are true of a path in general.

   The catalog and the log (`wiki/index.md`, `wiki/log.md`) are not wiki pages
   (VAULT-FORMAT.md: they carry no frontmatter). The page view wouldn't load
   them; the log has its own tab, the catalog has no view at all — so it's a
   file. */

import { homeOf } from '../../lib/doc-home';

export interface RouteTarget {
  kind: 'route';
  /** Address in the HashRouter, including the query part. */
  to: string;
}

export interface FileTarget {
  kind: 'file';
  path: string;
}

export type PathTarget = RouteTarget | FileTarget;

/* Mirrors `areaSlugFromCondensedPath` (`@core/condense/paths.ts`), plus the plain
   area file itself: a `condensation-due` finding lists the area path first
   (`areas/<slug>.md`), not the condensed sibling, and `FindingCard` opens
   `paths[0]` — so both spellings have to land on the same route. `homeOf`
   only sends the condensed spelling to the condensed tab; garden overrides
   the plain one here to match. */
const AREA = /^areas\/([^/]+?)(?:\.condensed)?\.md$/;

/* A module's overview is the artifact a module condensation writes, and a
   `condensation-due` finding lists it first (`modules/<slug>/wiki/overview.md`).
   Every other page of a module keeps the generic route `homeOf` gives it. */
const MODULE_OVERVIEW = /^modules\/([^/]+)\/wiki\/overview\.md$/;

/** The place where this path is visible in the app — otherwise the file itself. */
export function targetFor(path: string): PathTarget {
  const area = AREA.exec(path);
  if (area !== null) {
    return {
      kind: 'route',
      to: `/notes?a=${encodeURIComponent(area[1] ?? '')}&tab=condensed`,
    };
  }
  const moduleOverview = MODULE_OVERVIEW.exec(path);
  if (moduleOverview !== null) {
    return {
      kind: 'route',
      to: `/knowledge?m=${encodeURIComponent(moduleOverview[1] ?? '')}&tab=condensed`,
    };
  }
  if (path.startsWith('inbox/')) return { kind: 'route', to: '/notes?filter=unfiled' };
  if (path.startsWith('raw/')) return { kind: 'route', to: '/knowledge?tab=sources' };
  /* `homeOf` also recognizes journal days and, for everything else, the
     generic reader (`/read?path=…`) — neither of those had a garden view
     before this refactor, and garden's own behaviour must not change because
     the shared helper grew a case garden never had. Only the two screens
     garden always understood (knowledge, projects) are taken as routes; a
     `home` outside that whitelist falls to the file it always was. */
  const home = homeOf(path);
  if (home.startsWith('/knowledge?') || home.startsWith('/projects?')) {
    return { kind: 'route', to: home };
  }
  return { kind: 'file', path };
}

/** The file name without the folder — for previews and messages. */
export function leafOf(path: string): string {
  return path.split('/').pop() ?? path;
}
