/* 058, D2: the tray menu template and its wiring.
 *
 * `trayMenuTemplate` is pure — no Electron `Menu`/`Tray` involved — so most of
 * this file exercises it directly with a fake `TrayActions` object. The two
 * cases at the bottom go one layer further and prove `createAppTray` wires
 * "quit" to the real `app.quit()` and "quick capture" to the real
 * `triggerQuickCapture`, the same click-handler style `close-guard.test.ts`
 * uses for `app.quit()`. */

import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import type * as Hotkey from '../../src/main/hotkey';
import type { Services } from '../../src/main/services';
import type { AppIcon } from '@shared/types';

const electron = vi.hoisted(() => {
  let capturedTemplate: MenuItemConstructorOptions[] | null = null;
  class FakeTray {
    static last: FakeTray | null = null;
    destroyed = false;
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    setImage = vi.fn();
    on = vi.fn();
    isDestroyed = () => this.destroyed;
    destroy = vi.fn();
    constructor() {
      FakeTray.last = this;
    }
  }
  return {
    capturedTemplate: () => capturedTemplate,
    app: { quit: vi.fn(), isPackaged: false },
    Tray: FakeTray,
    Menu: {
      buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => {
        capturedTemplate = template;
        return { template };
      }),
    },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } }),
    },
  };
});

vi.mock('electron', () => ({
  app: electron.app,
  Tray: electron.Tray,
  Menu: electron.Menu,
  globalShortcut: electron.globalShortcut,
  screen: electron.screen,
  BrowserWindow: class {},
}));

/* Only `triggerQuickCapture` is replaced with a spy — everything else in the
   module (the hotkey registration machinery) keeps its real implementation,
   mirroring `will-quit.test.ts`'s `importOriginal` pattern. */
const triggerQuickCapture = vi.fn();
vi.mock('../../src/main/hotkey', async (importOriginal) => ({
  ...(await importOriginal<typeof Hotkey>()),
  triggerQuickCapture,
}));

const { trayMenuTemplate, createAppTray } = await import('../../src/main/tray');
const { appIconPath } = await import('../../src/main/app-icon');

type SettingsListener = (snapshot: { app: { customization: { appIcon: AppIcon } } }) => void;

function fakeServices(listeners: SettingsListener[] = []): Services {
  return {
    settings: {
      app: () => ({ customization: { appIcon: 'knowledge-garden' } }),
      uiLanguage: () => 'en',
      onChange: (listener: SettingsListener) => {
        listeners.push(listener);
        return () => undefined;
      },
    },
    mainWindow: () => null,
    sendEvent: () => undefined,
  } as unknown as Services;
}

function idsOf(template: MenuItemConstructorOptions[]): (string | undefined)[] {
  return template.map((item) => item.id);
}

describe('trayMenuTemplate', () => {
  it('has stable ids in order: open, quick-capture, separator, quit', () => {
    const actions = { open: vi.fn(), quickCapture: vi.fn(), quit: vi.fn() };
    const template = trayMenuTemplate('en', actions);
    expect(idsOf(template)).toEqual(['open', 'quick-capture', undefined, 'quit']);
    expect(template[2]?.type).toBe('separator');
  });

  it('labels in English', () => {
    const actions = { open: vi.fn(), quickCapture: vi.fn(), quit: vi.fn() };
    const template = trayMenuTemplate('en', actions);
    expect(template.find((item) => item.id === 'open')?.label).toBe('Open Gaston');
    expect(template.find((item) => item.id === 'quick-capture')?.label).toBe('Quick capture');
    expect(template.find((item) => item.id === 'quit')?.label).toBe('Quit Gaston');
  });

  it('labels in German', () => {
    const actions = { open: vi.fn(), quickCapture: vi.fn(), quit: vi.fn() };
    const template = trayMenuTemplate('de', actions);
    expect(template.find((item) => item.id === 'open')?.label).toBe('Gaston öffnen');
    expect(template.find((item) => item.id === 'quick-capture')?.label).toBe('Schnell erfassen');
    expect(template.find((item) => item.id === 'quit')?.label).toBe('Gaston beenden');
  });

  it("the quit item's click handler calls the passed quit action", () => {
    const actions = { open: vi.fn(), quickCapture: vi.fn(), quit: vi.fn() };
    const template = trayMenuTemplate('en', actions);
    const quitItem = template.find((item) => item.id === 'quit');
    (quitItem?.click as () => void)();
    expect(actions.quit).toHaveBeenCalledTimes(1);
  });

  it("the quick-capture item's click handler calls the passed quick-capture action", () => {
    const actions = { open: vi.fn(), quickCapture: vi.fn(), quit: vi.fn() };
    const template = trayMenuTemplate('en', actions);
    const item = template.find((entry) => entry.id === 'quick-capture');
    (item?.click as () => void)();
    expect(actions.quickCapture).toHaveBeenCalledTimes(1);
  });
});

describe('createAppTray wiring', () => {
  it('wires the quit item to the real app.quit()', () => {
    electron.app.quit.mockClear();
    createAppTray(fakeServices());
    const template = electron.capturedTemplate();
    if (!template) throw new Error('no menu template captured');
    const quitItem = template.find((item) => item.id === 'quit');
    (quitItem?.click as () => void)();
    expect(electron.app.quit).toHaveBeenCalledTimes(1);
  });

  it('wires the quick-capture item to the real triggerQuickCapture', () => {
    triggerQuickCapture.mockClear();
    const services = fakeServices();
    createAppTray(services);
    const template = electron.capturedTemplate();
    if (!template) throw new Error('no menu template captured');
    const item = template.find((entry) => entry.id === 'quick-capture');
    (item?.click as () => void)();
    expect(triggerQuickCapture).toHaveBeenCalledWith(services);
  });
});

describe('createAppTray settings sync', () => {
  function trayWithListener() {
    const listeners: SettingsListener[] = [];
    createAppTray(fakeServices(listeners));
    const tray = electron.Tray.last;
    const listener = listeners[0];
    if (!tray || !listener) throw new Error('no tray or no settings listener');
    return { tray, listener };
  }

  it('a new app icon in the settings becomes the tray icon (D-i)', () => {
    const { tray, listener } = trayWithListener();
    listener({ app: { customization: { appIcon: 'neural-core' } } });
    expect(tray.setImage).toHaveBeenCalledWith(appIconPath('neural-core'));
  });

  it('a settings change after the tray was destroyed touches nothing', () => {
    const { tray, listener } = trayWithListener();
    tray.setContextMenu.mockClear();
    tray.destroyed = true;
    expect(() => listener({ app: { customization: { appIcon: 'neural-core' } } })).not.toThrow();
    expect(tray.setContextMenu).not.toHaveBeenCalled();
    expect(tray.setImage).not.toHaveBeenCalled();
  });
});
