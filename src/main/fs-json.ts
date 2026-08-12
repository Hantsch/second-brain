/* JSON-Dateien im userData-Verzeichnis lesen und schreiben.
   Geschrieben wird immer atomar (tmp + rename), damit ein Absturz mitten im
   Schreiben keine halbe Datei hinterlässt — Einstellungen und Schlüssel sind
   die einzigen Dateien, die die App außerhalb des Vaults besitzt. */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Liest JSON. Fehlt die Datei oder ist sie kaputt, gibt es null statt eines Fehlers. */
export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    // Fehlend oder unlesbar behandeln wir gleich: die Defaults greifen.
    return null;
  }
}

/** Schreibt JSON atomar: erst in `<datei>.tmp`, dann umbenennen. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Führt `patch` in `base` zusammen: verschachtelte Objekte werden rekursiv
 * gemergt, Arrays und Primitive ersetzt, `undefined` ignoriert. `base` bleibt
 * unberührt — so bleiben Defaults als Referenz gültig.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (!isPlainObject(base)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(value) && isPlainObject(current) ? deepMerge(current, value) : value;
  }
  return out as T;
}
