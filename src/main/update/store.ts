/* The last update check, remembered between two app starts.

   Machine-local and derived, like the index: this file may be deleted at any
   time — the app then simply does not know of an update until the next check,
   and nothing is lost. It lives in `userData`, never in the vault: which
   version this machine runs belongs to this machine, not to the notes on it.

   `checkedWith` is the app version that wrote the record, so a stored offer can
   be discarded once the app has been updated past it.

   Mirrors `machine-scan-cache.ts`: own `version`, `readJson` / `writeJsonAtomic`. */

import { join } from 'node:path';
import type { UpdateFailure, UpdateOffer } from '@shared/types';
import { readJson, writeJsonAtomic } from '../fs-json';

const RECORD_FILE = 'update-check.json';
const RECORD_VERSION = 1;
const FAILURES: readonly UpdateFailure[] = ['network', 'http', 'feed', 'timeout', 'unknown'];

export interface UpdateRecord {
  version: 1;
  /** App version that ran the check. */
  checkedWith: string;
  update: UpdateOffer | null;
  error: UpdateFailure | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function asOffer(value: unknown): UpdateOffer | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { version, notes, releasedAt } = value;
  if (typeof version !== 'string' || typeof notes !== 'string' || !isStringOrNull(releasedAt)) {
    return undefined;
  }
  return { version, notes, releasedAt };
}

function asRecord(stored: unknown): UpdateRecord | null {
  if (!isRecord(stored) || stored['version'] !== RECORD_VERSION) return null;
  const { checkedWith, error, lastCheckedAt, lastSuccessAt } = stored;
  const update = asOffer(stored['update']);
  if (typeof checkedWith !== 'string' || update === undefined) return null;
  if (error !== null && !FAILURES.includes(error as UpdateFailure)) return null;
  if (!isStringOrNull(lastCheckedAt) || !isStringOrNull(lastSuccessAt)) return null;
  return {
    version: RECORD_VERSION,
    checkedWith,
    update,
    error: error as UpdateFailure | null,
    lastCheckedAt,
    lastSuccessAt,
  };
}

/** Reads `<dir>/update-check.json`; missing, damaged or foreign files are `null`. */
export async function loadUpdateRecord(dir: string): Promise<UpdateRecord | null> {
  return asRecord(await readJson<unknown>(join(dir, RECORD_FILE)));
}

/** Remembers a check. Never throws: an unremembered check only costs a re-check. */
export async function saveUpdateRecord(dir: string, record: UpdateRecord): Promise<void> {
  try {
    await writeJsonAtomic(join(dir, RECORD_FILE), record);
  } catch (error) {
    console.warn('[update] check not remembered:', error);
  }
}
