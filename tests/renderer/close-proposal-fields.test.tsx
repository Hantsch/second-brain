// @vitest-environment jsdom
/* People, projects, tags and mood/energy on the day close-out card (075, D4).
 *
 * People, projects and tags mirror the areas row (036, D3, proven in
 * `close-proposal-areas.test.tsx`): a proposal here is rarely all-or-nothing,
 * so each item is its own removable chip rather than one all-or-nothing
 * checkbox for the whole field. Mood and energy are different: AC7 asks that
 * a value can be *set*, not only kept or dropped — including one the
 * suggestion never proposed at all, since the group is always visible now.
 *
 * Every assertion reads `payloadOf` off the live store entry through
 * `PayloadProbe`, the same harness `close-proposal-todo-row.test.tsx` uses:
 * a mocked `onApply` argument would only prove a handler ran, not that the
 * correction reached what accepting actually writes. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { JournalCloseSuggestion, JournalFrontmatterFields, Project } from '@shared/types';
import { CloseProposal } from '@renderer/screens/journal/CloseProposal';
import { clear, set, useCloseProposal } from '@renderer/lib/close-proposal';
import { payloadOf } from '@renderer/lib/close-proposal-view';
import type { ClosePayload } from '@renderer/lib/close-proposal-view';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

const DATE = '2026-08-20';
const DAY_PATH = `journal/2026/08/${DATE}.md`;

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function installMock(handlers: Handlers): void {
  const invoke = async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    return handler(payload);
  };
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

function project(patch: Partial<Project> = {}): Project {
  return {
    path: 'projects/work/portal-relaunch/project.md',
    slug: 'portal-relaunch',
    title: 'Portal Relaunch',
    scope: 'work',
    status: 'active',
    priority: 1,
    favorite: false,
    deadline: null,
    nextStep: null,
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: DATE,
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 0,
    openTodoCount: 0,
    excerpt: '',
    ...patch,
  };
}

const PROJECT_RELAUNCH = project();
const PROJECT_GARDEN = project({
  path: 'projects/private/garden-fence/project.md',
  slug: 'garden-fence',
  title: 'Garden fence',
  scope: 'private',
});

function suggestion(frontmatter: Partial<JournalFrontmatterFields> = {}): JournalCloseSuggestion {
  return {
    date: DATE,
    path: DAY_PATH,
    proposal: {
      dumpPath: DAY_PATH,
      title: DATE,
      scope: 'work',
      tags: [],
      primary: { target: 'journal', path: DAY_PATH, section: 'Facts', content: '' },
      extras: [],
      alternatives: [],
      confidence: 1,
      reason: 'reason',
      todos: [],
      waitingOn: [],
      entities: [],
      heuristic: true,
      createdAt: DATE,
    },
    frontmatter: {
      people: [],
      projects: [],
      areas: [],
      mood: null,
      energy: null,
      tags: [],
      ...frontmatter,
    },
    heuristic: true,
  } as unknown as JournalCloseSuggestion;
}

/* Same probe as `close-proposal-todo-row.test.tsx`: re-subscribes to the same
   session store `CloseProposal` reads, so it reflects every edit fired
   against the rendered card, not a snapshot taken at render time. */
let latestPayload: ClosePayload | null = null;

function PayloadProbe({ date }: { date: string }) {
  const entry = useCloseProposal(date);
  latestPayload = entry === undefined ? null : payloadOf(entry.suggestion, entry.edits);
  return null;
}

function renderPanel(frontmatter: Partial<JournalFrontmatterFields> = {}): void {
  installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 1,
      indexedAt: DATE,
      indexing: false,
      indexRefreshFailedAt: null,
    }),
    'areas:list': () => [],
  });
  set(DATE, suggestion(frontmatter));
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PayloadProbe date={DATE} />
      <CloseProposal
        date={DATE}
        projects={[PROJECT_RELAUNCH, PROJECT_GARDEN]}
        busy={false}
        error={null}
        onApply={() => undefined}
        onDiscard={() => undefined}
        onRunAgain={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe('day close-out: fields item by item and mood/energy (075, D4)', () => {
  beforeEach(() => {
    setLanguage('en');
    latestPayload = null;
  });
  afterEach(() => clear(DATE));

  it('dropping one person keeps the others (AC6)', async () => {
    renderPanel({ people: ['Anna', 'Stefan'] });

    expect(await screen.findByText('Anna')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove “Anna”' }));

    expect(latestPayload?.frontmatter.people).toEqual(['Stefan']);
    expect(screen.queryByText('Anna')).toBeNull();
    expect(screen.getByText('Stefan')).toBeTruthy();
  });

  it('dropping one project keeps the others, and a picked project is added (AC6)', async () => {
    renderPanel({ projects: [PROJECT_RELAUNCH.slug] });

    await userEvent.click(screen.getByRole('button', { name: 'Remove “Portal Relaunch”' }));
    expect(latestPayload?.frontmatter.projects).toEqual([]);

    const picker = await screen.findByLabelText('Add a project');
    await userEvent.selectOptions(picker, PROJECT_GARDEN.slug);
    expect(latestPayload?.frontmatter.projects).toEqual([PROJECT_GARDEN.slug]);

    /* The dropped project stays offered again, the newly added one no longer
       is — the same picker filtering the areas row already proves. */
    await userEvent.selectOptions(picker, PROJECT_RELAUNCH.slug);
    expect(latestPayload?.frontmatter.projects).toEqual([
      PROJECT_GARDEN.slug,
      PROJECT_RELAUNCH.slug,
    ]);
  });

  it('dropping one tag keeps the others (AC6)', async () => {
    renderPanel({ tags: ['stress', 'sport'] });

    await userEvent.click(screen.getByRole('button', { name: 'Remove “stress”' }));

    expect(latestPayload?.frontmatter.tags).toEqual(['sport']);
    expect(screen.getByText('sport')).toBeTruthy();
  });

  it('mood and energy can be set when the proposal named neither (AC7)', async () => {
    renderPanel({ mood: null, energy: null });

    expect(latestPayload?.frontmatter.mood).toBeNull();
    expect(latestPayload?.frontmatter.energy).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Set Good' }));
    expect(latestPayload?.frontmatter.mood).toBe(4);

    await userEvent.click(screen.getByRole('button', { name: 'Set High' }));
    expect(latestPayload?.frontmatter.energy).toBe(4);
  });

  it('mood and energy can be changed to a different value than the one proposed (AC7)', async () => {
    renderPanel({ mood: 2, energy: 1 });

    expect(latestPayload?.frontmatter.mood).toBe(2);

    await userEvent.click(screen.getByRole('button', { name: 'Set Very good' }));
    expect(latestPayload?.frontmatter.mood).toBe(5);
    /* Energy, untouched, still carries the proposal's own value. */
    expect(latestPayload?.frontmatter.energy).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Set Full' }));
    expect(latestPayload?.frontmatter.energy).toBe(5);
  });
});
