/**
 * Der YouTube-Ingestor: URL herein, Ordner unter `raw/youtube/<video-id>/` heraus.
 *
 * Zusammengesetzt aus der Provider-Kette (`pipeline.ts`) und dem Schreiber
 * (`writer.ts`). Was diese Datei entscheidet, ist nur: welche Provider verfuegbar
 * sind, ob die Quelle schon liegt, und was der Fortschritt meldet.
 *
 * **Liegt die Quelle schon**, wird sie nicht neu geschrieben. Eine Rohquelle ist
 * unveraenderlich (docs/VAULT-FORMAT.md); das vorhandene Transcript ist der Text,
 * den die Verdichtung liest.
 */

import { rawPath } from '@core/vault/paths';
import { isoStamp, readIngestLog } from '../raw';
import { IngestError, throwIfCancelled } from '../types';
import type { IngestContext, IngestNote, IngestOutcome, SourceIngestor } from '../types';
import { harvestVideo } from './pipeline';
import type { YoutubeProvider } from './pipeline';
import { createInnertubeProvider } from './provider-innertube';
import { createYtDlpProvider } from './provider-ytdlp';
import { parseVideoId, watchUrl } from './video-url';
import { writeYoutubeSource, YOUTUBE_FILES } from './writer';

/** Welche Provider laufen koennen. Fehlt yt-dlp, bleibt der Fallback. */
export function buildProviders(ctx: IngestContext): {
  providers: YoutubeProvider[];
  notes: IngestNote[];
} {
  const providers: YoutubeProvider[] = [];
  const notes: IngestNote[] = [];
  const binary = ctx.youtube?.ytdlpPath ?? null;

  if (binary !== null && binary.length > 0 && ctx.run !== undefined && ctx.fs !== undefined) {
    providers.push(
      createYtDlpProvider({
        binary,
        run: ctx.run,
        fs: ctx.fs,
        ...(ctx.languages === undefined ? {} : { languages: ctx.languages }),
        ...(ctx.youtube?.ytdlpArgs === undefined ? {} : { extraArgs: ctx.youtube.ytdlpArgs }),
        ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
      }),
    );
  } else {
    notes.push({ code: 'ytdlp-missing' });
  }

  const innertube = ctx.youtube?.innertube;
  if (innertube !== undefined) {
    providers.push(
      createInnertubeProvider({
        client: innertube,
        ...(ctx.languages === undefined ? {} : { languages: ctx.languages }),
      }),
    );
  }
  return { providers, notes };
}

/** Die bereits liegende Quelle als Ergebnis — ohne eine Datei anzufassen. */
async function reuseExisting(
  ctx: IngestContext,
  dir: string,
  origin: string,
): Promise<IngestOutcome> {
  const log = await readIngestLog(ctx.store, dir);
  const text = (await ctx.store.readText(`${dir}/${YOUTUBE_FILES.transcript}`)) ?? '';
  return {
    kind: 'youtube',
    rawPath: dir,
    title: log?.title ?? dir,
    text,
    origin: log?.origin ?? origin,
    provenance: log?.provenance ?? {},
    notes: Array.isArray(log?.notes) ? log.notes : [],
  };
}

export function createYoutubeIngestor(): SourceIngestor {
  return {
    kind: 'youtube',

    canHandle(input: string): boolean {
      return parseVideoId(input) !== null;
    },

    async ingest(input: string, ctx: IngestContext): Promise<IngestOutcome> {
      const videoId = parseVideoId(input);
      if (videoId === null) {
        throw new IngestError('invalid', 'Das ist keine YouTube-Adresse.', { detail: input });
      }
      throwIfCancelled(ctx.signal);

      const now = ctx.now ?? new Date();
      const dir = rawPath('youtube', videoId, now);
      const origin = watchUrl(videoId);

      if (await ctx.store.exists(`${dir}/.ingest.json`)) {
        ctx.onProgress?.({ stage: 'writing-raw', progress: 1, message: null });
        return reuseExisting(ctx, dir, origin);
      }

      const { providers, notes } = buildProviders(ctx);
      if (providers.length === 0) {
        throw new IngestError(
          'invalid',
          'Kein Weg zu YouTube: yt-dlp fehlt und es ist kein Fallback eingerichtet.',
        );
      }

      ctx.onProgress?.({ stage: 'fetching', progress: 0.1, message: null });
      const harvest = await harvestVideo(videoId, {
        providers,
        ...(ctx.youtube?.stripNonSpeech === undefined
          ? {}
          : { stripNonSpeech: ctx.youtube.stripNonSpeech }),
        ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
        onStep: (step) => {
          ctx.onProgress?.({
            stage: 'fetching',
            progress: step.part === 'metadata' ? 0.3 : 0.6,
            message: `${step.provider}:${step.part}`,
          });
        },
      });

      throwIfCancelled(ctx.signal);
      ctx.onProgress?.({ stage: 'writing-raw', progress: 0.8, message: null });

      const written = await writeYoutubeSource({
        store: ctx.store,
        dir,
        harvest,
        ingestedAt: isoStamp(now),
        module: ctx.module ?? null,
        notes,
      });

      return {
        kind: 'youtube',
        rawPath: written.dir,
        title: written.title,
        text: written.text,
        origin: harvest.metadata.url ?? origin,
        provenance: {
          metadata: harvest.providers[0] ?? 'unbekannt',
          ...(written.transcript.provider === null
            ? {}
            : { transcript: written.transcript.provider }),
        },
        notes: [...notes, ...harvest.notes],
      };
    },
  };
}
