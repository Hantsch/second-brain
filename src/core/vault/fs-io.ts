/**
 * Ausgewiesener Dateisystem-Adapter (zusammen mit `fs-store.ts` der einzige Ort im
 * Kern, der `node:fs` kennt). Hier steht nur die Mechanik: lesen, atomar schreiben,
 * verschieben, aufraeumen — ohne Wissen ueber Vault-Regeln.
 *
 * Windows-Eigenheiten sind hier aufgehoben: `rename` ueber eine bestehende Datei
 * kann durch Virenscanner oder Suchindex kurz mit EPERM scheitern, deshalb Wiederholung.
 */

import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { dirname } from 'node:path';

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY']);

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Dateiinhalt als UTF-8; `null`, wenn es die Datei nicht gibt. */
export async function readTextOrNull(absolutePath: string): Promise<string | null> {
  try {
    return await readFile(absolutePath, 'utf8');
  } catch (error) {
    if (codeOf(error) === 'ENOENT' || codeOf(error) === 'EISDIR') return null;
    throw error;
  }
}

/** `stat`, aber `null` statt Ausnahme, wenn nichts da ist. */
export async function statOrNull(absolutePath: string): Promise<Stats | null> {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if (codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR') return null;
    throw error;
  }
}

export async function ensureDir(absolutePath: string): Promise<void> {
  await mkdir(absolutePath, { recursive: true });
}

/**
 * Atomar schreiben: erst in eine `.tmp`-Nachbardatei, dann per `rename` darueber.
 * Ein Absturz mitten im Schreiben hinterlaesst so nie eine halbe Datei.
 */
export async function writeFileAtomic(absolutePath: string, content: string): Promise<void> {
  await ensureDir(dirname(absolutePath));
  const suffix = `${process.pid.toString(36)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const temporary = `${absolutePath}.${suffix}.tmp`;
  await writeFile(temporary, content, 'utf8');
  try {
    await renameWithRetry(temporary, absolutePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Verschiebt Datei oder Ordner; legt den Zielordner an. */
export async function movePath(from: string, to: string): Promise<void> {
  await ensureDir(dirname(to));
  await renameWithRetry(from, to);
}

export async function removePath(absolutePath: string): Promise<void> {
  await rm(absolutePath, { recursive: true, force: true });
}

/** Ordnerinhalt als Name + Art; leer, wenn es den Ordner nicht gibt. */
export async function readDirEntries(
  absolutePath: string,
): Promise<{ name: string; dir: boolean }[]> {
  try {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, dir: entry.isDirectory() }));
  } catch (error) {
    if (codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR') return [];
    throw error;
  }
}

async function renameWithRetry(from: string, to: string, attempts = 4): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = codeOf(error);
      if (attempt >= attempts || code === undefined || !RETRYABLE.has(code)) throw error;
      await delay(20 * attempt);
    }
  }
}
