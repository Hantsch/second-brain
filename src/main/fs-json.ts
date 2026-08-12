/* Reading and writing JSON files in the userData directory.
   Writes always happen atomically (tmp + rename), so a crash mid-write
   doesn't leave a half-written file — settings and keys are the only files
   the app owns outside of the vault. */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Reads JSON. If the file is missing or broken, returns null instead of an error. */
export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    // We treat missing and unreadable the same way: the defaults kick in.
    return null;
  }
}

/** Writes JSON atomically: first to `<file>.tmp`, then renames it. */
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
 * Merges `patch` into `base`: nested objects are merged recursively, arrays
 * and primitives are replaced, `undefined` is ignored. `base` stays
 * untouched — this way defaults remain valid as a reference.
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
