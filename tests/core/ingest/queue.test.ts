/* Die Warteschlange: Parallelitaet, Abbruch, Wiederholung — und der ehrliche Zustand
   `awaiting-llm`, wenn die Rohquelle liegt, aber kein Modell verdichten kann. */

import { describe, expect, it, vi } from 'vitest';
import { IngestQueue, type IngestOutcome, type SourceIngestor } from '@core/ingest';
import { WikiError } from '@core/wiki';
import type { IngestJob } from '@shared/types';
import { memoryStore } from './fakes';

/** Ein Ingestor, der nichts holt, sondern nur meldet, dass er lief. */
function fakeIngestor(
  options: {
    onIngest?: () => void;
    gate?: Promise<void>;
    fail?: Error;
    text?: string;
  } = {},
): SourceIngestor {
  return {
    kind: 'text',
    canHandle: () => true,
    async ingest(input): Promise<IngestOutcome> {
      options.onIngest?.();
      if (options.gate !== undefined) await options.gate;
      if (options.fail !== undefined) throw options.fail;
      return {
        kind: 'text',
        rawPath: `raw/files/2026-08-10-${input}`,
        title: input,
        text: options.text ?? 'Inhalt der Quelle.',
        origin: 'paste',
        provenance: { content: 'paste' },
        notes: [],
      };
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = async (): Promise<void> => {
  for (let round = 0; round < 8; round += 1) await Promise.resolve();
};

describe('IngestQueue', () => {
  it('haelt die Parallelitaet ein', async () => {
    const gate = deferred();
    let started = 0;
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor({ gate: gate.promise, onIngest: () => (started += 1) })],
      concurrency: () => 2,
    });

    for (const input of ['a', 'b', 'c', 'd']) queue.add({ kind: 'text', input });
    await flush();

    expect(started).toBe(2);
    expect(queue.jobs().filter((job) => job.stage === 'queued')).toHaveLength(2);

    gate.resolve();
    await vi.waitFor(() => expect(started).toBe(4));
    await vi.waitFor(() =>
      expect(queue.jobs().every((job) => job.stage === 'awaiting-llm')).toBe(true),
    );
  });

  it('endet ohne Modell bei awaiting-llm — die Rohquelle liegt', async () => {
    const updates: IngestJob[] = [];
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor()],
      condense: async () => ({ pages: ['modules/m/wiki/sources/s-1.md'] }),
      llmAvailable: () => false,
      onUpdate: (job) => updates.push(job),
    });

    const job = queue.add({ kind: 'text', input: 'ohne Modell' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('awaiting-llm'));

    const done = queue.job(job.id);
    expect(done?.rawPath).toBe('raw/files/2026-08-10-ohne Modell');
    expect(done?.progress).toBe(1);
    expect(done?.touchedPages).toEqual([]);
    expect(done?.error).toBeNull();
    expect(updates.map((entry) => entry.stage)).toContain('writing-raw');
  });

  it('verdichtet mit Modell und traegt die Source-Seite im Protokoll nach', async () => {
    const store = memoryStore();
    const queue = new IngestQueue({
      store,
      ingestors: [fakeIngestor()],
      condense: async ({ outcome }) => {
        // Der Schritt liegt ausserhalb: er bekommt nur das Ergebnis, nichts vom Vault.
        expect(outcome.text).toBe('Inhalt der Quelle.');
        return {
          pages: ['modules/m/wiki/sources/s-2026-08-10-quelle.md'],
          sourcePage: 's-2026-08-10-quelle',
          modules: ['m'],
        };
      },
      llmAvailable: () => true,
    });

    await store.writeText(
      'raw/files/2026-08-10-quelle/.ingest.json',
      JSON.stringify({
        kind: 'text',
        origin: 'paste',
        ingestedAt: '2026-08-10T14:32:00+02:00',
        title: 'quelle',
        sourcePage: null,
        modules: [],
        provenance: { content: 'paste' },
      }),
    );

    const job = queue.add({ kind: 'text', input: 'quelle', module: 'm' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('done'));

    expect(queue.job(job.id)?.touchedPages).toEqual([
      'modules/m/wiki/sources/s-2026-08-10-quelle.md',
    ]);
    const record: unknown = JSON.parse(
      (await store.readText('raw/files/2026-08-10-quelle/.ingest.json')) ?? '{}',
    );
    expect(record).toMatchObject({ sourcePage: 's-2026-08-10-quelle', modules: ['m'] });
  });

  it('bricht einen wartenden Auftrag sofort ab', async () => {
    const gate = deferred();
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor({ gate: gate.promise })],
      concurrency: () => 1,
    });

    const first = queue.add({ kind: 'text', input: 'laeuft' });
    const second = queue.add({ kind: 'text', input: 'wartet' });
    await flush();

    expect(queue.cancel(second.id)).toBe(true);
    expect(queue.job(second.id)?.stage).toBe('error');
    expect(queue.job(second.id)?.error).toBe('cancelled');

    gate.resolve();
    await vi.waitFor(() => expect(queue.job(first.id)?.stage).toBe('awaiting-llm'));
  });

  it('bricht einen laufenden Auftrag ueber das Signal ab', async () => {
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [
        {
          kind: 'text',
          canHandle: () => true,
          ingest: (_input, ctx) =>
            new Promise((_resolve, reject) => {
              ctx.signal?.addEventListener('abort', () => reject(new Error('Signal kam an')));
            }),
        },
      ],
    });

    const job = queue.add({ kind: 'text', input: 'lange' });
    await flush();
    expect(queue.cancel(job.id)).toBe(true);

    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('error'));
    expect(queue.job(job.id)?.message).toBe('Signal kam an');
  });

  it('wiederholt einen gescheiterten Auftrag', async () => {
    let attempt = 0;
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [
        {
          kind: 'text',
          canHandle: () => true,
          async ingest(input): Promise<IngestOutcome> {
            attempt += 1;
            if (attempt === 1) throw new Error('Netz weg');
            return {
              kind: 'text',
              rawPath: `raw/files/2026-08-10-${input}`,
              title: input,
              text: 'Endlich da.',
              origin: 'paste',
              provenance: {},
              notes: [],
            };
          },
        },
      ],
    });

    const job = queue.add({ kind: 'text', input: 'wackelig' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('error'));
    expect(queue.job(job.id)?.error).toBe('unknown');
    expect(queue.job(job.id)?.message).toBe('Netz weg');

    queue.retry(job.id);
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('awaiting-llm'));
    expect(attempt).toBe(2);
    expect(queue.job(job.id)?.error).toBeNull();
  });

  it('schreibt beim Wiederholen keine zweite Rohquelle', async () => {
    let runs = 0;
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor({ onIngest: () => (runs += 1) })],
      condense: async () => {
        throw new Error('Verdichten scheitert');
      },
      llmAvailable: () => true,
    });

    const job = queue.add({ kind: 'text', input: 'einmal' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('error'));
    expect(runs).toBe(1);

    queue.retry(job.id);
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('error'));
    // Die Rohquelle wurde nicht noch einmal geschrieben, nur die Verdichtung wiederholt.
    expect(runs).toBe(1);
  });

  /** Ein Protokoll, wie es unter der Rohquelle liegt — noch unverdichtet. */
  async function writeLog(store: ReturnType<typeof memoryStore>, path: string): Promise<void> {
    await store.writeText(
      `${path}/.ingest.json`,
      JSON.stringify({
        kind: 'text',
        origin: 'paste',
        ingestedAt: '2026-08-10T14:32:00+02:00',
        title: 'quelle',
        sourcePage: null,
        modules: [],
        provenance: { content: 'paste' },
      }),
    );
  }

  const RAW_PATH = 'raw/files/2026-08-10-quelle';

  const existingOutcome: IngestOutcome = {
    kind: 'text',
    rawPath: RAW_PATH,
    title: 'quelle',
    text: 'Inhalt der Quelle.',
    origin: 'paste',
    provenance: { content: 'paste' },
    notes: [],
  };

  it('verdichtet dieselbe Rohquelle nicht zweimal parallel', async () => {
    const gate = deferred();
    let runs = 0;
    const store = memoryStore();
    await writeLog(store, RAW_PATH);
    const queue = new IngestQueue({
      store,
      ingestors: [fakeIngestor()],
      condense: async () => {
        runs += 1;
        await gate.promise;
        return { pages: ['modules/m/wiki/sources/s-1.md'], sourcePage: 's-1', modules: ['m'] };
      },
      llmAvailable: () => true,
      concurrency: () => 2,
    });

    const first = queue.addExisting({ kind: 'text', input: 'paste', module: 'm' }, existingOutcome);
    const second = queue.addExisting(
      { kind: 'text', input: 'paste', module: 'm' },
      existingOutcome,
    );

    await vi.waitFor(() => expect(queue.job(second.id)?.stage).toBe('duplicate'));
    /* Der zweite Auftrag ist kein Fehler — er sagt, dass es nichts zu tun gibt. */
    expect(queue.job(second.id)?.message).toBe('already-condensed');
    expect(queue.job(second.id)?.duplicateOf).toBe(RAW_PATH);

    gate.resolve();
    await vi.waitFor(() => expect(queue.job(first.id)?.stage).toBe('done'));
    /* Ein Lauf, eine Source-Seite — obwohl zwei Auftraege in der Schlange standen. */
    expect(runs).toBe(1);
  });

  it('verdichtet eine schon verdichtete Rohquelle beim Wiederholen nicht erneut', async () => {
    let runs = 0;
    const store = memoryStore();
    await writeLog(store, RAW_PATH);
    const queue = new IngestQueue({
      store,
      ingestors: [fakeIngestor()],
      condense: async () => {
        runs += 1;
        return { pages: ['modules/m/wiki/sources/s-1.md'], sourcePage: 's-1', modules: ['m'] };
      },
      llmAvailable: () => true,
    });

    const job = queue.addExisting({ kind: 'text', input: 'paste', module: 'm' }, existingOutcome);
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('done'));

    queue.retry(job.id);

    /* Das Protokoll trägt die Source-Seite — ein zweiter Lauf legte eine zweite an. */
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('duplicate'));
    expect(runs).toBe(1);
  });

  /* 051, D1: eine leere Quelle endet als `no-content` — der Hinweis der Quelle
     bleibt der Grund, nur die Stufe ist nicht mehr `awaiting-llm`. Ein ungelesenes
     PDF wartet auf kein Modell; es enthaelt einfach nichts. */
  it('meldet ohne Text den Hinweis der Quelle statt einer Verdichtung', async () => {
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [
        {
          kind: 'file',
          canHandle: () => true,
          async ingest(): Promise<IngestOutcome> {
            return {
              kind: 'file',
              rawPath: 'raw/files/2026-08-10-handbuch',
              title: 'Handbuch',
              text: '',
              origin: 'C:/handbuch.pdf',
              provenance: { content: 'none' },
              notes: [{ code: 'pdf-not-read', detail: 'handbuch.pdf' }],
            };
          },
        },
      ],
      condense: async () => ({ pages: [] }),
      llmAvailable: () => true,
    });

    const job = queue.add({ kind: 'file', input: 'C:/handbuch.pdf' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('no-content'));
    expect(queue.job(job.id)?.message).toBe('pdf-not-read');
  });

  /** Ein Video, dessen Metadaten liegen, dessen Transcript aber fehlt. */
  function transcriptlessIngestor(): SourceIngestor {
    return {
      kind: 'youtube',
      canHandle: () => true,
      async ingest(): Promise<IngestOutcome> {
        return {
          kind: 'youtube',
          rawPath: 'raw/youtube/xOFkpf9KgKg',
          title: 'Ein Video ohne Untertitel',
          text: '',
          origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
          provenance: { metadata: 'yt-dlp' },
          notes: [{ code: 'partial-metadata' }, { code: 'no-transcript' }],
        };
      },
    };
  }

  it('endet eine Quelle ohne Text als no-content, nicht als awaiting-llm', async () => {
    let condensed = 0;
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [transcriptlessIngestor()],
      condense: async () => {
        condensed += 1;
        return { pages: ['modules/m/wiki/sources/s-1.md'], sourcePage: 's-1', modules: ['m'] };
      },
      llmAvailable: () => true,
    });

    const job = queue.add({
      kind: 'youtube',
      input: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
    });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('no-content'));

    const done = queue.job(job.id);
    /* Der Grund ist maschinenlesbar und benennt das fehlende Transcript — nicht
       den beilaeufigen Hinweis auf die Metadaten. */
    expect(done?.message).toBe('no-transcript');
    expect(done?.stage).not.toBe('awaiting-llm');
    expect(done?.error).toBeNull();
    expect(done?.progress).toBe(1);
    expect(done?.finishedAt).not.toBeNull();
    /* Die Rohquelle liegt, aber kein Modell hat einen Platzhalter verdichtet. */
    expect(done?.rawPath).toBe('raw/youtube/xOFkpf9KgKg');
    expect(done?.touchedPages).toEqual([]);
    expect(condensed).toBe(0);
  });

  it('gewinnt no-content gegen ein fehlendes Modell', async () => {
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [transcriptlessIngestor()],
      condense: async () => ({ pages: ['modules/m/wiki/sources/s-1.md'] }),
      llmAvailable: () => false,
    });

    const job = queue.add({
      kind: 'youtube',
      input: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
    });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('no-content'));

    /* Ein Modell wuerde diese Quelle auch nicht vollstaendiger machen: die
       Warteansage waere unehrlich. */
    expect(queue.job(job.id)?.stage).not.toBe('awaiting-llm');
    expect(queue.job(job.id)?.message).toBe('no-transcript');
  });

  it('nennt ohne jeden Hinweis den allgemeinen Grund no-content', async () => {
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor({ text: '   ' })],
      condense: async () => ({ pages: [] }),
      llmAvailable: () => true,
    });

    const job = queue.add({ kind: 'text', input: 'nur Leerzeichen' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('no-content'));
    expect(queue.job(job.id)?.message).toBe('no-content');
  });

  it('raeumt abgeschlossene Auftraege auf Wunsch weg', async () => {
    const queue = new IngestQueue({ store: memoryStore(), ingestors: [fakeIngestor()] });
    const job = queue.add({ kind: 'text', input: 'fertig' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('awaiting-llm'));
    queue.clearFinished();
    expect(queue.jobs()).toEqual([]);
  });

  /* D8 (050): jeder Fehler mit `code` traegt ihn weiter — nicht nur `IngestError`.
     `WikiError` steht hier stellvertretend fuer 051/064's kuenftige Fehlertypen;
     `describeFailure` liest `code` strukturell, ohne diese Klasse zu kennen. */
  it('scheitert eine Verdichtung mit WikiError conflict, traegt der Auftrag den Code und die Nachricht', async () => {
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor()],
      condense: async () => {
        throw new WikiError('conflict', 'Die Seite wurde zwischenzeitlich geaendert.');
      },
      llmAvailable: () => true,
    });

    const job = queue.add({ kind: 'text', input: 'kollidiert' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('error'));

    expect(queue.job(job.id)?.error).toBe('conflict');
    expect(queue.job(job.id)?.message).toBe('Die Seite wurde zwischenzeitlich geaendert.');
  });

  /* D8 (050), Nachbesserung: ein roher `errno` — hier fingiert, wie ihn eine
     ungewrappte `FsVaultStore`-Operation werfen wuerde (`ENOSPC`, `EACCES`, ...) —
     ist kein Code, fuer den `error.code.*` einen Satz hat. Statt ihn ungeprueft
     als Auftragscode zu tragen (und die Oberflaeche dann den rohen, unuebersetzten
     Key rendern zu lassen), faellt er auf `unknown` zurueck — wie vor D8. */
  it('scheitert eine Verdichtung mit einem rohen Betriebssystem-Fehlercode, faellt der Auftrag auf unknown zurueck', async () => {
    const fsError = new Error('ENOSPC: no space left on device') as Error & { code: string };
    fsError.code = 'ENOSPC';
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor()],
      condense: async () => {
        throw fsError;
      },
      llmAvailable: () => true,
    });

    const job = queue.add({ kind: 'text', input: 'plattenfehler' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('error'));

    expect(queue.job(job.id)?.error).toBe('unknown');
    expect(queue.job(job.id)?.message).toBe('ENOSPC: no space left on device');
  });

  it('bleibt ohne Modell bei awaiting-llm — der generalisierte Fehlerpfad greift nicht', async () => {
    const queue = new IngestQueue({
      store: memoryStore(),
      ingestors: [fakeIngestor()],
      condense: async () => ({ pages: ['modules/m/wiki/sources/s-1.md'] }),
      llmAvailable: () => false,
    });

    const job = queue.add({ kind: 'text', input: 'ohne Modell' });
    await vi.waitFor(() => expect(queue.job(job.id)?.stage).toBe('awaiting-llm'));

    expect(queue.job(job.id)?.stage).not.toBe('error');
    expect(queue.job(job.id)?.error).toBeNull();
  });

  it('meldet einen unbekannten Auftrag ehrlich', () => {
    const queue = new IngestQueue({ store: memoryStore(), ingestors: [fakeIngestor()] });
    expect(queue.job('gibt-es-nicht')).toBeNull();
    expect(queue.cancel('gibt-es-nicht')).toBe(false);
    expect(() => queue.retry('gibt-es-nicht')).toThrow(/Kein Auftrag/);
  });
});
