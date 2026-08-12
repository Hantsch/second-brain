/**
 * Eingefuegten Text aufnehmen: `raw/files/<datum>-<slug>/source.md`.
 *
 * Das ist der Weg fuer alles, was ein Nutzer aus einem Chat, einem PDF oder einer
 * Mail herueberkopiert. Der Text wird **nicht** eingeordnet und nicht umgeschrieben
 * — eine Rohquelle ist wortwoertlich, was hereinkam. Wer einen Gedanken loswerden
 * will, nimmt das Erfassen (`inbox/`); hier geht es um fremdes Material.
 */

import { slugify } from '@core/vault/paths';
import { markdownDoc } from './markdown';
import { TEXT_FILE, titleFromMarkdown } from './file';
import { freeRawPath, isoStamp, writeIngestLog } from './raw';
import { IngestError, throwIfCancelled } from './types';
import type { IngestContext, IngestOutcome, SourceIngestor } from './types';

/** So viele Zeichen der ersten Zeile werden zum Titel, wenn keine Ueberschrift da ist. */
const TITLE_CHARS = 70;

/** Titel eines eingefuegten Textes: Ueberschrift, sonst die erste inhaltliche Zeile. */
export function titleForText(text: string): string {
  const heading = titleFromMarkdown(text);
  if (heading !== null) return heading;
  const first = text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|>\s*)/, '').trim())
    .find((line) => line.length > 0);
  if (first === undefined) return 'Notiz';
  if (first.length <= TITLE_CHARS) return first;
  const cut = first.slice(0, TITLE_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > TITLE_CHARS * 0.5 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

export function createTextIngestor(): SourceIngestor {
  return {
    kind: 'text',

    canHandle(input: string): boolean {
      return String(input ?? '').trim().length > 0;
    },

    async ingest(input: string, ctx: IngestContext): Promise<IngestOutcome> {
      const text = String(input ?? '')
        .replace(/\r\n/g, '\n')
        .trim();
      if (text.length === 0) throw new IngestError('invalid', 'Der Text ist leer.');
      throwIfCancelled(ctx.signal);

      const now = ctx.now ?? new Date();
      const ingestedAt = isoStamp(now);
      const title = titleForText(text);
      const dir = await freeRawPath(ctx.store, 'file', slugify(title), now);
      ctx.onProgress?.({ stage: 'writing-raw', progress: 0.6, message: null });

      await ctx.store.mkdir(dir);
      await ctx.store.writeText(
        `${dir}/${TEXT_FILE}`,
        markdownDoc({ doc_type: 'text', title, origin: 'paste', fetched_at: ingestedAt }, [
          `# ${title}`,
          '',
          text,
        ]),
      );

      await writeIngestLog(ctx.store, dir, {
        kind: 'text',
        origin: 'paste',
        ingestedAt,
        title,
        sourcePage: null,
        modules: ctx.module === null || ctx.module === undefined ? [] : [ctx.module],
        provenance: { content: 'paste' },
        notes: [],
      });

      return {
        kind: 'text',
        rawPath: dir,
        title,
        text,
        origin: 'paste',
        provenance: { content: 'paste' },
        notes: [],
      };
    },
  };
}
