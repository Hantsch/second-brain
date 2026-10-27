import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateBackend } from '../../../src/main/update/backend';

const fakeUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  allowPrerelease: true,
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('electron-updater', () => ({
  autoUpdater: fakeUpdater,
  CancellationToken: class {
    cancel(): void {}
  },
}));

beforeEach(() => {
  fakeUpdater.checkForUpdates.mockReset();
  fakeUpdater.downloadUpdate.mockReset();
});

describe('update backend download', () => {
  it('download stops before fetching when the feed now names another version', async () => {
    fakeUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.4.0' },
    });

    const outcome = await createUpdateBackend().download(
      new AbortController().signal,
      () => undefined,
      '1.3.0',
    );

    expect(outcome).toEqual({ kind: 'superseded' });
    expect(fakeUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('download fetches when the feed still names the announced version', async () => {
    fakeUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.3.0' },
    });
    fakeUpdater.downloadUpdate.mockResolvedValue(undefined);

    const outcome = await createUpdateBackend().download(
      new AbortController().signal,
      () => undefined,
      '1.3.0',
    );

    expect(outcome).toEqual({ kind: 'done' });
  });
});
