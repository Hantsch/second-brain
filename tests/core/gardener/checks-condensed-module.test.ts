/* The condensation-due check over module overviews: deterministic over
 * `moduleInputs()` and `recordedSources()`, no model, no file access. The context
 * is built by hand (as in checks-condensed.test.ts) because the comparison hangs
 * on exact hash pairs. */

import { describe, expect, it } from 'vitest';
import { condensationDueCheck, GERMAN_GARDENER_LABELS, inScope } from '@core/gardener';
import type { GardenerContext, GardenerIndexView, GardenerModuleView } from '@core/gardener';
import { condenseModule, CONDENSE_MODULE_TASK } from '@core/condense/run-module';
import { moduleOverviewPath } from '@core/condense/paths';
import type { IndexedDoc } from '@core/index/types';
import { parse } from '@core/vault/frontmatter';
import { createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

const TODAY = '2026-08-10';
const SLUG = 'identity-management';
const OVERVIEW = moduleOverviewPath(SLUG);
const RBAC = `modules/${SLUG}/wiki/concepts/rbac.md`;
const GUIDE = `modules/${SLUG}/wiki/sources/s-2026-07-02-auth0-rbac-guide.md`;
const NEW_PAGE = `modules/${SLUG}/wiki/concepts/tokens.md`;

function page(path: string, body: string): IndexedDoc {
  return makeDoc({
    path,
    docType: 'note',
    title: path,
    module: SLUG,
    frontmatter: { type: 'concept' },
    body,
  });
}

function stubOverview(): IndexedDoc {
  return makeDoc({
    path: OVERVIEW,
    title: 'Overview',
    module: SLUG,
    frontmatter: { type: 'overview', title: 'Overview' },
    body: '## Seiten\n',
  });
}

/** An overview carrying the `sources:`/`source_hashes:` pair of an earlier run. */
function condensedOverview(hashes: Record<string, string>): IndexedDoc {
  return makeDoc({
    path: OVERVIEW,
    title: 'Overview',
    module: SLUG,
    frontmatter: {
      type: 'overview',
      title: 'Overview',
      condensed_at: '2026-08-01T09:00:00+02:00',
      sources: Object.keys(hashes),
      source_hashes: hashes,
    },
    body: '## Entschieden\n\nAlt.\n',
  });
}

function fakeIndex(docs: readonly IndexedDoc[]): GardenerIndexView {
  const byPath = new Map(docs.map((doc) => [doc.path, doc]));
  return {
    index: () => ({ docs, byPath, brokenLinks: [], todos: [] }),
    pages: () => [],
    projects: () => [],
    sources: () => [],
    dumps: () => [],
    journal: () => [],
    todos: () => [],
    areas: () => [],
  };
}

function ctxFor(docs: readonly IndexedDoc[]): GardenerContext {
  const modules: GardenerModuleView[] = [
    {
      slug: SLUG,
      pages: [],
      catalogPath: `modules/${SLUG}/wiki/index.md`,
      catalog: null,
    },
  ];
  return {
    index: fakeIndex(docs),
    modules,
    limits: { reviewAfterDays: 120, unfiledAfterDays: 14 },
    today: TODAY,
    ranAt: '2026-08-10T09:00:00.000Z',
    labels: GERMAN_GARDENER_LABELS,
    docLanguage: 'de',
    replyLanguage: 'de',
  };
}

describe('condensationDueCheck: modules', () => {
  it('a page changed after the last condensation makes the module due', () => {
    const rbac = page(RBAC, 'Rollen werden pro Tenant vergeben.');
    const guide = page(GUIDE, 'Der Guide nennt eine Token-Laufzeit.');
    const overview = condensedOverview({ [RBAC]: 'alter-hash', [GUIDE]: guide.hash });

    const findings = condensationDueCheck.run(ctxFor([overview, rbac, guide]));

    expect(findings).toHaveLength(1);
    // The overview first (the open exit resolves paths[0]), then what changed.
    expect(findings[0]?.paths).toEqual([OVERVIEW, RBAC]);
    expect(findings[0]?.detail).toContain('2026-08-01T09:00:00+02:00');
  });

  it('a page added after the last condensation makes the module due', () => {
    const rbac = page(RBAC, 'Rollen werden pro Tenant vergeben.');
    const added = page(NEW_PAGE, 'Token leben eine Stunde.');
    const overview = condensedOverview({ [RBAC]: rbac.hash });

    const findings = condensationDueCheck.run(ctxFor([overview, rbac, added]));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths).toEqual([OVERVIEW, NEW_PAGE]);
  });

  it('a module with pages and no condensation yet is due', () => {
    const rbac = page(RBAC, 'Rollen werden pro Tenant vergeben.');

    for (const docs of [[stubOverview(), rbac], [rbac]]) {
      const findings = condensationDueCheck.run(ctxFor(docs));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.paths).toEqual([OVERVIEW]);
      expect(findings[0]?.title).toContain(SLUG);
      expect(findings[0]?.detail).not.toContain('Zuletzt verdichtet');
    }
  });

  it('a module with only its stub is not due', () => {
    expect(condensationDueCheck.run(ctxFor([stubOverview()]))).toEqual([]);
  });

  it('a module right after its condensation is not due', async () => {
    const rbac = page(RBAC, 'Rollen werden pro Tenant vergeben.');
    const guide = page(GUIDE, 'Der Guide nennt eine Token-Laufzeit.');
    const before = [stubOverview(), rbac, guide];
    const setup = createFakeGateway();
    setup.provider.setReply(
      CONDENSE_MODULE_TASK,
      JSON.stringify({
        decided: { text: 'Rollen pro Tenant.', sources: [RBAC] },
        open: { text: 'Token-Laufzeit offen.', sources: [GUIDE] },
        contradictions: { text: '', sources: [] },
      }),
    );
    const result = await condenseModule({ docs: before, gateway: setup.gateway, now: TODAY }, SLUG);
    if (result.kind !== 'proposal') throw new Error(`no proposal: ${result.kind}`);
    const { frontmatter, body } = parse(result.content);
    const accepted = makeDoc({ path: OVERVIEW, module: SLUG, frontmatter, body });

    // The same inputs the run recorded: the check and the run share one selector.
    expect(condensationDueCheck.run(ctxFor([accepted, rbac, guide]))).toEqual([]);

    // And it is a real comparison, not a blanket silence: one edited page flips it.
    const edited = page(RBAC, 'Rollen werden jetzt pro Mandant vergeben.');
    expect(condensationDueCheck.run(ctxFor([accepted, edited, guide]))).toHaveLength(1);
  });

  it('the finding is informational, carries the module and offers no fix', () => {
    const rbac = page(RBAC, 'Rollen werden pro Tenant vergeben.');
    const due = condensationDueCheck.run(ctxFor([condensedOverview({ [RBAC]: 'alt' }), rbac]));
    const missing = condensationDueCheck.run(ctxFor([stubOverview(), rbac]));

    for (const finding of [...due, ...missing]) {
      expect(finding.kind).toBe('condensation-due');
      expect(finding.severity).toBe('info');
      expect(finding.module).toBe(SLUG);
      expect(finding.fix).toBeNull();
      // A module-scoped run keeps it, a run for another module drops it.
      expect(inScope(finding, { module: SLUG })).toBe(true);
      expect(inScope(finding, { module: 'other' })).toBe(false);
    }
    expect(due).toHaveLength(1);
    expect(missing).toHaveLength(1);
  });

  it('keeps its id for an unchanged inventory and changes it with new material', () => {
    const rbac = page(RBAC, 'Rollen werden pro Tenant vergeben.');
    const first = condensationDueCheck.run(ctxFor([stubOverview(), rbac]));
    const again = condensationDueCheck.run(ctxFor([stubOverview(), page(RBAC, rbac.body)]));
    const grown = condensationDueCheck.run(
      ctxFor([stubOverview(), rbac, page(NEW_PAGE, 'Mehr Material.')]),
    );

    expect(again[0]?.id).toBe(first[0]?.id);
    expect(grown[0]?.id).not.toBe(first[0]?.id);
  });
});
