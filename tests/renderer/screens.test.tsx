// @vitest-environment jsdom
/* Die Screens müssen zeigen, was im Vault liegt — und dürfen nie behaupten, er
   sei leer, solange sie es nicht wissen. Genau das wird hier geprüft:
   Erfassen und Fragen öffnen als Overlay über dem Dashboard, Inbox und Projekte
   zeigen Daten, das Dashboard antwortet auf die drei Fragen, und die noch nicht
   gebauten Bereiche sagen das als Platzhalter statt als Leerzustand. */

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsSnapshot, UiLanguage } from '@shared/types';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
import * as fx from '@renderer/lib/mock-fixtures';
import { setLanguage } from '@renderer/i18n';

/* Die Oberfläche zieht ihre Sprache aus den Einstellungen: `App` überschreibt
   beim Start, was `setLanguage` gesetzt hat. Ein Test, der auf Englisch prüft,
   dreht deshalb hier — an der Quelle, die die Hülle wirklich liest. */
let uiLanguage: UiLanguage = 'de';

const invoke = vi.fn(async (channel: string, payload?: unknown) => {
  const result = await (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(
    channel,
    payload,
  );
  if (channel !== 'settings:get') return result;
  const snapshot = result as SettingsSnapshot;
  return {
    ...snapshot,
    app: { ...snapshot.app, uiLanguage },
    vault: snapshot.vault
      ? { ...snapshot.vault, languages: { ...snapshot.vault.languages, ui: uiLanguage } }
      : null,
  } satisfies SettingsSnapshot;
});

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

/** Dasselbe für die beiden Adressen, die kein Screen mehr sind: `#/capture` und
    `#/ask` öffnen ein Overlay über dem Dashboard. Es trägt keine h1, das Signal
    ist der Dialog. */
async function openOverlay(hash: string, name: string) {
  const rendered = renderAt(hash);
  await screen.findByRole('dialog', { name });
  return rendered;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

beforeEach(() => {
  uiLanguage = 'de';
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
    await openOverlay('#/capture', 'Erfassen');
    const field = screen.getByLabelText('Was liegt an?');
    expect(field.tagName).toBe('TEXTAREA');
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it('legt mit Ctrl+Enter ab und leert das Feld', async () => {
    await openOverlay('#/capture', 'Erfassen');
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
    const { container } = await openOverlay('#/capture', 'Erfassen');
    await expectNoViolations(container);
  });
});

/* Inbox als eigener Ort ist weg (Story 006): die Adresse bleibt bestehen, weil
   Kacheln, Erfassen-Panel und alte Lesezeichen weiter darauf zeigen, führt aber
   jetzt auf den Unerledigt-Filter von Notizen. Der Filter selbst wird erst mit
   Story 006/D3 ausgewertet — hier wird nur geprüft, dass die Umleitung selbst
   funktioniert und dabei die Abfrage nicht verschluckt, so wie bei den alten
   Wissen-Adressen weiter unten in dieser Datei. */
describe('Inbox: alte Adresse', () => {
  it('leitet #/inbox auf den Unerledigt-Filter von Notizen um', async () => {
    await openScreen('#/inbox', 'Notizen');
    expect(window.location.hash.split('?')[0]).toBe('#/notes');
    expect(addressQuery()).toEqual({ filter: 'unfiled' });
  });

  it('behält bei #/inbox eine mitgegebene Abfrage', async () => {
    await openScreen('#/inbox?x=1', 'Notizen');
    expect(window.location.hash.split('?')[0]).toBe('#/notes');
    expect(addressQuery()).toEqual({ x: '1', filter: 'unfiled' });
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
    await openOverlay('#/ask', 'Fragen');
    const field = screen.getByLabelText('Deine Frage');
    await userEvent.type(field, 'Was weiß ich über Rollen?');
    await userEvent.click(screen.getByRole('button', { name: 'Frage stellen' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('chat:ask', {
        question: 'Was weiß ich über Rollen?',
        module: null,
        project: null,
        scope: null,
      }),
    );
    /* Das Gespräch der Attrappe steht in der Liste, nicht ein leerer Kasten. */
    expect(
      await screen.findByRole('button', { name: `Gespräch „${fx.chatThread.title}“ öffnen` }),
    ).toBeTruthy();
  });

  /* „Routing einrichten" muss in der Routing-Tabelle landen, nicht irgendwo in
     den Einstellungen — sonst sucht der Nutzer den Weg selbst weiter. */
  it('führt von „kein Modell" direkt in den Modelle-Tab', async () => {
    await openOverlay('#/ask', 'Fragen');

    await userEvent.click(await screen.findByRole('button', { name: 'Routing einrichten' }));

    /* Der Klick führt aus dem Overlay heraus: die Hülle räumt es weg, sobald
       sich die Adresse ändert (`lib/shell-overlays.tsx`), sonst läge der
       Schleier über den Einstellungen, die der Nutzer sehen wollte — dafür
       steht der eigene Fall in `shell.test.tsx`. Geprüft wird hier nur das
       Ziel: der richtige Screen mit dem richtigen Tab. */
    await screen.findByRole('heading', { level: 1, name: 'Einstellungen' });
    expect(window.location.hash).toContain('tab=models');
    expect(screen.getByRole('tab', { name: 'Modelle' }).getAttribute('aria-selected')).toBe('true');
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openOverlay('#/ask', 'Fragen');
    await expectNoViolations(container);
  });
});

/* Das Tagebuch ist gebaut: es zeigt den Tag, nicht einen Platzhalter. */
describe('Tagebuch', () => {
  it('zeigt Tagesliste, Tagestext und das Gespräch', async () => {
    await openScreen('#/journal', 'Tagebuch');

    /* Der Tagestext steht im Strom (`EntryStream`) und links als erste Worte
       der Zeile in der Tagesliste. */
    expect((await screen.findAllByText(fx.journalDay.excerpt)).length).toBeGreaterThan(0);
    /* Die Attrappe legt dieselbe Runde doppelt an (siehe `mock-bridge.ts`):
       einmal im Strom, einmal im alten Gespräch — seit 011/D9 rendert
       `LegacyConversation` `turns` zusätzlich zum Strom, also erscheint der
       Satz jetzt zweimal statt einmal. */
    expect((await screen.findAllByText('Der Sprint fühlt sich unmöglich an.')).length).toBe(2);
    /* Die Demo-Einstellungen (`mock-settings.ts`) stehen auf „Tipps" — dort
       fragt der Knopf nach einem Modell, statt nur zu sagen (011, D8). */
    expect(screen.getByRole('button', { name: 'Speichern und fragen' })).toBeTruthy();
    expect(screen.queryByText('Noch nicht gebaut')).toBeNull();
    /* Kein Leerzustand, solange etwas im Vault liegt. */
    expect(screen.queryByText('Noch kein Tageseintrag im Vault')).toBeNull();
  });
});

/* Module und Quellen sind gebaut: sie zeigen den Bestand, keinen Platzhalter.
   Beide hängen jetzt unter einem Screen — „Wissen" ist die Überschrift, die
   Tabs sind der Weg. */
describe('Wissen', () => {
  it('zeigt bei Modulen die Karte mit Zählungen statt eines Platzhalters', async () => {
    await openScreen('#/knowledge', 'Wissen');
    expect(await screen.findByText(fx.knowledgeModule.title)).toBeTruthy();
    expect(screen.getByText('3 Quellen · 4 Entitäten · 5 Konzepte')).toBeTruthy();
    expect(screen.queryByText('Noch nicht gebaut')).toBeNull();
    expect(screen.queryByText('Noch kein Wissens-Modul im Vault')).toBeNull();
  });

  it('zeigt bei Quellen den Bestand aus raw/', async () => {
    await openScreen('#/knowledge?tab=sources', 'Wissen');
    const sourceButtonName = 'Details der Quelle Your AI second brain is slowly rotting öffnen';
    expect(screen.queryByRole('button', { name: sourceButtonName })).toBeNull();
    await userEvent.click(await screen.findByLabelText('Erfolgreiche ausblenden'));
    expect(await screen.findByRole('button', { name: sourceButtonName })).toBeTruthy();
    expect(screen.queryByText('Noch nicht gebaut')).toBeNull();
    expect(screen.queryByText('Noch keine Rohquelle im Vault')).toBeNull();
  });
});

/** Die Abfrage der aktuellen Adresse — als Objekt, damit die Reihenfolge der
    Parameter nicht mitgeprüft wird, ihr Inhalt aber schon. */
function addressQuery(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
}

/* Die alten Adressen stehen in Lesezeichen, in der Pflege und in Zitaten. Sie
   müssen weiter ankommen — und zwar mit ihrer Abfrage: ein bloßes
   `<Navigate to="/knowledge" />` würde sie wegwerfen, und jeder Tieflink in ein
   Modul landete still in der Übersicht. */
describe('Wissen: alte Adressen', () => {
  it('leitet #/modules ohne Abfrage auf #/knowledge um', async () => {
    await openScreen('#/modules', 'Wissen');
    expect(window.location.hash).toBe('#/knowledge');
    expect(await screen.findByText(fx.knowledgeModule.title)).toBeTruthy();
  });

  it('nimmt bei #/modules die ganze Abfrage mit', async () => {
    const slug = fx.knowledgeModule.slug;
    const page = fx.wikiPage.path;
    await openScreen(
      `#/modules?m=${slug}&tab=log&p=${encodeURIComponent(page)}`,
      fx.knowledgeModule.title,
    );

    expect(window.location.hash.split('?')[0]).toBe('#/knowledge');
    expect(addressQuery()).toEqual({ m: slug, tab: 'log', p: page });
    /* Nicht nur die Adresse: das Protokoll des Moduls steht auch wirklich da. */
    expect(screen.getByRole('tab', { name: 'Protokoll' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('leitet #/sources auf den Quellen-Tab von Wissen um', async () => {
    await openScreen('#/sources', 'Wissen');
    expect(window.location.hash).toBe('#/knowledge?tab=sources');
    expect(screen.getByRole('tab', { name: 'Quellen' }).getAttribute('aria-selected')).toBe('true');
  });

  it('behält bei #/sources eine mitgegebene Abfrage', async () => {
    await openScreen('#/sources?into=identity-management', 'Wissen');
    expect(window.location.hash.split('?')[0]).toBe('#/knowledge');
    expect(addressQuery()).toEqual({ into: 'identity-management', tab: 'sources' });
  });
});

describe('Einstellungen', () => {
  it('tragen die Kennzahlen des Index', async () => {
    await openScreen('#/settings', 'Einstellungen');
    expect(await screen.findByText('Was im Vault steht')).toBeTruthy();
    expect(screen.getByText('Wörter')).toBeTruthy();
  });
});

/** Öffnet die Palette über die Titelzeile und tippt die Suche ein. Gibt den
    Dialog zurück, damit die Treffer darin gesucht werden — der Screen dahinter
    ist weiter im Baum. */
async function openPalette(query: string, trigger = /Befehlspalette öffnen/) {
  await userEvent.click(screen.getByRole('button', { name: trigger }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByRole('textbox'), query);
  return dialog;
}

describe('Einstieg in die Befehlspalette', () => {
  it('steht sichtbar in der Titelzeile und öffnet sie per Klick', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    const trigger = screen.getByRole('button', {
      name: /Befehlspalette öffnen/,
    });
    /* Hinter Ctrl+K stehen zwei Modi, der Knopf sagt beide an. */
    expect(trigger.textContent).toContain('Suchen oder fragen');
    await userEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Befehle' })).toBeTruthy();
  });

  /* Quellen sind kein eigener Screen mehr, stehen also nicht mehr in SCREENS.
     Ohne einen festen Eintrag wären sie aus der Palette verschwunden — und der
     Eintrag muss auf dem Tab landen, nicht bloß auf dem Screen. */
  it('führt „quel" auf den Quellen-Tab von Wissen', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    const dialog = await openPalette('quel');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Quellen' }));

    await screen.findByRole('heading', { level: 1, name: 'Wissen' });
    expect(window.location.hash).toBe('#/knowledge?tab=sources');
    expect(screen.getByRole('tab', { name: 'Quellen' }).getAttribute('aria-selected')).toBe('true');
  });

  /* Seit Story 008 sind die Agent-Sitzungen ebenfalls kein eigener Screen mehr,
     sondern hängen unter Projekte. Ohne festen Eintrag wären sie aus der Palette
     verschwunden — und der Eintrag muss auf `/projects/sessions` landen, nicht
     bloß auf der Projektliste. */
  it('führt „sitz" auf die Agent-Sitzungen unter Projekte', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    const dialog = await openPalette('sitz');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Agent-Sitzungen' }));

    await screen.findByRole('heading', { level: 1, name: 'Agent-Sitzungen' });
    expect(window.location.hash).toBe('#/projects/sessions');
  });

  it('führt „wissen" per Enter auf den Modul-Tab von Wissen', async () => {
    await openScreen('#/dashboard', 'Dashboard');
    const dialog = await openPalette('wissen');

    expect(within(dialog).getByRole('button', { name: 'Wissen' })).toBeTruthy();
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('heading', { level: 1, name: 'Wissen' });
    expect(window.location.hash).toBe('#/knowledge');
    expect(screen.getByRole('tab', { name: 'Module' }).getAttribute('aria-selected')).toBe('true');
  });

  /* Dieselbe Suche auf Englisch: „know" und „sour" sind die Wörter, mit denen
     die Bereiche dort gefunden werden. `beforeEach` setzt die Sprache für den
     nächsten Test wieder auf Deutsch. */
  it('findet auf Englisch „sour" als Quellen-Tab', async () => {
    uiLanguage = 'en';
    setLanguage('en');
    document.documentElement.lang = 'en';
    await openScreen('#/dashboard', 'Dashboard');

    const knowledge = await openPalette('know', /Open the command palette/);
    expect(within(knowledge).getByRole('button', { name: 'Knowledge' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    const dialog = await openPalette('sour', /Open the command palette/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sources' }));

    await screen.findByRole('heading', { level: 1, name: 'Knowledge' });
    expect(window.location.hash).toBe('#/knowledge?tab=sources');
    expect(screen.getByRole('tab', { name: 'Sources' }).getAttribute('aria-selected')).toBe('true');
  });

  it('findet auf Englisch „sess" als Agent-Sitzungen', async () => {
    uiLanguage = 'en';
    setLanguage('en');
    document.documentElement.lang = 'en';
    await openScreen('#/dashboard', 'Dashboard');

    const dialog = await openPalette('sess', /Open the command palette/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agent sessions' }));

    await screen.findByRole('heading', { level: 1, name: 'Agent sessions' });
    expect(window.location.hash).toBe('#/projects/sessions');
  });

  /* Die Palette filtert über die übersetzte Beschriftung. Beide Erfassen-Wege
     und der Weg zum Fragen müssen deshalb in beiden Sprachen auffindbar sein —
     und unterscheidbar, sonst führt ein Treffer irgendwohin. */
  it('findet auf Deutsch beide Erfassen-Wege und das Fragen', async () => {
    await openScreen('#/dashboard', 'Dashboard');

    const dialog = await openPalette('erfass');
    expect(within(dialog).getByRole('button', { name: 'Gedanken erfassen' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Erfassen-Fenster' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    const asking = await openPalette('frage stellen');
    expect(within(asking).getByRole('button', { name: 'Frage stellen' })).toBeTruthy();
  });

  it('findet auf Englisch „capture", „capture window" und „ask"', async () => {
    uiLanguage = 'en';
    setLanguage('en');
    document.documentElement.lang = 'en';
    await openScreen('#/dashboard', 'Dashboard');

    const dialog = await openPalette('capture', /Open the command palette/);
    expect(within(dialog).getByRole('button', { name: 'Capture a thought' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Capture window' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    const asking = await openPalette('ask a question', /Open the command palette/);
    expect(within(asking).getByRole('button', { name: 'Ask a question' })).toBeTruthy();
  });
});
