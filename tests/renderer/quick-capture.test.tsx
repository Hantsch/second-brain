// @vitest-environment jsdom
/* Das Schnell-Erfassen-Fenster. Es hat eine Aufgabe: den Gedanken nicht
   verlieren.
 *
 * Also wird hier geprüft, was passiert, wenn es schiefgeht — kein Vault, Esc mit
 * Text im Feld, ein Neustart des Fensters. In jedem dieser Fälle muss der Text
 * noch da sein.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { SettingsSnapshot } from '@shared/types';
import { CONFIRM_MS, QuickCapture } from '@renderer/screens/quick-capture/QuickCapture';
import type { SbBridge } from '@renderer/lib/bridge';
import { settingsSnapshot } from '@renderer/lib/mock-settings';
import { setLanguage } from '@renderer/i18n';

const DRAFT_KEY = 'sb.quickCapture.draft';

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
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

/**
 * Das Fenster liest die Vault-Einstellung `capture.closeAfterCapture` — also
 * braucht es einen Query-Client, so wie im gebauten Renderer
 * (`src/renderer/quick-capture.tsx`).
 */
function renderQuick() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickCapture />
    </QueryClientProvider>,
  );
}

/** Die Vault-Einstellungen der Attrappe, mit einem geänderten Erfassen-Feld. */
function snapshotWith(closeAfterCapture: boolean): SettingsSnapshot {
  const snapshot = JSON.parse(JSON.stringify(settingsSnapshot)) as SettingsSnapshot;
  if (snapshot.vault) snapshot.vault.capture.closeAfterCapture = closeAfterCapture;
  return snapshot;
}

const dumped = {
  path: 'inbox/2026-08-10-1432-gedanke.md',
  id: '2026-08-10-1432-gedanke',
  title: 'Gedanke',
  text: 'Gedanke',
  created: '2026-08-10T14:32:00+02:00',
  origin: 'quick-capture' as const,
  status: 'raw' as const,
  ageDays: 0,
  wordCount: 1,
  tags: [],
  scope: null,
  filedInto: null,
  filedAt: null,
};

beforeEach(() => {
  setLanguage('de');
  window.localStorage.clear();
});

afterEach(() => {
  delete window.sb;
  window.localStorage.clear();
});

describe('Schnell erfassen', () => {
  /* Die Bestätigung muss zu sehen sein, bevor das Fenster geht — sonst ist
     „gespeichert" eine Behauptung ohne Beleg und ohne Rückweg. */
  it('speichert mit Ctrl+Enter, zeigt Pfad und Rückgängig, dann schließt es', async () => {
    const sb = installMock({
      'capture:dump': () => dumped,
      'capture:window': () => undefined,
      'settings:get': () => snapshotWith(true),
    });
    renderQuick();
    const field = screen.getByLabelText('Was ist dir durch den Kopf gegangen?');
    await waitFor(() => expect(document.activeElement).toBe(field));

    await userEvent.type(field, 'Rückmeldung von Jonas einholen.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'capture:dump')?.payload).toEqual({
        text: 'Rückmeldung von Jonas einholen.',
        origin: 'quick-capture',
      }),
    );
    expect(await screen.findByText('Gespeichert in')).toBeTruthy();
    expect(screen.getByText(dumped.path)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
    /* Geschrieben heißt: der Entwurf ist erledigt. */
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();

    await waitFor(
      () => expect(sb.calls.some((call) => call.channel === 'capture:window')).toBe(true),
      { timeout: 3000 },
    );
  });

  it('bleibt offen, wenn „Fenster schließen" abgeschaltet ist', async () => {
    const sb = installMock({
      'capture:dump': () => dumped,
      'capture:window': () => undefined,
      'settings:get': () => snapshotWith(false),
    });
    renderQuick();
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy());

    await userEvent.type(screen.getByRole('textbox'), 'Bleibt offen.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('Gespeichert in')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_MS + 200));
    expect(sb.calls.some((call) => call.channel === 'capture:window')).toBe(false);
    /* Und das Feld ist leer und bereit für den nächsten Gedanken. */
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('nimmt das Speichern zurück und legt den Text zurück ins Feld', async () => {
    const sb = installMock({
      /* Wie der Hauptprozess: der geschriebene Dump trägt den Text mit. */
      'capture:dump': ({ text }) => ({ ...dumped, text }),
      'capture:discard': () => ({ undoToken: 'undo-1' }),
      'capture:window': () => undefined,
      'settings:get': () => snapshotWith(false),
    });
    renderQuick();
    await userEvent.type(screen.getByRole('textbox'), 'Doch woanders hin.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('button', { name: 'Rückgängig' });

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'capture:discard')?.payload).toEqual({
        path: dumped.path,
      }),
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Doch woanders hin.');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('Doch woanders hin.');
  });

  it('hält den Text als Entwurf, bis er geschrieben ist', async () => {
    installMock({ 'capture:window': () => undefined });
    const first = renderQuick();
    await userEvent.type(screen.getByRole('textbox'), 'Halber Gedanke');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('Halber Gedanke');

    /* Fenster zu, Fenster auf: der Text steht wieder da. */
    first.unmount();
    renderQuick();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Halber Gedanke');
  });

  it('fragt bei Esc nach, solange Text im Feld steht', async () => {
    const sb = installMock({ 'capture:window': () => undefined });
    renderQuick();
    await userEvent.type(screen.getByRole('textbox'), 'Noch nicht fertig');

    await userEvent.keyboard('{Escape}');

    expect(screen.getByText('Entwurf verwerfen?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Weiter schreiben' }));
    expect(screen.queryByText('Entwurf verwerfen?')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Noch nicht fertig');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('Noch nicht fertig');
    /* Nichts wurde geschrieben, nichts verworfen. */
    expect(sb.calls.some((call) => call.channel === 'capture:dump')).toBe(false);
  });

  /* Der Rahmen darf bei Esc nicht mithören: sonst ist das Fenster weg, bevor die
     Rückfrage jemand sieht. Sie muss also stehen bleiben — und selbst einen
     Fluchtweg haben. */
  it('lässt die Rückfrage stehen und bietet ihr mit Esc einen Fluchtweg', async () => {
    const sb = installMock({ 'capture:window': () => undefined });
    renderQuick();
    await userEvent.type(screen.getByRole('textbox'), 'Noch nicht fertig');

    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Entwurf verwerfen?')).toBeTruthy();
    /* Das Fenster bleibt offen: geschlossen wird erst nach einer Antwort. */
    expect(sb.calls.some((call) => call.channel === 'capture:window')).toBe(false);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('Entwurf verwerfen?')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Noch nicht fertig');
    expect(sb.calls.some((call) => call.channel === 'capture:window')).toBe(false);
  });

  it('verwirft auf ausdrücklichen Wunsch und schließt', async () => {
    const sb = installMock({ 'capture:window': () => undefined });
    renderQuick();
    await userEvent.type(screen.getByRole('textbox'), 'Doch nichts');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(sb.calls.some((call) => call.channel === 'capture:window')).toBe(true);
  });

  it('schließt bei Esc ohne Rückfrage, wenn nichts im Feld steht', async () => {
    const sb = installMock({ 'capture:window': () => undefined });
    renderQuick();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('Entwurf verwerfen?')).toBeNull();
    expect(sb.calls.find((call) => call.channel === 'capture:window')?.payload).toEqual({
      show: false,
    });
  });

  it('sagt ohne Vault, was fehlt, und behält den Text', async () => {
    const sb = installMock({
      'capture:dump': () => {
        throw Object.assign(new Error('kein Vault geöffnet'), { code: 'no-vault' });
      },
      'capture:window': () => undefined,
      'window:show': () => undefined,
    });
    renderQuick();
    await userEvent.type(screen.getByRole('textbox'), 'Der Gedanke bleibt.');

    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText(/Kein Vault offen/)).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Der Gedanke bleibt.');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('Der Gedanke bleibt.');

    /* „Hauptfenster zeigen" muss das Hauptfenster zeigen, nicht nur dieses hier
       schließen — sonst ist der Weg zurück in die App eine Sackgasse. */
    await userEvent.click(screen.getByRole('button', { name: 'Hauptfenster zeigen' }));

    await waitFor(() => expect(sb.calls.some((call) => call.channel === 'window:show')).toBe(true));
    expect(sb.calls.some((call) => call.channel === 'capture:window')).toBe(true);
  });
});
