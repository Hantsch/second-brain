// @vitest-environment jsdom
/* Der Quellen-Tab unter „Wissen": neue Quellen hineinbekommen.
 *
 * Drei Zusagen werden hier geprüft:
 * - Der Eingang **erkennt selbst**, was hereinkommt, sagt es sichtbar, und
 *   schickt genau diese Art an den Hauptprozess. Ein YouTube-Link, der als „url"
 *   losgeschickt wird, verliert das Transcript — das darf nicht passieren.
 * - Fortschritt kommt über `event:work-tasks` herein (074, D6) — ein
 *   `WorkTask` vom Kind `ingest` trägt den Auftrag als `detail` — und steht
 *   in der Liste.
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
import type { IngestJob, KnowledgeModule, RawSource, SourceDetail, WorkTask } from '@shared/types';
import { SourcesTab } from '@renderer/screens/sources/SourcesTab';
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
  blocked: null,
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
  blocked: null,
};

const blocked: RawSource = {
  path: 'raw/youtube/no-transcript-1',
  title: 'Stream ohne Untertitel',
  kind: 'youtube',
  ingestedAt: NOW,
  sourcePage: null,
  origin: 'https://www.youtube.com/watch?v=no-transcript-1',
  bytes: 1024,
  modules: [],
  blocked: 'no-transcript',
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

/**
 * A `WorkTask` shaped exactly like `ipc/ingest.ts`'s `mirror()` produces for a
 * given job (074, D4/D6): `kind: 'ingest'`, `lane: 'import'`, `detail` set to
 * the job itself. What the sources screen actually reads out of a `WorkTask`
 * is `detail` — the rest of the fields exist only so this is a real `WorkTask`.
 */
function workTask(ingestJob: IngestJob, patch: Partial<WorkTask> = {}): WorkTask {
  return {
    id: ingestJob.id,
    kind: 'ingest',
    lane: 'import',
    subject: { label: ingestJob.label, ref: ingestJob.rawPath },
    state: ingestJob.stage === 'queued' ? 'queued' : 'running',
    progress: ingestJob.progress,
    message: ingestJob.message,
    error: ingestJob.error,
    hasResult: false,
    queuePosition: null,
    queuedAt: ingestJob.startedAt ?? NOW,
    startedAt: ingestJob.startedAt,
    finishedAt: ingestJob.finishedAt,
    // Mirrors the real registry task (`WorkRegistry.startExternal`, 074 D4).
    retryable: false,
    ...patch,
    detail: patch.detail ?? ingestJob,
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
      indexRefreshFailedAt: null,
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
      <MemoryRouter initialEntries={['/knowledge?tab=sources']}>
        <SourcesTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container };
}

/* jsdom has no `scrollIntoView`; `ErrorState` calls it when it appears. */
Element.prototype.scrollIntoView = () => undefined;

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
  it('zeigt den Fortschritt aus event:work-tasks', async () => {
    const { sb } = renderScreen({ 'ingest:jobs': () => [job()] });
    await screen.findByText('Wird geholt');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');

    const updated = job({ stage: 'summarizing', progress: 0.85 });
    sb.emit('event:work-tasks', [workTask(updated)]);

    expect(await screen.findByText('Wird verdichtet')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85'),
    );
  });

  it('nennt einen neuen Auftrag, der nur als Ereignis hereinkommt', async () => {
    const { sb } = renderScreen();
    await screen.findByLabelText('URL, YouTube-Link oder Text');

    const arrived = job({
      id: 'job-2',
      kind: 'url',
      label: 'example.org',
      stage: 'writing-raw',
      progress: 0.8,
    });
    sb.emit('event:work-tasks', [workTask(arrived)]);

    expect(await screen.findByText('example.org')).toBeTruthy();
    expect(screen.getByText('Rohquelle geschrieben')).toBeTruthy();
  });

  /* 074, D6: the mirrored list carries every kind of task, not only ingest —
     the filter on `kind === 'ingest'` must not lose a real job update just
     because an unrelated task (e.g. a condensation) rides along in the same
     emission. */
  it('übernimmt einen Fortschritt, auch wenn andere Auftragsarten in derselben Sendung mitkommen', async () => {
    const { sb } = renderScreen({ 'ingest:jobs': () => [job()] });
    await screen.findByText('Wird geholt');

    const unrelated: WorkTask = {
      id: 'condense-1',
      kind: 'condense',
      lane: 'model',
      subject: { label: 'Bereich Wachstum', ref: null },
      state: 'done',
      progress: 1,
      message: null,
      error: null,
      hasResult: false,
      queuePosition: null,
      queuedAt: NOW,
      startedAt: NOW,
      finishedAt: NOW,
      detail: null,
      retryable: true,
    };
    const updated = job({ stage: 'summarizing', progress: 0.85 });
    sb.emit('event:work-tasks', [unrelated, workTask(updated)]);

    expect(await screen.findByText('Wird verdichtet')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85'),
    );
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

  describe('Übergabe an den Agenten', () => {
    const waiting = () =>
      job({
        stage: 'awaiting-llm',
        progress: 1,
        rawPath: 'raw/youtube/xOFkpf9KgKg',
        finishedAt: NOW,
      });
    const HAND = 'An den Agenten geben';
    const WAITING_TITLE = 'Quelle liegt im Vault, die Verdichtung braucht ein Modell';
    /* The source list below the jobs offers the same button for its own rows. */
    const jobRow = async () => {
      const title = await screen.findByText(WAITING_TITLE);
      return within(title.closest('li') as HTMLElement);
    };

    it('bietet die Übergabe an einer wartenden Quelle an', async () => {
      renderScreen({ 'ingest:jobs': () => [waiting()], 'agent:jobs': () => [] });

      expect((await jobRow()).getByRole('button', { name: HAND })).toBeTruthy();
    });

    it('bietet an einer Quelle, die der Agent schon verdichtet hat, keine Übergabe mehr an', async () => {
      const { sb } = renderScreen({
        'ingest:jobs': () => [waiting()],
        'agent:jobs': () => [
          {
            id: 'condense-source-1',
            kind: 'condense-source' as const,
            subject: 'raw/youtube/xOFkpf9KgKg',
            label: 'xOFkpf9KgKg',
            module: MODULE,
            state: 'done' as const,
            reason: null,
            createdAt: NOW,
            finishedAt: NOW,
          },
        ],
      });

      const row = await jobRow();
      await waitFor(() => expect(row.queryByRole('button', { name: HAND })).toBeNull());
      expect(sb.calls.some(({ channel }) => channel === 'agent:jobs')).toBe(true);
      expect(row.getByRole('button', { name: 'Modell einrichten' })).toBeTruthy();
    });

    it('zeigt eine abgelehnte Übergabe als sichtbaren Fehler', async () => {
      renderScreen({
        'ingest:jobs': () => [waiting()],
        'agent:jobs': () => [],
        'agent:handOverSource': () => {
          throw Object.assign(new Error('This source is condensed already.'), { code: 'invalid' });
        },
      });

      await userEvent.click((await jobRow()).getByRole('button', { name: HAND }));

      expect(await screen.findByText('Diese Eingabe passt nicht.')).toBeTruthy();
    });

    it('zeigt ein gescheitertes Zurücknehmen als sichtbaren Fehler', async () => {
      renderScreen({
        'ingest:jobs': () => [waiting()],
        'agent:jobs': () => [
          {
            id: 'condense-source-1',
            kind: 'condense-source' as const,
            subject: 'raw/youtube/xOFkpf9KgKg',
            label: 'xOFkpf9KgKg',
            module: MODULE,
            state: 'with-agent' as const,
            reason: null,
            createdAt: NOW,
            finishedAt: null,
          },
        ],
        'agent:withdrawJob': () => {
          throw Object.assign(new Error('gone'), { code: 'not-found' });
        },
      });

      const row = await jobRow();
      await userEvent.click(await row.findByRole('button', { name: 'Zurückziehen' }));

      expect(await screen.findByText('Das Gesuchte gibt es nicht (mehr).')).toBeTruthy();
    });
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

  it('sperrt „Verdichten", solange der Auftrag zu dieser Quelle läuft', async () => {
    const { sb } = renderScreen({
      'ingest:jobs': () => [
        job({
          kind: 'url',
          rawPath: raw.path,
          module: MODULE,
          stage: 'summarizing',
          progress: 0.85,
        }),
      ],
      'ingest:condense': ({ path, module }) =>
        job({ kind: 'url', rawPath: path, module, stage: 'queued', progress: 0 }),
    });

    await screen.findByText('Digital Gardening: ein Überblick');
    const button = await screen.findByRole('button', { name: 'Wird verdichtet' });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(sb.calls.some((call) => call.channel === 'ingest:condense')).toBe(false);
  });

  it('sagt beim zweiten Verdichtungslauf, dass die Quelle schon verdichtet ist', async () => {
    renderScreen({
      'ingest:jobs': () => [
        job({
          stage: 'duplicate',
          progress: 1,
          message: 'already-condensed',
          rawPath: condensed.path,
          duplicateOf: condensed.path,
          finishedAt: NOW,
        }),
      ],
    });

    expect(await screen.findByText('Quelle ist bereits verdichtet')).toBeTruthy();
    expect(screen.getByText(/zweite Source-Seite/)).toBeTruthy();
    /* Kein „Wiederholen": das versuchte genau den Lauf, der gerade gestoppt wurde. */
    expect(screen.queryByRole('button', { name: 'Wiederholen' })).toBeNull();
  });

  it('verdichtet direkt aus der Liste, ohne die Details zu öffnen', async () => {
    const { sb } = renderScreen({
      'ingest:condense': ({ path, module }) =>
        job({ kind: 'url', rawPath: path, module, stage: 'queued', progress: 0 }),
    });

    await screen.findByText('Digital Gardening: ein Überblick');
    await userEvent.selectOptions(
      screen.getByLabelText('Zielmodul für Digital Gardening: ein Überblick'),
      MODULE,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Verdichten' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:condense')?.payload).toEqual({
        path: raw.path,
        module: MODULE,
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('zeigt bei einer blockierten Quelle den Grund und die Alternative', async () => {
    const { sb } = renderScreen({
      'modules:sources': () => [blocked],
      'ingest:condense': ({ path, module, basis }) =>
        job({
          kind: 'youtube',
          rawPath: path,
          module,
          message: basis ?? null,
          stage: 'queued',
          progress: 0,
        }),
    });

    const row = (await screen.findByText(blocked.title)).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Kein Transcript verfügbar')).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText(`Zielmodul für ${blocked.title}`), MODULE);
    await userEvent.click(screen.getByRole('button', { name: 'Aus Beschreibung verdichten' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:condense')?.payload).toEqual({
        path: blocked.path,
        module: MODULE,
        basis: 'metadata',
      }),
    );
  });

  it('ruft eine Quelle ohne Transcript aus den Details erneut ab', async () => {
    const { sb } = renderScreen({
      'modules:sources': () => [blocked],
      'ingest:detail': () => sourceDetail(blocked),
      'ingest:refetch': ({ path }) =>
        job({ rawPath: path, module: null, refetch: true, stage: 'queued', progress: 0 }),
    });

    await userEvent.click(await screen.findByText(blocked.title));
    const dialog = await screen.findByRole('dialog', { name: blocked.title });
    expect(within(dialog).getByText(/wandern vorher in den Papierkorb/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Erneut abrufen' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'ingest:refetch')?.payload).toEqual({
        path: blocked.path,
      }),
    );
  });

  it('sagt nach einem leeren Abruf, dass wieder kein Transcript kam', async () => {
    renderScreen({
      'modules:sources': () => [blocked],
      'ingest:detail': () => sourceDetail(blocked),
      'ingest:jobs': () => [
        job({
          rawPath: blocked.path,
          module: null,
          refetch: true,
          stage: 'no-content',
          message: 'no-transcript',
          progress: 1,
          finishedAt: NOW,
        }),
      ],
    });

    await userEvent.click(await screen.findByText(blocked.title));
    const dialog = await screen.findByRole('dialog', { name: blocked.title });
    expect(
      within(dialog).getByText('Erneut abgerufen: wieder kein Transcript erhalten.'),
    ).toBeTruthy();
  });

  it('bietet das erneute Abrufen bei einer Quelle mit Transcript nicht an', async () => {
    const withTranscript: RawSource = { ...blocked, blocked: null };
    renderScreen({
      'modules:sources': () => [withTranscript],
      'ingest:detail': () => sourceDetail(withTranscript),
    });

    await userEvent.click(await screen.findByText(withTranscript.title));
    const dialog = await screen.findByRole('dialog', { name: withTranscript.title });
    expect(within(dialog).queryByRole('button', { name: 'Erneut abrufen' })).toBeNull();
  });

  it('lässt eine gewöhnliche unverdichtete Zeile unverändert', async () => {
    renderScreen();

    const row = (await screen.findByText(raw.title)).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText('Kein Transcript verfügbar')).toBeNull();
    expect(
      within(row as HTMLElement).queryByRole('button', { name: 'Aus Beschreibung verdichten' }),
    ).toBeNull();
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
