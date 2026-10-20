/**
 * Die echten Adapter fuer Dateisystem und Prozessaufruf.
 *
 * Der einzige Ort im Aufnehmen, der `node:fs` und `node:child_process` kennt — genau
 * wie `vault/fs-io.ts` fuer den Vault. Alles darueber arbeitet gegen
 * `IngestFileSystem` und `ProcessRunner` und ist damit ohne Netz und ohne Binary
 * testbar. Diese Datei wird in Tests **nicht** benutzt.
 */

import { spawn } from 'node:child_process';
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { IngestFileStat, IngestFileSystem, ProcessResult, ProcessRunner } from './types';

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

export function nodeFileSystem(): IngestFileSystem {
  return {
    async readText(path: string): Promise<string | null> {
      try {
        return await readFile(path, 'utf8');
      } catch (error) {
        if (codeOf(error) === 'ENOENT' || codeOf(error) === 'EISDIR') return null;
        throw error;
      }
    },

    async readBytes(path: string): Promise<Uint8Array | null> {
      try {
        return await readFile(path);
      } catch (error) {
        if (codeOf(error) === 'ENOENT' || codeOf(error) === 'EISDIR') return null;
        throw error;
      }
    },

    async stat(path: string): Promise<IngestFileStat | null> {
      try {
        const info = await stat(path);
        return { size: info.size, modified: info.mtime.toISOString(), dir: info.isDirectory() };
      } catch {
        return null;
      }
    },

    async copyFile(from: string, to: string): Promise<void> {
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    },

    async mkdir(path: string): Promise<void> {
      await mkdir(path, { recursive: true });
    },

    async writeBytes(path: string, data: Uint8Array): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },

    async rename(from: string, to: string): Promise<void> {
      await rename(from, to);
    },

    async remove(path: string): Promise<void> {
      await rm(path, { recursive: true, force: true });
    },

    async chmod(path: string, mode: number): Promise<void> {
      if (process.platform === 'win32') return;
      await chmod(path, mode);
    },

    async isExecutable(path: string): Promise<boolean> {
      try {
        // Windows kennt kein Ausfuehrbar-Bit: dort zaehlt, dass die Datei da ist.
        await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },

    async readDir(path: string): Promise<string[]> {
      try {
        return await readdir(path);
      } catch {
        return [];
      }
    },

    tempDir(prefix: string): Promise<string> {
      return mkdtemp(join(tmpdir(), prefix));
    },

    join: (...parts: string[]): string => join(...parts),
    baseName: (path: string): string => basename(path),
  };
}

/**
 * Prozessaufruf mit Timeout und Abbruch. `windowsHide` haelt die Konsole unsichtbar
 * — sonst blitzt bei jedem yt-dlp-Aufruf ein Fenster auf.
 */
export function nodeProcessRunner(): ProcessRunner {
  return (binary, args, options = {}) =>
    new Promise<ProcessResult>((resolve, reject) => {
      const { timeoutMs = 180_000, signal, cwd } = options;
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(binary, args, { windowsHide: true, ...(cwd === undefined ? {} : { cwd }) });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn();
      };

      function onAbort(): void {
        child.kill('SIGKILL');
        finish(() => reject(new Error('Aufruf abgebrochen.')));
      }

      if (signal !== undefined) {
        if (signal.aborted) {
          child.kill('SIGKILL');
          finish(() => reject(new Error('Aufruf abgebrochen.')));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill('SIGKILL');
          finish(() => reject(new Error(`Timeout nach ${Math.round(timeoutMs / 1000)}s.`)));
        }, timeoutMs);
      }

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error) => finish(() => reject(error)));
      child.on('close', (code) => finish(() => resolve({ code: code ?? -1, stdout, stderr })));
    });
}
