// @vitest-environment jsdom
/* Die Hülle muss stehen, bevor irgendein Screen ausgebaut wird: sieben Ziele in
   der Rail, Tastaturwege, die Adressen von Erfassen und Fragen, und keine
   A11y-Verstöße. */

import { StrictMode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalDay } from '@shared/types';
import { App } from '@renderer/App';
import { AppShell } from '@renderer/components/AppShell';
import type { AskPrefill } from '@renderer/lib/shell-overlays';
import { useShellOverlays } from '@renderer/lib/shell-overlays';
import { DashboardScreen } from '@renderer/screens/dashboard/DashboardScreen';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
import * as fx from '@renderer/lib/mock-fixtures';
import { SCREENS } from '@renderer/lib/screens';
import { setLanguage, t } from '@renderer/i18n';

/* `window.sb` wird ausdrücklich gemockt: die Oberfläche darf im Test nichts
   Echtes anfassen. Die Antworten kommen aus den Fixtures der Mock-Brücke. */
const passthrough = (channel: string, payload?: unknown): Promise<unknown> =>
  (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(channel, payload);
const invoke = vi.fn(passthrough);

/* 009, D7: swaps only `journal:list` out from under the rail, everything
   else keeps answering from the usual fixtures. Needed to get a
   deterministic open-days count without touching the shared fixture the
   rest of this file relies on. */
function respondWithJournalDays(days: JournalDay[]): void {
  invoke.mockImplementation((channel: string, payload?: unknown) =>
    channel === 'journal:list' ? Promise.resolve(days) : passthrough(channel, payload),
  );
}

function renderAppAt(hash: string) {
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

function renderApp() {
  return renderAppAt('#/dashboard');
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  invoke.mockClear();
  invoke.mockImplementation(passthrough);
  /* 009, D7: the rail derives its open-days count from real "now" versus
     `JournalDay.date` — without a frozen clock the fixture's one demo day
     (dated at the fixtures' own `NOW`) would drift into the past as real
     time moves on and start counting as open on its own, out of nowhere in
     tests that were never about the journal. Same fixed instant the demo
     data is written from, so the fixture's day reads as "today" (never
     open) as originally intended. */
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(fx.NOW) });
  window.sb = {
    invoke,
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as SbBridge;
});

afterEach(() => {
  vi.useRealTimers();
  delete window.sb;
});

/* Der Knopf in der Titelzeile heißt wie die Aktion in leeren Zuständen — der
   Weg dorthin geht deshalb über die Titelzeile selbst. */
async function clickCapture(): Promise<void> {
  const titlebar = screen.getByRole('banner');
  await userEvent.click(within(titlebar).getByRole('button', { name: 'Gedanken erfassen' }));
}

/* Die sichtbaren Wege ins Fragen-Overlay (Befehlspalette, `#/ask`) stellen
   immer gleich eine Frage oder bringen keine mit. Für alles dazwischen — ein
   Overlay mit genau diesem Vorwissen, das offen stehen bleibt — wird es so
   getrieben, wie die Hülle es selbst tut: über den echten Kontext, aus einem
   winzigen Baustein heraus, der innerhalb der echten `AppShell` sitzt. */
function AskOpener({ prefill }: { prefill: AskPrefill }) {
  const overlays = useShellOverlays();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    overlays.openAsk(prefill);
  }, [overlays, prefill]);
  return null;
}

function renderAsk(prefill: AskPrefill = {}, hash = '#/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = hash;
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <HashRouter>
          <AppShell background="none" appIcon="knowledge-garden">
            <DashboardScreen />
            <AskOpener prefill={prefill} />
          </AppShell>
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/* Ein Öffner mit Knopf: die einzige Art, eine Frage ankommen zu lassen,
   während das Overlay schon steht, ohne sie gleich zu stellen — die Palette
   fragt immer sofort. */
function AskButton({ prefill, label }: { prefill: AskPrefill; label: string }) {
  const overlays = useShellOverlays();
  return (
    <button type="button" onClick={() => overlays.openAsk(prefill)}>
      {label}
    </button>
  );
}

/** Overlay auf, danach eine zweite Frage per Knopfdruck hinterher. */
function renderAskThenButton(first: AskPrefill, later: AskPrefill, label: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = '#/dashboard';
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <HashRouter>
          <AppShell background="none" appIcon="knowledge-garden">
            <DashboardScreen />
            <AskOpener prefill={first} />
            <AskButton prefill={later} label={label} />
          </AppShell>
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/** Öffnet die Palette, tippt dort eine Frage und schickt sie ab. */
async function askViaPalette(question: string): Promise<void> {
  await userEvent.keyboard('{Control>}k{/Control}');
  const palette = await screen.findByRole('dialog', { name: 'Befehle' });
  const field = within(palette).getByRole('textbox');
  await waitFor(() => expect(document.activeElement).toBe(field));
  await userEvent.keyboard(`?${question}{Enter}`);
}

/** Wie oft eine Frage tatsächlich an den Kern ging. */
function askCalls(): unknown[][] {
  return invoke.mock.calls.filter((call) => call[0] === 'chat:ask');
}

describe('AppShell', () => {
  it('rendert Titelzeile, Rail und Inhalt', async () => {
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fenster schließen' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('führt in acht Screens, jeder mit aria-label', async () => {
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const links = nav.querySelectorAll('a');
    expect(links.length).toBe(SCREENS.length);
    /* Acht Screens: sieben durchgehend nummeriert von 1 bis 7, keine Lücke —
       Inbox ist kein Rail-Eintrag mehr (die Inbox wird ein Filter auf
       „Notizen"), „Quellen" ist ein Tab unter „Wissen", Erfassen und Fragen
       sind Overlays, „Agents" ist seit story 008 kein Rail-Eintrag mehr: die
       Sitzungen hängen unter „Projekte". Dazu „Aufgaben" (072, D1) ohne
       eigene Ziffer — erreichbar per Klick und per Fokus, wie jeder Eintrag
       ohne Taste. */
    expect(SCREENS.length).toBe(8);
    for (const link of links) {
      expect(link.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /* Solange jeder Eintrag eine Ziffer trägt, muss sie auch an ihm stehen —
     sonst ist die Tastenbedienung da, aber unsichtbar. „Aufgaben" trägt
     bewusst keine Ziffer (072, D1) und wird hier eigens geprüft, statt die
     Schleife über alle Einträge stillschweigend aufzuweichen. */
  it('zeigt an jedem Rail-Eintrag seine Ziffer, sichtbar und für Hilfsmittel', async () => {
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });

    for (const definition of SCREENS.filter((screen) => screen.id !== 'tasks')) {
      const link = within(nav).getByRole('link', { name: t(definition.labelKey) });
      expect(definition.hotkey, `Rail-Eintrag ${definition.id}`).toBeDefined();
      expect(link.getAttribute('aria-keyshortcuts')).toBe(definition.hotkey);
      expect(link.querySelector('.sb-rail-key')?.textContent).toBe(definition.hotkey);
    }

    const tasksDefinition = SCREENS.find((screen) => screen.id === 'tasks');
    expect(tasksDefinition?.hotkey, 'Rail-Eintrag tasks').toBeUndefined();
    const tasksLink = within(nav).getByRole('link', { name: t('rail.tasks') });
    expect(tasksLink.getAttribute('aria-keyshortcuts')).toBeNull();
    expect(tasksLink.querySelector('.sb-rail-key')).toBeNull();
  });

  /* 009, D7: die Zahl offener Tage kommt ausschließlich aus `journal:list` +
     `countOpenDays`, ohne eigenen IPC-Kanal — hier stehen beide Zustände
     nebeneinander: kein Tag offen (Standard-Fixture, „heute" zählt nie als
     offen) gegen zwei tatsächlich offene Tage. */
  it('zeigt am Tagebuch-Eintrag kein Abzeichen, wenn kein Tag offen ist', async () => {
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const journalLink = within(nav).getByRole('link', { name: 'Tagebuch' });
    expect(journalLink.querySelector('.sb-rail-count')).toBeNull();
  });

  it('zeigt am Tagebuch-Eintrag ein Abzeichen mit der Zahl offener Tage', async () => {
    const openDays: JournalDay[] = [
      { ...fx.journalDay, date: '2026-08-06', closed: null, path: 'journal/2026/08/2026-08-06.md' },
      { ...fx.journalDay, date: '2026-08-08', closed: null, path: 'journal/2026/08/2026-08-08.md' },
      /* "Heute" selbst darf trotz `closed: null` nicht mitzählen. */
      fx.journalDay,
    ];
    respondWithJournalDays(openDays);
    renderApp();

    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const journalLink = await within(nav).findByRole('link', { name: 'Tagebuch, 2 offene Tage' });
    const badge = journalLink.querySelector('.sb-rail-count');
    expect(badge?.textContent).toBe('2');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');

    /* Kein anderer Eintrag hat sich verändert. */
    for (const definition of SCREENS.filter((screen) => screen.id !== 'journal')) {
      const link = within(nav).getByRole('link', { name: t(definition.labelKey) });
      expect(link.querySelector('.sb-rail-count')).toBeNull();
    }
  });

  it('wechselt den Screen über die Ziffern', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await userEvent.keyboard('2');
    expect(await screen.findByRole('heading', { level: 1, name: 'Projekte' })).toBeTruthy();
    await userEvent.keyboard('4');
    expect(await screen.findByRole('heading', { level: 1, name: 'Wissen' })).toBeTruthy();
    await userEvent.keyboard('7');
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

  it('öffnet über die Titelzeile das Erfassen-Overlay über dem Screen', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await clickCapture();
    expect(await screen.findByRole('dialog', { name: 'Erfassen' })).toBeTruthy();
    /* Das Overlay legt sich über den Screen, es ersetzt ihn nicht. */
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('schließt das Erfassen-Overlay mit Esc aus dem Feld heraus', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await clickCapture();
    const dialog = await screen.findByRole('dialog', { name: 'Erfassen' });
    /* Der Fokus landet im Feld — und genau dort schluckt das Feld die Taste,
       der Weg zum Schließen muss also auch von dort aus stehen. */
    const field = within(dialog).getByRole('textbox', { name: 'Was liegt an?' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('schließt das Erfassen-Overlay per Klick auf den Hintergrund', async () => {
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await clickCapture();
    await screen.findByRole('dialog', { name: 'Erfassen' });
    const scrim = container.querySelector('.gs-scrim');
    expect(scrim).toBeTruthy();
    await userEvent.click(scrim as Element);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('hat auch mit offenem Erfassen-Overlay keinen A11y-Verstoß', async () => {
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await clickCapture();
    await screen.findByRole('dialog', { name: 'Erfassen' });
    const result = await axe.run(container);
    const summary = result.violations.map((violation) => `${violation.id}: ${violation.help}`);
    expect(summary).toEqual([]);
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const result = await axe.run(container);
    const summary = result.violations.map((violation) => `${violation.id}: ${violation.help}`);
    expect(summary).toEqual([]);
  });
});

describe('Fragen-Overlay', () => {
  it('legt sich über den Screen, mit Gesprächen und Feld', async () => {
    renderAsk();
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    /* Das Overlay legt sich über den Screen, es ersetzt ihn nicht. */
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(dialog.querySelector('#sb-ask-field')).toBeTruthy();
    expect(await within(dialog).findByRole('list', { name: 'Gespräche' })).toBeTruthy();
  });

  it('füllt eine mitgegebene Frage nur ins Feld, ohne sie zu stellen', async () => {
    renderAsk({ question: 'Wo steht das Kundenportal?' });
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    const field = within(dialog).getByRole('textbox', { name: 'Deine Frage' });
    expect((field as HTMLTextAreaElement).value).toBe('Wo steht das Kundenportal?');
    expect(askCalls().length).toBe(0);
  });

  it('stellt die Frage genau einmal, wenn der Öffner sie schon mitbringt', async () => {
    renderAsk({ question: 'Was ist noch offen?', submit: true });
    await screen.findByRole('dialog', { name: 'Fragen' });
    await waitFor(() => expect(askCalls().length).toBe(1));
    /* StrictMode ruft Effekte doppelt auf — gefragt wird trotzdem nur einmal. */
    expect(askCalls().length).toBe(1);
    expect(askCalls()[0]?.[1]).toMatchObject({ question: 'Was ist noch offen?' });
  });

  /* Eine Folgefrage aus der Palette ist genau der Weg, den diese Story fördert.
     Sie darf deshalb nicht daran scheitern, dass das Overlay schon steht: das
     Overlay bleibt montiert (sonst wären Gespräch und laufende Antwort weg),
     also muss es die neue Frage selbst erkennen. */
  it('stellt eine zweite Frage aus der Palette, obwohl es schon offen steht', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    await askViaPalette('Erste Frage');
    await screen.findByRole('dialog', { name: 'Fragen' });
    await waitFor(() => expect(askCalls().length).toBe(1));

    /* Ohne das Overlay zu schließen. */
    await askViaPalette('Zweite Frage');
    await waitFor(() => expect(askCalls().length).toBe(2));
    expect(askCalls()[1]?.[1]).toMatchObject({ question: 'Zweite Frage' });
    expect(screen.getByRole('dialog', { name: 'Fragen' })).toBeTruthy();
  });

  /* Dieselbe Ankunft, nur ohne `submit`: dann gilt die Regel des Panels, und
     die Frage gehört ins Feld. Verloren gehen darf sie in keinem der Fälle. */
  it('legt eine später ankommende Frage ohne submit ins Feld', async () => {
    renderAskThenButton(
      { question: 'Wo steht das Kundenportal?' },
      { question: 'Wer wartet auf mich?' },
      'Später fragen',
    );
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    const field = within(dialog).getByRole('textbox', { name: 'Deine Frage' });
    expect((field as HTMLTextAreaElement).value).toBe('Wo steht das Kundenportal?');

    await userEvent.click(screen.getByRole('button', { name: 'Später fragen' }));
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe('Wer wartet auf mich?'));
    expect(askCalls().length).toBe(0);
  });

  /* Esc räumt immer nur die oberste Fläche ab: die Palette liegt über dem
     Overlay. Wer sie loswerden will, verliert dabei nicht Gespräch und
     Entwurf dahinter. */
  it('schließt mit Esc erst die Palette darüber, dann sich selbst', async () => {
    renderAsk();
    await screen.findByRole('dialog', { name: 'Fragen' });

    await userEvent.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog', { name: 'Befehle' });
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Befehle' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Fragen' })).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fragen' })).toBeNull());
  });

  it('schließt mit Esc, auch aus dem Feld heraus', async () => {
    renderAsk({ question: 'Wo bin ich stehen geblieben?' });
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    const field = within(dialog).getByRole('textbox', { name: 'Deine Frage' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('hat mit offenem Fragen-Overlay keinen A11y-Verstoß', async () => {
    const { container } = renderAsk();
    await screen.findByRole('dialog', { name: 'Fragen' });
    const result = await axe.run(container);
    const summary = result.violations.map((violation) => `${violation.id}: ${violation.help}`);
    expect(summary).toEqual([]);
  });
});

/* Hinter Ctrl+K steht ein Bedienelement mit zwei Modi. Geprüft wird beides:
   dass der Befehlsmodus bleibt, was er war, und dass der Fragenmodus ohne
   Vorwissen erreichbar ist — über sichtbare Chips, über Tab und über ein
   führendes Fragezeichen. */
describe('Befehlspalette mit zwei Modi', () => {
  /** Öffnet die Palette und wartet, bis der Fokus wirklich im Feld steht. */
  async function openPalette(): Promise<HTMLElement> {
    await userEvent.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Befehle' });
    const field = within(dialog).getByRole('textbox');
    await waitFor(() => expect(document.activeElement).toBe(field));
    return dialog;
  }

  /** Welcher Chip ist gedrückt? Ein Modus, der nur intern existiert, ist keiner. */
  function pressed(dialog: HTMLElement, label: string): string | null {
    return within(dialog).getByRole('button', { name: label }).getAttribute('aria-pressed');
  }

  async function openInDashboard(): Promise<HTMLElement> {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    return openPalette();
  }

  it('startet im Befehlsmodus und sagt das über die Chips', async () => {
    const dialog = await openInDashboard();
    expect(pressed(dialog, 'Befehle')).toBe('true');
    expect(pressed(dialog, 'Fragen')).toBe('false');
    expect(
      within(dialog).getByRole('textbox', { name: 'Springen, erfassen, suchen' }),
    ).toBeTruthy();
  });

  it('wechselt mit Tab aus dem Feld in den Fragenmodus und zurück', async () => {
    const dialog = await openInDashboard();

    await userEvent.keyboard('{Tab}');
    expect(pressed(dialog, 'Fragen')).toBe('true');
    expect(pressed(dialog, 'Befehle')).toBe('false');
    const asking = within(dialog).getByRole('textbox', { name: 'Was willst du wissen?' });
    /* Tab verschiebt hier ausdrücklich nicht den Fokus, sonst tippt der
       Nutzer nach dem Wechsel ins Leere. */
    expect(document.activeElement).toBe(asking);
    /* Kein Trefferliste im Fragenmodus: geantwortet wird im Overlay. */
    expect(within(dialog).queryByRole('list')).toBeNull();

    await userEvent.keyboard('{Tab}');
    expect(pressed(dialog, 'Befehle')).toBe('true');
  });

  it('schaltet auch per Klick auf den Chip um', async () => {
    const dialog = await openInDashboard();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fragen' }));
    expect(pressed(dialog, 'Fragen')).toBe('true');
    expect(within(dialog).getByRole('textbox', { name: 'Was willst du wissen?' })).toBeTruthy();
  });

  it('macht aus einem führenden ? den Wechsel, nicht den Anfang der Frage', async () => {
    const dialog = await openInDashboard();
    await userEvent.keyboard('?Wo steht das Kundenportal');

    expect(pressed(dialog, 'Fragen')).toBe('true');
    const field = within(dialog).getByRole('textbox', { name: 'Was willst du wissen?' });
    expect((field as HTMLInputElement).value).toBe('Wo steht das Kundenportal');
  });

  it('stellt die getippte Frage beim Enter genau einmal im Fragen-Overlay', async () => {
    await openInDashboard();
    await userEvent.keyboard('?Was ist noch offen?{Enter}');

    const ask = await screen.findByRole('dialog', { name: 'Fragen' });
    /* Die Palette ist weg, das Overlay steht — ein Ziel, nicht zwei. */
    expect(screen.queryByRole('dialog', { name: 'Befehle' })).toBeNull();
    await waitFor(() => expect(askCalls().length).toBe(1));
    /* StrictMode ruft Effekte doppelt auf — gefragt wird trotzdem nur einmal. */
    expect(askCalls().length).toBe(1);
    expect(askCalls()[0]?.[1]).toMatchObject({ question: 'Was ist noch offen?' });
    /* Die Frage ist heraus, also gehört sie nicht mehr ins Feld — sonst
       stünde sie beim nächsten Enter ein zweites Mal an. */
    const field = within(ask).getByRole('textbox', { name: 'Deine Frage' });
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  });

  it('lässt eine leere Frage nichts tun', async () => {
    const dialog = await openInDashboard();
    await userEvent.keyboard('?   {Enter}');
    expect(dialog.isConnected).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Fragen' })).toBeNull();
    expect(askCalls().length).toBe(0);
  });

  it('öffnet über „Gedanken erfassen" das Overlay statt des Erfassen-Fensters', async () => {
    const dialog = await openInDashboard();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gedanken erfassen' }));

    expect(await screen.findByRole('dialog', { name: 'Erfassen' })).toBeTruthy();
    expect(invoke.mock.calls.filter((call) => call[0] === 'capture:window')).toEqual([]);
  });

  /* Das eigene Fenster bleibt erreichbar: es ist der einzige Weg zu erfassen,
     ohne die ganze App nach vorn zu holen. */
  it('behält das Erfassen-Fenster als eigenen Befehl', async () => {
    const dialog = await openInDashboard();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Erfassen-Fenster' }));

    await waitFor(() =>
      expect(invoke.mock.calls.filter((call) => call[0] === 'capture:window').length).toBe(1),
    );
  });

  it('schaltet „Frage stellen" die Palette um, statt sie zu schließen', async () => {
    const dialog = await openInDashboard();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Frage stellen' }));

    expect(screen.getByRole('dialog', { name: 'Befehle' })).toBeTruthy();
    expect(pressed(dialog, 'Fragen')).toBe('true');
  });

  it('hat im Fragenmodus keinen A11y-Verstoß', async () => {
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const dialog = await openPalette();
    await userEvent.keyboard('{Tab}');
    expect(within(dialog).getByRole('textbox', { name: 'Was willst du wissen?' })).toBeTruthy();

    const result = await axe.run(container);
    const summary = result.violations.map((violation) => `${violation.id}: ${violation.help}`);
    expect(summary).toEqual([]);
  });
});

/* Erfassen und Fragen sind keine Screens mehr, ihre Adressen bleiben aber:
   Lesezeichen, die Kacheln des Dashboards und die Inbox zeigen weiter dorthin.
   Eine Adresse, die ins Leere führt, wäre der eine Fehler, den kein Nutzer
   selbst reparieren kann — deshalb steht hier, was sie tun müssen. */
describe('Adressen von Erfassen und Fragen', () => {
  it('öffnet über #/capture das Erfassen-Overlay über dem Dashboard', async () => {
    renderAppAt('#/capture');
    expect(await screen.findByRole('dialog', { name: 'Erfassen' })).toBeTruthy();
    /* Kein leerer Bildschirm: das Overlay liegt über dem Dashboard, der
       Vorgabe-Route der App. */
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
  });

  /* Der Regressionswächter dieses Deliverables. Er fällt bei beiden Arten,
     die Öffner-Route kaputtzumachen:
     – wird sie durch ein blankes `<Navigate to="/dashboard" replace />`
       ersetzt, gibt es überhaupt kein Overlay — `findByRole('dialog')` läuft
       in den Timeout;
     – verliert sie die Abfrage (was `<Navigate>` von sich aus tut, weil es
       `search` wegwirft), steht das Overlay zwar da, das Feld aber leer.
     Ein grüner Lauf ohne diesen Test würde beides durchgehen lassen. */
  it('nimmt bei #/ask?q=… die Frage mit ins Feld, ohne sie zu stellen', async () => {
    renderAppAt('#/ask?q=Was%20wei%C3%9F%20ich%20%C3%BCber%20X%3F');
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    const field = within(dialog).getByRole('textbox', { name: 'Deine Frage' });
    expect((field as HTMLTextAreaElement).value).toBe('Was weiß ich über X?');
    /* Eine Adresse ist keine Nutzeraktion: gefragt wird erst auf Enter. */
    expect(askCalls().length).toBe(0);
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
  });

  it('öffnet #/ask ohne Abfrage mit leerem Feld', async () => {
    renderAppAt('#/ask');
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    const field = within(dialog).getByRole('textbox', { name: 'Deine Frage' });
    expect((field as HTMLTextAreaElement).value).toBe('');
    expect(askCalls().length).toBe(0);
  });

  /* Die Kachelknöpfe navigieren weiter auf `/capture` — ein Mechanismus, nicht
     zwei. Dass dabei das Overlay herauskommt und nicht ein toter Screen, ist
     genau der Weg, den der Nutzer nimmt. */
  it('führt der Erfassen-Knopf des Dashboards ins Erfassen-Overlay', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const content = screen.getByRole('main');
    await userEvent.click(within(content).getByRole('button', { name: 'Gedanken erfassen' }));
    expect(await screen.findByRole('dialog', { name: 'Erfassen' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
  });
});

/* D8: Die Einschränkung kommt daher, wo der Nutzer gerade steht.

   Zwei Wege, weil sie zwei verschiedene Dinge belegen. Über die Befehlspalette
   geht die Frage sofort hinaus — und die Palette übergibt nur die Frage, ohne
   Modul und ohne Projekt. Käme die Umgebung erst dann zum Tragen, wenn niemand
   etwas mitgibt, wäre genau dieser Weg ungefiltert. Über den Öffner ohne
   `submit` bleibt das Overlay stehen, und daran lässt sich der sichtbare Chip
   samt Wegklicken prüfen. */
describe('Umgebung der Frage', () => {
  /** Öffnet die Palette an der Adresse und stellt dort eine Frage. */
  async function askFromPalette(hash: string): Promise<HTMLElement> {
    renderAppAt(hash);
    await userEvent.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Befehle' });
    const field = within(palette).getByRole('textbox');
    await waitFor(() => expect(document.activeElement).toBe(field));
    await userEvent.keyboard('?Was ist noch offen?{Enter}');
    return screen.findByRole('dialog', { name: 'Fragen' });
  }

  /** Die Nutzlast der ersten Frage an den Kern. */
  async function firstAsk(): Promise<unknown> {
    await waitFor(() => expect(askCalls().length).toBe(1));
    return askCalls()[0]?.[1];
  }

  it('schränkt eine Frage aus einem Modul auf dieses Modul ein', async () => {
    await askFromPalette('#/knowledge?m=identity-management');
    expect(await firstAsk()).toMatchObject({ module: 'identity-management', project: null });
  });

  it('schränkt eine Frage aus einem Projekt auf dieses Projekt ein', async () => {
    const dialog = await askFromPalette('#/projects?p=nyota-auth0-migration');
    expect(await firstAsk()).toMatchObject({ module: null, project: 'nyota-auth0-migration' });
    /* Ein Filter, den man nicht sieht, ist ein stiller Filter. */
    const group = within(dialog).getByRole('group', { name: 'Projekt' });
    expect(group.textContent).toContain('Nyota Auth0 Migration');
  });

  it('schränkt eine Frage vom Dashboard auf nichts ein', async () => {
    const dialog = await askFromPalette('#/dashboard');
    expect(await firstAsk()).toMatchObject({ module: null, project: null });
    expect(within(dialog).queryByRole('group', { name: 'Projekt' })).toBeNull();
  });

  it('nimmt den Projektfilter mit einem Klick weg und fragt dann ungefiltert', async () => {
    renderAsk({}, '#/projects?p=nyota-auth0-migration');
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    const group = within(dialog).getByRole('group', { name: 'Projekt' });

    await userEvent.click(within(group).getByRole('button', { name: 'Filter entfernen' }));
    expect(within(dialog).queryByRole('group', { name: 'Projekt' })).toBeNull();

    const field = within(dialog).getByRole('textbox', { name: 'Deine Frage' });
    await userEvent.type(field, 'Was ist noch offen?{Enter}');
    await waitFor(() => expect(askCalls().length).toBe(1));
    expect(askCalls()[0]?.[1]).toMatchObject({ project: null });
  });

  it('hat mit sichtbarem Projektfilter keinen A11y-Verstoß', async () => {
    const { container } = renderAsk({}, '#/projects?p=nyota-auth0-migration');
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    within(dialog).getByRole('group', { name: 'Projekt' });

    const result = await axe.run(container);
    const summary = result.violations.map((violation) => `${violation.id}: ${violation.help}`);
    expect(summary).toEqual([]);
  });
});

/* Ein Overlay, das über dem nächsten Screen stehen bleibt, ist die eine Falle,
   aus der der Nutzer nicht mehr herausfindet: der Weg, den er selbst angeklickt
   hat, liegt hinter dem Schleier. Beide Wege aus einem Overlay heraus, die die
   App anbietet, stehen deshalb hier. Die Öffner-Adressen sind die Ausnahme —
   dass ihre eigene Weiterleitung das Overlay nicht wieder wegräumt, hält der
   Regressionswächter oben fest. */
describe('Overlays und Navigation', () => {
  it('räumt das Fragen-Overlay weg, wenn der Hinweis ins Routing führt', async () => {
    renderAppAt('#/ask');
    const dialog = await screen.findByRole('dialog', { name: 'Fragen' });
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Routing einrichten' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeTruthy();
    /* Kein Schleier über den Einstellungen, die der Nutzer sehen wollte. */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('räumt das Erfassen-Overlay weg, wenn „Zur Inbox" führt', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await clickCapture();
    const dialog = await screen.findByRole('dialog', { name: 'Erfassen' });
    const field = within(dialog).getByRole('textbox', { name: 'Was liegt an?' });
    await userEvent.type(field, 'Rollenkonzept mit Stefan klären');
    await userEvent.click(within(dialog).getByRole('button', { name: /Speichern/ }));

    await userEvent.click(await within(dialog).findByRole('button', { name: 'Zur Inbox' }));
    /* Seit Story 006 führt der Weg nach „Notizen" mit gesetztem Filter — es
       gibt keinen Inbox-Screen mehr. Der Kopf allein wäre kein Beweis, dass er
       auch im Filter landet: der Satz, dass Ablegen freiwillig ist, steht nur
       in der Arbeitsfläche. */
    expect(await screen.findByRole('heading', { level: 1, name: 'Notizen' })).toBeTruthy();
    expect(await screen.findByText(/Ablegen ist freiwillig/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
