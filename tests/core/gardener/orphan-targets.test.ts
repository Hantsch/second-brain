/* Der Kandidatenpicker fuer den Verweis-Fix einer verwaisten Seite (Story 016):
   ohne eindeutige Stelle entscheidet ein Mensch statt der automatischen
   Einzelkandidaten-Regel in `checks/orphan.ts`. Getestet wird hier nur die reine
   Funktion — Ordnung, Ausschluss, Dokumentsprache — ohne Store oder Index. */

import { describe, expect, it } from 'vitest';
import { orphanTargets } from '@core/gardener/orphan-targets';
import type { WikiPage } from '@shared/types';

function page(overrides: Partial<WikiPage> & Pick<WikiPage, 'path' | 'slug' | 'title'>): WikiPage {
  return {
    module: 'm',
    type: 'concept',
    created: '2026-01-01T09:00:00.000Z',
    updated: '2026-01-01T09:00:00.000Z',
    tags: [],
    sources: [],
    outbound: [],
    inbound: [],
    excerpt: '',
    wordCount: 0,
    ...overrides,
  };
}

const orphan = page({
  path: 'modules/m/wiki/concepts/oauth-sessions.md',
  slug: 'oauth-sessions',
  title: 'OAuth Sessions',
});

describe('orphanTargets', () => {
  it('liefert eine leere Liste, aber die richtige Zeile, ohne andere Seite', () => {
    const result = orphanTargets([orphan], orphan, 'de');

    expect(result.targets).toEqual([]);
    expect(result.line).toBe('Bezug: [[oauth-sessions]]');
  });

  it('reiht die Uebersichtsseite zuerst ein', () => {
    const overview = page({
      path: 'modules/m/wiki/overview.md',
      slug: 'overview',
      title: 'Overview',
      type: 'overview',
    });
    const other = page({
      path: 'modules/m/wiki/concepts/billing.md',
      slug: 'billing',
      title: 'Billing Notes',
    });

    const result = orphanTargets([orphan, overview, other], orphan, 'de');

    expect(result.targets.map((target) => target.slug)).toEqual(['overview', 'billing']);
  });

  it('reiht eine Seite mit gemeinsamem Erwaehnungswort vor eine unbeteiligte ein, beide nach der Uebersicht', () => {
    const overview = page({
      path: 'modules/m/wiki/overview.md',
      slug: 'overview',
      title: 'Overview',
      type: 'overview',
    });
    const related = page({
      path: 'modules/m/wiki/concepts/oauth-client.md',
      slug: 'oauth-client',
      title: 'OAuth Client',
    });
    const unrelated = page({
      path: 'modules/m/wiki/concepts/billing.md',
      slug: 'billing',
      title: 'Billing Notes',
    });

    const result = orphanTargets([orphan, unrelated, related, overview], orphan, 'de');

    expect(result.targets.map((target) => target.slug)).toEqual([
      'overview',
      'oauth-client',
      'billing',
    ]);
  });

  it('nennt die verwaiste Seite selbst nie', () => {
    const other = page({
      path: 'modules/m/wiki/concepts/billing.md',
      slug: 'billing',
      title: 'Billing Notes',
    });

    const result = orphanTargets([orphan, other], orphan, 'de');

    expect(result.targets.some((target) => target.path === orphan.path)).toBe(false);
  });

  it('schliesst eine Seite aus, die die verwaiste Seite schon verlinkt', () => {
    const linking = page({
      path: 'modules/m/wiki/concepts/billing.md',
      slug: 'billing',
      title: 'Billing Notes',
      outbound: ['m/oauth-sessions'],
    });
    const notLinking = page({
      path: 'modules/m/wiki/concepts/invoices.md',
      slug: 'invoices',
      title: 'Invoices',
    });

    const result = orphanTargets([orphan, linking, notLinking], orphan, 'de');

    expect(result.targets.map((target) => target.slug)).toEqual(['invoices']);
  });

  it('folgt der Dokumentsprache fuer die angehaengte Zeile', () => {
    expect(orphanTargets([orphan], orphan, 'de').line).toBe('Bezug: [[oauth-sessions]]');
    expect(orphanTargets([orphan], orphan, 'en').line).toBe('Related: [[oauth-sessions]]');
  });

  it('sortiert Gleichstand innerhalb einer Gruppe nach Titel aufsteigend', () => {
    const zeta = page({
      path: 'modules/m/wiki/concepts/zeta.md',
      slug: 'zeta',
      title: 'Zeta Notes',
    });
    const alpha = page({
      path: 'modules/m/wiki/concepts/alpha.md',
      slug: 'alpha',
      title: 'Alpha Notes',
    });

    const result = orphanTargets([orphan, zeta, alpha], orphan, 'de');

    expect(result.targets.map((target) => target.slug)).toEqual(['alpha', 'zeta']);
  });
});
