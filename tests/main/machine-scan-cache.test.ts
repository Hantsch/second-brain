/* 035, D1: the machine scan remembered in `userData`.
 *
 * The cache is derived state, like the index — so the only thing it must never
 * do is turn a bad file into a failure. Missing, half-written, hand-edited or
 * written by a future version: all of them read as "never scanned", which is
 * the honest empty state the card already knows how to show.
 *
 * Nothing here touches Electron: `createMachineScanCache` takes the directory,
 * exactly like `createKeyStore` in `secrets.ts`.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineFacts } from '@shared/types';
import type { MachineScanCache } from '../../src/main/machine-scan-cache';
import { createMachineScanCache } from '../../src/main/machine-scan-cache';

/** Detection's raw output: no override, no budget — that is all this file stores. */
const RAW_FACTS: MachineFacts = {
  totalRamMb: 32_768,
  cpuCores: 8,
  platform: 'linux',
  arch: 'x64',
  freeDiskMb: 512_000,
  vramMb: null,
  gpuName: 'NVIDIA Corporation GA104M [GeForce RTX 3070 Mobile]',
  gpuDetection: 'detected',
};

const SCANNED_AT = '2026-08-23T10:15:00.000Z';

let dir = '';
let cache: MachineScanCache;
let file = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gaston-machine-scan-'));
  file = join(dir, 'machine-scan.json');
  cache = createMachineScanCache(dir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('the machine-scan cache round trip', () => {
  it('reads back exactly what was written', async () => {
    await cache.write({ scannedAt: SCANNED_AT, facts: RAW_FACTS });

    expect(await cache.read()).toEqual({ scannedAt: SCANNED_AT, facts: RAW_FACTS });
  });

  it('writes a versioned file into the userData directory', async () => {
    await cache.write({ scannedAt: SCANNED_AT, facts: RAW_FACTS });

    const stored = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    expect(stored['version']).toBe(1);
    expect(stored['scannedAt']).toBe(SCANNED_AT);
    expect(stored['facts']).toEqual(RAW_FACTS);
  });

  it('a second scan replaces the first', async () => {
    await cache.write({ scannedAt: SCANNED_AT, facts: RAW_FACTS });
    await cache.write({
      scannedAt: '2026-08-24T09:00:00.000Z',
      facts: { ...RAW_FACTS, cpuCores: 16 },
    });

    const entry = await cache.read();
    expect(entry?.scannedAt).toBe('2026-08-24T09:00:00.000Z');
    expect(entry?.facts.cpuCores).toBe(16);
  });

  it('survives a fresh cache object over the same directory — this is the restart', async () => {
    await cache.write({ scannedAt: SCANNED_AT, facts: RAW_FACTS });

    expect(await createMachineScanCache(dir).read()).toEqual({
      scannedAt: SCANNED_AT,
      facts: RAW_FACTS,
    });
  });
});

describe('an unusable file counts as "never scanned", not as an error', () => {
  it('says null when nothing was ever written', async () => {
    expect(await cache.read()).toBeNull();
  });

  it('says null on a file that is not JSON at all', async () => {
    await writeFile(file, 'not json {{{', 'utf8');

    expect(await cache.read()).toBeNull();
  });

  it('says null on a version it does not know', async () => {
    await writeFile(
      file,
      JSON.stringify({ version: 99, scannedAt: SCANNED_AT, facts: RAW_FACTS }),
      'utf8',
    );

    expect(await cache.read()).toBeNull();
  });

  it('says null when the version field is missing entirely', async () => {
    await writeFile(file, JSON.stringify({ scannedAt: SCANNED_AT, facts: RAW_FACTS }), 'utf8');

    expect(await cache.read()).toBeNull();
  });

  it.each([
    ['no facts at all', { version: 1, scannedAt: SCANNED_AT }],
    [
      'facts of the wrong shape',
      { version: 1, scannedAt: SCANNED_AT, facts: { totalRamMb: '32k' } },
    ],
    [
      'a RAM figure that is not a number',
      { version: 1, scannedAt: SCANNED_AT, facts: { ...RAW_FACTS, totalRamMb: 'plenty' } },
    ],
    [
      'a VRAM figure that is neither a number nor null',
      { version: 1, scannedAt: SCANNED_AT, facts: { ...RAW_FACTS, vramMb: 'lots' } },
    ],
    [
      'an unknown gpuDetection value',
      { version: 1, scannedAt: SCANNED_AT, facts: { ...RAW_FACTS, gpuDetection: 'maybe' } },
    ],
    ['a scan date that is not a date', { version: 1, scannedAt: 'yesterday', facts: RAW_FACTS }],
    ['no scan date', { version: 1, facts: RAW_FACTS }],
    ['an array instead of an object', [{ version: 1 }]],
  ])('says null on %s', async (_case, payload) => {
    await writeFile(file, JSON.stringify(payload), 'utf8');

    expect(await cache.read()).toBeNull();
  });
});

describe('a write that cannot happen', () => {
  it('does not throw — a scan that cannot be remembered is still a scan', async () => {
    /* A file where the cache expects a directory: `mkdir` fails, and with it
       the write. The scan result is already on screen at that point. */
    const blocked = join(dir, 'blocked');
    await writeFile(blocked, 'i am a file', 'utf8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createMachineScanCache(join(blocked, 'nested')).write({
        scannedAt: SCANNED_AT,
        facts: RAW_FACTS,
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
