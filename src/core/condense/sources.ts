/**
 * The hash contract of a condensed area (story 039, D1): how an artifact records
 * *which* documents it was built from and *what they looked like then*, and how
 * that record is read back.
 *
 * The artifact keeps two frontmatter fields, and the split is the whole point:
 *
 * - `sources:` stays what it always was — a plain list of vault-relative paths,
 *   the same key wiki pages use for evidence, readable in Obsidian and editable
 *   by hand. It is the inventory: one entry per document the run read.
 * - `source_hashes:` is a path → sha256 map that *annotates* that list. A run
 *   writes one entry per source; nothing else in the app depends on it.
 *
 * Two fields instead of one hash-carrying `sources:` entry, because the plain
 * list has readers (the IPC payload, the condensed tab's "N sources") and human
 * readers, and turning its entries into objects would cost both for no gain.
 *
 * What falls out of the split is exactly the honesty story 039 asks for
 * (Decision "A source entry without a hash counts as changed"): an artifact
 * written before this contract existed, or a path a user typed into `sources:`
 * by hand, has no entry in the map and reads back as `hash: null`. The check
 * then says "I cannot tell this is current" instead of assuming freshness.
 *
 * Pure frontmatter work: no file access, no model. The reader takes a
 * frontmatter record rather than a parsed artifact so the maintenance check can
 * use it on an `IndexedDoc` straight out of the index, without reading the file.
 */

import type { Frontmatter } from '@core/vault/frontmatter';
import type { CondenseInput } from './inputs';

/** The frontmatter field holding path → content hash. */
export const SOURCE_HASHES_FIELD = 'source_hashes';

/** One input as the artifact recorded it. `hash: null` means the file does not say. */
export interface RecordedSource {
  /** Vault-relative path, as it stands in `sources:`. */
  path: string;
  /** The hash recorded for that path, or `null` when none was. */
  hash: string | null;
}

/** The `sources:` list of an artifact: vault-relative paths, in file order. */
export function sourcePaths(frontmatter: Frontmatter): string[] {
  const value = frontmatter['sources'];
  if (typeof value === 'string') return cleanPaths([value]);
  if (!Array.isArray(value)) return [];
  return cleanPaths(value.filter((entry): entry is string => typeof entry === 'string'));
}

/**
 * The `source_hashes:` map of an artifact. A missing, malformed or hand-mangled
 * field is not an error — it yields an empty map, and every source then reads
 * back without a hash, which is the honest answer.
 */
export function sourceHashesIn(frontmatter: Frontmatter): Record<string, string> {
  const value = frontmatter[SOURCE_HASHES_FIELD];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const hashes: Record<string, string> = {};
  for (const [path, hash] of Object.entries(value as Record<string, unknown>)) {
    const key = path.trim();
    if (key.length === 0 || typeof hash !== 'string') continue;
    const text = hash.trim();
    if (text.length > 0) hashes[key] = text;
  }
  return hashes;
}

/**
 * What the artifact says it was built from: every `sources:` entry, each with
 * the hash recorded for it or `null`.
 *
 * `sources:` is the authority on *which* inputs there were — a hash entry for a
 * path no longer listed is ignored rather than resurrecting an input.
 */
export function recordedSources(frontmatter: Frontmatter): RecordedSource[] {
  const hashes = sourceHashesIn(frontmatter);
  return sourcePaths(frontmatter).map((path) => ({ path, hash: hashes[path] ?? null }));
}

/** The `source_hashes:` map for an inventory from `areaInputs()`. */
export function sourceHashesOf(inputs: readonly CondenseInput[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const input of inputs) {
    if (input.path.length > 0 && input.hash.length > 0) hashes[input.path] = input.hash;
  }
  return hashes;
}

function cleanPaths(paths: readonly string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}
