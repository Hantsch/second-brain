import { describe, expect, it } from 'vitest';
import { emptyStats, indexStats } from '@core/index/stats';
import { deriveIndex } from '@core/index/build';
import { emptyIndex } from '@core/index/types';
import { makeDoc } from './fixtures';

describe('indexStats', () => {
  it('ohne Index sind alle Zahlen 0 und die Zeiten null', () => {
    expect(indexStats(null)).toEqual(emptyStats());
    expect(indexStats(null).builtAt).toBeNull();
    expect(indexStats(null).durationMs).toBeNull();
  });

  it('ein leerer Index ist kein Fehler', () => {
    const stats = indexStats(emptyIndex('2026-08-10T09:00:00.000Z'));
    expect(stats).toMatchObject({ docs: 0, todos: 0, pages: 0, words: 0, durationMs: 0 });
    expect(stats.builtAt).toBe('2026-08-10T09:00:00.000Z');
  });

  it('zaehlt Dokumente, Todos, Projekte, Module, Seiten und Woerter', () => {
    const index = deriveIndex(
      [
        makeDoc({
          path: 'projects/work/x/project.md',
          docType: 'project',
          project: 'x',
          frontmatter: { type: 'project', title: 'X', slug: 'x', scope: 'work', status: 'active' },
          body: 'Ein Satz mit fuenf Woertern.\n\n- [ ] Etwas tun\n',
        }),
        makeDoc({
          path: 'modules/m/wiki/concepts/a.md',
          docType: 'concept',
          module: 'm',
          frontmatter: { type: 'concept', title: 'A' },
          body: 'Zwei Woerter.',
        }),
      ],
      { now: '2026-08-10', builtAt: '2026-08-10T09:00:00.000Z', durationMs: 42 },
    );
    expect(indexStats(index)).toEqual({
      docs: 2,
      todos: 1,
      projects: 1,
      modules: 1,
      pages: 1,
      words: index.docs[0]!.words + index.docs[1]!.words,
      builtAt: '2026-08-10T09:00:00.000Z',
      durationMs: 42,
      oversized: [],
    });
  });

  it('stats list oversized files', () => {
    const index = deriveIndex(
      [
        makeDoc({ path: 'areas/small.md', body: 'Kurzer Text.' }),
        makeDoc({ path: 'areas/z-big.md', body: '', oversized: true }),
        makeDoc({ path: 'areas/a-big.md', body: '', oversized: true }),
      ],
      { now: '2026-08-10' },
    );
    expect(indexStats(index).oversized).toEqual(['areas/a-big.md', 'areas/z-big.md']);
  });
});
