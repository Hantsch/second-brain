/* Gemeinsame Testdaten des Index. Bewusst keine `.test.ts`-Datei, damit vitest sie
   nicht als Suite sammelt.

   Zaehlt `walk`/`stat`/`readText`/`writeText` je Aufruf und die tatsaechlich
   geschriebenen Bytes — die Grundlage des Beweises, dass ein pfadgezielter
   Refresh nur stattet und liest, was er wirklich braucht, statt den Baum zu
   durchlaufen oder Buckets anderer Dokumente neu zu schreiben. */

import type { WriteResult } from '@shared/types';
import { byteLength } from '@core/vault/hash';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { ListOptions, VaultStat, WriteTextOptions } from '@core/vault/types';

export class CountingVaultStore extends MemoryVaultStore {
  walkCalls = 0;
  readonly statPaths: string[] = [];
  readonly readTextPaths: string[] = [];
  readonly writeTextPaths: string[] = [];
  writtenBytes = 0;

  override async *walk(options?: ListOptions): AsyncIterable<VaultStat> {
    this.walkCalls += 1;
    yield* super.walk(options);
  }

  override async stat(path: string): Promise<VaultStat | null> {
    this.statPaths.push(path);
    return super.stat(path);
  }

  override async readText(path: string): Promise<string | null> {
    this.readTextPaths.push(path);
    return super.readText(path);
  }

  override async writeText(
    path: string,
    content: string,
    options?: WriteTextOptions,
  ): Promise<WriteResult> {
    this.writeTextPaths.push(path);
    this.writtenBytes += byteLength(content);
    return super.writeText(path, content, options);
  }

  /** Zaehler zuruecksetzen, ohne den Dateiinhalt anzufassen — vor der Messung. */
  reset(): void {
    this.walkCalls = 0;
    this.statPaths.length = 0;
    this.readTextPaths.length = 0;
    this.writeTextPaths.length = 0;
    this.writtenBytes = 0;
  }
}
