/* `shell:openPath` / `shell:showInFolder` refuse anything outside the open
 * vault (057, D1) — through a fake `shell.openPath`/`shell.showItemInFolder`,
 * never a real process. Checked:
 *   - an absolute path outside the vault, a sibling folder that only shares
 *     the vault's string prefix, and a relative path that climbs out with
 *     `..` are all refused with `invalid`, and the OS is never touched
 *     (AC1).
 *   - opening a vault file, revealing an ingested raw file, and revealing
 *     the vault root itself keep working (AC6).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellHandlers } from '../../../src/main/ipc/shell';
import type { Services } from '../../../src/main/services';

const openPathMock = vi.fn<(path: string) => Promise<string>>();
const showItemInFolderMock = vi.fn<(path: string) => void>();

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  shell: {
    openPath: (path: string) => openPathMock(path),
    showItemInFolder: (path: string) => showItemInFolderMock(path),
  },
}));

function fakeServices(root: string | null): Services {
  return { vaultRoot: () => root } as unknown as Services;
}

beforeEach(() => {
  openPathMock.mockReset();
  openPathMock.mockResolvedValue('');
  showItemInFolderMock.mockReset();
});

describe('shell:openPath / shell:showInFolder refuse what is not the vault (AC1)', () => {
  let vaultRoot: string;

  beforeEach(() => {
    vaultRoot = mkdtempSync(join(tmpdir(), 'gaston-vault-'));
  });

  afterEach(() => {
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('refuses an absolute path outside the vault with invalid and never calls the OS', async () => {
    const handlers = shellHandlers(fakeServices(vaultRoot));
    const outside = mkdtempSync(join(tmpdir(), 'gaston-outside-'));

    await expect(handlers['shell:openPath']?.({ path: outside })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(openPathMock).not.toHaveBeenCalled();

    expect(() => handlers['shell:showInFolder']?.({ path: outside })).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );
    expect(showItemInFolderMock).not.toHaveBeenCalled();

    rmSync(outside, { recursive: true, force: true });
  });

  it("refuses a sibling folder that only shares the vault's prefix", async () => {
    const handlers = shellHandlers(fakeServices(vaultRoot));
    const sibling = join(`${vaultRoot}-evil`, 'file.md');

    await expect(handlers['shell:openPath']?.({ path: sibling })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(openPathMock).not.toHaveBeenCalled();

    expect(() => handlers['shell:showInFolder']?.({ path: sibling })).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );
    expect(showItemInFolderMock).not.toHaveBeenCalled();
  });

  it('refuses a relative path that climbs out with ..', async () => {
    const handlers = shellHandlers(fakeServices(vaultRoot));

    await expect(handlers['shell:openPath']?.({ path: '../outside.md' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(openPathMock).not.toHaveBeenCalled();

    expect(() => handlers['shell:showInFolder']?.({ path: '../outside.md' })).toThrowError(
      expect.objectContaining({ code: 'invalid' }),
    );
    expect(showItemInFolderMock).not.toHaveBeenCalled();
  });
});

describe('shell:openPath / shell:showInFolder keep legitimate flows working (AC6)', () => {
  let vaultRoot: string;

  beforeEach(() => {
    vaultRoot = mkdtempSync(join(tmpdir(), 'gaston-vault-'));
  });

  afterEach(() => {
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('opens a vault file in the OS editor', async () => {
    const filePath = join(vaultRoot, 'note.md');
    writeFileSync(filePath, '# note');
    const handlers = shellHandlers(fakeServices(vaultRoot));

    await handlers['shell:openPath']?.({ path: 'note.md' });

    expect(openPathMock).toHaveBeenCalledWith(filePath);
  });

  it('reveals an ingested raw file in its folder', () => {
    const rawPath = join(vaultRoot, 'raw', 'youtube', 'transcript.md');
    const handlers = shellHandlers(fakeServices(vaultRoot));

    handlers['shell:showInFolder']?.({ path: 'raw/youtube/transcript.md' });

    expect(showItemInFolderMock).toHaveBeenCalledWith(rawPath);
  });

  it('reveals the vault root itself', () => {
    const handlers = shellHandlers(fakeServices(vaultRoot));

    handlers['shell:showInFolder']?.({ path: vaultRoot });

    expect(showItemInFolderMock).toHaveBeenCalledWith(vaultRoot);
  });
});
