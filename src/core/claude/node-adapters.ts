/**
 * Der echte Verzeichnis- und Datei-Adapter.
 *
 * Die einzige Stelle im Claude-Modul, die `node:fs` kennt — wie
 * `vault/fs-io.ts` fuer den Vault und `ingest/node-adapters.ts` fuer das
 * Aufnehmen. In Tests wird diese Datei **nicht** benutzt; dort steht ein
 * Speicher-Adapter davor, damit kein Test das echte `~/.claude` liest.
 *
 * Streng lesend: Dateien werden mit `'r'` geoeffnet, nie geschrieben, nie
 * angefasst — die mtime einer Verlaufsdatei ist die Grundlage der Sortierung und
 * darf sich vom Mitlesen nicht veraendern.
 */

import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ClaudeFileInfo, ClaudeFileSystem } from './types';

/** So viele Dateien werden gleichzeitig abgefragt. */
const STAT_BATCH = 32;

export function nodeClaudeFileSystem(): ClaudeFileSystem {
  return {
    async listDirs(path: string): Promise<string[]> {
      try {
        const entries = await readdir(path, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      } catch {
        return [];
      }
    },

    async listFiles(path: string): Promise<ClaudeFileInfo[]> {
      let names: string[];
      try {
        const entries = await readdir(path, { withFileTypes: true });
        names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
      } catch {
        return [];
      }
      const files: ClaudeFileInfo[] = [];
      for (let start = 0; start < names.length; start += STAT_BATCH) {
        const batch = names.slice(start, start + STAT_BATCH);
        const read = await Promise.all(
          batch.map(async (name): Promise<ClaudeFileInfo | null> => {
            try {
              const info = await stat(join(path, name));
              return {
                path: join(path, name),
                name,
                size: info.size,
                modified: info.mtime.toISOString(),
              };
            } catch {
              return null;
            }
          }),
        );
        for (const file of read) if (file !== null) files.push(file);
      }
      return files;
    },

    async readRange(path: string, start: number, length: number): Promise<string> {
      if (length <= 0) return '';
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      try {
        handle = await open(path, 'r');
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, Math.max(0, start));
        return buffer.subarray(0, bytesRead).toString('utf8');
      } catch {
        return '';
      } finally {
        await handle?.close();
      }
    },

    async exists(path: string): Promise<boolean> {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },

    join: (...parts: string[]): string => join(...parts),
    homeDir: (): string => homedir(),
  };
}
