/* Fetching a filed YouTube source again (`ctx.refetch`) — the one path that replaces
 * raw payload. The first run goes through the fallback only and comes back without a
 * transcript, exactly the state a missing yt-dlp leaves behind; the second run has
 * a faked yt-dlp. No network, no binary. */

import { describe, expect, it, vi } from 'vitest';
import { createYoutubeIngestor, type IngestContext } from '@core/ingest';
import { fakeFileSystem, fakeRun, ingestFixture, memoryStore } from './fakes';
import { NOW_MS } from '../../helpers/time';

const ID = 'xOFkpf9KgKg';
const URL = `https://www.youtube.com/watch?v=${ID}`;
const DIR = `raw/youtube/${ID}`;
const PASTED = 'Von Hand eingefuegtes Transcript, das nicht verloren gehen darf.';

type Store = ReturnType<typeof memoryStore>;

/** The first run: fallback only, no transcript — as on a machine without yt-dlp. */
async function fileWithoutTranscript(store: Store): Promise<void> {
  const ctx: IngestContext = {
    store,
    now: new Date(NOW_MS),
    module: 'ai-topics',
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
  expect(outcome.text).toBe('');
}

/** A refetch with a faked yt-dlp; `subtitles: false` lets it find no track either. */
function refetchContext(store: Store, options: { subtitles: boolean }): IngestContext {
  const fs = fakeFileSystem();
  const run = fakeRun((_binary, args) => {
    if (args.includes('--dump-single-json')) return { stdout: ingestFixture('ytdlp-info.json') };
    if (args.includes('--write-subs') && options.subtitles) {
      const template = args[args.indexOf('-o') + 1] ?? '';
      const dir = template.slice(0, template.lastIndexOf('/'));
      fs.put(`${dir}/${ID}.de.json3`, ingestFixture('captions.json3'));
    }
    return { stdout: '' };
  });
  return {
    store,
    now: new Date(NOW_MS),
    refetch: true,
    languages: ['original', 'de', 'en'],
    fs,
    run: run.runner,
    youtube: { ytdlpPath: 'C:/bin/yt-dlp.exe' },
  };
}

async function readLog(store: Store): Promise<Record<string, unknown>> {
  return JSON.parse((await store.readText(`${DIR}/.ingest.json`)) ?? '{}') as Record<
    string,
    unknown
  >;
}

describe('YouTube refetch', () => {
  it('replaces a source without transcript and keeps its target module', async () => {
    const store = memoryStore();
    await fileWithoutTranscript(store);

    const outcome = await createYoutubeIngestor().ingest(
      URL,
      refetchContext(store, { subtitles: true }),
    );

    expect(outcome.rawPath).toBe(DIR);
    expect(outcome.text.length).toBeGreaterThan(0);
    expect(outcome.provenance).toEqual({ metadata: 'yt-dlp', transcript: 'yt-dlp' });
    expect(await store.exists(`${DIR}/transcript.timestamped.md`)).toBe(true);
    const log = await readLog(store);
    expect(log['transcript']).toMatchObject({ available: true, provider: 'yt-dlp' });
    expect(log['modules']).toEqual(['ai-topics']);
    expect(log['sourcePage']).toBeNull();
  });

  it('puts every replaced file into the trash first, so a pasted transcript survives', async () => {
    const store = memoryStore();
    await fileWithoutTranscript(store);
    const placeholder = (await store.readText(`${DIR}/transcript.md`)) ?? '';
    await store.writeText(`${DIR}/transcript.md`, `${placeholder}\n${PASTED}\n`);
    const snapshot = vi.spyOn(store, 'snapshot');

    await createYoutubeIngestor().ingest(URL, refetchContext(store, { subtitles: true }));

    expect(snapshot.mock.calls.map(([path]) => path)).toEqual([
      `${DIR}/metadata.md`,
      `${DIR}/metadata.json`,
      `${DIR}/transcript.md`,
      `${DIR}/transcript.timestamped.md`,
    ]);
    expect(await store.readText(`${DIR}/transcript.md`)).not.toContain(PASTED);
    const token = await snapshot.mock.results[2]?.value;
    expect(typeof token).toBe('string');
    await store.undo(String(token));
    expect(await store.readText(`${DIR}/transcript.md`)).toContain(PASTED);
  });

  it('writes nothing when the second fetch finds no transcript either', async () => {
    const store = memoryStore();
    await fileWithoutTranscript(store);
    const files = ['metadata.md', 'metadata.json', 'transcript.md', '.ingest.json'];
    const before = await Promise.all(files.map((file) => store.readText(`${DIR}/${file}`)));
    const snapshot = vi.spyOn(store, 'snapshot');

    const outcome = await createYoutubeIngestor().ingest(
      URL,
      refetchContext(store, { subtitles: false }),
    );

    expect(outcome.text).toBe('');
    expect(outcome.notes.map((note) => note.code)).toContain('no-transcript');
    expect(snapshot).not.toHaveBeenCalled();
    const after = await Promise.all(files.map((file) => store.readText(`${DIR}/${file}`)));
    expect(after).toEqual(before);
  });

  it('refuses a source that was already condensed, before fetching anything', async () => {
    const store = memoryStore();
    await fileWithoutTranscript(store);
    const log = await readLog(store);
    await store.writeText(
      `${DIR}/.ingest.json`,
      JSON.stringify({ ...log, sourcePage: 's-2026-10-13-video' }),
    );
    const ctx = refetchContext(store, { subtitles: true });
    const run = vi.fn(ctx.run);

    await expect(createYoutubeIngestor().ingest(URL, { ...ctx, run })).rejects.toMatchObject({
      code: 'invalid',
      detail: 'condensed',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a source that already has a transcript', async () => {
    const store = memoryStore();
    await createYoutubeIngestor().ingest(URL, {
      ...refetchContext(store, { subtitles: true }),
      refetch: false,
    });

    await expect(
      createYoutubeIngestor().ingest(URL, refetchContext(store, { subtitles: true })),
    ).rejects.toMatchObject({ code: 'invalid', detail: 'has-transcript' });
  });
});
