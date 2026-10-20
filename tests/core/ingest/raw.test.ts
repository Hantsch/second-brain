/* Der Platz unter `raw/` und das Protokoll.
 *
 * Zwei Zusagen aus docs/VAULT-FORMAT.md werden hier geprueft: eine Rohquelle wird nie
 * ueberschrieben, und der Index findet jede Quelle wieder — der Pflegelauf lebt davon,
 * dass `sourcePage: null` sichtbar bleibt. */

import { describe, expect, it } from 'vitest';
import {
  createTextIngestor,
  createUrlIngestor,
  freeRawPath,
  isoStamp,
  loadExistingOutcome,
  logPathFor,
  patchIngestLog,
  readIngestLog,
  writeIngestLog,
  type IngestContext,
} from '@core/ingest';
import { buildIndex } from '@core/index';
import { fakeFetch, ingestFixture, memoryStore } from './fakes';
import { NOW_MS } from '../../helpers/time';

const RECORD = {
  kind: 'text' as const,
  origin: 'paste',
  ingestedAt: '2026-08-10T14:32:00+02:00',
  title: 'Eine Quelle',
  sourcePage: null,
  modules: [],
  provenance: { content: 'paste' },
};

describe('logPathFor', () => {
  it('kennt beide Varianten aus VAULT-FORMAT.md', () => {
    expect(logPathFor('raw/youtube/xOFkpf9KgKg')).toBe('raw/youtube/xOFkpf9KgKg/.ingest.json');
    expect(logPathFor('raw/files/2026-08-10-notiz')).toBe(
      'raw/files/2026-08-10-notiz/.ingest.json',
    );
    expect(logPathFor('raw/web/2026-08-10-artikel.md')).toBe(
      'raw/web/2026-08-10-artikel.ingest.json',
    );
  });
});

describe('freeRawPath', () => {
  it('legt sich neben eine liegende Quelle, statt sie zu ueberschreiben', async () => {
    const store = memoryStore();
    const first = await freeRawPath(store, 'file', 'notiz', new Date(NOW_MS));
    expect(first).toBe('raw/files/2026-08-10-notiz');

    await writeIngestLog(store, first, RECORD);
    const second = await freeRawPath(store, 'file', 'notiz', new Date(NOW_MS));
    expect(second).toBe('raw/files/2026-08-10-notiz-2');
  });
});

describe('isoStamp', () => {
  it('schreibt einen Zeitstempel mit Zeitzone', () => {
    expect(isoStamp(new Date(NOW_MS))).toMatch(/^2026-08-10T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

describe('patchIngestLog', () => {
  it('traegt die Verdichtung nach und laesst alles andere stehen', async () => {
    const store = memoryStore();
    await writeIngestLog(store, 'raw/files/2026-08-10-notiz', RECORD);

    const patched = await patchIngestLog(store, 'raw/files/2026-08-10-notiz', {
      sourcePage: 's-2026-08-10-notiz',
      modules: ['methodik'],
    });

    expect(patched).toMatchObject({
      origin: 'paste',
      title: 'Eine Quelle',
      sourcePage: 's-2026-08-10-notiz',
      modules: ['methodik'],
    });
    expect(await readIngestLog(store, 'raw/files/2026-08-10-notiz')).toEqual(patched);
  });

  it('meldet ein fehlendes Protokoll, statt eines zu erfinden', async () => {
    await expect(patchIngestLog(memoryStore(), 'raw/files/weg', {})).rejects.toThrow(
      /Kein Protokoll/,
    );
  });

  it('liest ein kaputtes Protokoll als null', async () => {
    const store = memoryStore({ 'raw/files/x/.ingest.json': '{ kaputt' });
    expect(await readIngestLog(store, 'raw/files/x')).toBeNull();
  });
});

describe('loadExistingOutcome fuer YouTube', () => {
  it('liest leeren Text, wenn das Protokoll kein Transcript vermerkt', async () => {
    const store = memoryStore();
    const dir = 'raw/youtube/xOFkpf9KgKg';
    await store.writeText(`${dir}/transcript.md`, '# Video\n\n_Kein Transcript verfuegbar._\n');
    await writeIngestLog(store, dir, {
      kind: 'youtube',
      origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
      ingestedAt: '2026-08-10T14:32:00+02:00',
      title: 'Ein Video ohne Transcript',
      sourcePage: null,
      modules: [],
      provenance: { metadata: 'youtubei.js' },
      transcript: { available: false },
    });

    const outcome = await loadExistingOutcome(store, dir);
    expect(outcome.text).toBe('');
  });

  it('liest das Transcript, wenn das Protokoll es als verfuegbar vermerkt', async () => {
    const store = memoryStore();
    const dir = 'raw/youtube/xOFkpf9KgKg';
    await store.writeText(`${dir}/transcript.md`, '# Video\n\nEcht vorhandener Text.\n');
    await writeIngestLog(store, dir, {
      kind: 'youtube',
      origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
      ingestedAt: '2026-08-10T14:32:00+02:00',
      title: 'Ein Video mit Transcript',
      sourcePage: null,
      modules: [],
      provenance: { metadata: 'yt-dlp', transcript: 'yt-dlp' },
      transcript: { available: true },
    });

    const outcome = await loadExistingOutcome(store, dir);
    expect(outcome.text).toContain('Echt vorhandener Text.');
  });
});

describe('Rohquellen im Index', () => {
  it('findet jede aufgenommene Quelle als unverdichtet wieder', async () => {
    const store = memoryStore();
    const { fetchImpl } = fakeFetch({
      body: ingestFixture('article.html'),
      url: 'https://example.org/blog/wissen-verrottet',
    });
    const ctx: IngestContext = { store, now: new Date(NOW_MS), fetchImpl };

    await createUrlIngestor().ingest('https://example.org/blog/wissen-verrottet', ctx);
    await createTextIngestor().ingest('# Rollenvererbung\n\nRollen erben nicht.', ctx);

    const index = await buildIndex(store, { now: new Date(NOW_MS) });

    expect(index.sources).toHaveLength(2);
    for (const source of index.sources) {
      expect(source.sourcePage).toBeNull();
      expect(source.bytes).toBeGreaterThan(0);
      expect(source.ingestedAt.startsWith('2026-08-10')).toBe(true);
    }
    expect(index.sources.map((source) => source.kind).sort()).toEqual(['text', 'url']);
    expect(index.sources.map((source) => source.title)).toContain(
      'Wissen verrottet, wenn niemand es pflegt',
    );
  });
});
