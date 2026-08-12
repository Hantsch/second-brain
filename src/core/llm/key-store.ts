/* Schlüssel im Speicher. Für Tests und für den Fall, dass es keine
   verschlüsselte Ablage gibt (dann sind die Schlüssel nach dem Beenden weg —
   besser als sie im Klartext auf die Platte zu schreiben).

   Die echte Ablage sitzt im Main (`safeStorage`) und implementiert dasselbe
   Interface. */

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
