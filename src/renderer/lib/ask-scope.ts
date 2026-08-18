/* Where the question is asked from decides what it is about.

   Asking is reachable from everywhere in the shell, so the overlay has no
   screen of its own to inherit a filter from. The address is the only thing
   that still knows where the user was standing — this helper turns it into the
   scope the ask panel starts with. Pure and free of React so it can be checked
   on its own; the provider in `shell-overlays.tsx` is the only caller.

   Why the params decide and not the pathname: story 002 turned `/modules` into
   a redirect onto `/knowledge`, so two addresses lead to the same screen and
   only `m` reliably names a module. The project is the exception — `p` means
   something different on every screen that has one (a page path under
   knowledge, an agent project key under agents, the project slug only under
   `/projects`), so it counts on that one route alone. */

/** The scope an address implies. `null` means: no restriction. */
export interface AskRouteScope {
  /** Knowledge module slug. */
  module: string | null;
  /** Project slug. */
  project: string | null;
}

/** The one route whose `p` is a project slug. */
const PROJECTS_ROUTE = '/projects';

/** Trimmed param, or `null` — an empty param restricts nothing. */
function param(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key)?.trim() ?? '';
  return raw.length === 0 ? null : raw;
}

/** Pathname without a trailing slash, so `/projects/` counts as `/projects`. */
function route(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * The module and project the given address stands in.
 *
 * Everywhere else — dashboard, inbox, journal, settings — the answer is
 * unrestricted, which is the honest one: those screens are about no single
 * module and no single project.
 */
export function askScopeFor(pathname: string, params: URLSearchParams): AskRouteScope {
  return {
    module: param(params, 'm'),
    project: route(pathname) === PROJECTS_ROUTE ? param(params, 'p') : null,
  };
}
