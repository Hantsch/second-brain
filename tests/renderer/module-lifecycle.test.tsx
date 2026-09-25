// @vitest-environment jsdom
/* The module rename and delete dialogs (story 063, D5/D6).
 *
 * Prüfsteine, rename (D5): the dialog shows the plan's changes grouped by
 * kind before anything is written; a `blocked` plan disables confirm and
 * says why; a successful rename hands the new slug to `onRenamed` and toasts
 * with an undo action; a conflict from the apply call leaves the dialog open
 * with its own wording, instead of closing as if nothing went wrong.
 *
 * Prüfsteine, delete (D6): the dialog shows the plan's page count, affected
 * sources, broken inbound links and projects; a `digestion-pending` plan
 * disables confirm and says why; a successful delete calls `onDeleted` and
 * toasts with an undo action; a conflict from the apply call leaves the
 * dialog open with its own wording. `ModuleActions` renders both actions and
 * opens the matching dialog for each.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { KnowledgeModule } from '@shared/types';
import { ToastHost } from '@renderer/components/ToastHost';
import { setLanguage } from '@renderer/i18n';
import { clearToasts } from '@renderer/lib/toast';
import type { SbBridge } from '@renderer/lib/bridge';
import { DeleteModuleDialog } from '@renderer/screens/modules/DeleteModuleDialog';
import { ModuleActions } from '@renderer/screens/modules/ModuleActions';
import { RenameModuleDialog } from '@renderer/screens/modules/RenameModuleDialog';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
}

function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

const MODULE: KnowledgeModule = {
  slug: 'identity-management',
  title: 'Identity management',
  description: 'Login, roles and tenants.',
  created: '2025-12-13',
  updated: '2026-08-10T14:32:00+02:00',
  counts: { sources: 1, entities: 2, concepts: 1 },
  findingCount: 0,
  lastIngest: null,
  tags: [],
};

function renderDialog(extra: Handlers = {}, module: KnowledgeModule = MODULE) {
  const sb = installMock({
    'modules:renamePlan': ({ slug, title }) => ({
      slug,
      newSlug: slug,
      oldTitle: module.title,
      title,
      titleOnly: true,
      changes: [
        {
          path: `modules/${slug}/module.md`,
          kind: 'module-file',
          summary: 'The title line changes.',
        },
        {
          path: `modules/${slug}/wiki/entities/oauth2.md`,
          kind: 'page',
          summary: 'The module: frontmatter line updates.',
        },
      ],
      pages: [],
      blocked: null,
      fingerprint: 'fp-1',
    }),
    'modules:rename': ({ slug, title }) => ({
      slug,
      newSlug: slug,
      title,
      moved: false,
      written: [`modules/${slug}/module.md`],
      undoToken: 'undo-1',
      logged: `modules/${slug}/wiki/log.md`,
    }),
    'modules:undo': () => ({ restored: [], kept: [] }),
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onRenamed = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RenameModuleDialog open module={module} onClose={onClose} onRenamed={onRenamed} />
      <ToastHost />
    </QueryClientProvider>,
  );
  return { sb, onClose, onRenamed };
}

const DELETE_PAGE = {
  path: `modules/${MODULE.slug}/wiki/entities/oauth2.md`,
  module: MODULE.slug,
  slug: 'oauth2',
  title: 'OAuth2',
  type: 'entity' as const,
  created: '2025-12-13',
  updated: '2026-08-10',
  tags: [],
  sources: [],
  outbound: [],
  inbound: [],
  excerpt: '',
  wordCount: 42,
};

function renderDeleteDialog(extra: Handlers = {}, module: KnowledgeModule = MODULE) {
  const sb = installMock({
    'modules:deletePlan': ({ slug }) => ({
      slug,
      changes: [],
      pages: [DELETE_PAGE],
      sources: [
        {
          path: 'raw/files/2026-01-01-oauth2-slides/',
          protocolPath: 'raw/files/2026-01-01-oauth2-slides/.ingest.json',
          outcome: 'undigested',
          remainingModule: null,
        },
      ],
      brokenLinks: [
        { path: 'modules/other-module/wiki/concepts/sso.md', target: `${slug}/oauth2`, line: '5' },
      ],
      projects: [
        { path: 'projects/work/nyota-auth0-migration/project.md', slug: 'nyota-auth0-migration' },
      ],
      blocked: null,
      fingerprint: 'fp-delete-1',
    }),
    'modules:delete': ({ slug }) => ({
      slug,
      written: ['projects/work/nyota-auth0-migration/project.md'],
      deleted: `modules/${slug}`,
      undoToken: 'undo-delete-1',
    }),
    'modules:undo': () => ({ restored: [], kept: [] }),
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <DeleteModuleDialog open module={module} onClose={onClose} onDeleted={onDeleted} />
      <ToastHost />
    </QueryClientProvider>,
  );
  return { sb, onClose, onDeleted };
}

beforeEach(() => {
  setLanguage('en');
  clearToasts();
});

afterEach(() => {
  delete window.sb;
});

describe('RenameModuleDialog (Story 063, D5)', () => {
  it('shows the plan changes grouped by kind before confirm is enabled', async () => {
    renderDialog();

    expect(await screen.findByText('The title line changes.')).toBeTruthy();
    expect(screen.getByText('Module file')).toBeTruthy();
    expect(screen.getByText('Pages')).toBeTruthy();
    expect(screen.getByText('The module: frontmatter line updates.')).toBeTruthy();
    expect(screen.getByText('Only the title changes — the folder stays where it is.')).toBeTruthy();

    // A real title change, and past the debounce — a plan for what's shown.
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Identity platform');

    const confirm = screen.getByRole('button', { name: 'Rename' });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false), {
      timeout: 1000,
    });
  });

  it('disables confirm for a no-op title, and while a re-plan is still pending (findings 3, 4)', async () => {
    const { sb } = renderDialog();
    await screen.findByText('The title line changes.');

    // Nothing was typed — the plan reports the same title back: a no-op (finding 3).
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    // A new title is typed, but the 400ms debounce has not settled yet — the
    // plan shown still describes the old title (finding 4).
    await userEvent.type(screen.getByLabelText('Title'), ' updated');
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await waitFor(
      () =>
        expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(
          false,
        ),
      { timeout: 1000 },
    );
    expect(sb.calls.some((call) => call.channel === 'modules:rename')).toBe(false);
  });

  it('disables confirm and states the reason when the plan reports target-exists', async () => {
    renderDialog({
      'modules:renamePlan': ({ slug, title }) => ({
        slug,
        newSlug: slug,
        oldTitle: MODULE.title,
        title,
        titleOnly: true,
        changes: [],
        pages: [],
        blocked: 'target-exists',
        fingerprint: 'fp-1',
      }),
    });

    expect(
      await screen.findByText('A module with this name already exists — pick a different title.'),
    ).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Rename' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables confirm and states the reason when a digestion is still pending', async () => {
    renderDialog({
      'modules:renamePlan': ({ slug, title }) => ({
        slug,
        newSlug: slug,
        oldTitle: MODULE.title,
        title,
        titleOnly: true,
        changes: [],
        pages: [],
        blocked: 'digestion-pending',
        fingerprint: 'fp-1',
      }),
    });

    expect(
      await screen.findByText(
        'A source is still being taken into this module — try again once it finishes.',
      ),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('renames, hands the new slug to onRenamed and toasts with an undo action', async () => {
    const { sb, onClose, onRenamed } = renderDialog();
    await screen.findByText('The title line changes.');

    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Identity platform');
    const confirm = screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false), { timeout: 1000 });
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'modules:rename')?.payload).toEqual({
        slug: MODULE.slug,
        title: 'Identity platform',
        fingerprint: 'fp-1',
      }),
    );
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith(MODULE.slug));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/Renamed to/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('keeps the dialog open and shows conflict wording when the apply call reports a conflict', async () => {
    const { onClose, onRenamed } = renderDialog({
      'modules:rename': () => {
        throw Object.assign(new Error('conflict'), { code: 'conflict', message: 'conflict' });
      },
    });
    await screen.findByText('The title line changes.');

    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Identity platform');
    const confirm = screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false), { timeout: 1000 });
    await userEvent.click(confirm);

    expect(
      await screen.findByText(
        'Nothing was renamed — the module changed since the changes above were shown. Close and try again.',
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it('surfaces a toast when the undo action fails (finding 2)', async () => {
    renderDialog({
      'modules:undo': () => {
        throw Object.assign(new Error('conflict'), { code: 'conflict', message: 'conflict' });
      },
    });
    await screen.findByText('The title line changes.');
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Identity platform');
    const confirm = screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false), { timeout: 1000 });
    await userEvent.click(confirm);

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Undo failed — the module was not restored.')).toBeTruthy();
  });

  it('surfaces a toast when the undo action only partially restores (finding 2)', async () => {
    renderDialog({
      'modules:undo': () => ({ restored: [], kept: ['modules/identity-management/module.md'] }),
    });
    await screen.findByText('The title line changes.');
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Identity platform');
    const confirm = screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false), { timeout: 1000 });
    await userEvent.click(confirm);

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText('Undo partially applied — some changes could not be reverted.'),
    ).toBeTruthy();
  });
});

describe('DeleteModuleDialog (Story 063, D6)', () => {
  it('shows the page count, affected sources, broken links and projects from the plan', async () => {
    renderDeleteDialog();

    expect(await screen.findByText('One page is deleted with the module.')).toBeTruthy();
    expect(
      screen.getByText(
        'raw/files/2026-01-01-oauth2-slides/ returns to undigested — no module claims it anymore.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'modules/other-module/wiki/concepts/sso.md links to identity-management/oauth2, which will be gone.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('nyota-auth0-migration no longer lists this module.')).toBeTruthy();

    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables confirm and states the reason when a digestion is still pending', async () => {
    renderDeleteDialog({
      'modules:deletePlan': ({ slug }) => ({
        slug,
        changes: [],
        pages: [],
        sources: [],
        brokenLinks: [],
        projects: [],
        blocked: 'digestion-pending',
        fingerprint: 'fp-delete-1',
      }),
    });

    expect(
      await screen.findByText(
        'A source is still being taken into this module — try again once it finishes.',
      ),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('deletes, calls onDeleted and toasts with an undo action that calls modules:undo', async () => {
    const { sb, onClose, onDeleted } = renderDeleteDialog();
    await screen.findByText('One page is deleted with the module.');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'modules:delete')?.payload).toEqual({
        slug: MODULE.slug,
        fingerprint: 'fp-delete-1',
      }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/Deleted/)).toBeTruthy();

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    await userEvent.click(undoButton);
    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'modules:undo')?.payload).toEqual({
        undoToken: 'undo-delete-1',
      }),
    );
  });

  it('keeps the dialog open and shows conflict wording when the apply call reports a conflict', async () => {
    const { onClose, onDeleted } = renderDeleteDialog({
      'modules:delete': () => {
        throw Object.assign(new Error('conflict'), { code: 'conflict', message: 'conflict' });
      },
    });
    await screen.findByText('One page is deleted with the module.');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(
        'Nothing was deleted — the module changed since the changes above were shown. Close and try again.',
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('surfaces a toast when the undo action fails (finding 2)', async () => {
    renderDeleteDialog({
      'modules:undo': () => {
        throw Object.assign(new Error('conflict'), { code: 'conflict', message: 'conflict' });
      },
    });
    await screen.findByText('One page is deleted with the module.');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Undo failed — the module was not restored.')).toBeTruthy();
  });

  it('surfaces a toast when the undo action only partially restores (finding 2)', async () => {
    renderDeleteDialog({
      'modules:undo': () => ({ restored: [], kept: ['modules/identity-management/module.md'] }),
    });
    await screen.findByText('One page is deleted with the module.');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText('Undo partially applied — some changes could not be reverted.'),
    ).toBeTruthy();
  });
});

describe('ModuleActions (Story 063, D5/D6)', () => {
  it('opens the rename dialog from the module detail header', async () => {
    installMock({
      'modules:renamePlan': ({ slug, title }) => ({
        slug,
        newSlug: slug,
        oldTitle: MODULE.title,
        title,
        titleOnly: true,
        changes: [],
        pages: [],
        blocked: null,
        fingerprint: 'fp-1',
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ModuleActions module={MODULE} onRenamed={() => undefined} onDeleted={() => undefined} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('dialog', { name: 'Rename module' })).toBeTruthy();
  });

  it('opens the delete dialog from the module detail header', async () => {
    installMock({
      'modules:deletePlan': ({ slug }) => ({
        slug,
        changes: [],
        pages: [],
        sources: [],
        brokenLinks: [],
        projects: [],
        blocked: null,
        fingerprint: 'fp-delete-1',
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ModuleActions module={MODULE} onRenamed={() => undefined} onDeleted={() => undefined} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('dialog', { name: `Delete “${MODULE.title}”?` })).toBeTruthy();
  });
});
