// @vitest-environment jsdom
/* Die Screens müssen zeigen, was im Vault liegt — und dürfen nie behaupten, er
   sei leer, solange sie es nicht wissen. Genau das wird hier geprüft:
   Erfassen hat ein Feld, Inbox und Projekte zeigen Daten, das Dashboard
   antwortet auf die drei Fragen, Fragen kann suchen, und die noch nicht gebauten
   Bereiche sagen das als Platzhalter statt als Leerzustand. */

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
import * as fx from '@renderer/lib/mock-fixtures';
import { setLanguage } from '@renderer/i18n';

const invoke = vi.fn((channel: string, payload?: unknown) =>
  (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(channel, payload),
);

function renderAt(hash: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = hash;
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

/** Wartet, bis der Screen steht — die Überschrift ist das Signal. */
async function openScreen(hash: string, heading: string) {
  const rendered = renderAt(hash);
  await screen.findByRole('heading', { level: 1, name: heading });
  return rendered;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
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

describe('Erfassen', () => {
  it('rendert ein fokussiertes Textfeld, nicht bloß einen Knopf', async () => {
    await openScreen('#/capture', 'Erfassen');
    const field = screen.getByLabelText('Was liegt an?');
    expect(field.tagName).toBe('TEXTAREA');
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it('legt mit Ctrl+Enter ab und leert das Feld', async () => {
    await openScreen('#/capture', 'Erfassen');
    const field = screen.getByLabelText('Was liegt an?');
    await userEvent.type(field, 'Die Pipeline braucht einen Schritt.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('capture:dump', {
        text: 'Die Pipeline braucht einen Schritt.',
        origin: 'window',
        tags: [],
        scope: null,
      }),
    );
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openScreen('#/capture', 'Erfassen');
    await expectNoViolations(container);
  });
});

describe('Inbox', () => {
  it('zeigt die Dumps aus dem Vault statt „die Inbox ist leer"', async () => {
    await openScreen('#/inbox', 'Inbox');
    /* Zweimal: als Zeile in der Liste und als Kopf der Detailspalte. */
    expect(await screen.findAllByText(fx.dump.title)).toHaveLength(2);
    expect(screen.queryByText('Die Inbox ist leer')).toBeNull();
  });

  it('zeigt den Ablage-Vorschlag mit Ziel und Begründung', async () => {
    await openScreen('#/inbox', 'Inbox');
    expect(
      await screen.findByRole('heading', { name: /Projekt Nyota Auth0 Migration/ }),
    ).toBeTruthy();
    expect(screen.getByText(fx.proposal.reason)).toBeTruthy();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openScreen('#/inbox', 'Inbox');
    await screen.findByRole('heading', { name: /Projekt Nyota Auth0 Migration/ });
    await expectNoViolations(container);
  });
});

/* Der Screen ist zweispaltig: Titel und Status stehen in der Zeile *und* im
   Detail, der Status zusätzlich als Wahlmöglichkeit im Feld. Deshalb wird hier
   auf Vorkommen geprüft, nicht auf Einmaligkeit — wie bei der Inbox. */
describe('Projekte', () => {
  it('zeigt Projekt, Status und nächsten Schritt', async () => {
    await openScreen('#/projects', 'Projekte');
    expect((await screen.findAllByText(fx.project.title)).length).toBeGreaterThan(0);
    /* Der nächste Schritt steht im Detail — auf das wird gewartet. */
    expect(await screen.findByText(/Rückmeldung von Stefan/)).toBeTruthy();
    expect(screen.getAllByText('Wartet').length).toBeGreaterThan(0);
    expect(screen.queryByText('Noch kein Projekt im Vault')).toBeNull();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openScreen('#/projects', 'Projekte');
    await screen.findByText(/Rückmeldung von Stefan/);
    await expectNoViolations(container);
  });
});

describe('Dashboard', () => {
  it('zeigt die drei Module statt einer Zahlenreihe', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    expect(await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Steht an' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Warte auf' })).toBeTruthy();
    /* Die Kennzahlen liegen in den Einstellungen, nicht hier. */
    expect(screen.queryByText('Wörter')).toBeNull();
  });

  /* Dasselbe Projekt steht in mehreren Kacheln (zuletzt gearbeitet, laufende
     Projekte, Fristen) — deshalb auf Vorkommen geprüft, nicht auf Einmaligkeit,
     wie bei Inbox und Projekten. */
  it('füllt die Module mit echten Zeilen', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    expect((await screen.findAllByText(fx.project.title)).length).toBeGreaterThan(0);
    expect(screen.getByText(fx.todo.text)).toBeTruthy();
    /* Warte-auf kommt aus dem Projekt-Frontmatter. */
    expect(screen.getByText('Freigabe des Rollenkonzepts')).toBeTruthy();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openScreen('#/dashboard', 'Dashboard');
    await screen.findAllByText(fx.project.title);
    await expectNoViolations(container);
  });
});

describe('Fragen', () => {
  /* Der Screen fragt das Second Brain: die Frage geht über `chat:ask`, die Antwort
     kommt als Stream mit Belegen (siehe tests/renderer/ask.test.tsx). Hier zählt
     nur, dass der Weg aus der Hülle heraus funktioniert. */
  it('nimmt eine Frage auf und schickt sie an den Hauptprozess', async () => {
    await openScreen('#/ask', 'Fragen');
    const field = screen.getByLabelText('Deine Frage');
    await userEvent.type(field, 'Was weiß ich über Rollen?');
    await userEvent.click(screen.getByRole('button', { name: 'Frage stellen' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('chat:ask', {
        question: 'Was weiß ich über Rollen?',
        module: null,
        scope: null,
      }),
    );
    /* Das Gespräch der Attrappe steht in der Liste, nicht ein leerer Kasten. */
    expect(
      await screen.findByRole('button', { name: `Gespräch „${fx.chatThread.title}" öffnen` }),
    ).toBeTruthy();
  });

  /* „Routing einrichten" muss in der Routing-Tabelle landen, nicht irgendwo in
     den Einstellungen — sonst sucht der Nutzer den Weg selbst weiter. */
  it('führt von „kein Modell" direkt in den Modelle-Tab', async () => {
    await openScreen('#/ask', 'Fragen');

    await userEvent.click(await screen.findByRole('button', { name: 'Routing einrichten' }));

    await screen.findByRole('heading', { level: 1, name: 'Einstellungen' });
    expect(window.location.hash).toContain('tab=models');
    expect(screen.getByRole('tab', { name: 'Modelle' }).getAttribute('aria-selected')).toBe('true');
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openScreen('#/ask', 'Fragen');
    await expectNoViolations(container);
  });
});

/* Das Tagebuch ist gebaut: es zeigt den Tag, nicht einen Platzhalter. */
describe('Tagebuch', () => {
  it('zeigt Tagesliste, Tagestext und das Gespräch', async () => {
    await openScreen('#/journal', 'Tagebuch');

    /* Der Tagestext steht rechts als Prosa und links als erste Worte der Zeile. */
    expect((await screen.findAllByText(fx.journalDay.excerpt)).length).toBeGreaterThan(0);
    expect(screen.getByText('Der Sprint fühlt sich unmöglich an.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sagen' })).toBeTruthy();
    expect(screen.queryByText('Noch nicht gebaut')).toBeNull();
    /* Kein Leerzustand, solange etwas im Vault liegt. */
    expect(screen.queryByText('Noch kein Tageseintrag im Vault')).toBeNull();
  });
});

/* Module und Quellen sind gebaut: sie zeigen den Bestand, keinen Platzhalter. */
describe('Wissen', () => {
  it('zeigt bei Modulen die Karte mit Zählungen statt eines Platzhalters', async () => {
    await openScreen('#/modules', 'Module');
    expect(await screen.findByText(fx.knowledgeModule.title)).toBeTruthy();
    expect(screen.getByText('3 Quellen · 4 Entitäten · 5 Konzepte')).toBeTruthy();
    expect(screen.queryByText('Noch nicht gebaut')).toBeNull();
    expect(screen.queryByText('Noch kein Wissens-Modul im Vault')).toBeNull();
  });

  it('zeigt bei Quellen den Bestand aus raw/', async () => {
    await openScreen('#/sources', 'Quellen');
    expect(await screen.findByText('Your AI second brain is slowly rotting')).toBeTruthy();
    expect(screen.queryByText('Noch nicht gebaut')).toBeNull();
    expect(screen.queryByText('Noch keine Rohquelle im Vault')).toBeNull();
  });
});

describe('Einstellungen', () => {
  it('tragen die Kennzahlen des Index', async () => {
    await openScreen('#/settings', 'Einstellungen');
    expect(await screen.findByText('Was im Vault steht')).toBeTruthy();
    expect(screen.getByText('Wörter')).toBeTruthy();
  });
});

describe('Einstieg in die Befehlspalette', () => {
  it('steht sichtbar in der Titelzeile und öffnet sie per Klick', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    const trigger = screen.getByRole('button', {
      name: /Befehlspalette öffnen/,
    });
    expect(trigger.textContent).toContain('Springen, erfassen, suchen');
    await userEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Befehle' })).toBeTruthy();
  });
});
