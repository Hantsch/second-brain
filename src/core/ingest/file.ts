/**
 * Eine Datei aufnehmen: das Original wandert unveraendert nach
 * `raw/files/<datum>-<slug>/`, der lesbare Text daneben.
 *
 * Was gelesen wird:
 * - `.md`, `.txt`, `.markdown`, `.csv`, `.json`, `.log` → Text uebernehmen.
 * - `.html`, `.htm` → zu Markdown wandeln, Ergebnis als `source.md` daneben.
 * - `.pdf` → **nicht gelesen.** Die Datei liegt trotzdem als Quelle, und der Nutzer
 *   erfaehrt den Grund (`pdf-not-read`). Ein halbes PDF-Parsing waere eine Quelle,
 *   die aussieht wie Text und keiner ist — das ist schlimmer als eine Absage.
 * - alles andere → abgelegt, nicht gelesen (`binary-not-read`).
 */

import { extName, sanitizeSegment, slugify } from '@core/vault/paths';
import { htmlToArticle } from './html';
import { markdownDoc } from './markdown';
import { freeRawPath, isoStamp, writeIngestLog } from './raw';
import { IngestError, throwIfCancelled } from './types';
import type { IngestContext, IngestNote, IngestOutcome, SourceIngestor } from './types';
import { sourceFingerprint } from './fingerprint';

/** Der Name der Datei, die den ausgelesenen Text traegt. */
export const TEXT_FILE = 'source.md';

const TEXT_EXTENSIONS = [
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.csv',
  '.json',
  '.log',
  '.yml',
  '.yaml',
];
const HTML_EXTENSIONS = ['.html', '.htm', '.xhtml'];

/** Groesse, ab der eine Textdatei nicht mehr am Stueck gelesen wird. */
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type FileHandling = 'text' | 'html' | 'pdf' | 'opaque';

/** Wie mit dieser Datei umzugehen ist — allein an der Endung entschieden. */
export function handlingFor(path: string): FileHandling {
  const ext = extName(path);
  if (TEXT_EXTENSIONS.includes(ext)) return 'text';
  if (HTML_EXTENSIONS.includes(ext)) return 'html';
  if (ext === '.pdf') return 'pdf';
  return 'opaque';
}

/** Sieht die Eingabe wie ein Dateipfad aus (und nicht wie eine URL)? */
export function looksLikePath(input: string): boolean {
  const raw = String(input ?? '').trim();
  if (raw.length === 0 || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return false;
  if (raw.includes('\n')) return false;
  return /^([a-z]:[\\/]|\\\\|\/|\.\.?[\\/])/i.test(raw) || /[\\/]/.test(raw);
}

/** Titel aus dem Dateinamen: Endung weg, Trennzeichen zu Leerzeichen. */
export function titleFromFileName(name: string): string {
  const stem = name.slice(0, name.length - extName(name).length) || name;
  return stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Erste Ueberschrift eines Markdown-Textes, wenn es eine gibt. */
export function titleFromMarkdown(text: string): string | null {
  const match = /^#\s+(.+)$/m.exec(text);
  const title = match?.[1]?.trim();
  return title === undefined || title.length === 0 ? null : title;
}

export function createFileIngestor(): SourceIngestor {
  return {
    kind: 'file',

    canHandle(input: string): boolean {
      return looksLikePath(input);
    },

    async ingest(input: string, ctx: IngestContext): Promise<IngestOutcome> {
      const fs = ctx.fs;
      if (fs === undefined) throw new IngestError('invalid', 'Kein Dateisystem eingerichtet.');

      const source = String(input ?? '').trim();
      const stat = await fs.stat(source);
      if (stat === null || stat.dir) {
        throw new IngestError('not-found', 'Die Datei gibt es nicht.', { detail: source });
      }
      throwIfCancelled(ctx.signal);
      ctx.onProgress?.({ stage: 'fetching', progress: 0.2, message: null });

      const name = fs.baseName(source);
      const handling = handlingFor(name);
      const notes: IngestNote[] = [];
      let text = '';
      let foundTitle: string | null = null;

      if (handling === 'text' || handling === 'html') {
        if (stat.size > MAX_TEXT_BYTES) {
          notes.push({ code: 'content-truncated', detail: String(stat.size) });
        }
        const raw = (await fs.readText(source)) ?? '';
        const content = raw.length > MAX_TEXT_BYTES ? raw.slice(0, MAX_TEXT_BYTES) : raw;
        if (handling === 'html') {
          const article = htmlToArticle(content);
          text = article.markdown;
          foundTitle = article.title;
        } else {
          text = content.replace(/\r\n/g, '\n');
          foundTitle = titleFromMarkdown(text);
        }
      } else if (handling === 'pdf') {
        notes.push({ code: 'pdf-not-read', detail: name });
      } else {
        notes.push({ code: 'binary-not-read', detail: extName(name) || name });
      }

      const title = foundTitle ?? titleFromFileName(name);

      const now = ctx.now ?? new Date();
      const ingestedAt = isoStamp(now);
      const dir = await freeRawPath(ctx.store, 'file', slugify(title), now);
      ctx.onProgress?.({ stage: 'writing-raw', progress: 0.7, message: null });

      await ctx.store.mkdir(dir);
      // Das Original zuerst: es ist die Quelle, alles andere ist daraus abgeleitet.
      const copyName = sanitizeSegment(name);
      await fs.copyFile(source, fs.join(ctx.store.root, ...dir.split('/'), copyName));

      // Nur wenn der lesbare Text nicht schon die Originaldatei ist.
      if (handling === 'html' && text.length > 0) {
        await ctx.store.writeText(
          `${dir}/${TEXT_FILE}`,
          markdownDoc(
            {
              doc_type: 'file',
              title,
              origin: source,
              fetched_at: ingestedAt,
              source_file: copyName,
            },
            [`# ${title}`, '', text],
          ),
        );
      }

      await writeIngestLog(ctx.store, dir, {
        kind: 'file',
        origin: source,
        ingestedAt,
        title,
        sourcePage: null,
        modules: ctx.module === null || ctx.module === undefined ? [] : [ctx.module],
        provenance: { content: handling === 'pdf' || handling === 'opaque' ? 'none' : 'file' },
        fingerprint: sourceFingerprint('file', source),
        notes,
        file: copyName,
        bytes: stat.size,
      });

      return {
        kind: 'file',
        rawPath: dir,
        title,
        text,
        origin: source,
        provenance: { content: handling === 'pdf' || handling === 'opaque' ? 'none' : 'file' },
        notes,
      };
    },
  };
}
