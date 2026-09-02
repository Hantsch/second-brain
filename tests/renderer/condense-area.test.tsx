// @vitest-environment jsdom
/* The condensed tab of an area section (story 038, deliverable D6).
 *
 * The prüfsteine of this deliverable:
 *
 * - Without a routed model, only `LlmMissing` shows — no trigger anywhere,
 *   not even disabled — but an existing artifact is still readable, since
 *   reading never needs a model.
 * - With a routed model and no artifact yet, an empty state offers the
 *   trigger.
 * - With a routed model and an existing artifact, the artifact's content and
 *   meta line show, plus a trigger to re-run.
 * - While a run is going, the trigger is disabled and a running indicator
 *   shows.
 * - A failed run shows an error card without hiding the artifact that was
 *   already there, and leaves the trigger available to retry.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcError, IpcRequest, IpcResponse } from '@shared/ipc';
import type { CondenseProposal } from '@shared/types';
import { AreaCondensedTab } from '@renderer/screens/notes/AreaCondensedTab';
import { ToastHost } from '@renderer/components/ToastHost';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
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

/* Own mock instead of the shared one from `tests/setup.ts` — same reason
   `notes.test.tsx` gives for its own copy. */
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

const AREA = { slug: 'gesundheit', title: 'Gesundheit' };

const ARTIFACT = {
  content: 'Verdichteter Überblick über den Bereich Gesundheit.',
  hash: 'hash-condensed',
  condensedAt: '2026-08-10T09:00:00+02:00',
  sources: ['areas/gesundheit.md'],
};

const NOT_ROUTED: Handlers = {
  'llm:routing': () => ({ tasks: {}, defaults: {} }),
  'llm:tasks': () => [],
};

const ROUTED: Handlers = {
  'llm:routing': () => ({
    tasks: { 'condense-area': { providerId: 'local', model: 'qwen' } },
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
    }),
    'condense:read': () => null,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AreaCondensedTab area={AREA} />
        <ToastHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container };
}

afterEach(() => {
  delete window.sb;
  clearToasts();
});

/* jsdom kennt `scrollIntoView` nicht. Ohne Attrappe stirbt `ErrorState` daran
   (`journal.test.tsx`, `garden.test.tsx`, `projects.test.tsx` tragen dieselbe
   Zeile). */
Element.prototype.scrollIntoView = () => undefined;

describe('Verdichtet-Tab (Story 038, D6)', () => {
  it('zeigt ohne Routing nur den Hinweis, keinen Auslöser — ein vorhandenes Artefakt bleibt lesbar', async () => {
    setLanguage('de');
    renderTab({ ...NOT_ROUTED, 'condense:read': () => ARTIFACT });

    expect(await screen.findByText('Für diesen Schritt fehlt ein Modell')).toBeTruthy();
    /* The artifact is still readable — reading is independent of routing. */
    expect(
      await screen.findByText('Verdichteter Überblick über den Bereich Gesundheit.'),
    ).toBeTruthy();
    /* No trigger anywhere, not even disabled. */
    expect(screen.queryByRole('button', { name: 'Diesen Bereich verdichten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erneut verdichten' })).toBeNull();
  });

  it('zeigt bei geroutetem Modell ohne Artefakt einen Leerzustand mit Auslöser', async () => {
    setLanguage('de');
    renderTab(ROUTED);

    expect(await screen.findByText('Noch nicht verdichtet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diesen Bereich verdichten' })).toBeTruthy();
  });

  it('zeigt bei vorhandenem Artefakt den Inhalt und einen Auslöser zum erneuten Verdichten', async () => {
    setLanguage('de');
    renderTab({ ...ROUTED, 'condense:read': () => ARTIFACT });

    expect(
      await screen.findByText('Verdichteter Überblick über den Bereich Gesundheit.'),
    ).toBeTruthy();
    expect(screen.getByText(/Verdichtet am/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erneut verdichten' })).toBeTruthy();
  });

  it('deaktiviert den Auslöser während ein Lauf geht und zeigt eine Wartemeldung', async () => {
    setLanguage('de');
    let resolveRun: (value: CondenseProposal) => void = () => undefined;
    const runPromise = new Promise<CondenseProposal>((resolve) => {
      resolveRun = resolve;
    });
    renderTab({ ...ROUTED, 'condense:run': () => runPromise });

    await userEvent.click(await screen.findByRole('button', { name: 'Diesen Bereich verdichten' }));

    expect(await screen.findByText('Verdichtung läuft')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Diesen Bereich verdichten' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveRun({
      slug: AREA.slug,
      path: 'areas/gesundheit.md',
      baseHash: null,
      before: '',
      after: 'Neuer Vorschlag.',
      sources: [],
    });
    await waitFor(() => expect(screen.queryByText('Verdichtung läuft')).toBeNull());
  });

  it('zeigt bei einem fehlgeschlagenen Lauf eine Fehlerkarte, das Artefakt bleibt sichtbar', async () => {
    setLanguage('de');
    const { sb } = renderTab({
      ...ROUTED,
      'condense:read': () => ARTIFACT,
      'condense:run': () => {
        throw ipcError('llm-unavailable');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Erneut verdichten' }));

    expect(await screen.findByText(/ist kein Sprachmodell erreichbar/)).toBeTruthy();
    /* The artifact stays — a failed run replaces nothing. */
    expect(screen.getByText('Verdichteter Überblick über den Bereich Gesundheit.')).toBeTruthy();
    /* The trigger stays available to retry. */
    expect(
      (screen.getByRole('button', { name: 'Erneut verdichten' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(sb.calls.filter((entry) => entry.channel === 'condense:run').length).toBe(1);
  });

  it('zeigt nach einem Lauf den Diff mit Übernehmen-Button, schreibt aber nichts von selbst', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      slug: AREA.slug,
      path: 'areas/gesundheit.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    const { sb } = renderTab({ ...ROUTED, 'condense:run': () => proposal });

    await userEvent.click(await screen.findByRole('button', { name: 'Diesen Bereich verdichten' }));

    expect(await screen.findByText('Alte Zeile.')).toBeTruthy();
    expect(await screen.findByText('Neue Zeile.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeTruthy();
    /* Nothing writes until Accept is clicked. */
    expect(sb.calls.some((entry) => entry.channel === 'condense:accept')).toBe(false);
  });

  it('verwirft den Vorschlag bei einem Konflikt und zeigt eine Meldung, das Artefakt bleibt lesbar', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      slug: AREA.slug,
      path: 'areas/gesundheit.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    renderTab({
      ...ROUTED,
      'condense:read': () => ARTIFACT,
      'condense:run': () => proposal,
      'condense:accept': () => {
        throw ipcError('conflict');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Erneut verdichten' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Übernehmen' })).toBeNull());
    /* The artifact — read independently of the discarded proposal — stays. */
    expect(screen.getByText('Verdichteter Überblick über den Bereich Gesundheit.')).toBeTruthy();
  });

  it('lehnt einen Vorschlag mit Begründung ab (D8) — der Vorschlag verschwindet danach', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      slug: AREA.slug,
      path: 'areas/gesundheit.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    const { sb } = renderTab({
      ...ROUTED,
      'condense:run': () => proposal,
      'condense:reject': () => ({ path: 'areas/gesundheit.condensed.md' }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Diesen Bereich verdichten' }));
    await screen.findByRole('button', { name: 'Übernehmen' });

    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Begründung'), 'Zu ungenau, bitte noch einmal.');
    await userEvent.click(dialog.getByRole('button', { name: 'Ablehnen' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Übernehmen' })).toBeNull());
    const rejectCall = sb.calls.find((entry) => entry.channel === 'condense:reject');
    expect(rejectCall?.payload).toEqual({
      slug: AREA.slug,
      reason: 'Zu ungenau, bitte noch einmal.',
    });
  });

  it('leert die Begründung nach einer erfolgreichen Ablehnung, statt sie beim nächsten Öffnen erneut zu zeigen', async () => {
    setLanguage('de');
    const proposal: CondenseProposal = {
      slug: AREA.slug,
      path: 'areas/gesundheit.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    renderTab({
      ...ROUTED,
      'condense:run': () => proposal,
      'condense:reject': () => ({ path: 'areas/gesundheit.condensed.md' }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Diesen Bereich verdichten' }));
    await screen.findByRole('button', { name: 'Übernehmen' });
    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    const firstDialog = within(await screen.findByRole('dialog'));
    await userEvent.type(firstDialog.getByLabelText('Begründung'), 'Erster Versuch war unklar.');
    await userEvent.click(firstDialog.getByRole('button', { name: 'Ablehnen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // A fresh run, then reopen the reject dialog — the previous sentence must
    // not still be sitting in the field (D8's own dialog only clears on its
    // own `close()`, which the success path here never calls).
    await userEvent.click(await screen.findByRole('button', { name: 'Diesen Bereich verdichten' }));
    await screen.findByRole('button', { name: 'Übernehmen' });
    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    const secondDialog = within(await screen.findByRole('dialog'));

    expect((secondDialog.getByLabelText('Begründung') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('Verdichtung löschen (Story 043, D2)', () => {
  it('zeigt ohne Artefakt gar keine Löschen-Schaltfläche', async () => {
    setLanguage('de');
    renderTab(ROUTED);

    expect(await screen.findByText('Noch nicht verdichtet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verdichtung löschen' })).toBeNull();
  });

  it('bietet die Löschen-Schaltfläche auch ohne geroutetes Modell an', async () => {
    setLanguage('de');
    renderTab({ ...NOT_ROUTED, 'condense:read': () => ARTIFACT });

    expect(
      await screen.findByText('Verdichteter Überblick über den Bereich Gesundheit.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verdichtung löschen' })).toBeTruthy();
  });

  it('löscht das Artefakt und zeigt danach den Leerzustand „nie verdichtet“, ein offener Vorschlag verschwindet mit', async () => {
    setLanguage('de');
    let artifactDeleted = false;
    const proposal: CondenseProposal = {
      slug: AREA.slug,
      path: 'areas/gesundheit.md',
      baseHash: 'hash-before',
      before: 'Alte Zeile.',
      after: 'Neue Zeile.',
      sources: [],
    };
    const { sb } = renderTab({
      ...ROUTED,
      // Stateful like the query cache it stands in for: still the artifact
      // until the delete lands, then gone — so the invalidation the delete
      // mutation triggers actually surfaces a different response, the way a
      // real re-read of the file would.
      'condense:read': () => (artifactDeleted ? null : ARTIFACT),
      'condense:run': () => proposal,
      'condense:delete': () => {
        artifactDeleted = true;
        return { path: 'areas/gesundheit.condensed.md', undoToken: 'token-1' };
      },
    });

    // Bring up an open proposal first, so the delete can be checked to clear
    // it too — deleting the artifact a proposal was built against must not
    // leave that proposal sitting there offering to write it back.
    await userEvent.click(await screen.findByRole('button', { name: 'Erneut verdichten' }));
    await screen.findByRole('button', { name: 'Übernehmen' });

    await userEvent.click(await screen.findByRole('button', { name: 'Verdichtung löschen' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Löschen' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const deleteCall = sb.calls.find((entry) => entry.channel === 'condense:delete');
    expect(deleteCall?.payload).toEqual({ slug: AREA.slug, expectedHash: ARTIFACT.hash });

    expect(await screen.findByText('Noch nicht verdichtet')).toBeTruthy();
    expect(screen.queryByText('Verdichteter Überblick über den Bereich Gesundheit.')).toBeNull();
    /* The open proposal from before the delete is gone too. */
    expect(screen.queryByRole('button', { name: 'Übernehmen' })).toBeNull();
  });

  it('zeigt bei einem Konflikt beim Löschen die vorhandene Konfliktmeldung, das Artefakt bleibt lesbar', async () => {
    setLanguage('de');
    renderTab({
      ...ROUTED,
      'condense:read': () => ARTIFACT,
      'condense:delete': () => {
        throw ipcError('conflict');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Verdichtung löschen' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Löschen' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      await screen.findByText(
        /Die Datei für Gesundheit hat sich seit dem letzten Lesen geändert\./,
      ),
    ).toBeTruthy();
    /* The artifact stays readable — a conflicting delete never removes it. */
    expect(screen.getByText('Verdichteter Überblick über den Bereich Gesundheit.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verdichtung löschen' })).toBeTruthy();
  });
});
