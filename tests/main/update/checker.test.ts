import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  UPDATE_FEED,
  createUpdateChecker,
  detectDistribution,
  type AutoUpdaterLike,
} from '../../../src/main/update/checker';

type Check = AutoUpdaterLike['checkForUpdates'];

function fake(checkForUpdates: Check): AutoUpdaterLike {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    setFeedURL: () => undefined,
    checkForUpdates,
  };
}

const available =
  (releaseNotes: string | Array<{ note?: string | null }> | null): Check =>
  async () => ({
    isUpdateAvailable: true,
    updateInfo: { version: '2.0.0', releaseNotes, releaseDate: '2026-01-02T00:00:00Z' },
  });

describe('update checker', () => {
  it('release notes from GitHub HTML become headings and list items', async () => {
    const html = '<h3>Added</h3><ul><li>Tom &amp; Jerry &amp;lt;b&amp;gt;</li><li>Two</li></ul>';
    const updater = fake(available(html));
    const result = await createUpdateChecker({ autoUpdater: updater }).check();
    expect(result).toEqual({
      kind: 'available',
      version: '2.0.0',
      notes: '### Added\n\n- Tom & Jerry &lt;b&gt;\n\n- Two',
      releasedAt: '2026-01-02T00:00:00Z',
    });
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);

    const arr = await createUpdateChecker({
      autoUpdater: fake(available([{ note: 'a' }, { note: null }, { note: 'b' }])),
    }).check();
    expect(arr).toMatchObject({ notes: 'a\n\n\n\nb' });
    const none = await createUpdateChecker({ autoUpdater: fake(available(null)) }).check();
    expect(none).toMatchObject({ notes: '' });
  });

  it('offline, error responses and a malformed feed map to reason codes', async () => {
    const failing = (error: unknown) =>
      createUpdateChecker({
        autoUpdater: fake(async () => {
          throw error;
        }),
      }).check();
    expect(await failing(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toEqual({
      kind: 'failed',
      reason: 'network',
    });
    expect(await failing(Object.assign(new Error('x'), { statusCode: 404 }))).toEqual({
      kind: 'failed',
      reason: 'http',
    });
    expect(await failing(new Error('Cannot parse latest.yml'))).toEqual({
      kind: 'failed',
      reason: 'feed',
    });
    expect(await failing(new Error('boom'))).toEqual({ kind: 'failed', reason: 'unknown' });
    const upToDate = await createUpdateChecker({
      autoUpdater: fake(async () => ({ isUpdateAvailable: false, updateInfo: { version: '1' } })),
    }).check();
    expect(upToDate).toEqual({ kind: 'up-to-date' });
  });

  it('PORTABLE_EXECUTABLE_DIR marks the portable build', () => {
    expect(detectDistribution({ PORTABLE_EXECUTABLE_DIR: 'D:\\gaston' })).toBe('portable');
    expect(detectDistribution({ PORTABLE_EXECUTABLE_DIR: '' })).toBe('installed');
    expect(detectDistribution({})).toBe('installed');
  });

  it('the feed matches the publish target in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      build?: { publish?: { provider?: string; owner?: string; repo?: string } };
    };
    expect(pkg.build?.publish).toEqual(UPDATE_FEED);
  });
});
