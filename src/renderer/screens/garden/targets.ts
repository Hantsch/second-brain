/* Wohin ein Befundpfad führt.

   Ein Befund nennt Dateien; der Screen soll sie öffnen können, ohne zu raten.
   Für die vier Orte, an denen die App selbst eine Ansicht hat, führt der Klick
   dorthin — für alles andere gibt es den Weg über das Betriebssystem, und der
   Knopf heißt dann auch so.

   Katalog und Chronik (`wiki/index.md`, `wiki/log.md`) sind keine Wiki-Seiten
   (VAULT-FORMAT.md: sie tragen kein Frontmatter). Die Seitenansicht würde sie
   nicht laden; die Chronik hat einen eigenen Reiter, der Katalog gar keine
   Ansicht — also Datei. */

export interface RouteTarget {
  kind: 'route';
  /** Adresse im HashRouter, inklusive Suchteil. */
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

/** Der Ort, an dem dieser Pfad in der App sichtbar ist — sonst die Datei selbst. */
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

/** Der Dateiname ohne Ordner — für Vorschauen und Meldungen. */
export function leafOf(path: string): string {
  return path.split('/').pop() ?? path;
}
