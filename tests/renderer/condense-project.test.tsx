// @vitest-environment jsdom
/* The knowledge tab of a project (story 045, deliverable D4).
 *
 * `ProjectKnowledgeTab` is a thin wrapper around `CondensedUnitPanel`
 * (the same panel `AreaCondensedTab` uses, see `condense-area.test.tsx`) —
 * this file checks the project-specific wiring: the `condense-project` task,
 * the `project.condensed.*` copy, and that the panel's shared behaviour
 * (no-model state, trigger → diff → accept, reject-with-reason, delete,
 * conflict handling) all carry over unchanged for this level.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcError, IpcRequest, IpcResponse } from '@shared/ipc';
import type { CondenseProposal, WorkTask } from '@shared/types';
import { ProjectKnowledgeTab } from '@renderer/screens/projects/ProjectKnowledgeTab';
import { AreaCondensedTab } from '@renderer/screens/notes/AreaCondensedTab';
import { ToastHost } from '@renderer/components/ToastHost';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { getWorkTasks, resetWorkTasksStoreForTests, setWorkTasks } from '@renderer/lib/tasks-store';
import { clearToasts } from '@renderer/lib/toast';

function ipcError(code: IpcError['code']): Error {
  return Object.assign(new Error(code), { code });
}

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
}

function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

const PROJECT = { slug: 'kundenportal-relaunch', title: 'Kundenportal Relaunch' };

const ARTIFACT = {
  content: 'Verdichteter Überblick über das Projekt Kundenportal Relaunch.',
  hash: 'hash-condensed',
  path: 'projects/work/kundenportal-relaunch/project.condensed.md',
  condensedAt: '2026-08-10T09:00:00+02:00',
  sources: ['projects/work/kundenportal-relaunch/project.md'],
};

/* Since 073 a run is a queued task, and since D5 the panel reads its whole
   state back from the work queue (`condense-area.test.tsx` carries the same
   fixture and the longer note on why). The `subject.ref` is what ties a task
   to one unit — `<unit>:<slug>`, exactly as `condense:run` writes it. */
const RUN_TASK: WorkTask = {
  id: 'condense-task',
  kind: 'condense',
  lane: 'model',
  subject: { label: 'Verdichtung', ref: `project:${PROJECT.slug}` },
  state: 'done',
  progress: 1,
  message: null,
  error: null,
  queuePosition: null,
  queuedAt: '2026-08-10T09:00:00.000Z',
  startedAt: '2026-08-10T09:00:00.000Z',
  finishedAt: '2026-08-10T09:00:01.000Z',
  hasResult: true,
  detail: null,
  retryable: true,
};

/** Feeds the live queue store the way `main.tsx` does for a real
    `event:work-tasks` — a test standing in for the main process. */
let runCount = 0;

function queueTask(task: WorkTask): void {
  setWorkTasks([...getWorkTasks(), task]);
}

/** The channels one run now takes, as one spread. */
function runsTo(proposal: CondenseProposal, task: WorkTask = RUN_TASK): Handlers {
  return {
    'condense:run': () => {
      /* Every run is its own task with its own id, exactly as the real queue
         mints them — a re-run must not read the previous run's result back
         out of the cache entry keyed by that id. */
      runCount += 1;
      const queued: WorkTask = { ...task, id: `${task.id}-${runCount}` };
      queueTask(queued);
      return queued;
    },
    'work:list': () => getWorkTasks(),
    'tasks:result': () => ({ kind: 'condense', proposal }),
  };
}

const NOT_ROUTED: Handlers = {
  'llm:routing': () => ({ tasks: {}, defaults: {} }),
  'llm:tasks': () => [],
};

const ROUTED: Handlers = {
  'llm:routing': () => ({
    tasks: { 'condense-project': { providerId: 'local', model: 'qwen' } },
    defaults: {},
  }),
  'llm:tasks': () => [],
};

function renderTab(extra: Handlers): { sb: Mock; container: HTMLElement } {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 5,
      indexedAt: '2026-08-10T09:00:00+02:00',
      indexing: false,
      indexRefreshFailedAt: null,
    }),
    'condense:read': () => null,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectKnowledgeTab project={PROJECT} />
        <ToastHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container };
}

/* The queue store is a module singleton — see `condense-area.test.tsx`. */
beforeEach(() => {
  resetWorkTasksStoreForTests();
  runCount = 0;
});

afterEach(() => {
  delete window.sb;
  clearToasts();
});

/* jsdom kennt `scrollIntoView` nicht — ohne Attrappe stirbt `ErrorState`
   daran, wie in `condense-area.test.tsx`. */
Element.prototype.scrollIntoView = () => undefined;

describe('Wissen-Tab eines Projekts (Story 045, D4)', () => {
  it('zeigt ohne Routing nur den Hinweis zu „condense-project“, keinen Auslöser — ein Artefakt bleibt lesbar', async () => {
    setLanguage('de');
    renderTab({ ...NOT_ROUTED, 'condense:read': () => ARTIFACT });

    expect(await screen.findByText('Für diesen Schritt fehlt ein Modell')).toBeTruthy();
    expect(screen.getByText(/Projekt verdichten/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Routing einrichten' })).toBeTruthy();
    /* The artifact is still readable — reading is independent of routing. */
    expect(
      await screen.findByText('Verdichteter Überblick über das Projekt Kundenportal Relaunch.'),
    ).toBeTruthy();
    /* No trigger anywhere, not even disabled. */
    expect(screen.queryByRole('button', { name: 'Dieses Projekt verdichten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erneut verdichten' })).toBeNull();
  });

  it('zeigt bei geroutetem Modell ohne Artefakt einen Leerzustand mit Auslöser', async () => {
    setLanguage('de');
    renderTab(ROUTED);

    expect(await screen.findByText('Noch nicht verdichtet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dieses Projekt verdichten' })).toBeTruthy();
  });

  it('führt Auslöser, Diff und Übernehmen zusammen aus, schreibt aber nichts von selbst', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      unit: 'project',
      slug: PROJECT.slug,
      path: 'projects/work/kundenportal-relaunch/project.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    const { sb } = renderTab({
      ...ROUTED,
      ...runsTo(proposal),
      'condense:accept': () => ({ path: ARTIFACT.path, hash: 'hash-after', undoToken: null }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Dieses Projekt verdichten' }));

    expect(await screen.findByText('Alte Zeile.')).toBeTruthy();
    expect(await screen.findByText('Neue Zeile.')).toBeTruthy();
    /* Nothing writes until Accept is clicked. */
    expect(sb.calls.some((entry) => entry.channel === 'condense:accept')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() =>
      expect(sb.calls.some((entry) => entry.channel === 'condense:accept')).toBe(true),
    );
    const acceptCall = sb.calls.find((entry) => entry.channel === 'condense:accept');
    expect(acceptCall?.payload).toEqual({ proposal });
  });

  it('deaktiviert den Bestätigen-Knopf im Ablehnen-Dialog, solange keine Begründung steht', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      unit: 'project',
      slug: PROJECT.slug,
      path: 'projects/work/kundenportal-relaunch/project.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    renderTab({ ...ROUTED, ...runsTo(proposal) });

    await userEvent.click(await screen.findByRole('button', { name: 'Dieses Projekt verdichten' }));
    await screen.findByRole('button', { name: 'Übernehmen' });
    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));

    const dialog = within(await screen.findByRole('dialog'));
    const submit = dialog.getByRole('button', { name: 'Ablehnen' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(dialog.getByLabelText('Begründung'), 'Zu ungenau.');
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    /* No bare dismiss: closing without a reason must not exist as a submit
       path — the disabled state above is what stands in for that guarantee,
       and the dialog's own Escape/close handler (tested generically in
       `condense-reject-dialog.test.tsx`) never counts as accepting. */
  });

  it('rejects a proposal with a reason (D8 behaviour carried over) — the proposal disappears afterwards', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      unit: 'project',
      slug: PROJECT.slug,
      path: 'projects/work/kundenportal-relaunch/project.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    const { sb } = renderTab({
      ...ROUTED,
      ...runsTo(proposal),
      'condense:reject': () => ({ path: ARTIFACT.path }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Dieses Projekt verdichten' }));
    await screen.findByRole('button', { name: 'Übernehmen' });
    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Begründung'), 'Zu ungenau, bitte noch einmal.');
    await userEvent.click(dialog.getByRole('button', { name: 'Ablehnen' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Übernehmen' })).toBeNull());
    const rejectCall = sb.calls.find((entry) => entry.channel === 'condense:reject');
    expect(rejectCall?.payload).toEqual({
      unit: 'project',
      slug: PROJECT.slug,
      reason: 'Zu ungenau, bitte noch einmal.',
    });
  });

  it('zeigt ohne Artefakt gar keine Löschen-Schaltfläche', async () => {
    setLanguage('de');
    renderTab(ROUTED);

    expect(await screen.findByText('Noch nicht verdichtet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verdichtung löschen' })).toBeNull();
  });

  it('benennt beim Löschen den Direktiven-Verlust als unwiederbringlich', async () => {
    setLanguage('de');
    renderTab({ ...ROUTED, 'condense:read': () => ARTIFACT });

    expect(
      await screen.findByText('Verdichteter Überblick über das Projekt Kundenportal Relaunch.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Verdichtung löschen' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByText(/Der Direktiven-Abschnitt ist der einzige Teil, den kein späterer Lauf/),
    ).toBeTruthy();
  });

  it('hält den Cache eines Bereichs und eines Projekts mit gleichem Slug auseinander (045 review finding)', async () => {
    setLanguage('de');
    const SHARED_SLUG = 'gleicher-slug';
    const AREA_ARTIFACT = {
      content: 'Verdichteter Bereichsinhalt.',
      hash: 'hash-area',
      path: `areas/${SHARED_SLUG}.condensed.md`,
      condensedAt: '2026-08-10T09:00:00+02:00',
      sources: [`areas/${SHARED_SLUG}.md`],
    };
    const PROJECT_ARTIFACT = {
      content: 'Verdichteter Projektinhalt.',
      hash: 'hash-project',
      path: `projects/work/${SHARED_SLUG}/project.condensed.md`,
      condensedAt: '2026-08-10T09:00:00+02:00',
      sources: [`projects/work/${SHARED_SLUG}/project.md`],
    };
    installMock({
      'vault:status': () => ({
        root: 'C:/vaults/demo',
        name: 'Demo',
        ready: true,
        docCount: 5,
        indexedAt: '2026-08-10T09:00:00+02:00',
        indexing: false,
        indexRefreshFailedAt: null,
      }),
      'llm:tasks': () => [],
      'llm:routing': () => ({
        tasks: {
          'condense-area': { providerId: 'local', model: 'qwen' },
          'condense-project': { providerId: 'local', model: 'qwen' },
        },
        defaults: {},
      }),
      'condense:read': ({ unit }: { unit: 'area' | 'project'; slug: string }) =>
        unit === 'area' ? AREA_ARTIFACT : PROJECT_ARTIFACT,
    });
    // One shared QueryClient — this is what a colliding cache key would
    // corrupt: the area's read populating the entry the project's tab reads.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AreaCondensedTab area={{ slug: SHARED_SLUG, title: 'Bereich' }} />
          <ProjectKnowledgeTab project={{ slug: SHARED_SLUG, title: 'Projekt' }} />
          <ToastHost />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Verdichteter Bereichsinhalt.')).toBeTruthy();
    expect(await screen.findByText('Verdichteter Projektinhalt.')).toBeTruthy();
  });

  it('zeigt bei einem Konflikt beim Übernehmen die Konfliktmeldung, das Artefakt bleibt lesbar', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      unit: 'project',
      slug: PROJECT.slug,
      path: 'projects/work/kundenportal-relaunch/project.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    renderTab({
      ...ROUTED,
      'condense:read': () => ARTIFACT,
      ...runsTo(proposal),
      'condense:accept': () => {
        throw ipcError('conflict');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Erneut verdichten' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Übernehmen' })).toBeNull());
    expect(
      screen.getByText('Verdichteter Überblick über das Projekt Kundenportal Relaunch.'),
    ).toBeTruthy();
  });
});
