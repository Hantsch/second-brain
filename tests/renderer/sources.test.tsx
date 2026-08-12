// @vitest-environment jsdom
/* Der Quellen-Screen: neue Quellen hineinbekommen.
 *
 * Drei Zusagen werden hier geprüft:
 * - Der Eingang **erkennt selbst**, was hereinkommt, sagt es sichtbar, und
 *   schickt genau diese Art an den Hauptprozess. Ein YouTube-Link, der als „url"
 *   losgeschickt wird, verliert das Transcript — das darf nicht passieren.
 * - Fortschritt kommt aus `event:ingest-progress` und steht in der Liste.
 * - `awaiting-llm` ist ein eigener, ehrlicher Zustand mit zwei Wegen, kein
 *   Fehler und kein halber Erfolg.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { IngestJob, KnowledgeModule, RawSource, SourceDetail } from '@shared/types';
import { SourcesScreen } from '@renderer/screens/sources/SourcesScreen';
import { detectKind } from '@renderer/screens/sources/detect';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
}

function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = {
    invoke,
    on: (event: string, callback: (payload: never) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
      return () => void set.delete(callback);
    },
    off: () => undefined,
  } as unknown as SbBridge;
  return {
    calls,
    emit: (event, payload) => {
      for (const callback of listeners.get(event) ?? []) {
        (callback as (value: unknown) => void)(payload);
      }
    },
  };
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

const NOW = '2026-08-10T14:32:00+02:00';
const MODULE = 'identity-management';

const knowledgeModule: KnowledgeModule = {
  slug: MODULE,
  title: 'Identitätsmanagement',
  description: 'Anmeldung, Rollen und Mandanten.',
  created: '2025-12-13',
  updated: NOW,
  counts: { sources: 1, entities: 2, concepts: 1 },
  findingCount: 0,
  lastIngest: NOW,
  tags: [],
};

const condensed: RawSource = {
  path: 'raw/youtube/xOFkpf9KgKg',
  title: 'Your AI second brain is slowly rotting',
  kind: 'youtube',
  ingestedAt: NOW,
  sourcePage: 's-2026-08-10-ai-second-brain-rotting',
  origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
  bytes: 48210,
  modules: [MODULE],
};

const raw: RawSource = {
  path: 'raw/web/2026-08-06-digital-gardening-ueberblick',
  title: 'Digital Gardening: ein Überblick',
  kind: 'url',
  ingestedAt: '2026-08-06T22:08:00+02:00',
  sourcePage: null,
  origin: 'https://example.org/digital-gardening-ueberblick',
  bytes: 4210,
  modules: [],
};

function sourceDetail(source: RawSource, patch: Partial<SourceDetail> = {}): SourceDetail {
  return { source, resourceReport: null, attachments: [], ...patch };
}

function job(patch: Partial<IngestJob> = {}): IngestJob {
  return {
    id: 'job-1',
    kind: 'youtube',
    input: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
    label: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
    module: MODULE,
    stage: 'fetching',
    progress: 0.4,
    message: null,
    error: null,
    startedAt: NOW,
    finishedAt: null,
    rawPath: null,
    touchedPages: [],
    ...patch,
  };
}

function renderScreen(extra: Handlers = {}) {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'modules:list': () => [knowledgeModule],
    'modules:sources': () => [condensed, raw],
    'ingest:jobs': () => [],
    'ingest:ytdlpStatus': () => ({ available: false, path: null, version: null }),
    'ingest:start': ({ kind, input }) => job({ kind, input, stage: 'queued', progress: 0 }),
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sources']}>
        <SourcesScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container };
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
});

describe('Erkennung der Quellenart', () => {
  it('erkennt YouTube in allen üblichen Formen', () => {
    for (const input of [
      'https://www.youtube.com/watch?v=xOFkpf9KgKg',
      'youtu.be/xOFkpf9KgKg',
      'https://www.youtube.com/shorts/xOFkpf9KgKg',
      'https://music.youtube.com/watch?v=xOFkpf9KgKg&list=RDAMVM',
    ]) {
      expect(detectKind(input), input).toBe('youtube');
    }
  });

  it('unterscheidet Webseite, Dateipfad und Text', () => {
    expect(detectKind('https://example.org/digital-gardening')).toBe('url');
    expect(detectKind('C:/Users/demo/Downloads/notizen.md')).toBe('file');
    expect(detectKind('/home/demo/notizen.md')).toBe('file');
    expect(detectKind('Ein Absatz, den ich aus einer Mail kopiert habe.')).toBe('text');
    expect(detectKind('   ')).toBeNull();
  });
});

describe('Quellen: Eingang', () => {
  it('sagt sichtbar, dass ein YouTube-Video erkannt wurde, und schickt es so los', async () => {
    const { sb } = renderScreen();
    const field = await screen.findByLabelText('URL, YouTube-Link oder Text');

    await userEvent.type(field, 'https://www.youtube.com/watch?v=xOFkpf9KgKg');
    expect(screen.getByText('YouTube-Video erkannt')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Aufnehmen' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:start')?.payload).toEqual({
        kind: 'youtube',
        input: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
        module: null,
      }),
    );
  });

  it('nimmt eingefügten Text als Quelle und nennt das Zielmodul', async () => {
    const { sb } = renderScreen();
    const field = await screen.findByLabelText('URL, YouTube-Link oder Text');

    await userEvent.type(field, 'Ein Absatz aus einem Chat, den ich behalten will.');
    expect(screen.getByText(/Text erkannt/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Zielmodul'), MODULE);
    await userEvent.click(screen.getByRole('button', { name: 'Aufnehmen' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:start')?.payload).toEqual({
        kind: 'text',
        input: 'Ein Absatz aus einem Chat, den ich behalten will.',
        module: MODULE,
      }),
    );
  });

  it('sagt beim fehlenden yt-dlp, was „automatisch holen" tut', async () => {
    renderScreen();
    expect(await screen.findByText('yt-dlp fehlt')).toBeTruthy();
    expect(screen.getByText(/eigenständige Binary in den Anwendungsordner/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Automatisch holen' })).toBeTruthy();
  });

  it('zeigt die vorhandene Version in Mono, wenn yt-dlp liegt', async () => {
    renderScreen({
      'ingest:ytdlpStatus': () => ({
        available: true,
        path: 'C:/Users/demo/AppData/Roaming/second-brain/bin/yt-dlp.exe',
        version: '2026.07.21',
      }),
    });
    expect(await screen.findByText('yt-dlp vorhanden')).toBeTruthy();
    expect(screen.getByText('2026.07.21').className).toContain('sb-mono');
  });
});

describe('Quellen: Aufträge', () => {
  it('zeigt den Fortschritt aus event:ingest-progress', async () => {
    const { sb } = renderScreen({ 'ingest:jobs': () => [job()] });
    await screen.findByText('Wird geholt');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');

    sb.emit('event:ingest-progress', job({ stage: 'summarizing', progress: 0.85 }));

    expect(await screen.findByText('Wird verdichtet')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85'),
    );
  });

  it('nennt einen neuen Auftrag, der nur als Ereignis hereinkommt', async () => {
    const { sb } = renderScreen();
    await screen.findByLabelText('URL, YouTube-Link oder Text');

    sb.emit(
      'event:ingest-progress',
      job({ id: 'job-2', kind: 'url', label: 'example.org', stage: 'writing-raw', progress: 0.8 }),
    );

    expect(await screen.findByText('example.org')).toBeTruthy();
    expect(screen.getByText('Rohquelle geschrieben')).toBeTruthy();
  });

  it('behandelt „kein Modell" als eigenen Zustand mit zwei Wegen', async () => {
    renderScreen({
      'ingest:jobs': () => [
        job({
          stage: 'awaiting-llm',
          progress: 1,
          rawPath: 'raw/youtube/xOFkpf9KgKg',
          finishedAt: NOW,
        }),
      ],
    });

    expect(
      await screen.findByText('Quelle liegt im Vault, die Verdichtung braucht ein Modell'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modell einrichten' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Rohquelle ansehen' })).toHaveLength(1);
    /* Kein Fortschrittsbalken mehr: der Auftrag läuft nicht. */
    expect(screen.queryByRole('progressbar')).toBeNull();
    /* Und wiederholen bleibt möglich, sobald ein Modell steht. */
    expect(screen.getByRole('button', { name: 'Wiederholen' })).toBeTruthy();
  });

  it('nennt einen Fehler im Klartext und hält das Technische hinter Details', async () => {
    renderScreen({
      'ingest:jobs': () => [
        job({ stage: 'error', error: 'io', message: 'HTTP 503', finishedAt: NOW }),
      ],
    });

    expect(await screen.findByText('Der Dateizugriff ist fehlgeschlagen.')).toBeTruthy();
    expect(screen.queryByText('HTTP 503')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Details anzeigen' }));
    expect(screen.getByText('HTTP 503')).toBeTruthy();
  });

  it('bricht einen laufenden Auftrag ab', async () => {
    const { sb } = renderScreen({ 'ingest:jobs': () => [job()], 'ingest:cancel': () => undefined });
    await screen.findByText('Wird geholt');

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:cancel')?.payload).toEqual({
        id: 'job-1',
      }),
    );
  });
});

describe('Quellen: fallen lassen', () => {
  /** Ein Ablegen, wie es der Browser meldet: Typen, Dateien, `getData`. */
  function dropOn(node: Element, transfer: { types: string[]; files?: File[]; text?: string }) {
    const dataTransfer = {
      types: transfer.types,
      files: transfer.files ?? [],
      getData: (type: string) =>
        type === 'text' || type === 'text/plain' ? (transfer.text ?? '') : '',
    };
    fireEvent.drop(node, { dataTransfer });
  }

  it('nimmt einen fallengelassenen Link in den Eingang und erkennt ihn', async () => {
    const { container } = renderScreen();
    const zone = container.querySelector('.sb-dropzone');
    await screen.findByLabelText('URL, YouTube-Link oder Text');

    dropOn(zone as Element, {
      types: ['text/plain'],
      text: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
    });

    expect(await screen.findByText('YouTube-Video erkannt')).toBeTruthy();
  });

  it('übernimmt eine fallengelassene Textdatei als Quelle', async () => {
    const { sb, container } = renderScreen();
    const zone = container.querySelector('.sb-dropzone');
    await screen.findByLabelText('URL, YouTube-Link oder Text');

    const file = new File(['# Notiz\n\nAus einer Datei.'], 'notiz.md', { type: 'text/markdown' });
    dropOn(zone as Element, { types: ['Files'], files: [file] });

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:start')?.payload).toEqual({
        kind: 'text',
        input: '# Notiz\n\nAus einer Datei.',
        module: null,
      }),
    );
  });

  /* Eine PDF hat im Renderer keinen Pfad — sie wird nicht halb aufgenommen. */
  it('nimmt eine Dateiart, die es nicht lesen kann, nicht auf', async () => {
    const { sb, container } = renderScreen();
    const zone = container.querySelector('.sb-dropzone');
    await screen.findByLabelText('URL, YouTube-Link oder Text');

    const file = new File(['%PDF-1.7'], 'whitepaper.pdf', { type: 'application/pdf' });
    dropOn(zone as Element, { types: ['Files'], files: [file] });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sb.calls.some((call) => call.channel === 'ingest:start')).toBe(false);
  });
});

describe('Quellen: Bestand', () => {
  it('blendet erfolgreiche Quellen standardmäßig aus und zeigt sie per Toggle', async () => {
    renderScreen();

    const row = (await screen.findByText('Digital Gardening: ein Überblick')).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Unverdichtet')).toBeTruthy();
    const toggle = screen.getByLabelText('Erfolgreiche ausblenden') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.queryByText('Your AI second brain is slowly rotting')).toBeNull();

    await userEvent.click(toggle);

    /* Die erfolgreiche Quelle ist wieder sichtbar und trägt die Warnmarke nicht. */
    const other = (await screen.findByText('Your AI second brain is slowly rotting')).closest('li');
    expect(within(other as HTMLElement).queryByText('Unverdichtet')).toBeNull();
  });

  it('meldet, wenn keine Quelle Aufmerksamkeit braucht', async () => {
    renderScreen({ 'modules:sources': () => [condensed] });

    expect(
      await screen.findByText(
        'Keine Quelle braucht gerade Aufmerksamkeit. Alle aufgenommenen Quellen sind erfolgreich verdichtet.',
      ),
    ).toBeTruthy();
  });

  it('öffnet Details und stößt die Verdichtung einer alten Rohquelle an', async () => {
    const { sb } = renderScreen({
      'ingest:detail': ({ path }) => sourceDetail({ ...raw, path }),
      'ingest:condense': ({ path, module }) =>
        job({ kind: 'url', rawPath: path, module, stage: 'queued', progress: 0 }),
    });

    await userEvent.click(await screen.findByText('Digital Gardening: ein Überblick'));

    const dialog = await screen.findByRole('dialog', { name: raw.title });
    expect(within(dialog).getByText('Unverdichtet')).toBeTruthy();
    await userEvent.selectOptions(within(dialog).getByLabelText('Zielmodul'), MODULE);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Verdichten' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:condense')?.payload).toEqual({
        path: raw.path,
        module: MODULE,
      }),
    );
  });

  it('zeigt den YouTube-Ressourcenreport und nimmt Dateien nachträglich an', async () => {
    const report: SourceDetail = sourceDetail(condensed, {
      resourceReport: {
        generatedAt: NOW,
        analyzedWithModel: true,
        model: 'local/qwen',
        resources: [
          {
            name: 'ComfyUI workflow',
            mention: 'The complete workflow is linked below.',
            location: 'video',
            timestamp: '12:34',
            links: [{ url: 'https://example.org/workflow.json', label: 'Workflow download' }],
          },
        ],
        descriptionLinks: [
          { url: 'https://example.org/workflow.json', label: 'Workflow download' },
        ],
      },
    });
    const { sb, container } = renderScreen({
      'ingest:detail': () => report,
      'ingest:attachFiles': () => ({
        ...report,
        attachments: [
          {
            name: 'workflow.json',
            path: `${condensed.path}/sources/workflow.json`,
            bytes: 2048,
            directory: false,
          },
        ],
      }),
    });

    await userEvent.click(await screen.findByLabelText('Erfolgreiche ausblenden'));
    await userEvent.click(await screen.findByText(condensed.title));

    expect(await screen.findByText('ComfyUI workflow')).toBeTruthy();
    expect(screen.getByText('im Video bei 12:34')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Workflow download' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Dateien hinzufügen' }));
    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:attachFiles')?.payload).toEqual({
        path: condensed.path,
      }),
    );
    expect(await screen.findByText('workflow.json')).toBeTruthy();
    await expectNoViolations(container);
  });

  it('erklärt im Leerzustand die vier Quellenarten', async () => {
    renderScreen({ 'modules:sources': () => [] });

    expect(await screen.findByText('Vier Wege herein')).toBeTruthy();
    expect(screen.getByText(/Transkript, Kapitel und Metadaten/)).toBeTruthy();
    expect(screen.getByText(/der Artikel wird zu Markdown/)).toBeTruthy();
    expect(screen.getByText(/das Original wandert unverändert/)).toBeTruthy();
    expect(screen.getByText(/eingefügtes Material aus Chat/)).toBeTruthy();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = renderScreen({ 'ingest:jobs': () => [job()] });
    await screen.findByText('Wird geholt');
    await expectNoViolations(container);
  });
});
