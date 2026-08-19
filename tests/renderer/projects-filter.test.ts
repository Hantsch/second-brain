/* The order of the project list — pure logic, no React.
 *
 * Six promises hang on this file: the last-touched row on top, the favourites
 * right below it, every project exactly once, star and re-entry point beating
 * "stale", the three other sorts untouched, and the filter staying binding.
 * A wrong rank is invisible in a diff — here it isn't.
 */

import { describe, expect, it } from 'vitest';
import type { Project } from '@shared/types';
import { favoritesFirst } from '@renderer/lib/favorites';
import {
  DEFAULT_FILTER,
  sortProjects,
  splitStalled,
  visibleProjects,
} from '@renderer/screens/projects/filter';
import type { ProjectFilter } from '@renderer/screens/projects/filter';

function project(patch: Partial<Project> & { slug: string }): Project {
  return {
    path: `projects/work/${patch.slug}/project.md`,
    title: patch.slug,
    scope: 'work',
    status: 'active',
    priority: 2,
    favorite: false,
    deadline: null,
    nextStep: null,
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: '2026-08-01T10:00:00.000Z',
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 0,
    openTodoCount: 0,
    excerpt: '',
    ...patch,
  };
}

/** Shorthand: slug plus the two fields the ranking actually hangs on. */
function row(slug: string, day: string, patch: Partial<Project> = {}): Project {
  return project({ slug, lastTouch: `2026-08-${day}T10:00:00.000Z`, ...patch });
}

const byTouch: ProjectFilter = { ...DEFAULT_FILTER, sort: 'touch' };

const slugs = (rows: readonly Project[]): string[] => rows.map((entry) => entry.slug);

describe('visibleProjects — ranking under "touch"', () => {
  it('puts the last-touched project on top and names it as latest', () => {
    const list = visibleProjects([row('old', '01'), row('new', '09'), row('mid', '05')], byTouch);

    expect(slugs(list.current)).toEqual(['new', 'mid', 'old']);
    expect(list.latest).toBe('new');
  });

  it('pulls the favourites directly behind latest, in their existing order', () => {
    const list = visibleProjects(
      [
        row('new', '09'),
        row('plain-a', '08'),
        row('star-a', '07', { favorite: true }),
        row('plain-b', '06'),
        row('star-b', '05', { favorite: true }),
      ],
      byTouch,
    );

    /* star-a before star-b, plain-a before plain-b: touch order survives inside
       each group — only the groups swap places. */
    expect(slugs(list.current)).toEqual(['new', 'star-a', 'star-b', 'plain-a', 'plain-b']);
    expect(list.latest).toBe('new');
  });

  it('lists every project exactly once in all', () => {
    const input = [
      row('a', '09', { favorite: true }),
      row('b', '08'),
      row('c', '07', { favorite: true }),
      row('d', '06', { stale: true }),
      row('e', '05'),
    ];

    const list = visibleProjects(input, byTouch);

    expect(list.all).toHaveLength(input.length);
    expect(new Set(slugs(list.all)).size).toBe(input.length);
    expect([...slugs(list.all)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(list.all).toEqual([...list.current, ...list.stalled]);
  });

  it('lists a project that is both favourite and latest only once, at the top', () => {
    const list = visibleProjects(
      [
        row('star-new', '09', { favorite: true }),
        row('star-old', '07', { favorite: true }),
        row('plain', '08'),
      ],
      byTouch,
    );

    expect(slugs(list.current)).toEqual(['star-new', 'star-old', 'plain']);
    expect(slugs(list.all).filter((slug) => slug === 'star-new')).toHaveLength(1);
    expect(list.latest).toBe('star-new');
  });

  it('never drops a starred project into the stale section', () => {
    const list = visibleProjects(
      [
        row('new', '09'),
        row('star-stale', '05', { favorite: true, stale: true }),
        row('just-stale', '04', { stale: true }),
      ],
      byTouch,
    );

    expect(slugs(list.current)).toEqual(['new', 'star-stale']);
    expect(slugs(list.stalled)).toEqual(['just-stale']);
    /* The star moves the row, not the fact — it stays marked stale. */
    expect(list.current[1]?.stale).toBe(true);
  });

  it('never drops the last-touched project into the stale section either', () => {
    const list = visibleProjects(
      [row('new-but-stale', '09', { stale: true }), row('old', '05')],
      byTouch,
    );

    expect(slugs(list.current)).toEqual(['new-but-stale', 'old']);
    expect(list.stalled).toEqual([]);
    expect(list.latest).toBe('new-but-stale');
  });

  it('leaves the plain touch order untouched when nothing is favourited', () => {
    const input = [row('c', '05'), row('a', '09'), row('b', '07')];

    const list = visibleProjects(input, byTouch);

    expect(slugs(list.current)).toEqual(slugs(sortProjects(input, 'touch')));
    expect(slugs(list.current)).toEqual(['a', 'b', 'c']);
    expect(list.latest).toBe('a');
  });

  it('has no latest when nothing survives the filter', () => {
    const list = visibleProjects([], byTouch);

    expect(list.latest).toBeNull();
    expect(list.all).toEqual([]);
  });

  it('mixes the scopes into one list — only the scope filter separates them', () => {
    const list = visibleProjects(
      [
        row('work-old', '05'),
        row('private-new', '09', { scope: 'private' }),
        row('private-star', '04', { scope: 'private', favorite: true }),
      ],
      byTouch,
    );

    expect(slugs(list.current)).toEqual(['private-new', 'private-star', 'work-old']);
  });
});

describe('visibleProjects — the other sorts', () => {
  const rows = [
    row('late', '09', { title: 'Zebra', priority: 5, deadline: '2026-12-01' }),
    row('star', '08', { title: 'Anton', priority: 3, deadline: '2026-09-01', favorite: true }),
    row('none', '07', { title: 'Marta', priority: 1, deadline: null }),
  ];

  it('sorts by deadline, priority and name without regard for the star', () => {
    /* Exactly the order sortProjects delivers today — being favourited must
       have zero effect on any of the three. */
    expect(slugs(sortProjects(rows, 'deadline'))).toEqual(['star', 'late', 'none']);
    expect(slugs(sortProjects(rows, 'priority'))).toEqual(['none', 'star', 'late']);
    expect(slugs(sortProjects(rows, 'name'))).toEqual(['star', 'none', 'late']);

    const unstarred = rows.map((entry) => ({ ...entry, favorite: false }));
    for (const sort of ['deadline', 'priority', 'name'] as const) {
      expect(slugs(sortProjects(rows, sort))).toEqual(slugs(sortProjects(unstarred, sort)));
    }
  });

  it('reorders nothing and reports no latest under deadline, priority and name', () => {
    for (const sort of ['deadline', 'priority', 'name'] as const) {
      const list = visibleProjects(rows, { ...DEFAULT_FILTER, sort });
      expect(list.latest).toBeNull();
      expect(slugs(list.all)).toEqual(slugs(sortProjects(rows, sort)));
    }
  });
});

describe('visibleProjects — the filter stays binding', () => {
  it('does not bring a filtered-out favourite back in via the scope filter', () => {
    const list = visibleProjects(
      [row('private-star', '09', { scope: 'private', favorite: true }), row('work', '05')],
      { ...DEFAULT_FILTER, scope: 'work' },
    );

    expect(slugs(list.all)).toEqual(['work']);
    expect(list.latest).toBe('work');
  });

  it('does not bring a favourite back in that status or search excluded', () => {
    const rows = [row('done-star', '09', { status: 'done', favorite: true }), row('running', '05')];

    expect(slugs(visibleProjects(rows, { ...DEFAULT_FILTER, status: 'open' }).all)).toEqual([
      'running',
    ]);
    expect(slugs(visibleProjects(rows, { ...DEFAULT_FILTER, query: 'running' }).all)).toEqual([
      'running',
    ]);
  });
});

describe('splitStalled', () => {
  it('spares star and latest, banishes the rest, and keeps the order', () => {
    const rows = [
      row('latest-stale', '09', { stale: true }),
      row('star-stale', '08', { favorite: true, stale: true }),
      row('stale-a', '07', { stale: true }),
      row('awake', '06'),
      row('stale-b', '05', { stale: true }),
    ];

    const split = splitStalled(rows, 'latest-stale');

    expect(slugs(split.current)).toEqual(['latest-stale', 'star-stale', 'awake']);
    expect(slugs(split.stalled)).toEqual(['stale-a', 'stale-b']);
  });

  it('spares only the stars when there is no latest', () => {
    const split = splitStalled(
      [row('a', '09', { stale: true }), row('b', '08', { stale: true, favorite: true })],
      null,
    );

    expect(slugs(split.current)).toEqual(['b']);
    expect(slugs(split.stalled)).toEqual(['a']);
  });
});

describe('favoritesFirst', () => {
  it('partitions stably: stars to the front, order kept inside both groups', () => {
    const rows = [
      row('nonFavA', '09'),
      row('favA', '08', { favorite: true }),
      row('nonFavB', '07'),
      row('favB', '06', { favorite: true }),
    ];

    expect(slugs(favoritesFirst(rows))).toEqual(['favA', 'favB', 'nonFavA', 'nonFavB']);
  });

  it('leaves the input alone and copes with empty and star-free lists', () => {
    const rows = [row('a', '09'), row('b', '08')];

    expect(favoritesFirst([])).toEqual([]);
    expect(slugs(favoritesFirst(rows))).toEqual(['a', 'b']);
    expect(slugs(rows)).toEqual(['a', 'b']);
  });
});
