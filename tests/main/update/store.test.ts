import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadUpdateRecord, saveUpdateRecord } from '../../../src/main/update/store';
import type { UpdateRecord } from '../../../src/main/update/store';

const RECORD: UpdateRecord = {
  version: 1,
  checkedWith: '1.2.0',
  update: {
    version: '1.3.0',
    notes: 'Fixes and a new tab.',
    releasedAt: '2026-10-01T08:00:00.000Z',
  },
  error: null,
  lastCheckedAt: '2026-10-20T09:00:00.000Z',
  lastSuccessAt: '2026-10-20T09:00:00.000Z',
};

let dir = '';
let file = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gaston-update-check-'));
  file = join(dir, 'update-check.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('update check store', () => {
  it('a saved record is read back from userData', async () => {
    await saveUpdateRecord(dir, RECORD);
    expect(await loadUpdateRecord(dir)).toEqual(RECORD);

    const failed: UpdateRecord = { ...RECORD, update: null, error: 'timeout' };
    await saveUpdateRecord(dir, failed);
    expect(await loadUpdateRecord(dir)).toEqual(failed);
  });

  it('a damaged or foreign-version file reads as nothing known', async () => {
    expect(await loadUpdateRecord(dir)).toBeNull();

    const bad: unknown[] = [
      'not json {{{',
      JSON.stringify({ ...RECORD, version: 99 }),
      JSON.stringify({ ...RECORD, version: undefined }),
      JSON.stringify({ ...RECORD, error: 'boom' }),
      JSON.stringify({ ...RECORD, update: { version: 2 } }),
      JSON.stringify({ ...RECORD, lastCheckedAt: 5 }),
      JSON.stringify([RECORD]),
    ];
    for (const content of bad) {
      await writeFile(file, content as string, 'utf8');
      expect(await loadUpdateRecord(dir)).toBeNull();
    }
  });
});
