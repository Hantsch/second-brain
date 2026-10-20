/* `supersede` names a relation, it deletes nothing: both pages must still be
   there afterwards, and the only line that may change is the newer page's
   `supersedes` array. Four questions per test, same as `fixes.test.ts`: what
   changed, what didn't, does undo put it back, and does a stale precondition
   stop the write instead of running past it. */

import { describe, expect, it } from 'vitest';
import { GardenerError, supersede, undoFix } from '@core/gardener';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { NOW_MS } from '../../helpers/time';
import { moduleFixture, pagePathOf } from './fixtures';
import type { GardenerFixture } from './fixtures';

const OLDER = pagePathOf('wissen', { type: 'concept', slug: 'alt' });
const NEWER = pagePathOf('wissen', { type: 'concept', slug: 'neu' });

function deps(fixture: GardenerFixture) {
  return { store: fixture.store, docLanguage: 'de' as const, now: NOW_MS };
}

async function twoPageFixture(newerExtra?: Record<string, unknown>): Promise<GardenerFixture> {
  return moduleFixture('wissen', [
    {
      type: 'concept',
      slug: 'alt',
      title: 'Alte Fassung',
      summary: 'Die erste Version',
      body: 'Die alte Behauptung.',
    },
    {
      type: 'concept',
      slug: 'neu',
      title: 'Neue Fassung',
      summary: 'Die zweite Version',
      body: 'Die neue Behauptung.',
      extra: newerExtra,
    },
  ]);
}

describe('supersede', () => {
  it('trägt den Slug der älteren Seite in `supersedes` der neueren ein', async () => {
    const fixture = await twoPageFixture();
    const olderBefore = await fixture.text(OLDER);
    const newerBefore = await fixture.text(NEWER);

    const result = await supersede(deps(fixture), { newerPath: NEWER, olderPath: OLDER });

    expect(result.written).toBe(NEWER);
    expect(await fixture.text(OLDER)).toBe(olderBefore);

    const after = parse(await fixture.text(NEWER));
    expect(after.frontmatter['supersedes']).toEqual(['alt']);
    /* Alles andere im Frontmatter bleibt stehen. */
    const before = parse(newerBefore);
    expect(after.frontmatter['title']).toBe(before.frontmatter['title']);
    expect(after.frontmatter['tags']).toEqual(before.frontmatter['tags']);
    expect(after.body).toBe(before.body);
  });

  it('behält vorhandene Einträge und hängt nur den neuen an', async () => {
    const fixture = await twoPageFixture({ supersedes: ['irgendwas'] });

    await supersede(deps(fixture), { newerPath: NEWER, olderPath: OLDER });

    const after = parse(await fixture.text(NEWER));
    expect(after.frontmatter['supersedes']).toEqual(['irgendwas', 'alt']);
  });

  it('verweigert einen überholten Hash der neueren Seite und schreibt nichts', async () => {
    const fixture = await twoPageFixture();
    const newerBefore = await fixture.text(NEWER);
    const olderBefore = await fixture.text(OLDER);

    await expect(
      supersede(deps(fixture), {
        newerPath: NEWER,
        olderPath: OLDER,
        expectedHash: sha256('eine andere Fassung'),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof GardenerError && error.code === 'conflict',
    );

    expect(await fixture.text(NEWER)).toBe(newerBefore);
    expect(await fixture.text(OLDER)).toBe(olderBefore);
  });

  it('meldet ein schon benanntes Paar als `invalid`, statt erneut zu schreiben', async () => {
    const fixture = await twoPageFixture({ supersedes: ['alt'] });
    const before = await fixture.text(NEWER);

    await expect(
      supersede(deps(fixture), { newerPath: NEWER, olderPath: OLDER }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof GardenerError && error.code === 'invalid',
    );

    expect(await fixture.text(NEWER)).toBe(before);
  });

  it('lässt sich zurückdrehen: `supersedes` steht wieder wie davor', async () => {
    const fixture = await twoPageFixture();
    const before = await fixture.text(NEWER);

    const result = await supersede(deps(fixture), { newerPath: NEWER, olderPath: OLDER });
    expect(await fixture.text(NEWER)).not.toBe(before);

    const undone = await undoFix(fixture.store, result.undoToken);

    expect(undone.restored).toEqual([NEWER]);
    expect(await fixture.text(NEWER)).toBe(before);
  });

  it('schreibt einen lint-Eintrag in die Chronik des Moduls der neueren Seite', async () => {
    const fixture = await twoPageFixture();

    const result = await supersede(deps(fixture), { newerPath: NEWER, olderPath: OLDER });

    expect(result.logged).toBe('modules/wissen/wiki/log.md');
    const log = await fixture.text('modules/wissen/wiki/log.md');
    expect(log).toContain('- findings: supersede (alt -> neu)');
    expect(log).toContain('- touched: [[neu]], [[alt]]');
  });
});
