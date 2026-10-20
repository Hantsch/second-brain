/* Keys in memory. For tests, and for the case where there is no encrypted
   storage available (then the keys are gone after quitting — better than
   writing them to disk in plain text).

   The real storage lives in main (`safeStorage`) and implements the same
   interface. */

import type { KeyStore } from './types';

export class MemoryKeyStore implements KeyStore {
  private readonly keys = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [id, key] of Object.entries(initial)) this.keys.set(id, key);
  }

  get(providerId: string): string | null {
    return this.keys.get(providerId) ?? null;
  }

  set(providerId: string, key: string): void {
    if (key.length === 0) this.keys.delete(providerId);
    else this.keys.set(providerId, key);
  }

  remove(providerId: string): void {
    this.keys.delete(providerId);
  }
}
