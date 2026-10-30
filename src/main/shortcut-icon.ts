/* Windows takes the taskbar icon from the Start Menu or pinned shortcut that
   carries the app's AppUserModelID, not from the window: once the installer
   (or a dev shortcut for notifications) has created one, `setIcon` never
   reaches the taskbar. So the chosen icon is written into those shortcuts
   too — only into ours, recognised by `APP_ID`. */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { app, shell } from 'electron';
import { APP_ID } from './app-identity';
import { appIconPath } from './app-icon';
import type { Services } from './services';
import { HARNESS } from './window-shared';

/** The shortcut operations this module needs — a seam so tests never touch real shortcuts. */
export interface ShortcutIo {
  list(dir: string): Promise<string[]>;
  /** Throws when the file is not a readable shortcut. */
  read(path: string): { appUserModelId?: string; icon?: string };
  update(path: string, icon: string): boolean;
}

/** The folders Windows consults for an AppUserModelID's taskbar icon. */
export function shortcutDirs(appData: string): string[] {
  return [
    join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
  ];
}

/** Points every shortcut of this app at `icon`. Returns the paths it rewrote. */
export async function updateShortcutIcons(
  dirs: string[],
  icon: string,
  io: ShortcutIo,
): Promise<string[]> {
  const updated: string[] = [];
  for (const dir of dirs) {
    /* A folder that doesn't exist (nothing pinned yet) is simply empty. */
    const names = await io.list(dir).catch(() => []);
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.lnk')) continue;
      const path = join(dir, name);
      let link: { appUserModelId?: string; icon?: string };
      try {
        link = io.read(path);
      } catch {
        continue;
      }
      if (link.appUserModelId !== APP_ID || link.icon === icon) continue;
      if (io.update(path, icon)) updated.push(path);
    }
  }
  return updated;
}

const electronShortcuts: ShortcutIo = {
  list: (dir) => readdir(dir),
  read: (path) => shell.readShortcutLink(path),
  /* The typings demand a full `ShortcutDetails`, so the existing one is passed
     back unchanged apart from the icon — target, app id and toast CLSID stay. */
  update: (path, icon) =>
    shell.writeShortcutLink(path, 'update', {
      ...shell.readShortcutLink(path),
      icon,
      iconIndex: 0,
    }),
};

/** Keeps the shortcuts' icon in step with `customization.appIcon`, now and on every change. */
export function watchShortcutIcon(services: Services): void {
  /* A verification run must not rewrite the developer's own shortcuts. */
  if (process.platform !== 'win32' || HARNESS) return;
  let synced: string | null = null;
  const sync = (): void => {
    const icon = appIconPath(services.settings.app().customization.appIcon);
    if (icon === synced) return;
    synced = icon;
    updateShortcutIcons(shortcutDirs(app.getPath('appData')), icon, electronShortcuts).catch(
      (error: unknown) => console.warn('[shortcut-icon] shortcuts could not be updated:', error),
    );
  };
  sync();
  services.settings.onChange(sync);
}
