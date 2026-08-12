/* Where a finding's path leads.

   A finding names files; the screen should be able to open them without
   guessing. For the four places where the app itself has a view, the click
   leads there — for everything else there's the path through the operating
   system, and the button is named accordingly.

   The catalog and the log (`wiki/index.md`, `wiki/log.md`) are not wiki pages
   (VAULT-FORMAT.md: they carry no frontmatter). The page view wouldn't load
   them; the log has its own tab, the catalog has no view at all — so it's a
   file. */

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

const WIKI_PAGE = /^modules\/([^/]+)\/wiki\/(sources|entities|concepts)\/[^/]+\.md$/;
const WIKI_OVERVIEW = /^modules\/([^/]+)\/wiki\/overview\.md$/;
const WIKI_LOG = /^modules\/([^/]+)\/wiki\/log\.md$/;
const PROJECT = /^projects\/(?:work|private)\/([^/]+)\/project\.md$/;

/** The place where this path is visible in the app — otherwise the file itself. */
export function targetFor(path: string): PathTarget {
  const page = WIKI_PAGE.exec(path) ?? WIKI_OVERVIEW.exec(path);
  if (page !== null) {
    const module = page[1] ?? '';
    return {
      kind: 'route',
      to: `/modules?m=${encodeURIComponent(module)}&p=${encodeURIComponent(path)}`,
    };
  }
  const log = WIKI_LOG.exec(path);
  if (log !== null) {
    return { kind: 'route', to: `/modules?m=${encodeURIComponent(log[1] ?? '')}&tab=log` };
  }
  const project = PROJECT.exec(path);
  if (project !== null) {
    return { kind: 'route', to: `/projects?p=${encodeURIComponent(project[1] ?? '')}` };
  }
  if (path.startsWith('inbox/')) return { kind: 'route', to: '/inbox' };
  if (path.startsWith('raw/')) return { kind: 'route', to: '/sources' };
  return { kind: 'file', path };
}

/** The file name without the folder — for previews and messages. */
export function leafOf(path: string): string {
  return path.split('/').pop() ?? path;
}
