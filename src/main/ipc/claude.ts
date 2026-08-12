/* Claude Code sessions as a work trail.

   Read via `@core/claude` (`ClaudeSessionReader`): only the head and tail of
   each history file, never the whole thing. Linked via `repos` in the
   project frontmatter — as documented in docs/VAULT-FORMAT.md.

   `claude:link` writes exactly that: the session's working directory moves
   into the project's `repos`. That puts the link where it belongs — in the
   file the user can read and change themselves — and it applies to every
   future session in that directory, not just this one. A mapping table in
   settings would have claimed the same effect and would have become a second
   truth on the next run. */

import { pathKey, vaultPath } from '@core/claude';
import { isoDay } from '@core/vault/paths';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { claudeSessions, forgetSessions, usesClaudeSessions } from './overview-deps';
import { settle } from './wiki-bridge';
import type { Services } from '../services';

/** Maximum number of sessions a single call may fetch. */
const MAX_LIMIT = 100;

export function claudeHandlers(services: Services): HandlerMap {
  return defineHandlers({
    /* If reading sessions is switched off, the list is empty. The renderer
       knows the setting and shows on the tile that it's off — instead of
       claiming "no sessions". */
    'claude:sessions': async ({ limit }) => {
      services.requireVaultRoot();
      if (!usesClaudeSessions(services)) return [];
      const want =
        typeof limit === 'number' && Number.isFinite(limit)
          ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
          : undefined;
      return claudeSessions(services, want);
    },

    'claude:link': async ({ sessionId, project: slug }) => {
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw fail('invalid', 'sessionId: darf nicht leer sein');
      }
      if (!usesClaudeSessions(services)) {
        throw fail('invalid', 'das Mitlesen der Sitzungen ist abgeschaltet');
      }
      const sessions = await claudeSessions(services, MAX_LIMIT);
      const session = sessions.find((entry) => entry.id === sessionId);
      if (session === undefined) throw fail('not-found', 'diese Sitzung gibt es nicht');
      /* Canonical write form, not display form: `C:/...` as in
         docs/VAULT-FORMAT.md. Otherwise `C:/development/x` and
         `c:/development/y` would sit side by side in the same list, and any
         comparison outside `pathKey` — git diff, Obsidian, a user's script —
         would take them for different folders. */
      const cwd = vaultPath(session.cwd);
      if (cwd.length === 0) {
        throw fail('invalid', 'diese Sitzung hat kein Arbeitsverzeichnis');
      }

      const store = services.requireStore();
      const found = (services.index()?.projects?.() ?? []).find((entry) => entry.slug === slug);
      if (found === undefined) throw fail('not-found', `dieses Projekt gibt es nicht: ${slug}`);
      const doc = await store.read(found.path);
      if (doc === null) throw fail('not-found', `diese Projektdatei gibt es nicht: ${found.path}`);

      /* Existing entries stay as the user wrote them; only identical paths
         are not entered twice. */
      const known = Array.isArray(doc.frontmatter['repos'])
        ? (doc.frontmatter['repos'] as unknown[]).filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [];
      const already = known.some((entry) => pathKey(entry) === pathKey(cwd));
      if (!already) {
        await store.write({
          path: found.path,
          frontmatter: { repos: [...known, cwd], updated: isoDay(new Date()) },
          expectedHash: doc.hash,
        });
        await settle(services, [found.path], 'claude');
      }
      /* The link now lives in the file — the buffer doesn't know it yet. */
      forgetSessions();
    },
  });
}
