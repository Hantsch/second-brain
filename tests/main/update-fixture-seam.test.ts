/* The `SB_E2E_UPDATE_FIXTURE` seam: unset means the real checker stays in use. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateFileFixture } from '../../src/main/update/e2e-fixture';

const ENV = 'SB_E2E_UPDATE_FIXTURE';

describe('the update-fixture seam (SB_E2E_UPDATE_FIXTURE)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, '', '  ', 'bogus', 'offline,bogus'])('%j wires no fixture', async (value) => {
    vi.stubEnv(ENV, value);
    const { updateFixtureFor } = await import('../../src/main/update/e2e-fixture');
    expect(updateFixtureFor()).toBeUndefined();
  });

  it('consumes one outcome per call and repeats the last', async () => {
    vi.stubEnv(ENV, 'offline, http, available');
    const { updateFixtureFor } = await import('../../src/main/update/e2e-fixture');
    const check = updateFixtureFor()!;

    expect(await check()).toEqual({ kind: 'failed', reason: 'network' });
    expect(await check()).toEqual({ kind: 'failed', reason: 'http' });
    const available = await check();
    expect(available).toMatchObject({ kind: 'available', version: '99.0.0' });
    expect(available).toMatchObject({ notes: '### Added\n- Fixture release' });
    expect(await check()).toEqual(available);
  });

  it('up-to-date answers without an offer', async () => {
    vi.stubEnv(ENV, 'up-to-date');
    const { updateFixtureFor } = await import('../../src/main/update/e2e-fixture');
    expect(await updateFixtureFor()!()).toEqual({ kind: 'up-to-date' });
  });
});

describe('the update-fixture file mode', () => {
  let dir: string;
  let file: string;
  const script = (patch: Partial<UpdateFileFixture> = {}): UpdateFileFixture => ({
    distribution: 'installed',
    latest: { version: '99.0.0', notes: 'notes' },
    download: { ticks: 2, tickMs: 1, outcome: 'ok' },
    ...patch,
  });
  const write = (next: unknown): void => writeFileSync(file, JSON.stringify(next), 'utf8');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'update-fixture-'));
    file = join(dir, 'fixture.json');
    delete globalThis.sbUpdateInstallCalls;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([undefined, '', 'missing.json'])('%j means the real backend', async (value) => {
    vi.stubEnv(ENV, value);
    const { updateFileFixtureFor } = await import('../../src/main/update/e2e-fixture');
    expect(updateFileFixtureFor('1.0.0')).toBeUndefined();
  });

  it('an invalid file wires nothing and never throws', async () => {
    writeFileSync(file, '{not json', 'utf8');
    vi.stubEnv(ENV, file);
    const { updateFileFixtureFor } = await import('../../src/main/update/e2e-fixture');
    expect(updateFileFixtureFor('1.0.0')).toBeUndefined();
    write({ distribution: 'other' });
    expect(updateFileFixtureFor('1.0.0')).toBeUndefined();
  });

  it('re-reads the file on every check and download', async () => {
    write(script());
    vi.stubEnv(ENV, file);
    const { updateFileFixtureFor } = await import('../../src/main/update/e2e-fixture');
    const wiring = updateFileFixtureFor('1.0.0')!;
    expect(await wiring.check()).toMatchObject({ kind: 'available', version: '99.0.0' });

    write(script({ latest: null }));
    expect(await wiring.check()).toEqual({ kind: 'up-to-date' });
    write(script({ latest: { version: '1.0.0', notes: '' } }));
    expect(await wiring.check()).toEqual({ kind: 'up-to-date' });

    expect(await wiring.backend.download(new AbortController().signal, () => {})).toEqual({
      kind: 'done',
    });
    write(script({ download: { ticks: 1, tickMs: 1, outcome: 'checksum' } }));
    expect(await wiring.backend.download(new AbortController().signal, () => {})).toEqual({
      kind: 'failed',
      reason: 'checksum',
    });
    write(script({ download: { ticks: 0, tickMs: 1, outcome: 'offline' } }));
    expect(await wiring.backend.download(new AbortController().signal, () => {})).toEqual({
      kind: 'failed',
      reason: 'offline',
    });
  });

  it('takes the distribution from the file', async () => {
    write(script({ distribution: 'portable' }));
    vi.stubEnv(ENV, file);
    const { updateFileFixtureFor } = await import('../../src/main/update/e2e-fixture');
    expect(updateFileFixtureFor('1.0.0')!.distribution).toBe('portable');
  });

  it('reports progress per tick and honours an abort', async () => {
    write(script({ download: { ticks: 50, tickMs: 5, outcome: 'ok' } }));
    vi.stubEnv(ENV, file);
    const { updateFileFixtureFor } = await import('../../src/main/update/e2e-fixture');
    const { backend } = updateFileFixtureFor('1.0.0')!;
    const controller = new AbortController();
    const ratios: Array<number | null> = [];
    const result = await backend.download(controller.signal, (progress) => {
      ratios.push(progress.ratio);
      if (ratios.length === 2) controller.abort();
    });
    expect(result).toEqual({ kind: 'failed', reason: 'cancelled' });
    expect(ratios).toEqual([0.02, 0.04]);
  });

  it('records quitAndInstall without quitting and keeps auto-install off', async () => {
    write(script());
    vi.stubEnv(ENV, file);
    const { updateFileFixtureFor } = await import('../../src/main/update/e2e-fixture');
    const { backend } = updateFileFixtureFor('1.0.0')!;
    backend.quitAndInstall();
    backend.quitAndInstall();
    expect(globalThis.sbUpdateInstallCalls).toHaveLength(2);
    expect(backend.autoInstallOnAppQuit).toBe(false);
  });
});
