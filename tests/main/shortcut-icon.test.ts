/* The taskbar shows the icon of the shortcut carrying Gaston's AppUserModelID,
 * not the window's — so the chosen app icon has to land in those shortcuts.
 * Driven through a fake `ShortcutIo`: no test may touch real shortcuts. */

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { APP_ID } from '../../src/main/app-identity';
import type { ShortcutIo } from '../../src/main/shortcut-icon';

vi.mock('electron', () => ({ app: { isPackaged: false }, shell: {} }));

const { shortcutDirs, updateShortcutIcons } = await import('../../src/main/shortcut-icon');

const ICON = join('icons', 'neural-core.ico');

type Link = { appUserModelId?: string; icon?: string };

/** Folders of shortcuts; a `null` link is a file that is not a readable shortcut. */
function fakeIo(folders: Record<string, Record<string, Link | null>>) {
  const links = new Map<string, Link | null>();
  for (const [dir, files] of Object.entries(folders)) {
    for (const [name, link] of Object.entries(files)) links.set(join(dir, name), link);
  }
  const io: ShortcutIo & { update: ReturnType<typeof vi.fn> } = {
    list: (dir) => {
      const files = folders[dir];
      return files ? Promise.resolve(Object.keys(files)) : Promise.reject(new Error('ENOENT'));
    },
    read: (path) => {
      const link = links.get(path);
      if (!link) throw new Error('not a shortcut');
      return link;
    },
    update: vi.fn((_path: string, _icon: string) => true),
  };
  return io;
}

describe('updateShortcutIcons', () => {
  it('points a shortcut carrying the app id at the chosen icon', async () => {
    const io = fakeIo({ menu: { 'Gaston.lnk': { appUserModelId: APP_ID, icon: 'old.ico' } } });
    const updated = await updateShortcutIcons(['menu'], ICON, io);
    expect(io.update).toHaveBeenCalledWith(join('menu', 'Gaston.lnk'), ICON);
    expect(updated).toEqual([join('menu', 'Gaston.lnk')]);
  });

  it('leaves the shortcuts of other apps alone', async () => {
    const io = fakeIo({ menu: { 'Brave.lnk': { appUserModelId: 'Brave', icon: 'brave.ico' } } });
    expect(await updateShortcutIcons(['menu'], ICON, io)).toEqual([]);
    expect(io.update).not.toHaveBeenCalled();
  });

  it('does not rewrite a shortcut that already shows the icon', async () => {
    const io = fakeIo({ menu: { 'Gaston.lnk': { appUserModelId: APP_ID, icon: ICON } } });
    await updateShortcutIcons(['menu'], ICON, io);
    expect(io.update).not.toHaveBeenCalled();
  });

  it('a missing folder, a non-shortcut and an unreadable shortcut do not stop the rest', async () => {
    const io = fakeIo({
      pinned: {
        'desktop.ini': { appUserModelId: APP_ID },
        'Broken.lnk': null,
        'Electron.lnk': { appUserModelId: APP_ID },
      },
    });
    const updated = await updateShortcutIcons(['missing', 'pinned'], ICON, io);
    expect(updated).toEqual([join('pinned', 'Electron.lnk')]);
    expect(io.update).toHaveBeenCalledTimes(1);
  });
});

describe('shortcutDirs', () => {
  it('covers the Start Menu and the pinned taskbar shortcuts', () => {
    expect(shortcutDirs('appdata')).toEqual([
      join('appdata', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      join('appdata', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
    ]);
  });
});
