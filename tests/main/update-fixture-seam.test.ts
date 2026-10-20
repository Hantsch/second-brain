/* The `SB_E2E_UPDATE_FIXTURE` seam: unset means the real checker stays in use. */

import { afterEach, describe, expect, it, vi } from 'vitest';

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
