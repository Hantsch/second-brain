/* Der YouTube-Ingestor von der URL bis zum Ordner unter `raw/youtube/`.
 *
 * yt-dlp wird gefaelscht: der Prozessaufruf gibt den Fixture-Dump zurueck und legt die
 * Untertiteldatei ins gefaelschte Temp-Verzeichnis. Damit laeuft die ganze Kette —
 * Spurwahl, Cues, Prosa, Deep-Links, Protokoll — ohne Netz und ohne Binary. */

import { describe, expect, it } from 'vitest';
import { createYoutubeIngestor, type IngestContext, type IngestProgressEvent } from '@core/ingest';
import { fakeFileSystem, fakeRun, ingestFixture, memoryStore } from './fakes';
import { NOW_MS } from '../../helpers/time';

const ID = 'xOFkpf9KgKg';
const URL = `https://www.youtube.com/watch?v=${ID}`;
const DIR = `raw/youtube/${ID}`;

function setup(): {
  ctx: IngestContext;
  store: ReturnType<typeof memoryStore>;
  calls: { binary: string; args: string[] }[];
  events: IngestProgressEvent[];
} {
  const store = memoryStore();
  const fs = fakeFileSystem();
  const events: IngestProgressEvent[] = [];

  const run = fakeRun((_binary, args) => {
    if (args.includes('--dump-single-json')) {
      return { stdout: ingestFixture('ytdlp-info.json') };
    }
    if (args.includes('--write-subs')) {
      // yt-dlp schreibt `<id>.<lang>.<ext>` in das mit `-o` genannte Verzeichnis.
      const template = args[args.indexOf('-o') + 1] ?? '';
      const dir = template.slice(0, template.lastIndexOf('/'));
      fs.put(`${dir}/${ID}.de.json3`, ingestFixture('captions.json3'));
      return { stdout: '' };
    }
    return { stdout: '' };
  });

  const ctx: IngestContext = {
    store,
    now: new Date(NOW_MS),
    languages: ['original', 'de', 'en'],
    module: 'second-brain-methodik',
    fs,
    run: run.runner,
    youtube: { ytdlpPath: 'C:/bin/yt-dlp.exe' },
    onProgress: (event) => events.push(event),
  };
  return { ctx, store, calls: run.calls, events };
}

describe('YoutubeIngestor', () => {
  it('erkennt nur YouTube-Adressen', () => {
    const ingestor = createYoutubeIngestor();
    expect(ingestor.kind).toBe('youtube');
    expect(ingestor.canHandle(URL)).toBe(true);
    expect(ingestor.canHandle('https://example.org/artikel')).toBe(false);
  });

  it('schreibt den Ordner im yougrab-Aufbau', async () => {
    const { ctx, store } = setup();
    const outcome = await createYoutubeIngestor().ingest(URL, ctx);

    expect(outcome.rawPath).toBe(DIR);
    expect(outcome.title).toBe('Dein zweites Gehirn verrottet langsam');
    expect(outcome.origin).toBe(URL);
    expect(outcome.provenance).toEqual({ metadata: 'yt-dlp', transcript: 'yt-dlp' });

    for (const file of [
      'metadata.md',
      'metadata.json',
      'transcript.md',
      'transcript.timestamped.md',
      '.ingest.json',
    ]) {
      expect(await store.exists(`${DIR}/${file}`), file).toBe(true);
    }
    // Die Description verlinkt etwas, also gibt es den leeren Ablageordner.
    expect(await store.exists(`${DIR}/sources`)).toBe(true);
  });

  it('legt Metadaten als Markdown und als JSON ab', async () => {
    const { ctx, store } = setup();
    await createYoutubeIngestor().ingest(URL, ctx);

    const markdown = (await store.readText(`${DIR}/metadata.md`)) ?? '';
    expect(markdown).toContain('doc_type: video-metadata');
    expect(markdown).toContain('# Dein zweites Gehirn verrottet langsam');
    expect(markdown).toContain('- **Kanal:** [Beispielkanal](https://www.youtube.com/channel/');
    expect(markdown).toContain('- **Dauer:** 1m 36s');
    expect(markdown).toContain('## Kapitel');
    expect(markdown).toContain('| `00:30` | Drei Anzeichen |');
    expect(markdown).toContain('## Links in der Description');
    expect(markdown).toContain('<https://example.org/karpathy-wiki>');

    const json: unknown = JSON.parse((await store.readText(`${DIR}/metadata.json`)) ?? '{}');
    const payload = json as {
      provenance: Record<string, string>;
      transcript: { cueCount: number };
    };
    expect(payload.provenance['title']).toBe('yt-dlp');
    expect(payload.transcript.cueCount).toBeGreaterThan(0);
  });

  it('schreibt das Transcript als Prosa und als zitierfaehige Zeilen', async () => {
    const { ctx, store } = setup();
    await createYoutubeIngestor().ingest(URL, ctx);

    const prose = (await store.readText(`${DIR}/transcript.md`)) ?? '';
    expect(prose).toContain('## 00:00 — Einleitung');
    expect(prose).toContain('Wir sprechen über Größe und Übersicht.');
    // Sound-Marker sind aus der Prosa verschwunden.
    expect(prose).not.toContain('[Music]');
    expect(prose).not.toContain('[Applause]');

    const stamped = (await store.readText(`${DIR}/transcript.timestamped.md`)) ?? '';
    expect(stamped).toContain(`](https://youtu.be/${ID}?t=3)`);
    expect(stamped).toContain('- [`00:00:03`]');
  });

  it('schreibt das Protokoll nach VAULT-FORMAT', async () => {
    const { ctx, store } = setup();
    await createYoutubeIngestor().ingest(URL, ctx);

    const record: unknown = JSON.parse((await store.readText(`${DIR}/.ingest.json`)) ?? '{}');
    expect(record).toMatchObject({
      kind: 'youtube',
      origin: URL,
      title: 'Dein zweites Gehirn verrottet langsam',
      sourcePage: null,
      modules: ['second-brain-methodik'],
      provenance: { metadata: 'yt-dlp', transcript: 'yt-dlp' },
    });
    const stamp = (record as { ingestedAt: string }).ingestedAt;
    expect(stamp).toMatch(/^2026-08-10T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('waehlt die manuelle deutsche Spur und laedt genau diese', async () => {
    const { ctx, calls } = setup();
    await createYoutubeIngestor().ingest(URL, ctx);

    const download = calls.find((call) => call.args.includes('--write-subs'));
    expect(download?.args[download.args.indexOf('--sub-langs') + 1]).toBe('de');
    expect(download?.args).toContain('--sub-format');
  });

  it('meldet Fortschritt in Stufen', async () => {
    const { ctx, events } = setup();
    await createYoutubeIngestor().ingest(URL, ctx);
    expect(events.map((event) => event.stage)).toContain('fetching');
    expect(events[events.length - 1]?.stage).toBe('writing-raw');
  });

  it('schreibt eine liegende Quelle nicht neu', async () => {
    const first = setup();
    await createYoutubeIngestor().ingest(URL, first.ctx);
    const before = (await first.store.readText(`${DIR}/transcript.md`)) ?? '';

    const second: IngestContext = { ...first.ctx };
    const outcome = await createYoutubeIngestor().ingest(URL, second);

    expect(outcome.rawPath).toBe(DIR);
    expect(outcome.text).toBe(before);
    expect(outcome.title).toBe('Dein zweites Gehirn verrottet langsam');
    // Der zweite Lauf hat kein weiteres yt-dlp gestartet.
    expect(first.calls.filter((call) => call.args.includes('--dump-single-json'))).toHaveLength(1);
  });

  it('nimmt ohne yt-dlp den Fallback und sagt, dass das Binary fehlt', async () => {
    const store = memoryStore();
    const ctx: IngestContext = {
      store,
      now: new Date(NOW_MS),
      youtube: {
        ytdlpPath: null,
        innertube: async () => ({
          getInfo: async () => ({
            basic_info: {
              id: ID,
              title: 'Aus dem Fallback',
              short_description: 'Beschreibung',
              duration: 60,
              channel: { name: 'Kanal' },
            },
          }),
        }),
      },
    };

    const outcome = await createYoutubeIngestor().ingest(URL, ctx);

    expect(outcome.provenance['metadata']).toBe('youtubei.js');
    expect(outcome.notes.map((note) => note.code)).toEqual(['ytdlp-missing', 'no-transcript']);
    expect(await store.exists(`${DIR}/transcript.md`)).toBe(true);
    expect((await store.readText(`${DIR}/transcript.md`)) ?? '').toContain(
      '_Kein Transcript verfuegbar._',
    );
  });

  it('sagt ehrlich, wenn es keinen Weg zu YouTube gibt', async () => {
    const ctx: IngestContext = { store: memoryStore(), youtube: { ytdlpPath: null } };
    await expect(createYoutubeIngestor().ingest(URL, ctx)).rejects.toThrow(/yt-dlp fehlt/);
  });

  it('lehnt eine Adresse ohne Video-ID ab', async () => {
    const ctx: IngestContext = { store: memoryStore() };
    await expect(createYoutubeIngestor().ingest('https://example.org', ctx)).rejects.toThrow(
      /keine YouTube-Adresse/,
    );
  });
});
