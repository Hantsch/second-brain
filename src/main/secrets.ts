/* Key storage. API keys live encrypted in `<userData>/keys.json`,
   never in the vault, never in the repo, never in a log.

   If `safeStorage` is not available (e.g. Linux without a keyring), nothing
   is written to disk: the keys then live only for the runtime session, and
   the caller learns this via `persisted: false`. */

import { join } from 'node:path';
import { safeStorage } from 'electron';
import { readJson, writeJsonAtomic } from './fs-json';

const KEYS_FILE = 'keys.json';
const KEYS_VERSION = 1;

interface KeysFile {
  version: number;
  /** Provider ID → base64 of the encrypted blob. */
  keys: Record<string, string>;
}

export interface KeySetResult {
  /** Was the key written to disk in encrypted form? */
  persisted: boolean;
  /** Was OS-level encryption available? */
  encrypted: boolean;
}

/** Key ID of a provider. One place, so main and core use the same one. */
export function providerKeyId(providerId: string): string {
  return `provider:${providerId}`;
}

export interface KeyStore {
  /** false = the keys do not survive a restart. The UI states this. */
  readonly encryptionAvailable: boolean;
  has(id: string): boolean;
  get(id: string): string | null;
  set(id: string, secret: string): Promise<KeySetResult>;
  remove(id: string): Promise<void>;
  /** IDs of all known keys — never the keys themselves. */
  ids(): string[];
}

/** The part of Electron's `safeStorage` that we need. Injectable for tests. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

class SafeStorageKeyStore implements KeyStore {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly file: string,
    private readonly storage: SafeStorageLike,
    public readonly encryptionAvailable: boolean,
    private blobs: Record<string, string>,
  ) {}

  has(id: string): boolean {
    return this.cache.has(id) || this.blobs[id] !== undefined;
  }

  get(id: string): string | null {
    const cached = this.cache.get(id);
    if (cached !== undefined) return cached;
    const blob = this.blobs[id];
    if (blob === undefined || !this.encryptionAvailable) return null;
    try {
      const plain = this.storage.decryptString(Buffer.from(blob, 'base64'));
      this.cache.set(id, plain);
      return plain;
    } catch {
      /* Not decryptable (different user profile, different machine): the
         key is lost, but the app keeps running. */
      console.warn('[secrets] key not decryptable:', id);
      return null;
    }
  }

  async set(id: string, secret: string): Promise<KeySetResult> {
    this.cache.set(id, secret);
    if (!this.encryptionAvailable) {
      return { persisted: false, encrypted: false };
    }
    this.blobs = { ...this.blobs, [id]: this.storage.encryptString(secret).toString('base64') };
    await this.flush();
    return { persisted: true, encrypted: true };
  }

  async remove(id: string): Promise<void> {
    this.cache.delete(id);
    if (this.blobs[id] === undefined) return;
    const next = { ...this.blobs };
    delete next[id];
    this.blobs = next;
    await this.flush();
  }

  ids(): string[] {
    return [...new Set([...Object.keys(this.blobs), ...this.cache.keys()])];
  }

  private async flush(): Promise<void> {
    const payload: KeysFile = { version: KEYS_VERSION, keys: this.blobs };
    await writeJsonAtomic(this.file, payload);
  }
}

/** On some systems the check throws instead of returning false. */
function encryptionAvailable(storage: SafeStorageLike): boolean {
  try {
    return storage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Builds the key store. Must run after `app.whenReady()`. */
export async function createKeyStore(
  userDataDir: string,
  storage: SafeStorageLike = safeStorage,
): Promise<KeyStore> {
  const file = join(userDataDir, KEYS_FILE);
  const available = encryptionAvailable(storage);
  const stored = await readJson<KeysFile>(file);
  if (!available) {
    console.warn('[secrets] No OS-level encryption available — keys remain in memory only.');
  }
  return new SafeStorageKeyStore(file, storage, available, stored?.keys ?? {});
}
