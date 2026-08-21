// @vitest-environment jsdom
/* Der Pflege-Screen und die Bedienung der Erinnerungen.
 *
 * Der Prüfstein dieses Screens: **behauptet irgendetwas etwas, das nicht
 * passiert?** Deshalb steht hier vor allem, was ein Klick wirklich schickt und was
 * die Oberfläche vorher darüber sagt:
 *
 * - Ohne Lauf gibt es keine Zahl, sondern „noch nicht geprüft" und den einen
 *   Fokuspunkt „jetzt prüfen". `gardener:report` läuft nicht los.
 * - Der Lauf zeigt, welche Prüfung dran ist, und ist abbrechbar.
 * - Ohne Modell stehen die deterministischen Befunde vollständig da, dazu eine
 *   Zeile, was ein Modell zusätzlich fände — mit Weg in die Einstellung.
 * - Jeder Fix-Typ zeigt vorher, was geschrieben wird, und schickt genau seinen
 *   Befund. Was nichts schreibt, sagt das.
 * - „Passt so" ist zurücknehmbar.
 * - Der Widerspruch bietet drei Wege und löst nichts automatisch auf.
 * - Die Kachel zeigt Zahlen nur, wenn ein Lauf vorliegt.
 * - Die Snooze-Auswahl schickt den Abstand zu dem Tag, den sie anzeigt.
 * - axe findet nichts.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { GardenerFinding, GardenerReport, Reminder, VaultDoc, WikiPage } from '@shared/types';
import { GardenScreen } from '@renderer/screens/garden/GardenScreen';
import { GardenerTile } from '@renderer/components/tiles/GardenerTile';
import { DeadlinesTile } from '@renderer/components/tiles/DeadlinesTile';
import { ToastHost } from '@renderer/components/ToastHost';
import { applyFilter, groupByKind, kindCounts } from '@renderer/screens/garden/filter';
import { writeTargetOf } from '@renderer/screens/garden/fixes';
import { contradictionPassage } from '@renderer/screens/garden/sections';
import { targetFor } from '@renderer/screens/garden/targets';
import { setLanguage } from '@renderer/i18n';
import { clearToasts } from '@renderer/lib/toast';
import type { SbBridge } from '@renderer/lib/bridge';

const NOW = '2026-08-10T14:32:00+02:00';
const TODAY = '2026-08-10';
const MODULE = 'identity-management';
const PAGE_A = `modules/${MODULE}/wiki/concepts/token-lebensdauer.md`;
const PAGE_B = `modules/${MODULE}/wiki/entities/scim.md`;
const CATALOG = `modules/${MODULE}/wiki/index.md`;

/* Das Beinahe-Dubletten-Paar (015 D9): dieselbe Quelle, zweimal aufgenommen —
   der reale Fall aus der Story, hier als zwei Quellseiten desselben Moduls. */
const NDUP_A = `modules/${MODULE}/wiki/sources/s-2026-01-01-video-workshop.md`;
const NDUP_B = `modules/${MODULE}/wiki/sources/s-2026-01-01-video-workshop-2.md`;
const NDUP_A_FILE = NDUP_A.split('/').pop() as string;
const NDUP_B_FILE = NDUP_B.split('/').pop() as string;
const NDUP_A_SLUG = NDUP_A_FILE.replace('.md', '');
const NDUP_B_SLUG = NDUP_B_FILE.replace('.md', '');

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Sent {
  channel: IpcChannel;
  payload: unknown;
}

const sent: Sent[] = [];
const listeners = new Map<string, Set<(payload: unknown) => void>>();

/** Eigene Attrappe: ein Test unter `tests/renderer/` sieht nur den Renderer. */
function installMock(handlers: SbHandlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    sent.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = {
    invoke,
    on: (event: string, callback: (payload: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
      return () => set.delete(callback);
    },
    off: (event: string, callback: (payload: unknown) => void) => {
      listeners.get(event)?.delete(callback);
    },
  } as unknown as SbBridge;
}

/** Ein Ereignis aus dem Hauptprozess — so kommt Fortschritt in den Screen. */
function emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void {
  act(() => {
    for (const callback of listeners.get(event) ?? []) callback(payload);
  });
}

function calls(channel: IpcChannel): unknown[] {
  return sent.filter((entry) => entry.channel === channel).map((entry) => entry.payload);
}

function finding(input: Partial<GardenerFinding> & { id: string; kind: GardenerFinding['kind'] }) {
  return {
    severity: 'warn',
    title: `Befund ${input.id}`,
    detail: 'Warum das ein Problem ist.',
    paths: [PAGE_A],
    module: MODULE,
    foundAt: NOW,
    fix: null,
    ...input,
  } as GardenerFinding;
}

const DRIFT = finding({
  id: 'f-drift',
  kind: 'index-drift',
  severity: 'info',
  title: 'Fehlt im Katalog: scim',
  paths: [PAGE_B, CATALOG],
  fix: {
    action: 'add-to-index',
    label: 'In den Katalog eintragen',
    preview: '- [[scim]] — Nutzerverwaltung über SCIM.',
  },
});

const STALE = finding({
  id: 'f-stale',
  kind: 'stale-page',
  severity: 'info',
  title: 'Seit 200 Tagen nicht geprüft: Token-Lebensdauer',
  paths: [PAGE_A],
  fix: { action: 'mark-reviewed', label: 'Als geprüft markieren', preview: `reviewed: ${TODAY}` },
});

const DUMP = finding({
  id: 'f-dump',
  kind: 'unfiled-dump',
  title: 'Liegt seit 30 Tagen in der Inbox: Idee',
  paths: ['inbox/2026-07-11-0900-idee.md'],
  module: null,
  fix: { action: 'open-classify', label: 'Zum Einordnen öffnen', preview: null },
});

const BROKEN = finding({
  id: 'f-broken',
  kind: 'broken-link',
  title: 'Kaputter Wikilink: [[device-code-flow]]',
  paths: [PAGE_A],
});

const CONTRADICTION = finding({
  id: 'f-contra',
  kind: 'contradiction',
  severity: 'high',
  title: 'Widerspruch: Token-Lebensdauer und SCIM',
  detail: 'Die eine Seite nennt 15 Minuten, die andere eine Stunde.',
  paths: [PAGE_A, PAGE_B],
  fix: {
    action: 'add-links',
    label: 'Widerspruch benennen',
    preview: '- [[scim]] widerspricht: 15 Minuten gegen eine Stunde.',
  },
});

const NDUP = finding({
  id: 'f-ndup',
  kind: 'near-duplicate',
  severity: 'info',
  title: 'Beinahe-Dublette: Workshop-Aufzeichnung (Video) und Workshop-Aufzeichnung (Video)',
  detail: 'Fast derselbe Wortlaut auf beiden Seiten.',
  paths: [NDUP_A, NDUP_B],
  fix: { action: 'merge', label: 'Beide Seiten vergleichen', preview: null },
});

/* Ein eigener, kleiner Bericht statt NDUP in `REPORT` aufzunehmen — sonst
   verschieben sich die vielen auf `REPORT.findings.length` gestützten Zahlen
   in jedem Test oberhalb, der REPORT unverändert erwartet. */
const NDUP_REPORT: GardenerReport = {
  ranAt: NOW,
  usedLlm: false,
  findings: [NDUP],
  health: 97,
  healthKnown: true,
  healthContributions: [{ kind: 'near-duplicate', count: 1, points: 3 }],
  advice: [],
};

/* Der Verwaisungs-Befund ohne eindeutigen Kandidaten (016 D5): die Übersicht
   des Moduls plus ein paar weitere Seiten, ausgedacht als das, was
   `gardener:orphanTargets` schon geordnet und gefiltert zurückgäbe. */
const ORPHAN_PAGE = `modules/${MODULE}/wiki/concepts/verwaiste-seite.md`;
const ORPHAN_FILE = ORPHAN_PAGE.split('/').pop() as string;
const ORPHAN_SLUG = ORPHAN_FILE.replace('.md', '');
const OVERVIEW_PATH = `modules/${MODULE}/wiki/overview.md`;
const OTHER_A = `modules/${MODULE}/wiki/concepts/andere-seite-a.md`;
const OTHER_B = `modules/${MODULE}/wiki/concepts/andere-seite-b.md`;
const ORPHAN_LINE = '- [[verwaiste-seite]] wird hier erwähnt.';

const ORPHAN = finding({
  id: 'f-orphan',
  kind: 'orphan',
  title: 'Verwaiste Seite: Verwaiste Seite',
  detail: 'Keine andere Seite verweist auf diese Seite.',
  paths: [ORPHAN_PAGE],
  fix: null,
});

const ORPHAN_TARGETS_SMALL = {
  line: ORPHAN_LINE,
  targets: [
    { path: OVERVIEW_PATH, title: 'Übersicht', slug: 'overview' },
    { path: OTHER_A, title: 'Andere Seite A', slug: 'andere-seite-a' },
    { path: OTHER_B, title: 'Andere Seite B', slug: 'andere-seite-b' },
  ],
};

/* Acht weitere Seiten — ab dieser Zahl zeigt die Auswahl ein Suchfeld
   (`SEARCH_FROM` in `OrphanCard.tsx`, derselbe Schwellwert wie `SessionLink`). */
const MANY_OTHERS = Array.from({ length: 8 }, (_, index) => ({
  path: `modules/${MODULE}/wiki/concepts/andere-seite-${index + 1}.md`,
  title: `Andere Seite ${index + 1}`,
  slug: `andere-seite-${index + 1}`,
}));

const ORPHAN_TARGETS_MANY = {
  line: ORPHAN_LINE,
  targets: [{ path: OVERVIEW_PATH, title: 'Übersicht', slug: 'overview' }, ...MANY_OTHERS],
};

const ORPHAN_TARGETS_EMPTY = { line: ORPHAN_LINE, targets: [] };

const ORPHAN_REPORT: GardenerReport = {
  ranAt: NOW,
  usedLlm: false,
  findings: [ORPHAN],
  health: 95,
  healthKnown: true,
  healthContributions: [{ kind: 'orphan', count: 1, points: 5 }],
  advice: [],
};

/* Der Gegenfall: genau ein Kandidat, also `fix` bereits gesetzt — die Karte
   bleibt die gewöhnliche `FindingCard`, ohne jede Auswahl. */
const ORPHAN_SINGLE = finding({
  id: 'f-orphan-single',
  kind: 'orphan',
  title: 'Verwaiste Seite: Andere verwaiste Seite',
  paths: [ORPHAN_PAGE],
  fix: { action: 'add-links', label: 'Verweis eintragen', preview: ORPHAN_LINE },
});

const ORPHAN_SINGLE_REPORT: GardenerReport = {
  ranAt: NOW,
  usedLlm: false,
  findings: [ORPHAN_SINGLE],
  health: 98,
  healthKnown: true,
  healthContributions: [{ kind: 'orphan', count: 1, points: 2 }],
  advice: [],
};

const REPORT: GardenerReport = {
  ranAt: NOW,
  usedLlm: false,
  findings: [CONTRADICTION, DUMP, BROKEN, DRIFT, STALE],
  health: 72,
  healthKnown: true,
  healthContributions: [
    { kind: 'contradiction', count: 1, points: 14 },
    { kind: 'unfiled-dump', count: 1, points: 6 },
    { kind: 'broken-link', count: 1, points: 5 },
    { kind: 'index-drift', count: 1, points: 2 },
    { kind: 'stale-page', count: 1, points: 1 },
  ],
  advice: [],
};

const REMINDER: Reminder = {
  id: 'reminder-1',
  source: 'project-deadline',
  urgency: 'today',
  title: 'Kundenportal-Relaunch',
  date: TODAY,
  daysOut: 0,
  scope: 'work',
  path: 'projects/work/kundenportal-relaunch/project.md',
  project: 'kundenportal-relaunch',
  who: null,
};

function pageDoc(
  path: string,
  title: string,
  body: string,
  updated: string,
): { page: WikiPage; doc: VaultDoc } {
  return {
    page: {
      path,
      module: MODULE,
      slug: path.split('/').pop()?.replace('.md', '') ?? '',
      title,
      type: 'concept' as const,
      created: '2026-01-02',
      updated,
      tags: [],
      sources: [],
      outbound: [],
      inbound: [],
      excerpt: body.slice(0, 80),
      wordCount: 40,
    },
    doc: {
      path,
      frontmatter: { type: 'concept', title, module: MODULE, created: '2026-01-02' },
      body,
      hash: `hash-${path}`,
      modified: `${updated}T09:00:00+02:00`,
      size: body.length,
    },
  };
}

/** Alles, was der Screen fragt. `report` ist der Fall, den der Test setzt. */
function handlers(report: GardenerReport | null, extra: SbHandlers = {}): SbHandlers {
  return {
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 42,
      indexedAt: NOW,
      indexing: false,
    }),
    'gardener:report': () => report,
    'gardener:run': () => report ?? REPORT,
    'gardener:cancel': () => undefined,
    'gardener:dismiss': () => undefined,
    'gardener:undismiss': () => undefined,
    'gardener:applyFix': () => ({ written: [CATALOG], undoToken: 'undo-1' }),
    'gardener:undoFix': () => ({ restored: [CATALOG], kept: [] }),
    /* Kein Modell konfiguriert — der Normalfall dieses Nutzers. */
    'llm:routing': () => ({ tasks: {}, defaults: {} }),
    'llm:tasks': () => [
      {
        kind: 'gardener-audit' as const,
        labelKey: 'task.gardener-audit.label',
        hintKey: 'task.gardener-audit.hint',
        suggested: 'strong' as const,
        typicalTokens: { in: 15000, out: 1500 },
        sensitive: false,
        streams: false,
        structured: true,
      },
    ],
    'modules:page': ({ path }) => {
      if (path === PAGE_A) {
        return pageDoc(
          PAGE_A,
          'Token-Lebensdauer',
          'Access-Token leben 15 Minuten.\n\n## Widersprüche\n\n- [[scim]] nennt eine Stunde.\n',
          '2026-08-09',
        );
      }
      /* Beide Seiten des Beinahe-Dubletten-Paars: derselbe Titel, derselbe
         Rumpf — eine Quelle, zweimal aufgenommen. */
      if (path === NDUP_A || path === NDUP_B) {
        return pageDoc(
          path,
          'Workshop-Aufzeichnung (Video)',
          'Mitschrift, 40 Minuten. Rollen und Mandanten.\n',
          '2026-01-01',
        );
      }
      return pageDoc(PAGE_B, 'SCIM', 'Nutzer werden über SCIM verwaltet.\n', '2026-08-01');
    },
    'modules:savePage': () => ({ path: PAGE_A, hash: 'hash-neu', created: false }),
    'shell:openPath': () => undefined,
    ...extra,
  };
}

function Location() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, { resultTypes: ['violations'] });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {node}
        <Location />
        <ToastHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
  sent.length = 0;
  listeners.clear();
  clearToasts();
  /* jsdom kennt `scrollIntoView` nicht. Ohne Attrappe stirbt die Fehlerkarte an
     der Zeile, die den Fehler in den Sichtbereich rollt. */
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  delete window.sb;
});

// ── Reine Rechnungen ────────────────────────────────────────────────────────

describe('Ordnung der Befunde', () => {
  it('filtert, gruppiert und zählt dieselbe Liste', () => {
    const shown = applyFilter(REPORT.findings, { kind: 'all', module: MODULE, severity: 'all' });
    expect(shown.every((entry) => entry.module === MODULE)).toBe(true);
    expect(shown).not.toContain(DUMP);

    const groups = groupByKind(REPORT.findings);
    expect(groups.map((group) => group.kind)).toEqual([
      'contradiction',
      'unfiled-dump',
      'broken-link',
      'index-drift',
      'stale-page',
    ]);

    /* Die Zahl je Art wird ohne den Art-Filter gerechnet — sonst stünde überall
       (0), sobald eine Art gewählt ist. */
    const counts = kindCounts(REPORT.findings, {
      kind: 'stale-page',
      module: 'all',
      severity: 'all',
    });
    expect(counts.get('broken-link')).toBe(1);
  });

  it('nennt die Datei, in die ein Fix schreibt — und keine, wenn er nichts schreibt', () => {
    expect(writeTargetOf(DRIFT)).toBe(CATALOG);
    expect(writeTargetOf(STALE)).toBe(PAGE_A);
    expect(writeTargetOf(CONTRADICTION)).toBe(PAGE_A);
    expect(writeTargetOf(DUMP)).toBeNull();
    expect(writeTargetOf(BROKEN)).toBeNull();
  });

  it('führt Pfade dorthin, wo sie in der App stehen', () => {
    expect(targetFor(PAGE_A)).toEqual({
      kind: 'route',
      to: `/knowledge?m=${MODULE}&p=${encodeURIComponent(PAGE_A)}`,
    });
    /* Seit Story 006 ist die Inbox kein Ort mehr, sondern der Filter auf
       Notizen — der Weg zu einem liegengebliebenen Dump führt dorthin. */
    expect(targetFor('inbox/x.md')).toEqual({ kind: 'route', to: '/notes?filter=unfiled' });
    expect(targetFor('raw/web/x.md')).toEqual({ kind: 'route', to: '/knowledge?tab=sources' });
    /* Katalog und Chronik sind keine Wiki-Seiten: die Seitenansicht lüde sie nicht. */
    expect(targetFor(CATALOG)).toEqual({ kind: 'file', path: CATALOG });
  });

  it('unterscheidet die benannte Stelle vom bloßen Ausschnitt', () => {
    const named = contradictionPassage('Text\n\n## Widersprüche\n\n- [[scim]] nennt X.\n');
    expect(named).toEqual({ text: '- [[scim]] nennt X.', named: true });
    const plain = contradictionPassage('# Titel\n\nNur Fließtext.\n');
    expect(plain).toEqual({ text: 'Nur Fließtext.', named: false });
  });
});

// ── Ohne Bericht ────────────────────────────────────────────────────────────

describe('Pflege ohne Lauf', () => {
  it('behauptet keine Gesundheit und bietet den einen Fokuspunkt', async () => {
    installMock(handlers(null));
    wrap(<GardenScreen />);

    expect(await screen.findByText('Noch nicht geprüft')).toBeTruthy();
    expect(screen.queryByText('100')).toBeNull();
    expect(screen.queryByText('Gesundheit')).toBeNull();
    /* Der Bericht wird gelesen, nicht erzeugt. */
    expect(calls('gardener:run')).toEqual([]);
    expect(screen.getAllByRole('button', { name: 'Jetzt prüfen' }).length).toBeGreaterThan(0);
  });

  it('startet den Lauf und übernimmt seinen Bericht', async () => {
    installMock(handlers(null, { 'gardener:run': () => REPORT }));
    wrap(<GardenScreen />);
    await screen.findByText('Noch nicht geprüft');

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Jetzt prüfen' })[0] as HTMLElement,
    );

    expect(calls('gardener:run')).toEqual([{}]);
    expect(await screen.findByText('72')).toBeTruthy();
  });
});

// ── Lauf mit Fortschritt ────────────────────────────────────────────────────

describe('Lauf', () => {
  it('zeigt, welche Prüfung läuft, und bricht ab', async () => {
    installMock(
      handlers(REPORT, {
        /* Der Lauf endet erst, wenn der Test ihn enden lässt. */
        'gardener:run': () => new Promise(() => undefined) as unknown as GardenerReport,
      }),
    );
    wrap(<GardenScreen />);
    await screen.findByText('72');

    await userEvent.click(screen.getByRole('button', { name: 'Neu prüfen' }));
    emit('event:gardener-progress', {
      phase: 'checks',
      check: 'broken-link',
      done: 2,
      total: 10,
      running: true,
    });

    expect(await screen.findByText('Prüfung: Kaputte Wikilinks')).toBeTruthy();
    expect(screen.getByText('2 von 10')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('20');

    await userEvent.click(screen.getByRole('button', { name: 'Prüfung abbrechen' }));
    expect(calls('gardener:cancel')).toEqual([undefined]);
    expect(
      await screen.findByText('Abgebrochen. Der letzte Bericht bleibt, wie er war.'),
    ).toBeTruthy();
  });

  it('nennt beim Deuten das Modell und nicht eine Prüfung', async () => {
    installMock(
      handlers(REPORT, {
        'gardener:run': () => new Promise(() => undefined) as unknown as GardenerReport,
      }),
    );
    wrap(<GardenScreen />);
    await screen.findByText('72');
    await userEvent.click(screen.getByRole('button', { name: 'Neu prüfen' }));

    emit('event:gardener-progress', {
      phase: 'audit',
      check: null,
      done: 10,
      total: 11,
      running: true,
    });

    expect(await screen.findByText('Das Modell deutet die Befunde')).toBeTruthy();
  });
});

// ── Der Bericht ─────────────────────────────────────────────────────────────

describe('Bericht', () => {
  it('erklärt den Wert, statt ihn nur zu verkünden', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);

    expect(await screen.findByText('72')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Gesundheit 72 von 100' })).toBeTruthy();
    expect(screen.getByText('1 Widerspruch')).toBeTruthy();
    expect(screen.getByText('1 kaputter Wikilink')).toBeTruthy();
    expect(screen.getByText('28 von 100 Punkten gehen auf diese Befunde zurück.')).toBeTruthy();
    /* Zeitpunkt in Mono, und ob ein Modell beteiligt war. */
    expect(screen.getByText('Zuletzt geprüft')).toBeTruthy();
    expect(screen.getByText('ohne Modell, nur die maschinellen Prüfungen')).toBeTruthy();
  });

  it('leitet ohne Modell den Rat aus den Befunden ab und sagt das', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    expect(
      screen.getByText('Widersprüche benennen — beide Fassungen bleiben stehen.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Ohne Modell aus Zahl und Schwere der Befunde abgeleitet.'),
    ).toBeTruthy();
    /* Höchstens drei Sätze. */
    expect(
      screen.queryByText('Die angestaubten Seiten lesen und als geprüft markieren.'),
    ).toBeNull();
  });

  it('zeigt ohne Modell alle maschinellen Befunde und die ehrliche Zeile', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    /* Vollständig: fünf Befunde, fünf Gruppen. */
    expect(screen.getByText('5 Befunde')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Kaputte Wikilinks/ })).toBeTruthy();
    expect(screen.getByText('Was ein Modell zusätzlich fände:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Routing einrichten' })).toBeTruthy();
  });

  it('sagt bei keinem Befund, was geprüft wurde — ohne Feier', async () => {
    installMock(
      handlers({
        ...REPORT,
        findings: [],
        health: 100,
        healthContributions: [],
      }),
    );
    wrap(<GardenScreen />);

    expect(await screen.findByText('Keine Befunde.')).toBeTruthy();
    /* Zeitpunkt und Umfang stehen in einem Satz: „zuletzt geprüft" plus was
       geprüft wurde. Der Tag selbst hängt an der Uhr des Rechners. */
    expect(screen.getByText(/Zuletzt geprüft:/)).toBeTruthy();
    expect(screen.getByText(/Geprüft wurden Wiki-Seiten/)).toBeTruthy();
    expect(
      screen.getByText('Nichts drückt den Wert: Die Prüfung hat keine Befunde ergeben.'),
    ).toBeTruthy();
  });

  it('filtert nach Art und sagt, wie viele von wie vielen stehen', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    await userEvent.selectOptions(screen.getByLabelText('Art'), 'stale-page');

    expect(await screen.findByText('1 von 5 angezeigt')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Kaputte Wikilinks/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(await screen.findByText('5 Befunde')).toBeTruthy();
  });
});

// ── Fixes ───────────────────────────────────────────────────────────────────

describe('Fixes', () => {
  it('zeigt bei „als geprüft markieren" die geschriebene Zeile und schickt den Befund', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    /* In der Karte des angestaubten Befunds — dieselbe Datei steht auch im
       Widerspruch, und zwei gleiche Sätze wären kein Beleg. */
    const card = screen.getByText(STALE.title).closest('.sb-finding') as HTMLElement;
    expect(within(card).getByText(`+ reviewed: ${TODAY}`)).toBeTruthy();
    expect(within(card).getByText(`Geschrieben wird in ${PAGE_A}:`)).toBeTruthy();

    await userEvent.click(within(card).getByRole('button', { name: 'Als geprüft markieren' }));

    expect(calls('gardener:applyFix')).toEqual([{ finding: STALE }]);
  });

  it('zeigt bei „in den Katalog eintragen" die Katalogzeile und die Zieldatei', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    expect(screen.getByText('+ - [[scim]] — Nutzerverwaltung über SCIM.')).toBeTruthy();
    expect(screen.getByText(`Geschrieben wird in ${CATALOG}:`)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'In den Katalog eintragen' }));
    expect(calls('gardener:applyFix')).toEqual([{ finding: DRIFT }]);
    expect(await screen.findByText(`Geschrieben: ${CATALOG}`)).toBeTruthy();
  });

  it('sagt bei einer Aktion, die nur öffnet, dass sie nichts schreibt', async () => {
    installMock(
      handlers(REPORT, {
        'gardener:applyFix': () => ({ written: [], open: [DUMP.paths[0] as string] }),
      }),
    );
    wrap(<GardenScreen />);
    await screen.findByText('72');

    expect(screen.getByText('Schreibt nichts. Öffnet nur, wo es weitergeht.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Zum Einordnen öffnen' }));

    expect(calls('gardener:applyFix')).toEqual([{ finding: DUMP }]);
    /* Der Weg führt zu den nicht abgelegten Dumps — seit Story 006 der Filter
       auf Notizen, nicht mehr ein eigener Screen — und die Meldung behauptet
       kein Schreiben. */
    expect(await screen.findByText(`Geöffnet: ${DUMP.paths[0]}`)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/notes?filter=unfiled'),
    );
  });

  it('dreht einen Fix auf Wunsch zurück', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');
    await userEvent.click(screen.getByRole('button', { name: 'In den Katalog eintragen' }));
    await screen.findByText(`Geschrieben: ${CATALOG}`);

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    expect(calls('gardener:undoFix')).toEqual([{ undoToken: 'undo-1' }]);
    expect(await screen.findByText('Zurückgedreht.')).toBeTruthy();
  });

  it('nimmt „passt so" zurück', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    await userEvent.click(screen.getAllByRole('button', { name: 'Passt so' })[0] as HTMLElement);

    expect(calls('gardener:dismiss')).toEqual([{ id: CONTRADICTION.id }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Wieder anzeigen' }));
    expect(calls('gardener:undismiss')).toEqual([{ id: CONTRADICTION.id }]);
  });
});

// ── Widerspruch ─────────────────────────────────────────────────────────────

describe('Widerspruch', () => {
  it('stellt beide Seiten hin, bietet drei Wege und löst nichts automatisch auf', async () => {
    installMock(handlers(REPORT));
    wrap(<GardenScreen />);
    await screen.findByText('72');

    /* Beide Seiten mit ihrer Stelle: die benannte und der Ausschnitt. */
    expect(await screen.findByRole('button', { name: /Token-Lebensdauer/ })).toBeTruthy();
    expect(screen.getByText('- [[scim]] nennt eine Stunde.')).toBeTruthy();
    expect(screen.getByText('Abschnitt „Widersprüche" dieser Seite')).toBeTruthy();
    expect(
      screen.getByText('Anfang der Seite — die Stelle ist in der Datei nicht benannt'),
    ).toBeTruthy();
    expect(
      screen.getByText('Nie automatisch aufgelöst: beide Fassungen bleiben stehen.'),
    ).toBeTruthy();

    /* Weg 1: benennen — der Fix des Kerns, mit seiner Zeile. */
    expect(
      screen.getByText('+ - [[scim]] widerspricht: 15 Minuten gegen eine Stunde.'),
    ).toBeTruthy();
    /* Weg 2: die ältere als überholt markieren, mit der Frontmatter-Zeile. */
    const supersede = screen.getByRole('button', {
      name: '„Token-Lebensdauer" überholt „SCIM"',
    });
    expect(screen.getByText('+ supersedes: [scim]')).toBeTruthy();
    /* Weg 3: passt so. */
    expect(screen.getAllByRole('button', { name: 'Passt so' }).length).toBeGreaterThan(0);

    await userEvent.click(supersede);

    /* Geschrieben wird genau ein Feld, mit dem Hash, der beim Laden gelesen wurde. */
    expect(calls('modules:savePage')).toEqual([
      { path: PAGE_A, frontmatter: { supersedes: ['scim'] }, expectedHash: `hash-${PAGE_A}` },
    ]);
    expect(await screen.findByText(`Eingetragen in ${PAGE_A}.`)).toBeTruthy();

    /* Auch dieser Schreibweg hat seinen Rückweg: zurück auf den Stand von vorher,
       mit dem Hash, den der Schreibvorgang zurückgegeben hat. */
    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(calls('modules:savePage')[1]).toEqual({
      path: PAGE_A,
      frontmatter: { supersedes: [] },
      expectedHash: 'hash-neu',
    });
    expect(await screen.findByText('Zurückgedreht.')).toBeTruthy();
  });

  it('meldet eine Fremdänderung sichtbar, statt sie zu überschreiben', async () => {
    installMock(
      handlers(REPORT, {
        'modules:savePage': () => {
          throw Object.assign(new Error('conflict'), { code: 'conflict' });
        },
      }),
    );
    wrap(<GardenScreen />);
    await screen.findByText('72');

    /* Erst wenn beide Seiten geladen sind, kennt die Karte Alter und Hash. */
    await userEvent.click(
      await screen.findByRole('button', { name: '„Token-Lebensdauer" überholt „SCIM"' }),
    );

    expect(await screen.findByText(/zwischenzeitlich geändert/)).toBeTruthy();
  });
});

// ── Beinahe-Dublette ────────────────────────────────────────────────────────

describe('Beinahe-Dublette', () => {
  it('verwirft eine der beiden Seiten und bietet danach den Rückweg', async () => {
    installMock(
      handlers(NDUP_REPORT, {
        'gardener:discardPlan': () => ({
          target: {
            path: NDUP_A,
            module: MODULE,
            slug: NDUP_A_SLUG,
            type: 'source',
            title: 'Workshop-Aufzeichnung (Video)',
            hash: `hash-${NDUP_A}`,
          },
          inbound: [],
          catalogPath: CATALOG,
          catalogLine: `- [[${NDUP_A_SLUG}]] — Mitschrift, 40 Minuten.`,
          repoints: [],
        }),
        'gardener:discardPage': () => ({
          discarded: NDUP_A,
          written: [CATALOG],
          undoToken: 'undo-ndup-1',
          logged: null,
        }),
      }),
    );
    wrap(<GardenScreen />);

    /* Der Dateiname steht auf dem Knopf — nie „diese Seite verwerfen", sonst
       wüsste man bei zwei Seiten auf einer Karte nicht, welche gemeint ist. */
    const discardButtonA = await screen.findByRole('button', {
      name: `„${NDUP_A_FILE}" verwerfen`,
    });
    await userEvent.click(discardButtonA);

    /* Die Vorschau steht, bevor irgendetwas geschrieben wird: keine Verweise,
       die abbrechen würden, und die Katalogzeile, die verschwindet. */
    expect(await screen.findByText('Keine andere Seite verlinkt darauf.')).toBeTruthy();
    expect(screen.getByText(`- - [[${NDUP_A_SLUG}]] — Mitschrift, 40 Minuten.`)).toBeTruthy();
    expect(calls('gardener:discardPage')).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(calls('gardener:discardPage')).toEqual([
      { path: NDUP_A, expectedHash: `hash-${NDUP_A}` },
    ]);
    /* Nie „geschrieben" für eine Seite, die im Papierkorb liegt. */
    expect(await screen.findByText(`„${NDUP_A}" liegt jetzt im Papierkorb.`)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(calls('gardener:undoFix')).toEqual([{ undoToken: 'undo-ndup-1' }]);
    expect(await screen.findByText('Zurückgedreht.')).toBeTruthy();
  });

  it('zeigt eine Fremdänderung im Verwerfen-Dialog, statt sie zu verschweigen', async () => {
    installMock(
      handlers(NDUP_REPORT, {
        'gardener:discardPlan': () => ({
          target: {
            path: NDUP_A,
            module: MODULE,
            slug: NDUP_A_SLUG,
            type: 'source',
            title: 'Workshop-Aufzeichnung (Video)',
            hash: `hash-${NDUP_A}`,
          },
          inbound: [],
          catalogPath: CATALOG,
          catalogLine: `- [[${NDUP_A_SLUG}]] — Mitschrift, 40 Minuten.`,
          repoints: [],
        }),
        'gardener:discardPage': () => {
          throw Object.assign(new Error('conflict'), { code: 'conflict' });
        },
      }),
    );
    wrap(<GardenScreen />);

    await userEvent.click(
      await screen.findByRole('button', { name: `„${NDUP_A_FILE}" verwerfen` }),
    );
    await screen.findByText('Keine andere Seite verlinkt darauf.');
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    /* Sichtbar im Dialog, mit dem Dateinamen als Subjekt — nicht irgendwo
       verschluckt und nicht als stiller Fehlschlag. */
    expect(
      await screen.findByText(
        `„${NDUP_A_FILE}" wurde zwischenzeitlich geändert. Nichts wurde überschrieben.`,
      ),
    ).toBeTruthy();
    /* Der Dialog bleibt offen: nichts wurde verwerfen, der Nutzer entscheidet neu. */
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeTruthy();
  });

  it('benennt "überholt" mit Datei und Feld vor dem Klick, schreibt danach und bietet den Rückweg', async () => {
    installMock(
      handlers(NDUP_REPORT, {
        'gardener:supersede': () => ({
          written: NDUP_A,
          undoToken: 'undo-ndup-2',
          logged: null,
        }),
      }),
    );
    wrap(<GardenScreen />);

    await screen.findByText(NDUP.title);
    /* Beide Seiten tragen dasselbe Anlegedatum (die Attrappe für `modules:page`
       gibt beiden `2026-01-01`) — deshalb gibt es keinen Vorschlag, und ein
       Mensch muss zuerst wählen. */
    expect(
      screen.getByText(
        'Kein Vorschlag: Bei einer Seite fehlt das Erstelldatum, oder beide tragen dasselbe. Ein Mensch entscheidet hier.',
      ),
    ).toBeTruthy();

    /* Der Radio-Knopf steht von Anfang an da, aber gesperrt, solange die Seite
       noch lädt — erst wenn beide Seiten geladen sind, darf man wählen. */
    const radioA = (await screen.findByRole('radio', {
      name: `„${NDUP_A_FILE}" ist die neuere Seite`,
    })) as HTMLInputElement;
    await waitFor(() => expect(radioA.disabled).toBe(false));
    await userEvent.click(radioA);

    /* Die Vorschau nennt Datei und Feld, bevor irgendetwas geschrieben wird. */
    expect(
      screen.getByText(
        `Trägt supersedes: [${NDUP_B_SLUG}] in ${NDUP_A} ein. Beide Seiten bleiben stehen, die ältere ist damit als überholt markiert.`,
      ),
    ).toBeTruthy();
    expect(screen.getByText(`+ supersedes: [${NDUP_B_SLUG}]`)).toBeTruthy();

    const supersedeButton = screen.getByRole('button', {
      name: `Überholt: ${NDUP_B_FILE} → ${NDUP_A_FILE}`,
    });
    await userEvent.click(supersedeButton);

    expect(calls('gardener:supersede')).toEqual([
      { newerPath: NDUP_A, olderPath: NDUP_B, expectedHash: `hash-${NDUP_A}` },
    ]);
    expect(await screen.findByText(`Geschrieben: ${NDUP_A}`)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(calls('gardener:undoFix')).toEqual([{ undoToken: 'undo-ndup-2' }]);
    expect(await screen.findByText('Zurückgedreht.')).toBeTruthy();
  });

  it('behauptet nicht „schon benannt", wenn eine der beiden Seiten nicht lesbar ist', async () => {
    installMock(
      handlers(NDUP_REPORT, {
        /* Der Zustand nach einem Verwerfen auf dieser Karte: die Seite ist weg,
           der Befund steht bis zum nächsten Lauf weiter da. */
        'modules:page': ({ path }) => {
          if (path === NDUP_A) throw Object.assign(new Error('nicht da'), { code: 'not-found' });
          return pageDoc(
            path,
            'Workshop-Aufzeichnung (Video)',
            'Mitschrift, 40 Minuten. Rollen und Mandanten.\n',
            '2026-01-01',
          );
        },
      }),
    );
    wrap(<GardenScreen />);
    await screen.findByText(NDUP.title);

    /* Die noch lesbare Seite darf gewählt werden — die fehlende ist gesperrt. */
    const radioB = (await screen.findByRole('radio', {
      name: `„${NDUP_B_FILE}" ist die neuere Seite`,
    })) as HTMLInputElement;
    await waitFor(() => expect(radioB.disabled).toBe(false));
    await userEvent.click(radioB);

    /* Über das Frontmatter einer Seite, die sie nicht lesen konnte, weiß die Karte
       nichts — „schon eingetragen" wäre eine Behauptung über eine Datei, die sie
       nie gesehen hat. */
    expect(
      screen.queryByText('Diese Beziehung ist schon eingetragen. Es gibt nichts zu schreiben.'),
    ).toBeNull();
    expect(screen.getByText(/vielleicht liegt sie schon im Papierkorb/)).toBeTruthy();
    /* Und geschrieben wird nichts: es gibt keinen Knopf dafür. */
    expect(screen.queryByRole('button', { name: /^Überholt:/ })).toBeNull();
    expect(calls('gardener:supersede')).toEqual([]);
  });
});

describe('Verwaiste Seite: Ziel wählen', () => {
  it('bietet die Modulübersicht als Ein-Klick-Weg und eine Auswahl für den Rest — nie nur "Passt so"', async () => {
    installMock(handlers(ORPHAN_REPORT, { 'gardener:orphanTargets': () => ORPHAN_TARGETS_SMALL }));
    wrap(<GardenScreen />);

    await screen.findByText(ORPHAN.title);
    expect(
      await screen.findByRole('button', {
        name: `Von der Übersicht des Moduls „${MODULE}" aus verlinken`,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Andere Seite wählen' })).toBeTruthy();
    /* „Passt so" bleibt stehen, ist aber nicht die einzige Handlung auf der Karte. */
    expect(screen.getByRole('button', { name: 'Passt so' })).toBeTruthy();
  });

  it('zeigt beim Ein-Klick-Weg Zeile und Zieldatei vor jedem Schreiben — und schreibt erst nach dem Bestätigen', async () => {
    installMock(
      handlers(ORPHAN_REPORT, {
        'gardener:orphanTargets': () => ORPHAN_TARGETS_SMALL,
        'gardener:linkOrphan': () => ({ written: [OVERVIEW_PATH], undoToken: 'undo-orphan-1' }),
      }),
    );
    wrap(<GardenScreen />);

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Von der Übersicht des Moduls „${MODULE}" aus verlinken`,
      }),
    );

    /* Die Vorschau steht, bevor irgendetwas geschrieben wird. */
    expect(await screen.findByText(`Geschrieben wird in ${OVERVIEW_PATH}:`)).toBeTruthy();
    expect(screen.getByText(`+ ${ORPHAN_LINE}`)).toBeTruthy();
    expect(calls('gardener:linkOrphan')).toEqual([]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Verweis in „overview.md" eintragen' }),
    );

    expect(calls('gardener:linkOrphan')).toEqual([{ findingId: ORPHAN.id, target: OVERVIEW_PATH }]);
    expect(await screen.findByText(`Geschrieben: ${OVERVIEW_PATH}`)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(calls('gardener:undoFix')).toEqual([{ undoToken: 'undo-orphan-1' }]);
    expect(await screen.findByText('Zurückgedreht.')).toBeTruthy();
  });

  it('schränkt die Auswahl per Suche nach Titel ein — eine Anfrage ohne Treffer sagt das, statt eine leere Liste zu zeigen', async () => {
    installMock(handlers(ORPHAN_REPORT, { 'gardener:orphanTargets': () => ORPHAN_TARGETS_MANY }));
    wrap(<GardenScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Andere Seite wählen' }));

    const search = await screen.findByLabelText('Seite suchen');
    const select = screen.getByRole('combobox', { name: 'Zielseite wählen' });
    expect(within(select).getAllByRole('option')).toHaveLength(1 + MANY_OTHERS.length);

    await userEvent.type(search, 'Seite 3');
    const narrowed = within(select).getAllByRole('option');
    expect(narrowed).toHaveLength(2);
    expect(within(select).getByText('Andere Seite 3')).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.type(search, 'nichts passendes');
    expect(await screen.findByText('Keine Seite passt zu „nichts passendes".')).toBeTruthy();
  });

  it('sagt ehrlich, dass es in diesem Modul nichts zu verlinken gibt, statt eine leere Auswahl zu zeigen', async () => {
    installMock(handlers(ORPHAN_REPORT, { 'gardener:orphanTargets': () => ORPHAN_TARGETS_EMPTY }));
    wrap(<GardenScreen />);

    expect(
      await screen.findByText(
        'Keine andere Seite in diesem Modul, auf die verwiesen werden könnte.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /verlinken/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Andere Seite wählen' })).toBeNull();
    /* „Passt so" steht da, ist aber selbst hier — ganz ohne Kandidaten — nicht
       die einzige Handlung: das Verwerfen (016 D6) bleibt eine echte
       Alternative, kein bloßer Wegwisch-Knopf. */
    expect(screen.getByRole('button', { name: 'Passt so' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `„${ORPHAN_FILE}" verwerfen` })).toBeTruthy();
  });

  it('lässt den Einzelkandidaten-Befund unverändert: gewöhnliche Karte, ein Klick, keine Auswahl', async () => {
    installMock(handlers(ORPHAN_SINGLE_REPORT));
    wrap(<GardenScreen />);

    await screen.findByText(ORPHAN_SINGLE.title);
    expect(screen.getByRole('button', { name: ORPHAN_SINGLE.fix?.label as string })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Andere Seite wählen' })).toBeNull();
    expect(calls('gardener:orphanTargets')).toEqual([]);
  });

  /* 016 D6: derselbe geteilte Verwerfen-Weg aus 015 als dritter Ausweg —
     dieselbe Beschriftung, kein zweiter Dialog. Ohne `keep`, weil eine
     verwaiste Seite per Definition nichts hat, worauf umzubiegen wäre. */
  it('bietet das Verwerfen als dritten Weg — ehrlich, dass nichts umzubiegen ist', async () => {
    installMock(
      handlers(ORPHAN_REPORT, {
        'gardener:orphanTargets': () => ORPHAN_TARGETS_SMALL,
        'gardener:discardPlan': () => ({
          target: {
            path: ORPHAN_PAGE,
            module: MODULE,
            slug: ORPHAN_SLUG,
            type: 'concept',
            title: 'Verwaiste Seite',
            hash: `hash-${ORPHAN_PAGE}`,
          },
          inbound: [],
          catalogPath: CATALOG,
          catalogLine: null,
          repoints: [],
        }),
        'gardener:discardPage': () => ({
          discarded: ORPHAN_PAGE,
          written: [],
          undoToken: 'undo-orphan-discard-1',
          logged: null,
        }),
      }),
    );
    wrap(<GardenScreen />);

    await screen.findByText(ORPHAN.title);
    const discardButton = await screen.findByRole('button', {
      name: `„${ORPHAN_FILE}" verwerfen`,
    });
    await userEvent.click(discardButton);

    /* Die verwaiste Seite hat per Definition keine eingehenden Verweise —
       und ohne `keep` gibt es kein Kästchen zum Umbiegen. */
    expect(await screen.findByText('Keine andere Seite verlinkt darauf.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(calls('gardener:discardPage')).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    /* Kein `keep` im Aufruf: nichts, worauf umgebogen werden könnte. */
    expect(calls('gardener:discardPage')).toEqual([
      { path: ORPHAN_PAGE, expectedHash: `hash-${ORPHAN_PAGE}` },
    ]);
    expect(await screen.findByText(`„${ORPHAN_PAGE}" liegt jetzt im Papierkorb.`)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(calls('gardener:undoFix')).toEqual([{ undoToken: 'undo-orphan-discard-1' }]);
    expect(await screen.findByText('Zurückgedreht.')).toBeTruthy();
  });

  it('verschweigt nicht, wenn seit dem Lauf doch etwas auf die verwaiste Seite verweist', async () => {
    installMock(
      handlers(ORPHAN_REPORT, {
        'gardener:orphanTargets': () => ORPHAN_TARGETS_SMALL,
        'gardener:discardPlan': () => ({
          target: {
            path: ORPHAN_PAGE,
            module: MODULE,
            slug: ORPHAN_SLUG,
            type: 'concept',
            title: 'Verwaiste Seite',
            hash: `hash-${ORPHAN_PAGE}`,
          },
          inbound: [
            {
              path: OTHER_A,
              module: MODULE,
              slug: 'andere-seite-a',
              type: 'concept',
              title: 'Andere Seite A',
            },
          ],
          catalogPath: CATALOG,
          catalogLine: `- [[${ORPHAN_SLUG}]] — Verwaiste Seite.`,
          repoints: [],
        }),
      }),
    );
    wrap(<GardenScreen />);

    await userEvent.click(
      await screen.findByRole('button', { name: `„${ORPHAN_FILE}" verwerfen` }),
    );

    /* Ohne `keep` gibt es nichts, worauf die Karte umbiegen könnte — die Karte
       verschweigt das nicht, sondern sagt es offen, statt ein Kästchen
       anzubieten, das hier keinen Sinn ergäbe. */
    expect(await screen.findByText('1 Seite verlinkt auf diese Seite.')).toBeTruthy();
    expect(
      screen.getByText(
        'Diese Links würden brechen — es gibt keine Zielseite, auf die sie umgebogen werden.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

// ── Kachel ──────────────────────────────────────────────────────────────────

describe('Pflege-Kachel', () => {
  function dashboard(healthKnown: boolean) {
    return {
      reminders: [],
      recentWork: [],
      staleProjects: [],
      todos: { work: [], private: [] },
      waitingOn: [],
      inboxCount: 0,
      journal: { streak: 0, lastEntry: null, moodTrend: [] },
      health: healthKnown ? 72 : 0,
      findingCount: healthKnown ? 5 : 0,
      healthKnown,
      sessions: [],
    };
  }

  it('zeigt ohne Lauf keine Zahl, sondern den Weg zum Prüfen', async () => {
    installMock({ ...handlers(null), 'dashboard:data': () => dashboard(false) });
    wrap(<GardenerTile />);

    expect(await screen.findByText(/Noch nicht geprüft/)).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('100')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Jetzt prüfen' }));
    expect(screen.getByTestId('location').textContent).toBe('/garden');
  });

  it('zeigt mit Lauf Wert, Zahl und die zwei dringendsten Arten', async () => {
    installMock({ ...handlers(REPORT), 'dashboard:data': () => dashboard(true) });
    wrap(<GardenerTile />);

    expect(await screen.findByText('72')).toBeTruthy();
    expect(screen.getByText('5 Befunde')).toBeTruthy();
    expect(await screen.findByText('1 Widerspruch')).toBeTruthy();
    expect(screen.getByText('1 liegengebliebener Dump')).toBeTruthy();
    /* Nur die zwei dringendsten. */
    expect(screen.queryByText('1 angestaubte Seite')).toBeNull();
  });
});

// ── Erinnerungen ruhig stellen ──────────────────────────────────────────────

describe('Ruhig stellen', () => {
  function reminderHandlers(): SbHandlers {
    return {
      ...handlers(null),
      'reminders:list': () => [REMINDER],
      'reminders:snooze': () => undefined,
      'reminders:unsnooze': () => undefined,
      'settings:get': () => ({
        app: {
          version: 1,
          lastVault: 'C:/vaults/demo',
          recentVaults: [],
          theme: 'dark' as const,
          customization: { background: 'none' as const, appIcon: 'knowledge-garden' as const },
          uiLanguage: 'de' as const,
          window: { width: 1440, height: 900 },
          startMinimized: false,
          onboarded: true,
        },
        vault: null,
      }),
    };
  }

  it('bietet vier Wege und schickt den Abstand zum genannten Tag', async () => {
    installMock(reminderHandlers());
    wrap(<DeadlinesTile />);
    await screen.findByText(REMINDER.title);

    await userEvent.click(
      screen.getByRole('button', { name: `„${REMINDER.title}" ruhig stellen` }),
    );
    const panel = screen.getByRole('group', { name: 'Wieder erinnern' });
    expect(within(panel).getAllByRole('button')).toHaveLength(4);

    await userEvent.click(within(panel).getByRole('button', { name: /Nächste Woche/ }));

    expect(calls('reminders:snooze')).toEqual([{ id: REMINDER.id, days: 7 }]);
  });

  it('rechnet ein eigenes Datum in Tage um und bietet den Rückweg', async () => {
    installMock(reminderHandlers());
    wrap(<DeadlinesTile />);
    await screen.findByText(REMINDER.title);
    await userEvent.click(
      screen.getByRole('button', { name: `„${REMINDER.title}" ruhig stellen` }),
    );

    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(
      target.getDate(),
    ).padStart(2, '0')}`;
    const field = screen.getByLabelText('Wieder erinnern am');
    await userEvent.clear(field);
    await userEvent.type(field, iso);
    await userEvent.click(screen.getByRole('button', { name: 'Ruhig stellen' }));

    expect(calls('reminders:snooze')).toEqual([{ id: REMINDER.id, days: 5 }]);
    /* Jede Ruhigstellung trägt ihren Rückweg. */
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    expect(calls('reminders:unsnooze')).toEqual([{ id: REMINDER.id }]);
  });

  it('lehnt einen Tag ab, der nichts ruhig stellen würde', async () => {
    installMock(reminderHandlers());
    wrap(<DeadlinesTile />);
    await screen.findByText(REMINDER.title);
    await userEvent.click(
      screen.getByRole('button', { name: `„${REMINDER.title}" ruhig stellen` }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ruhig stellen' }));

    expect(screen.getByText('Dieser Tag ist nicht in der Zukunft.')).toBeTruthy();
    expect(calls('reminders:snooze')).toEqual([]);
  });
});

// ── A11y ────────────────────────────────────────────────────────────────────

describe('Bedienbarkeit', () => {
  it('hat keinen A11y-Verstoß, auch nicht in der Widerspruchs-Karte', async () => {
    installMock(handlers(REPORT));
    const { container } = wrap(<GardenScreen />);
    await screen.findByText('72');
    await screen.findByText('- [[scim]] nennt eine Stunde.');

    await expectNoViolations(container);
  });

  it('hat auch ohne Lauf und mit offener Snooze-Auswahl keinen Verstoß', async () => {
    installMock(handlers(null));
    const empty = wrap(<GardenScreen />);
    await screen.findByText('Noch nicht geprüft');
    await expectNoViolations(empty.container);
    empty.unmount();

    installMock({
      ...handlers(null),
      'reminders:list': () => [REMINDER],
      'reminders:snooze': () => undefined,
    });
    const tile = wrap(<DeadlinesTile />);
    await screen.findByText(REMINDER.title);
    await userEvent.click(
      screen.getByRole('button', { name: `„${REMINDER.title}" ruhig stellen` }),
    );
    await expectNoViolations(tile.container);
  });
});
