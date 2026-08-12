// @vitest-environment jsdom
/* Die Hülle muss stehen, bevor irgendein Screen ausgebaut wird: zehn Ziele in
   der Rail, Tastaturwege, und keine A11y-Verstöße. */

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
import { SCREENS } from '@renderer/lib/screens';
import { setLanguage } from '@renderer/i18n';

/* `window.sb` wird ausdrücklich gemockt: die Oberfläche darf im Test nichts
   Echtes anfassen. Die Antworten kommen aus den Fixtures der Mock-Brücke. */
const invoke = vi.fn((channel: string, payload?: unknown) =>
  (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(channel, payload),
);

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = '#/dashboard';
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  invoke.mockClear();
  window.sb = {
    invoke,
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as SbBridge;
});

afterEach(() => {
  delete window.sb;
});

describe('AppShell', () => {
  it('rendert Titelzeile, Rail und Inhalt', async () => {
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fenster schließen' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('führt in elf Screens, jeder mit aria-label', async () => {
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const links = nav.querySelectorAll('a');
    expect(links.length).toBe(SCREENS.length);
    /* Zehn Screens mit Ziffer 1–0, dazu „Agents" ohne — story 001. */
    expect(SCREENS.length).toBe(11);
    for (const link of links) {
      expect(link.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('hat für „Agents" keine Ziffer, aber trotzdem ein Ziel', async () => {
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const agents = within(nav).getByRole('link', { name: 'Agents' });
    expect(agents.getAttribute('aria-keyshortcuts')).toBeNull();
    expect(agents.querySelector('.sb-rail-key')).toBeNull();
  });

  it('wechselt den Screen über die Ziffern', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await userEvent.keyboard('5');
    expect(await screen.findByRole('heading', { level: 1, name: 'Projekte' })).toBeTruthy();
    await userEvent.keyboard('0');
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeTruthy();
  });

  it('öffnet die Befehlspalette mit Ctrl+K und schließt sie mit Esc', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Befehle' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('zeigt den Vault-Status am Fuß der Rail', async () => {
    renderApp();
    const status = await screen.findByRole('button', {
      name: 'Vault-Status, öffnet die Einstellungen',
    });
    await waitFor(() => expect(status.textContent).toContain('Demo-Vault'));
    expect(status.textContent).toContain('42');
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const result = await axe.run(container);
    const summary = result.violations.map((violation) => `${violation.id}: ${violation.help}`);
    expect(summary).toEqual([]);
  });
});
