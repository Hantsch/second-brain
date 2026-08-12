/* Claude-Code-Sessions als Arbeitsspur.

   Gelesen wird über `@core/claude` (`ClaudeSessionReader`): nur Kopf und Ende
   jeder Verlaufsdatei, nie das Ganze. Zugeordnet wird über `repos` im
   Projekt-Frontmatter — so steht es in docs/VAULT-FORMAT.md.

   `claude:link` schreibt genau das: das Arbeitsverzeichnis der Sitzung wandert in
   `repos` des Projekts. Damit ist die Zuordnung dort, wo sie hingehört — in der
   Datei, die der Nutzer selbst lesen und ändern kann — und sie gilt für jede
   künftige Sitzung in diesem Verzeichnis, nicht nur für diese eine. Eine
   Zuordnungstabelle in den Einstellungen hätte dieselbe Wirkung behauptet und
   wäre beim nächsten Lauf eine zweite Wahrheit gewesen. */

import { pathKey, vaultPath } from '@core/claude';
import { isoDay } from '@core/vault/paths';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { claudeSessions, forgetSessions, usesClaudeSessions } from './overview-deps';
import { settle } from './wiki-bridge';
import type { Services } from '../services';

/** Höchstzahl der Sitzungen, die ein Aufruf holen darf. */
const MAX_LIMIT = 100;

export function claudeHandlers(services: Services): HandlerMap {
  return defineHandlers({
    /* Ist das Mitlesen abgeschaltet, ist die Liste leer. Der Renderer kennt die
       Einstellung und sagt an der Kachel, dass sie aus ist — statt „keine
       Sitzungen" zu behaupten. */
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
      /* Schreibform, nicht Anzeigeform: `C:/...` wie in docs/VAULT-FORMAT.md.
         Sonst stuenden `C:/development/x` und `c:/development/y` nebeneinander in
         derselben Liste, und jeder Vergleich ausserhalb von `pathKey` — Git-Diff,
         Obsidian, ein Skript des Nutzers — hielte sie fuer verschiedene Ordner. */
      const cwd = vaultPath(session.cwd);
      if (cwd.length === 0) {
        throw fail('invalid', 'diese Sitzung hat kein Arbeitsverzeichnis');
      }

      const store = services.requireStore();
      const found = (services.index()?.projects?.() ?? []).find((entry) => entry.slug === slug);
      if (found === undefined) throw fail('not-found', `dieses Projekt gibt es nicht: ${slug}`);
      const doc = await store.read(found.path);
      if (doc === null) throw fail('not-found', `diese Projektdatei gibt es nicht: ${found.path}`);

      /* Vorhandene Einträge bleiben, wie der Nutzer sie geschrieben hat; nur
         gleiche Pfade werden nicht zweimal eingetragen. */
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
      /* Die Zuordnung steht jetzt in der Datei — der Puffer kennt sie noch nicht. */
      forgetSessions();
    },
  });
}
