/* Faelschungen fuer das Aufnehmen: Dateisystem, Prozessaufruf, fetch.
 *
 * Kein Test dieser Schicht fasst Netz, Platte oder ein Binary an — genau dafuer sind
 * `IngestFileSystem`, `ProcessRunner` und `FetchLike` injizierbar. Wer hier eine
 * echte Datei braucht, nimmt `createTempVault()` aus `tests/helpers/vault.ts`.
 */

import { readFileSync } from 'node:fs';
import { MemoryVaultStore } from '@core/vault';
import type { IngestFileStat, IngestFileSystem, ProcessResult, ProcessRunner } from '@core/ingest';
import { fixturePath } from '../../fixtures';

/** Inhalt einer Ingest-Fixture. */
export function ingestFixture(name: string): string {
  return readFileSync(fixturePath('ingest', name), 'utf8');
}

export interface FakeFileSystem extends IngestFileSystem {
  /** Datei anlegen, als laege sie auf der Platte — Text oder rohe Bytes. */
  put(path: string, content: string | Uint8Array, options?: { executable?: boolean }): void;
  /** Was geschrieben wurde: Pfad → Groesse in Byte. */
  written(): Record<string, number>;
  /** Was kopiert wurde: Ziel → Quelle. */
  copies(): Record<string, string>;
  chmods(): Record<string, number>;
}

interface Entry {
  content: string | Uint8Array;
  bytes: number;
  dir: boolean;
  executable: boolean;
}

/** Ein Dateisystem im Speicher. Trenner ist '/', auch fuer Windows-Pfade. */
export function fakeFileSystem(initial: Record<string, string> = {}): FakeFileSystem {
  const files = new Map<string, Entry>();
  const copied = new Map<string, string>();
  const modes = new Map<string, number>();
  let temp = 0;

  const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '');

  const put = (
    path: string,
    content: string | Uint8Array,
    options: { executable?: boolean } = {},
  ): void => {
    files.set(normalize(path), {
      content,
      bytes: typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.byteLength,
      dir: false,
      executable: options.executable ?? false,
    });
  };

  for (const [path, content] of Object.entries(initial)) put(path, content);

  return {
    put,
    written: () => Object.fromEntries([...files].map(([path, entry]) => [path, entry.bytes])),
    copies: () => Object.fromEntries(copied),
    chmods: () => Object.fromEntries(modes),

    async readText(path) {
      const entry = files.get(normalize(path));
      if (entry === undefined) return null;
      return typeof entry.content === 'string' ? entry.content : null;
    },
    async readBytes(path) {
      const entry = files.get(normalize(path));
      if (entry === undefined) return null;
      if (entry.content instanceof Uint8Array) return entry.content;
      return Buffer.from(entry.content, 'latin1');
    },
    async stat(path): Promise<IngestFileStat | null> {
      const entry = files.get(normalize(path));
      if (entry !== undefined) {
        return { size: entry.bytes, modified: '2026-08-10T12:00:00.000Z', dir: entry.dir };
      }
      const prefix = `${normalize(path)}/`;
      const isDir = [...files.keys()].some((candidate) => candidate.startsWith(prefix));
      return isDir ? { size: 0, modified: '2026-08-10T12:00:00.000Z', dir: true } : null;
    },
    async copyFile(from, to) {
      const entry = files.get(normalize(from));
      if (entry === undefined) throw new Error(`Fake-FS: ${from} fehlt.`);
      files.set(normalize(to), { ...entry });
      copied.set(normalize(to), normalize(from));
    },
    async mkdir(path) {
      files.set(normalize(path), { content: '', bytes: 0, dir: true, executable: false });
    },
    async writeBytes(path, data) {
      files.set(normalize(path), {
        content: Buffer.from(data).toString('utf8'),
        bytes: data.byteLength,
        dir: false,
        executable: true,
      });
    },
    async rename(from, to) {
      const entry = files.get(normalize(from));
      if (entry === undefined) throw new Error(`Fake-FS: ${from} fehlt.`);
      files.delete(normalize(from));
      files.set(normalize(to), entry);
    },
    async remove(path) {
      const target = normalize(path);
      for (const key of [...files.keys()]) {
        if (key === target || key.startsWith(`${target}/`)) files.delete(key);
      }
    },
    async chmod(path, mode) {
      modes.set(normalize(path), mode);
    },
    async isExecutable(path) {
      return files.get(normalize(path))?.executable ?? false;
    },
    async readDir(path) {
      const prefix = `${normalize(path)}/`;
      return [...files.keys()]
        .filter((candidate) => candidate.startsWith(prefix))
        .map((candidate) => candidate.slice(prefix.length))
        .filter((name) => !name.includes('/'));
    },
    async tempDir(prefix) {
      temp += 1;
      const dir = `/tmp/${prefix}${temp}`;
      files.set(dir, { content: '', bytes: 0, dir: true, executable: false });
      return dir;
    },
    join: (...parts) => normalize(parts.filter((part) => part.length > 0).join('/')),
    baseName: (path) => normalize(path).split('/').pop() ?? path,
  };
}

export interface FakeRun {
  runner: ProcessRunner;
  /** Jeder Aufruf: Binary und Argumente. */
  calls: { binary: string; args: string[] }[];
}

/**
 * Ein gefaelschter `spawn`: die Antwort wird an den Argumenten entschieden.
 * `handler` gibt `null` zurueck, wenn dieser Aufruf scheitern soll.
 */
export function fakeRun(
  handler: (binary: string, args: string[]) => Partial<ProcessResult> | null,
): FakeRun {
  const calls: { binary: string; args: string[] }[] = [];
  return {
    calls,
    runner: async (binary, args) => {
      calls.push({ binary, args: [...args] });
      const result = handler(binary, args);
      if (result === null) return { code: 1, stdout: '', stderr: 'ERROR: Fake ist gescheitert' };
      return { code: result.code ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
  };
}

export interface FakeFetchOptions {
  status?: number;
  headers?: Record<string, string>;
  url?: string;
  body?: string;
}

/** Ein `fetch`, das immer dasselbe liefert — und mitschreibt, wonach gefragt wurde. */
export function fakeFetch(reply: FakeFetchOptions | ((url: string) => FakeFetchOptions)): {
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  urls: string[];
  /** Was `init` bei jedem Aufruf mitbekam — fuer Kopfzeilen-Zusicherungen. */
  inits: (RequestInit | undefined)[];
} {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  return {
    urls,
    inits,
    fetchImpl: async (url, init) => {
      urls.push(url);
      inits.push(init);
      const options = typeof reply === 'function' ? reply(url) : reply;
      const response = new Response(options.body ?? '', {
        status: options.status ?? 200,
        headers: options.headers ?? { 'content-type': 'text/html; charset=utf-8' },
      });
      if (options.url !== undefined) {
        Object.defineProperty(response, 'url', { value: options.url });
      }
      return response;
    },
  };
}

/** Ein Vault im Speicher, wie das Aufnehmen ihn braucht. */
export function memoryStore(files: Record<string, string> = {}): MemoryVaultStore {
  return new MemoryVaultStore({ files });
}
