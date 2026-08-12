/* Der Demo-Vault in Klein — mit **genau** den absichtlichen Mängeln, die
   `npm run seed` einbaut (siehe `scripts/seed/check.mjs`, `EXPECTED_FINDINGS`):

     1. eine verwaiste Seite               entities/scim.md
     2. ein kaputter Wikilink              entities/oauth2.md → [[device-code-flow]]
     3. eine im index.md fehlende Seite    concepts/just-in-time-provisionierung.md
     4. + 5. zwei Seiten mit benanntem Widerspruch
                                           concepts/token-lebensdauer.md ⟷
                                           concepts/altes-token-konzept.md
     6. eine Seite mit `reviewed` vor 200 Tagen
                                           concepts/mandantentrennung.md

   Dazu die übrigen Züge des Demo-Vaults: eine unverdichtete Rohquelle, ein Dump,
   der zu lange liegt, ein Projekt ohne nächsten Schritt — und ein **zweites,
   gesundes Modul**, an dem sich falsche Positive zeigen würden: eine Source-Seite,
   die nur im Frontmatter belegt ist (kein Verweis im Text), und ein Code-Zaun mit
   `[[...]]` darin.

   Firmen und Personen sind erfunden. Alle Daten liegen um `TODAY` (2026-08-10). */

import { serialize } from '@core/vault/frontmatter';
import { day, stamp } from '../../helpers/time';
import { DEMO, HEALTHY, MODULE, VIDEO_SOURCE } from './demo-paths';
import {
  healthyCatalog,
  healthyPages,
  identityCatalog,
  identityLog,
  identityPages,
} from './demo-pages';

export { DEMO, DEMO_SLUGS } from './demo-paths';

/* ── Alles ausserhalb der Module ───────────────────────────────────────────── */

function dump(input: {
  title: string;
  created: string;
  status: string;
  scope: string | null;
  body: string;
}): string {
  return serialize(
    {
      type: 'dump',
      title: input.title,
      created: input.created,
      origin: 'quick-capture',
      status: input.status,
      tags: [],
      scope: input.scope,
      lang: 'de',
    },
    input.body,
  );
}

function project(input: {
  title: string;
  slug: string;
  scope: 'work' | 'private';
  status: string;
  nextStep?: string;
  body: string;
}): string {
  return serialize(
    {
      type: 'project',
      title: input.title,
      slug: input.slug,
      scope: input.scope,
      status: input.status,
      priority: 2,
      started: day(-40),
      ...(input.nextStep === undefined ? {} : { next_step: input.nextStep }),
      tags: [],
      modules: [],
      repos: [],
      created: day(-40),
      updated: day(-2),
      lang: 'de',
    },
    input.body,
  );
}

const around: Record<string, string> = {
  'README.md': '# Vault\n\nEin Ordner voller Markdown-Dateien.\n',

  [DEMO.freshDump]: dump({
    title: 'Idee: Wochenrückblick automatisch aus dem Worklog',
    created: stamp(0, '11:32'),
    status: 'raw',
    scope: null,
    body: 'Freitags kostet der Rückblick eine halbe Stunde, obwohl alles schon irgendwo steht.',
  }),

  /* Liegt seit 19 Tagen — der Befund. */
  [DEMO.oldDump]: dump({
    title: 'Einkauf fürs Hochbeet',
    created: stamp(-19, '18:55'),
    status: 'raw',
    scope: 'private',
    body: 'Noppenfolie fünf Meter, Edelstahlschrauben, zwei Säcke Blumenerde, ein Sack Kompost.',
  }),

  /* Liegt seit 21 Tagen, aber bewusst: `kept` ist kein Befund. */
  [DEMO.keptDump]: dump({
    title: 'Zu viele Baustellen gleichzeitig',
    created: stamp(-21, '23:10'),
    status: 'kept',
    scope: 'private',
    body: 'Kein Aktionspunkt. Das soll einfach hier liegen bleiben.',
  }),

  [DEMO.projectWithStep]: project({
    title: 'SSO-Migration',
    slug: 'sso-migration',
    scope: 'work',
    status: 'active',
    nextStep: 'Rollenzuordnung mit dem Kunden durchgehen',
    body: '## Stand\n\nDer Testmandant steht, die Rollen fehlen.\n',
  }),

  /* Aktiv, aber ohne nächsten Schritt — der Befund. */
  [DEMO.projectWithoutStep]: project({
    title: 'Hochbeet für den Balkon',
    slug: 'hochbeet-bauen',
    scope: 'private',
    status: 'active',
    body: '## Stand\n\nDas Holz liegt im Keller, die Schrauben auch.\n',
  }),

  /* Pausiert und ohne nächsten Schritt — ausdrücklich kein Befund. */
  [DEMO.pausedProject]: project({
    title: 'Altes Portal',
    slug: 'altes-portal',
    scope: 'work',
    status: 'paused',
    body: '## Stand\n\nLiegt bewusst still, bis die Migration durch ist.\n',
  }),

  [`journal/2026/08/${day(0)}.md`]: serialize(
    {
      type: 'journal',
      title: 'Montag, 10. August 2026',
      date: day(0),
      mood: 3,
      energy: 3,
      people: [],
      projects: ['sso-migration'],
      tags: [],
      lang: 'de',
    },
    '## Tag\n\nVormittag am Testmandanten, Nachmittag Rollenkonzept.\n',
  ),

  /* Unverdichtete Rohquelle: Protokoll ohne `sourcePage`. */
  [`${DEMO.rawWeb}.md`]: '# Digital Gardening: ein Überblick\n\nAbgerufener Text der Webseite.\n',
  [`${DEMO.rawWeb}.ingest.json`]: `${JSON.stringify(
    {
      kind: 'url',
      origin: 'https://example.org/digital-gardening-ueberblick',
      ingestedAt: stamp(-4, '22:08'),
      title: 'Digital Gardening: ein Überblick',
      sourcePage: null,
      modules: [],
    },
    null,
    2,
  )}\n`,

  /* Verdichtete Rohquelle: kein Befund. */
  [`${DEMO.rawFiles}/mitschrift.md`]: '# Mitschrift\n\nZwei Stunden Workshop.\n',
  [`${DEMO.rawFiles}/.ingest.json`]: `${JSON.stringify(
    {
      kind: 'file',
      origin: 'C:/tmp/mitschrift.md',
      ingestedAt: stamp(-24, '16:00'),
      title: 'Workshop Rollenkonzept (Mitschrift)',
      sourcePage: `s-${day(-24)}-rollenkonzept-workshop`,
      modules: [MODULE],
    },
    null,
    2,
  )}\n`,
};

/** Der ganze Demo-Bestand als „Pfad → Inhalt". */
export function demoVaultFiles(): Record<string, string> {
  return {
    [`modules/${MODULE}/module.md`]: serialize(
      {
        type: 'note',
        title: 'Identitätsmanagement',
        slug: MODULE,
        description: 'Anmeldung, Rollen und Mandanten',
        created: day(-240),
        updated: day(-6),
        tags: ['auth'],
        lang: 'de',
      },
      'Alles, was ich über Anmeldung und Mandantentrennung belegen kann.\n',
    ),
    [DEMO.catalog]: identityCatalog,
    [DEMO.log]: identityLog,
    ...identityPages,
    [`modules/${HEALTHY}/module.md`]: serialize(
      {
        type: 'note',
        title: 'Second-Brain-Methodik',
        slug: HEALTHY,
        description: 'Wie eine Sammlung gepflegt wird',
        created: day(-45),
        updated: day(-9),
        tags: ['methodik'],
        lang: 'de',
      },
      'Verfahren und Begriffe der Wissenspflege.\n',
    ),
    [DEMO.healthyCatalog]: healthyCatalog,
    [`modules/${HEALTHY}/wiki/log.md`]: `# Chronik\n\n## [${day(-9)}] ingest | Video\n\n- summary: wiki/sources/${VIDEO_SOURCE}.md\n- touched: [[wissensverfall]], index.md\n`,
    ...healthyPages,
    ...around,
  };
}
