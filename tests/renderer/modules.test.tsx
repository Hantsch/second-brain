// @vitest-environment jsdom
/* Der Modul-Screen: Wissen sichtbar machen.
 *
 * Der Prüfstein ist, dass die Ansicht die Datei zeigt und nicht eine Deutung
 * davon: der Rumpf mit klickbaren Wikilinks, die Fakten aus dem Frontmatter, wer
 * hierher verlinkt — und ein kaputter Wikilink, der als kaputt zu erkennen ist.
 *
 * Dazu die zwei Stellen, an denen Dateien wirklich auf dem Spiel stehen:
 * Speichern mit veraltetem Hash (nichts wird überschrieben, die Meldung ist
 * ehrlich) und der Graph, der bei zu vielen Knoten sagt, dass er kappt.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { KnowledgeModule, VaultDoc, WikiPage } from '@shared/types';
import { WikiGraph } from '@renderer/components/WikiGraph';
import { ModulesScreen } from '@renderer/screens/modules/ModulesScreen';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';

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
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

/* Die Adresse ist der Zustand — also wird sie hier auch gelesen. Ohne diese
   Sonde prüft ein Reiter-Test nur, was auf dem Schirm steht, nicht was im Link
   landet, den morgen jemand verschickt. */
function Address() {
  const location = useLocation();
  return <span data-testid="address">{location.search}</span>;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

const NOW = '2026-08-10T14:32:00+02:00';
const MODULE = 'identity-management';
const OAUTH = `modules/${MODULE}/wiki/entities/oauth2.md`;
const TOKEN = `modules/${MODULE}/wiki/concepts/token-lebensdauer.md`;

const knowledgeModule: KnowledgeModule = {
  slug: MODULE,
  title: 'Identitätsmanagement',
  description: 'Anmeldung, Rollen und Mandanten bei Orbit Identity.',
  created: '2025-12-13',
  updated: NOW,
  counts: { sources: 1, entities: 2, concepts: 1 },
  findingCount: 2,
  lastIngest: NOW,
  tags: ['auth'],
};

function page(patch: Partial<WikiPage> & { path: string }): WikiPage {
  return {
    module: MODULE,
    slug: 'oauth2',
    title: 'OAuth 2.1',
    type: 'entity',
    created: '2026-01-07',
    updated: NOW,
    tags: ['auth'],
    sources: [],
    outbound: [],
    inbound: [],
    excerpt: '',
    wordCount: 42,
    ...patch,
  };
}

const oauth = page({
  path: OAUTH,
  slug: 'oauth2',
  title: 'OAuth 2.1',
  sources: ['s-2026-08-04-token-lifetimes-blog'],
  outbound: [`${MODULE}/token-lebensdauer`],
});

const token = page({
  path: TOKEN,
  slug: 'token-lebensdauer',
  title: 'Token-Lebensdauer',
  type: 'concept',
  inbound: [`${MODULE}/oauth2`],
});

const source = page({
  path: `modules/${MODULE}/wiki/sources/s-2026-08-04-token-lifetimes-blog.md`,
  slug: 's-2026-08-04-token-lifetimes-blog',
  title: 'Blogartikel: Kurze Token',
  type: 'source',
});

const PAGES: WikiPage[] = [oauth, token, source];

const BODIES: Record<string, string> = {
  [OAUTH]:
    'Autorisierungsprotokoll. PKCE ist Pflicht (source: [[s-2026-08-04-token-lifetimes-blog]]).\n\nWie lange Tokens leben, steht in [[token-lebensdauer]].\n\nFür Geräte ohne Browser wäre [[device-code-flow]] der Weg.\n',
  [TOKEN]: 'Access-Token 15 Minuten, Refresh-Token 8 Stunden.\n',
  [source.path]: 'Praxisbericht eines Teams.\n',
};

function doc(path: string, hash = 'hash-1'): VaultDoc {
  return {
    path,
    frontmatter: {
      type: path.includes('/concepts/') ? 'concept' : 'entity',
      title: PAGES.find((entry) => entry.path === path)?.title ?? path,
      created: '2026-01-07',
      updated: '2026-06-11',
      reviewed: '2026-06-11',
    },
    body: BODIES[path] ?? '',
    hash,
    modified: NOW,
    size: 512,
  };
}

const LOG = `# Chronik

## [2026-08-04] ingest | Blogartikel zu Token-Lebensdauern

- summary: wiki/sources/s-2026-08-04-token-lifetimes-blog.md
- touched: [[token-lebensdauer]], [[oauth2]], index.md
- notes: Widerspruch benannt statt plattgebügelt
`;

function renderScreen(extra: Handlers = {}, at = `/modules?m=${MODULE}&p=${OAUTH}`) {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
      indexRefreshFailedAt: null,
    }),
    'modules:list': () => [knowledgeModule],
    'modules:pages': () => PAGES,
    'modules:page': ({ path }) => {
      const found = PAGES.find((entry) => entry.path === path);
      return found === undefined ? null : { page: found, doc: doc(path) };
    },
    'modules:sources': () => [],
    'ingest:jobs': () => [],
    'ingest:ytdlpStatus': () => ({ available: false, path: null, version: null }),
    'modules:graph': () => ({
      nodes: PAGES.map((entry) => ({
        id: `${entry.module}/${entry.slug}`,
        title: entry.title,
        type: entry.type,
      })),
      edges: [[`${MODULE}/oauth2`, `${MODULE}/token-lebensdauer`]],
    }),
    'vault:read': () => ({ ...doc(OAUTH), path: `modules/${MODULE}/wiki/log.md`, body: LOG }),
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <ModulesScreen />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  /* Der Client kommt mit zurück: eine externe Änderung erreicht den Renderer über
     `event:vault-changed` → Invalidierung. Das Ereignis selbst hängt in `App`; hier
     wird derselbe Weg von Hand gegangen. */
  return { sb, container, client, address: () => screen.getByTestId('address').textContent };
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
});

describe('Module: Übersicht', () => {
  it('zeigt Karten mit Zählungen, letztem Ingest und offenen Befunden', async () => {
    renderScreen({}, '/modules');

    expect(await screen.findByText('Identitätsmanagement')).toBeTruthy();
    expect(screen.getByText('1 Quellen · 2 Entitäten · 1 Konzepte')).toBeTruthy();
    expect(screen.getByText('2 Befunde aus der Pflege')).toBeTruthy();
  });

  it('erklärt im Dialog in einem Satz, was ein Modul ist', async () => {
    renderScreen({}, '/modules');
    await screen.findByText('Identitätsmanagement');

    await userEvent.click(screen.getByRole('button', { name: 'Modul anlegen' }));

    const dialog = await screen.findByRole('dialog', { name: 'Modul anlegen' });
    expect(within(dialog).getByText(/Ein Modul ist ein kleines Wiki/)).toBeTruthy();
    expect(within(dialog).getByLabelText('Titel')).toBeTruthy();
    expect(within(dialog).getByLabelText('Zweck')).toBeTruthy();
  });

  it('legt ein Modul mit Titel und Zweck an', async () => {
    const { sb } = renderScreen(
      { 'modules:create': ({ title }) => ({ ...knowledgeModule, slug: 'zweites-hirn', title }) },
      '/modules',
    );
    await screen.findByText('Identitätsmanagement');

    await userEvent.click(screen.getByRole('button', { name: 'Modul anlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modul anlegen' });
    await userEvent.type(within(dialog).getByLabelText('Titel'), 'Zweites Hirn');
    await userEvent.type(within(dialog).getByLabelText('Zweck'), 'Methodik.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'modules:create')?.payload).toEqual({
        title: 'Zweites Hirn',
        description: 'Methodik.',
      }),
    );
  });
});

describe('Wissen: die Reiter des Screens', () => {
  /* `tab` heißt zweierlei — mit `m` der Reiter des Moduls, ohne `m` der des
     Screens. `sources` ist in beiden Sätzen ein gültiger Wert; wer den falschen
     Satz liest, öffnet still die falsche Ansicht. Deshalb prüfen diese Tests
     nicht nur den Schirm, sondern auch die Adresse. */

  it('schaltet auf die Quellen-Werkbank und schreibt den Reiter in die Adresse', async () => {
    const { address } = renderScreen({}, '/modules');
    await screen.findByText('Identitätsmanagement');

    await userEvent.click(screen.getByRole('tab', { name: 'Quellen' }));

    expect(await screen.findByLabelText('URL, YouTube-Link oder Text')).toBeTruthy();
    expect(address()).toBe('?tab=sources');

    /* Und zurück: der Standardreiter steht nicht in der Adresse. */
    await userEvent.click(screen.getByRole('tab', { name: 'Module' }));
    expect(await screen.findByText('1 Quellen · 2 Entitäten · 1 Konzepte')).toBeTruthy();
    expect(address()).toBe('');
  });

  it('zeigt bei ?tab=sources die volle Werkbank, nicht nur einen Ausschnitt', async () => {
    renderScreen({}, '/modules?tab=sources');

    expect(await screen.findByLabelText('URL, YouTube-Link oder Text')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aufnehmen' })).toBeTruthy();
    expect(screen.getByLabelText('Zielmodul')).toBeTruthy();
    /* Der Bestand kommt aus einer eigenen Abfrage — leer heißt hier: die vier
       Wege herein stehen da, nicht bloß ein Ladebalken. */
    expect(await screen.findByText('Vier Wege herein')).toBeTruthy();
  });

  it('zeigt die Werkbank auch in einem Vault ganz ohne Modul', async () => {
    /* Der frische Vault ist genau der Fall, in dem jemand hierher kommt: der
       Leerzustand gehört dem Modul-Reiter, nicht dem Screen — sonst wäre der
       Weg zu, über den das erste Modul überhaupt Inhalt bekommt. */
    renderScreen({ 'modules:list': () => [] }, '/modules?tab=sources');

    expect(await screen.findByLabelText('URL, YouTube-Link oder Text')).toBeTruthy();
    expect(screen.queryByText('Noch kein Wissens-Modul im Vault')).toBeNull();

    /* Auf dem Modul-Reiter daneben steht er sehr wohl. */
    await userEvent.click(screen.getByRole('tab', { name: 'Module' }));
    expect(await screen.findByText('Noch kein Wissens-Modul im Vault')).toBeTruthy();
  });

  it('führt ?m=…&tab=log&p=… weiterhin in die Chronik des Moduls', async () => {
    const { address } = renderScreen({}, `/modules?m=${MODULE}&tab=log&p=${OAUTH}`);

    expect(await screen.findByText('Quelle aufgenommen')).toBeTruthy();
    /* Über einem Modul steht kein Screen-Reiter: die Reiter hier sind seine. */
    expect(screen.queryByRole('tab', { name: 'Module' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Protokoll' })).toBeTruthy();
    expect(address()).toBe(`?m=${MODULE}&tab=log&p=${OAUTH}`);
  });

  it('lässt keinen Reiter in den falschen Namensraum durchschlagen', async () => {
    const { address } = renderScreen({}, `/modules?m=${MODULE}&tab=log`);
    await screen.findByText('Quelle aufgenommen');

    /* `log` ist kein Reiter des Screens — beim Verlassen des Moduls fällt er weg. */
    await userEvent.click(screen.getByRole('button', { name: 'Alle Module' }));
    expect(await screen.findByRole('tab', { name: 'Module' })).toBeTruthy();
    expect(address()).toBe('');

    /* Und umgekehrt: `sources` des Screens landet nicht in der Adresse eines
       Moduls — dort hieße es „Quellen dieses Moduls". */
    await userEvent.click(screen.getByRole('tab', { name: 'Quellen' }));
    expect(address()).toBe('?tab=sources');
    await userEvent.click(screen.getByRole('tab', { name: 'Module' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Modul Identitätsmanagement öffnen' }),
    );
    expect(address()).toBe(`?m=${MODULE}`);
  });
});

describe('Wissen: Zielmodul vorbelegen', () => {
  /* `into` ist ein Startwert, kein Zustand: es setzt den Zielmodul-Wähler der
     Werkbank vor. Deshalb wird hier immer beides geprüft — was im Wähler steht
     und was in der Adresse landet. */

  const targetModule = () => screen.getByLabelText<HTMLSelectElement>('Zielmodul');

  it('belegt den Zielmodul-Wähler aus ?into= vor', async () => {
    renderScreen({}, `/modules?tab=sources&into=${MODULE}`);

    await screen.findByLabelText('URL, YouTube-Link oder Text');
    expect(targetModule().value).toBe(MODULE);
  });

  it('bleibt ohne ?into= auf „Später einordnen"', async () => {
    renderScreen({}, '/modules?tab=sources');

    await screen.findByLabelText('URL, YouTube-Link oder Text');
    expect(targetModule().value).toBe('');
  });

  it('erfindet kein Ziel, wenn ?into= kein Modul benennt', async () => {
    /* Gelöscht oder vertippt: der Wähler fällt auf „Später einordnen" zurück,
       statt eine Quelle in ein Modul zu schreiben, das es nicht gibt. */
    renderScreen({}, '/modules?tab=sources&into=geloeschtes-modul');

    await screen.findByLabelText('URL, YouTube-Link oder Text');
    expect(targetModule().value).toBe('');
  });

  it('zeigt die Werkbank auch mit ?into=, während der Index noch gebaut wird', async () => {
    /* Solange `indexing` läuft, ist die Modulliste abgeschaltet — sie kommt nie
       an. Würde der Startwert darauf warten, stünde statt der Werkbank ein
       Skelett, das auf nichts wartet: ausgerechnet im frischen Vault, für den
       man den Quellen-Reiter überhaupt öffnet. */
    renderScreen(
      {
        'vault:status': () => ({
          root: 'C:/vaults/demo',
          name: 'Demo',
          ready: false,
          docCount: 0,
          indexedAt: null,
          indexing: true,
          indexRefreshFailedAt: null,
        }),
      },
      `/modules?tab=sources&into=${MODULE}`,
    );

    expect(await screen.findByLabelText('URL, YouTube-Link oder Text')).toBeTruthy();
    /* Ohne Liste ist kein Ziel prüfbar — „Später einordnen" statt einer
       Behauptung über ein Modul, das noch niemand gelesen hat. */
    expect(targetModule().value).toBe('');
  });

  it('führt vom Quellen-Reiter eines Moduls mit einem Klick in die vorbelegte Werkbank', async () => {
    const { address } = renderScreen({}, `/modules?m=${MODULE}&tab=sources`);

    /* Der Leerzustand ist genau der Moment, in dem man eine Quelle will. */
    expect(
      await screen.findByText(/Für dieses Modul ist noch keine Rohquelle verdichtet/),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Quelle in dieses Modul aufnehmen' }));

    expect(await screen.findByLabelText('URL, YouTube-Link oder Text')).toBeTruthy();
    expect(address()).toBe(`?tab=sources&into=${MODULE}`);
    expect(targetModule().value).toBe(MODULE);
  });

  it('trägt ?into= nur auf dem Quellen-Reiter mit', async () => {
    const { address } = renderScreen({}, `/modules?tab=sources&into=${MODULE}`);
    await screen.findByLabelText('URL, YouTube-Link oder Text');

    /* Auf dem Reiter selbst bleibt der Startwert stehen. */
    await userEvent.click(screen.getByRole('tab', { name: 'Quellen' }));
    expect(address()).toBe(`?tab=sources&into=${MODULE}`);

    /* Daneben nicht: für die Modulliste heißt „into" nichts. */
    await userEvent.click(screen.getByRole('tab', { name: 'Module' }));
    expect(await screen.findByText('1 Quellen · 2 Entitäten · 1 Konzepte')).toBeTruthy();
    expect(address()).toBe('');

    /* Und in der Adresse eines Moduls taucht es nie auf — dort läse es sich
       als „Quellen dieses Moduls" und meinte etwas anderes. */
    await userEvent.click(
      await screen.findByRole('button', { name: 'Modul Identitätsmanagement öffnen' }),
    );
    expect(address()).toBe(`?m=${MODULE}`);
  });
});

describe('Module: Seite', () => {
  it('rendert den Rumpf, die Fakten und die eingehenden Verweise', async () => {
    renderScreen({}, `/modules?m=${MODULE}&p=${TOKEN}`);

    expect(await screen.findByRole('heading', { name: 'Token-Lebensdauer' })).toBeTruthy();
    expect(screen.getByText(/Access-Token 15 Minuten/)).toBeTruthy();
    /* Fakten aus dem Frontmatter, nicht geraten: `updated` und `reviewed`
       stehen beide auf dem Tag aus der Datei. */
    expect(screen.getByText('Konzept')).toBeTruthy();
    expect(screen.getAllByText('2026-06-11')).toHaveLength(2);
    expect(screen.getByText('Geprüft')).toBeTruthy();
    /* „Verlinkt hierher" nennt die Seite mit ihrem Titel. */
    const inbound = screen.getByRole('button', {
      name: /Seite identity-management\/oauth2 öffnen/,
    });
    expect(inbound.textContent).toContain('OAuth 2.1');
  });

  it('navigiert über einen Wikilink zur Zielseite', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'OAuth 2.1' });

    await userEvent.click(screen.getByRole('button', { name: 'Seite token-lebensdauer öffnen' }));

    expect(await screen.findByRole('heading', { name: 'Token-Lebensdauer' })).toBeTruthy();
  });

  it('markiert einen kaputten Wikilink als kaputt', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'OAuth 2.1' });

    const broken = screen.getByRole('button', { name: 'Seite device-code-flow gibt es nicht' });
    expect(broken.className).toContain('sb-wikilink--missing');
    expect(broken.textContent).toContain('fehlt');
    /* Und der gültige Link daneben sieht anders aus. */
    expect(
      screen.getByRole('button', { name: 'Seite token-lebensdauer öffnen' }).className,
    ).not.toContain('sb-wikilink--missing');
  });

  it('schickt beim Speichern den gelesenen Hash mit', async () => {
    const { sb } = renderScreen(
      {
        'modules:savePage': () => ({ path: TOKEN, hash: 'hash-2', created: false }),
      },
      `/modules?m=${MODULE}&p=${TOKEN}`,
    );
    await screen.findByRole('heading', { name: 'Token-Lebensdauer' });

    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    const field = screen.getByLabelText('Markdown dieser Seite');
    await userEvent.clear(field);
    await userEvent.type(field, 'Von mir umgeschrieben.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'modules:savePage')?.payload).toEqual({
        path: TOKEN,
        body: 'Von mir umgeschrieben.',
        expectedHash: 'hash-1',
      }),
    );
    expect(await screen.findByText('Gespeichert.')).toBeTruthy();
  });

  it('sagt bei einem Konflikt ehrlich, dass die Datei außerhalb geändert wurde', async () => {
    const { sb } = renderScreen(
      {
        'modules:savePage': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict', message: 'Konflikt' });
        },
      },
      `/modules?m=${MODULE}&p=${TOKEN}`,
    );
    await screen.findByRole('heading', { name: 'Token-Lebensdauer' });

    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Markdown dieser Seite'), ' Ergänzung.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Gespeichert wurde nichts — die Datei hat sich geändert'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeTruthy();

    /* Die Meldung steht zwischen Feld und Fußzeile — nicht über dem 380 px hohen
       Feld, wo sie nach dem Klick auf „Speichern" außerhalb des Sichtfelds lag
       (gemessen: 182 px hoch bei top = -136). */
    const card = screen
      .getByText('Gespeichert wurde nichts — die Datei hat sich geändert')
      .closest('.sb-conflict');
    const field = screen.getByLabelText('Markdown dieser Seite');
    const foot = document.querySelector('.sb-pageedit-foot');
    expect(card?.getAttribute('role')).toBe('alert');
    expect(field.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card!.compareDocumentPosition(foot!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    /* Und am Knopf selbst steht, dass nichts geschrieben wurde. */
    expect(
      within(foot as HTMLElement).getByText(
        'Nicht gespeichert — die Datei wurde außerhalb geändert.',
      ),
    ).toBeTruthy();

    /* Überschreiben ist der zweite Weg — ausdrücklich und ohne Hash. */
    await userEvent.click(screen.getByRole('button', { name: 'Überschreiben' }));
    await waitFor(() => {
      const writes = sb.calls.filter((call) => call.channel === 'modules:savePage');
      expect(writes).toHaveLength(2);
      expect((writes[1]?.payload as { expectedHash?: string }).expectedHash).toBeUndefined();
    });
  });

  /* Der Fall, der die Kernzusage der App trägt: der Nutzer tippt in der App, jemand
     schreibt gleichzeitig von außen in die Datei (Obsidian, ein Ingest). Der Hash
     muss der beim Öffnen gelesene sein — sonst geht der alte Text mit dem neuen
     Hash raus und der Hauptprozess nimmt ihn an. Genau das war der Fehler. */
  it('schickt beim Speichern den beim Öffnen gelesenen Hash — auch nach einer externen Änderung', async () => {
    let hash = 'hash-1';
    let body = BODIES[TOKEN] ?? '';
    const { sb, client } = renderScreen(
      {
        'modules:page': ({ path }) => {
          const found = PAGES.find((entry) => entry.path === path);
          if (found === undefined) return null;
          return {
            page: found,
            doc: {
              ...doc(path, path === TOKEN ? hash : 'hash-1'),
              body: path === TOKEN ? body : (BODIES[path] ?? ''),
            },
          };
        },
        'modules:savePage': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict', message: 'Konflikt' });
        },
      },
      `/modules?m=${MODULE}&p=${TOKEN}`,
    );
    await screen.findByRole('heading', { name: 'Token-Lebensdauer' });
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    const field = screen.getByLabelText('Markdown dieser Seite');
    await userEvent.type(field, 'Aus der App getippt.');

    /* Jetzt schreibt jemand von außen und der Watcher lädt die Seite neu. */
    hash = 'hash-2';
    body = `${body}Von außen angehängt.\n`;
    await client.invalidateQueries();

    /* Der Entwurf bleibt stehen — und die Karte sagt, was passiert ist. */
    expect(await screen.findByText('Die Datei ändert sich gerade außerhalb')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Meine Fassung behalten' })).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toContain('Aus der App getippt.');
    expect((field as HTMLTextAreaElement).value).not.toContain('Von außen angehängt.');

    await userEvent.click(screen.getByRole('button', { name: 'Meine Fassung behalten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      const writes = sb.calls.filter((call) => call.channel === 'modules:savePage');
      expect(writes).toHaveLength(1);
      /* Der alte Hash, nicht der neue: der Hauptprozess muss ablehnen können. */
      expect((writes[0]?.payload as { expectedHash?: string }).expectedHash).toBe('hash-1');
    });
    /* Und die Ablehnung steht als Konflikt da, mit dem ausdrücklichen Weg. */
    expect(await screen.findByRole('button', { name: 'Überschreiben' })).toBeTruthy();
  });
});

describe('Module: Graph und Protokoll', () => {
  it('zeigt Knoten und Kanten des Moduls', async () => {
    renderScreen({}, `/modules?m=${MODULE}&tab=graph`);

    expect(await screen.findByText('3 Seiten · 1 Verbindungen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'OAuth 2.1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Token-Lebensdauer' })).toBeTruthy();
    /* Die Kategorien stehen als Spaltenköpfe da. */
    expect(screen.getByText('Entitäten')).toBeTruthy();
    expect(screen.getByText('Konzepte')).toBeTruthy();
  });

  it('bereitet die Chronik lesbar auf, mit berührten Seiten als Verweise', async () => {
    renderScreen({}, `/modules?m=${MODULE}&tab=log`);

    expect(await screen.findByText('Quelle aufgenommen')).toBeTruthy();
    expect(screen.getByText('2026-08-04')).toBeTruthy();
    expect(screen.getByText('Blogartikel zu Token-Lebensdauern')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seite token-lebensdauer öffnen' })).toBeTruthy();
    /* `index.md` ist kein Wikilink — es bleibt ein Pfad. */
    expect(screen.getByText('index.md')).toBeTruthy();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = renderScreen();
    await screen.findByRole('heading', { name: 'OAuth 2.1' });
    await expectNoViolations(container);
  });

  /* Der offene Editor samt Konfliktmeldung steht in keiner Aufnahme des
     axe-Laufs — er entsteht nur nach einer Ablehnung. */
  it('hat auch mit offenem Editor und Konfliktmeldung keinen A11y-Verstoß', async () => {
    const { container } = renderScreen(
      {
        'modules:savePage': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict', message: 'Konflikt' });
        },
      },
      `/modules?m=${MODULE}&p=${TOKEN}`,
    );
    await screen.findByRole('heading', { name: 'Token-Lebensdauer' });
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Gespeichert wurde nichts — die Datei hat sich geändert');

    await expectNoViolations(container);
  });
});

describe('WikiGraph', () => {
  const nodes = (count: number) =>
    Array.from({ length: count }, (_, at) => ({
      id: `m/n${at}`,
      title: `Seite ${at}`,
      type: at % 2 === 0 ? 'entity' : 'concept',
    }));

  it('zeichnet eine Linie je Kante', () => {
    const { container } = render(
      <WikiGraph
        nodes={nodes(4)}
        edges={[
          ['m/n0', 'm/n1'],
          ['m/n2', 'm/n3'],
        ]}
        onOpen={() => undefined}
      />,
    );
    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(container.querySelectorAll('.sb-graph-node')).toHaveLength(4);
  });

  it('kappt über 80 Knoten auf die 40 am stärksten verbundenen und sagt es', () => {
    /* Jeder zweite Knoten hängt an n0 — er und seine Nachbarn müssen bleiben. */
    const many = nodes(90);
    const edges: [string, string][] = many
      .slice(1, 30)
      .map((node) => ['m/n0', node.id] as [string, string]);

    const { container } = render(<WikiGraph nodes={many} edges={edges} onOpen={() => undefined} />);

    expect(container.querySelectorAll('.sb-graph-node')).toHaveLength(40);
    expect(
      screen.getByText(/gezeigt werden die 40 am stärksten verbundenen Seiten von 90/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seite 0' })).toBeTruthy();
  });

  it('sagt bei einem Modul ohne Seiten, dass es keinen Graphen gibt', () => {
    render(<WikiGraph nodes={[]} edges={[]} onOpen={() => undefined} />);
    expect(screen.getByText(/kein Graph/)).toBeTruthy();
  });
});
