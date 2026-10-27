/* The setup manifest: the single record of which files Gaston installed, from which
 * template, at which version and with which content hash. Anything that cannot be
 * read as a manifest counts as no manifest — ownership then falls back to markers,
 * which can only ever make fewer files Gaston's, never more. */

import { AGENT_SETUP_MANIFEST } from '../../shared/types/agent-setup';
import { sha256 } from '../vault/hash';
import type { SetupStore } from './setup-types';

export interface SetupManifestEntry {
  path: string;
  template: string;
  version: number;
  hash: string;
}

export interface SetupManifestRead {
  files: SetupManifestEntry[];
  /** sha256 of the manifest as read, `''` when absent — the guard for writing it back. */
  hash: string;
}

const MANIFEST_KIND = 'agent-setup-manifest';

function isEntry(value: unknown): value is SetupManifestEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.path === 'string' &&
    typeof entry.template === 'string' &&
    typeof entry.version === 'number' &&
    Number.isInteger(entry.version) &&
    typeof entry.hash === 'string'
  );
}

function parseEntries(text: string): SetupManifestEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const manifest = parsed as Record<string, unknown>;
  if (manifest.gaston !== MANIFEST_KIND || !Array.isArray(manifest.files)) return [];
  return manifest.files.filter(isEntry);
}

export async function readSetupManifest(store: SetupStore): Promise<SetupManifestRead> {
  const text = await store.readText(AGENT_SETUP_MANIFEST);
  if (text === null) return { files: [], hash: '' };
  return { files: parseEntries(text), hash: sha256(text) };
}

export function serializeSetupManifest(files: readonly SetupManifestEntry[]): string {
  const manifest = {
    gaston: MANIFEST_KIND,
    files: files.map(({ path, template, version, hash }) => ({ path, template, version, hash })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Records freshly written files: their entries replace older ones for the same path,
 * entries of every other file survive. Guarded by the hash the manifest had when read.
 */
export async function recordSetupFiles(
  store: SetupStore,
  read: SetupManifestRead,
  written: readonly SetupManifestEntry[],
): Promise<void> {
  const replaced = new Set(written.map((entry) => entry.path));
  const files = [...read.files.filter((entry) => !replaced.has(entry.path)), ...written];
  await store.writeText(AGENT_SETUP_MANIFEST, serializeSetupManifest(files), {
    expectedHash: read.hash,
  });
}
