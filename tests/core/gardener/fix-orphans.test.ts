/* Mehrere verwaiste Seiten in einem Zug in die Overview: jede Zeile wörtlich die
   Vorschau ihres Befunds, ein Rückweg für alles, und was schon verlinkt ist,
   wird nicht doppelt eingetragen. */

import { describe, expect, it } from 'vitest';
import { linkOrphansIntoOverview, orphanCheck, undoFix } from '@core/gardener';
import { NOW_MS } from '../../helpers/time';
import { SETTINGS, moduleFixture } from './fixtures';

const OVERVIEW = 'modules/wissen/wiki/overview.md';

/* Ohne Katalog: eine im Katalog gelistete Seite wäre keine Waise. */
const UNLISTED = { catalog: null };

const PAGES = [
  {
    type: 'concept' as const,
    slug: 'eins',
    title: 'Erste Waise',
    summary: 'Niemand verlinkt',
    body: 'Steht für sich.',
  },
  {
    type: 'concept' as const,
    slug: 'zwei',
    title: 'Zweite Waise',
    summary: 'Niemand verlinkt',
    body: 'Steht auch für sich.',
  },
  {
    type: 'overview' as const,
    slug: 'overview',
    title: 'Synthese',
    summary: 'Der rote Faden',
    body: 'Führt über nichts.',
  },
];

describe('linkOrphansIntoOverview', () => {
  it('trägt alle Seiten in einem Schreibvorgang ein und dreht sie mit einer Marke zurück', async () => {
    const fixture = await moduleFixture('wissen', PAGES, UNLISTED);
    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));
    expect(findings).toHaveLength(2);
    const before = (await fixture.store.readText(OVERVIEW)) ?? '';

    const result = await linkOrphansIntoOverview(
      { store: fixture.store, docLanguage: 'de', now: NOW_MS },
      findings,
    );

    expect(result.written).toEqual([OVERVIEW]);
    const overview = (await fixture.store.readText(OVERVIEW)) ?? '';
    expect(overview).toContain('## Seiten');
    for (const finding of findings) expect(overview).toContain(finding.fix?.preview ?? 'x');
    expect(result.logged).not.toBeNull();

    await fixture.refresh();
    expect(orphanCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);

    const undone = await undoFix(fixture.store, result.undoToken ?? '');
    expect(undone.restored).toEqual([OVERVIEW]);
    expect(await fixture.store.readText(OVERVIEW)).toBe(before);
  });

  it('lässt weg, was die Overview schon verlinkt, und sagt ehrlich, wenn nichts übrig bleibt', async () => {
    const fixture = await moduleFixture('wissen', PAGES, UNLISTED);
    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));
    const deps = { store: fixture.store, docLanguage: 'de' as const, now: NOW_MS };

    await linkOrphansIntoOverview(deps, findings);
    // Derselbe, jetzt veraltete Befund: alles steht schon da.
    await expect(linkOrphansIntoOverview(deps, findings)).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('weist einen Befund ab, dessen Fix keine Overview ist', async () => {
    const fixture = await moduleFixture('wissen', PAGES, UNLISTED);
    const [finding] = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));
    if (finding === undefined) throw new Error('Kein Befund.');
    const wrong = { ...finding, paths: [finding.paths[0] ?? '', finding.paths[0] ?? ''] };

    await expect(
      linkOrphansIntoOverview({ store: fixture.store, docLanguage: 'de', now: NOW_MS }, [wrong]),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});
