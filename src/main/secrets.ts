/* Schlüsselspeicher. API-Keys liegen verschlüsselt in `<userData>/keys.json`,
   niemals im Vault, niemals im Repo, niemals in einem Log.

   Steht `safeStorage` nicht zur Verfügung (z. B. Linux ohne Keyring), wird
   nichts auf die Platte geschrieben: die Schlüssel leben dann nur für die
   Laufzeit, und der Aufrufer erfährt das über `persisted: false`. */

import { join } from 'node:path';
import { safeStorage } from 'electron';
import { readJson, writeJsonAtomic } from './fs-json';

const KEYS_FILE = 'keys.json';
const KEYS_VERSION = 1;

interface KeysFile {
  version: number;
  /** Provider-ID → base64 des verschlüsselten Blobs. */
  keys: Record<string, string>;
}

export interface KeySetResult {
  /** Wurde der Schlüssel verschlüsselt auf die Platte geschrieben? */
  persisted: boolean;
  /** Stand eine Betriebssystem-Verschlüsselung zur Verfügung? */
  encrypted: boolean;
}

/** Schlüssel-ID eines Providers. Eine Stelle, damit Main und Kern dieselbe benutzen. */
export function providerKeyId(providerId: string): string {
  return `provider:${providerId}`;
}

export interface KeyStore {
  /** false = die Schlüssel überleben den Neustart nicht. Die Oberfläche sagt das. */
  readonly encryptionAvailable: boolean;
  has(id: string): boolean;
  get(id: string): string | null;
  set(id: string, secret: string): Promise<KeySetResult>;
  remove(id: string): Promise<void>;
  /** IDs aller bekannten Schlüssel — nie die Schlüssel selbst. */
  ids(): string[];
}

/** Der Teil von Electrons `safeStorage`, den wir brauchen. Injizierbar für Tests. */
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
      /* Nicht entschlüsselbar (anderes Benutzerprofil, anderer Rechner): der
         Schlüssel ist verloren, aber die App läuft weiter. */
      console.warn('[secrets] Schlüssel nicht entschlüsselbar:', id);
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

/** Auf manchen Systemen wirft die Abfrage, statt false zu liefern. */
function encryptionAvailable(storage: SafeStorageLike): boolean {
  try {
    return storage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Baut den Schlüsselspeicher. Muss nach `app.whenReady()` laufen. */
export async function createKeyStore(
  userDataDir: string,
  storage: SafeStorageLike = safeStorage,
): Promise<KeyStore> {
  const file = join(userDataDir, KEYS_FILE);
  const available = encryptionAvailable(storage);
  const stored = await readJson<KeysFile>(file);
  if (!available) {
    console.warn(
      '[secrets] Keine Betriebssystem-Verschlüsselung verfügbar — Schlüssel bleiben nur im Speicher.',
    );
  }
  return new SafeStorageKeyStore(file, storage, available, stored?.keys ?? {});
}
