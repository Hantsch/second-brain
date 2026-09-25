/* The small, realistic vault both module-lifecycle suites run against (story 063):
 * one module with pages, `AGENTS.md`, a catalog, a log, two raw sources (one that
 * would go "undigested", one that stays digested elsewhere), a project, a filed
 * dump, and a second module whose page links across with an explicit
 * `[[produktwissen/…]]` wikilink. Shared so plan (D1) and apply (D2/D3) are measured
 * against the very same files. */

import { IndexService } from '@core/index/service';
import { renderAgentsMd } from '@core/wiki';
import type { ModuleLifecycleDeps } from '@core/wiki';
import { serialize } from '@core/vault/frontmatter';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { NOW_MS, day, stamp } from '../../helpers/time';

export const MODULE = 'produktwissen';
export const TITLE = 'Produktwissen';
export const OTHER_MODULE = 'andere-notizen';

export const PAGE_A = `modules/${MODULE}/wiki/concepts/a.md`;
export const PAGE_B = `modules/${MODULE}/wiki/concepts/b.md`;
export const OVERVIEW = `modules/${MODULE}/wiki/overview.md`;
export const MODULE_FILE = `modules/${MODULE}/module.md`;
export const AGENTS = `modules/${MODULE}/AGENTS.md`;
export const CATALOG = `modules/${MODULE}/wiki/index.md`;
export const LOG = `modules/${MODULE}/wiki/log.md`;
export const OTHER_PAGE = `modules/${OTHER_MODULE}/wiki/concepts/x.md`;
export const PROJECT = 'projects/work/beispielprojekt/project.md';
export const DUMP = 'inbox/2026-08-05-1200-mein-dump.md';
export const RAW_ONE = 'raw/web/2026-08-01-quelle-eins.md';
export const PROTOCOL_ONE = 'raw/web/2026-08-01-quelle-eins.ingest.json';
export const RAW_TWO = 'raw/web/2026-08-02-quelle-zwei.md';
export const PROTOCOL_TWO = 'raw/web/2026-08-02-quelle-zwei.ingest.json';

export function fixtureFiles(): Record<string, string> {
  return {
    [MODULE_FILE]: serialize(
      {
        type: 'note',
        title: TITLE,
        slug: MODULE,
        module: MODULE,
        description: 'Testmodul',
        created: day(-60),
        updated: day(-1),
        tags: [],
        lang: 'de',
      },
      'Ein Modul fuer die Tests.\n',
    ),
    [CATALOG]: `# Katalog — ${TITLE}\n\n## Begriffe\n\n- [[a]] — Erste Seite\n- [[b]] — Zweite Seite\n`,
    [LOG]: [
      '# Chronik',
      '',
      '## [2026-07-01] ingest | Testquelle',
      `- summary: ${PAGE_A}`,
      `- touched: [[${MODULE}/a]], index.md`,
      '',
    ].join('\n'),
    [OVERVIEW]: serialize(
      {
        type: 'overview',
        title: `${TITLE} — Synthese`,
        module: MODULE,
        created: day(-60),
        updated: day(-1),
        tags: [],
        sources: [],
        lang: 'de',
      },
      '## Entschieden\n\n## Offen\n',
    ),
    [PAGE_A]: serialize(
      {
        type: 'concept',
        title: 'A',
        module: MODULE,
        created: day(-30),
        updated: day(-1),
        reviewed: day(-1),
        tags: [],
        sources: [],
        lang: 'de',
      },
      'Inhalt von A.\n',
    ),
    [PAGE_B]: serialize(
      {
        type: 'concept',
        title: 'B',
        module: MODULE,
        created: day(-30),
        updated: day(-1),
        reviewed: day(-1),
        tags: [],
        sources: [],
        lang: 'de',
      },
      'Verweist auf [[a]], das bleibt gleich.\n',
    ),
    [AGENTS]: renderAgentsMd(MODULE, TITLE, 'de'),
    [`modules/${OTHER_MODULE}/module.md`]: serialize(
      {
        type: 'note',
        title: 'Andere Notizen',
        slug: OTHER_MODULE,
        module: OTHER_MODULE,
        description: 'Zweites Testmodul',
        created: day(-40),
        updated: day(-1),
        tags: [],
        lang: 'de',
      },
      'Ein zweites Modul.\n',
    ),
    [`modules/${OTHER_MODULE}/wiki/index.md`]: `# Katalog — Andere Notizen\n\n## Begriffe\n\n- [[x]] — Verweist rueber\n`,
    [`modules/${OTHER_MODULE}/wiki/log.md`]: '# Chronik\n',
    [OTHER_PAGE]: serialize(
      {
        type: 'concept',
        title: 'X',
        module: OTHER_MODULE,
        created: day(-20),
        updated: day(-1),
        reviewed: day(-1),
        tags: [],
        sources: [],
        lang: 'de',
      },
      `Siehe [[${MODULE}/a|Übersicht]] und [[unrelated/a]] sowie [[x]].\n`,
    ),
    [RAW_ONE]: `Rohinhalt mit einem Verweis [[${MODULE}/a]], der nie angefasst wird.\n`,
    [PROTOCOL_ONE]: `${JSON.stringify(
      {
        kind: 'url',
        origin: 'https://example.com/eins',
        ingestedAt: stamp(-5),
        title: 'Quelle eins',
        fingerprint: 'url:eins',
        sourcePage: 's-2026-08-01-quelle-eins',
        modules: [MODULE],
      },
      null,
      2,
    )}\n`,
    [RAW_TWO]: 'Rohinhalt zwei.\n',
    [PROTOCOL_TWO]: `${JSON.stringify(
      {
        kind: 'url',
        origin: 'https://example.com/zwei',
        ingestedAt: stamp(-4),
        title: 'Quelle zwei',
        fingerprint: 'url:zwei',
        sourcePage: 's-2026-08-02-quelle-zwei',
        modules: [MODULE, OTHER_MODULE],
      },
      null,
      2,
    )}\n`,
    [PROJECT]: serialize(
      {
        type: 'project',
        title: 'Beispielprojekt',
        slug: 'beispielprojekt',
        scope: 'work',
        status: 'active',
        priority: 2,
        favorite: false,
        tags: [],
        modules: [MODULE],
        repos: [],
      },
      '## Stand\n\nLaeuft.\n',
    ),
    [DUMP]: serialize(
      {
        type: 'dump',
        title: 'Gedanke',
        created: stamp(-3),
        origin: 'quick-capture',
        status: 'filed',
        tags: [],
        scope: null,
        filed_into: `modules/${MODULE}/wiki/concepts/a.md`,
        filed_at: day(-3),
      },
      'Ein Gedanke, der abgelegt wurde.\n',
    ),
  };
}

export async function fixture(extra: Record<string, string> = {}) {
  const store = new MemoryVaultStore({
    files: { ...fixtureFiles(), ...extra },
    now: new Date(NOW_MS),
  });
  const index = await IndexService.open(store, { persistence: null, now: () => new Date(NOW_MS) });
  const deps: ModuleLifecycleDeps = { store, index };
  return { store, index, deps };
}
