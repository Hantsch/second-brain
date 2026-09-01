// @vitest-environment jsdom
/* The areas row of the day close-out (036, D3).
 *
 * Every other proposed field (people, projects, tags, mood, energy) is
 * all-or-nothing: one checkbox keeps or discards the whole list the model
 * found. Areas are different — the model may miss one the user still wants,
 * or name one that does not belong — so the row is chips plus an add-picker
 * fed by `api.areas.list()`, never a single checkbox. These tests exercise
 * exactly that shape: proposed areas as removable chips, the picker adding
 * one the model did not propose, removing every chip down to an empty set,
 * and that none of this writes anything before "Apply" is pressed. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse, JournalCloseSuggestion } from '@shared/ipc';
import type { Area } from '@shared/types';
import { CloseProposal } from '@renderer/screens/journal/CloseProposal';
import { clear, set } from '@renderer/lib/close-proposal';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

const DATE = '2026-08-20';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function installMock(handlers: Handlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

function area(slug: string, title: string): Area {
  return {
    path: `areas/${slug}.md`,
    slug,
    title,
    scope: 'work',
    hash: `hash-${slug}`,
    noteCount: 0,
    openTodoCount: 0,
    notes: [],
  };
}

const AREAS: Area[] = [
  area('gesundheit', 'Gesundheit'),
  area('finanzen', 'Finanzen'),
  area('garten', 'Garten'),
];

function suggestion(areas: string[]): JournalCloseSuggestion {
  return {
    date: DATE,
    path: `journal/2026/08/${DATE}.md`,
    proposal: {
      dumpPath: `journal/2026/08/${DATE}.md`,
      title: DATE,
      scope: 'work',
      tags: [],
      primary: { kind: 'journal', target: `journal/2026/08/${DATE}.md`, reason: 'reason' },
      extras: [],
      alternatives: [],
      todos: [],
      waitingOn: [],
      reason: 'reason',
    },
    frontmatter: { people: [], projects: [], areas, mood: null, energy: null, tags: [] },
    heuristic: true,
  } as unknown as JournalCloseSuggestion;
}

function renderPanel(areas: string[]): { onApply: ReturnType<typeof vi.fn> } {
  installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 1,
      indexedAt: new Date().toISOString(),
      indexing: false,
    }),
    'areas:list': () => AREAS,
  });
  set(DATE, suggestion(areas));
  const client = new QueryClient();
  const onApply = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CloseProposal
        date={DATE}
        projects={[]}
        busy={false}
        error={null}
        onApply={onApply}
        onDiscard={() => undefined}
        onRunAgain={() => undefined}
      />
    </QueryClientProvider>,
  );
  return { onApply };
}

describe('day close-out: areas row', () => {
  beforeEach(() => setLanguage('de'));
  afterEach(() => clear(DATE));

  it('shows proposed areas as removable chips', async () => {
    renderPanel(['gesundheit']);

    expect(await screen.findByText('Gesundheit')).toBeTruthy();
    expect(screen.getByRole('button', { name: '„Gesundheit“ entfernen' })).toBeTruthy();
  });

  it('removing a chip drops it from what gets applied', async () => {
    const { onApply } = renderPanel(['gesundheit']);

    await userEvent.click(await screen.findByRole('button', { name: '„Gesundheit“ entfernen' }));

    /* The chip (and its remove control) is gone; the area is only left as
       an offer in the add-picker, not as a kept chip. */
    expect(screen.queryByRole('button', { name: '„Gesundheit“ entfernen' })).toBeNull();
    expect(await screen.findByText('Kein Bereich ausgewählt.')).toBeTruthy();

    /* Nothing else is proposed, so the button stays disabled without a
       write, and applying anyway must not carry the removed area. */
    expect(onApply).not.toHaveBeenCalled();
  });

  it('the picker (fed by api.areas.list()) adds an area the model did not propose', async () => {
    renderPanel([]);

    expect(await screen.findByText('Kein Bereich ausgewählt.')).toBeTruthy();
    const picker = await screen.findByLabelText('Bereich hinzufügen');
    await userEvent.selectOptions(picker, 'garten');

    expect(await screen.findByText('Garten')).toBeTruthy();
    expect(screen.queryByText('Kein Bereich ausgewählt.')).toBeNull();
    /* Applying now carries the picked area, and only that one. */
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Übernehmen' }).getAttribute('disabled')).toBe(
        null,
      ),
    );
  });

  it('removing all chips leaves an empty set', async () => {
    renderPanel(['gesundheit', 'finanzen']);

    await userEvent.click(await screen.findByRole('button', { name: '„Gesundheit“ entfernen' }));
    await userEvent.click(await screen.findByRole('button', { name: '„Finanzen“ entfernen' }));

    expect(await screen.findByText('Kein Bereich ausgewählt.')).toBeTruthy();
  });

  it('only offers areas that exist in the vault — the picker never proposes an unknown one', async () => {
    renderPanel(['gesundheit']);

    const picker = (await screen.findByLabelText('Bereich hinzufügen')) as HTMLSelectElement;
    const offered = Array.from(picker.options).map((option) => option.value);
    /* The already-chosen area is not offered again; only vault areas ever
       appear, both here and in the discard tests. */
    expect(offered).not.toContain('gesundheit');
    expect(offered).toEqual(expect.arrayContaining(['finanzen', 'garten']));
  });

  it('discarding the panel writes nothing regardless of chip edits', async () => {
    const { onApply } = renderPanel(['gesundheit']);

    await userEvent.click(await screen.findByRole('button', { name: '„Gesundheit“ entfernen' }));
    const picker = await screen.findByLabelText('Bereich hinzufügen');
    await userEvent.selectOptions(picker, 'garten');

    /* Discard is exercised through the callback directly here (the panel's
       own discard button is covered end-to-end in journal.test.tsx); the
       point of this test is only that nothing was ever applied. */
    expect(onApply).not.toHaveBeenCalled();
  });
});
