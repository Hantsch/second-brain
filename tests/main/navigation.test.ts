/* The navigation guard: only the app's own entry pages stay in-app, http/https/
   mailto go to the browser, everything else is refused outright. `navigationVerdict`
   is tested directly as a pure function; `attachNavigationGuards` is tested against
   a fake `webContents` EventEmitter, mirroring the `vi.mock('electron')` pattern
   used in tests/main/ipc/ollama-runtime.test.ts. */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import {
  attachNavigationGuards,
  EXTERNAL_PROTOCOLS,
  navigationVerdict,
} from '../../src/main/navigation';

const openExternalMock = vi.fn<(url: string) => Promise<void>>();

vi.mock('electron', () => ({
  shell: { openExternal: (url: string) => openExternalMock(url) },
}));

beforeEach(() => {
  openExternalMock.mockReset();
});

const CURRENT = 'file:///C:/app/out/renderer/index.html';

describe('navigationVerdict', () => {
  it('blocks a file:// URL that is not an app entry page', () => {
    expect(navigationVerdict('file:///C:/app/out/renderer/other.html', CURRENT)).toBe('block');
    expect(navigationVerdict('file:///C:/Windows/System32/calc.exe', CURRENT)).toBe('block');
    expect(navigationVerdict('file:///C:/app/out/renderer/sub/index.html', CURRENT)).toBe('block');
  });

  it("allows the app's own index.html and quick-capture.html", () => {
    expect(navigationVerdict('file:///C:/app/out/renderer/index.html', CURRENT)).toBe('allow');
    expect(navigationVerdict('file:///C:/app/out/renderer/quick-capture.html', CURRENT)).toBe(
      'allow',
    );
  });

  it('allows same-origin navigation on the dev server', () => {
    const devCurrent = 'http://localhost:5173/index.html';
    expect(navigationVerdict('http://localhost:5173/quick-capture.html', devCurrent)).toBe('allow');
  });

  it('hands only http/https/mailto to the browser', () => {
    expect(EXTERNAL_PROTOCOLS).toEqual(new Set(['http:', 'https:', 'mailto:']));
    expect(navigationVerdict('https://example.com', CURRENT)).toBe('external');
    expect(navigationVerdict('http://example.com', CURRENT)).toBe('external');
    expect(navigationVerdict('mailto:someone@example.com', CURRENT)).toBe('external');
    expect(navigationVerdict('ftp://example.com/file', CURRENT)).toBe('block');
    expect(navigationVerdict('javascript:alert(1)', CURRENT)).toBe('block');
    expect(navigationVerdict('data:text/html,<h1>hi</h1>', CURRENT)).toBe('block');
  });

  it('blocks an unparsable URL', () => {
    expect(navigationVerdict('not a url', CURRENT)).toBe('block');
  });

  it('blocks a file:// target with a foreign host even if the path matches', () => {
    expect(navigationVerdict('file://evil.example/C:/app/out/renderer/index.html', CURRENT)).toBe(
      'block',
    );
  });

  it('blocks javascript: and data: targets against an opaque current origin', () => {
    expect(navigationVerdict('javascript:alert(1)', 'about:blank')).toBe('block');
    expect(navigationVerdict('data:text/html,<h1>hi</h1>', 'about:blank')).toBe('block');
  });
});

/** A minimal stand-in for `BrowserWindow['webContents']`: enough of an
    EventEmitter for `will-navigate`, plus the two methods the guard calls. */
function fakeWebContents(currentUrl: string): {
  webContents: {
    getURL: () => string;
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: string }) => void;
    on: EventEmitter['on'];
    emit: EventEmitter['emit'];
  };
  openHandler: { current: ((details: { url: string }) => { action: string }) | null };
} {
  const emitter = new EventEmitter();
  const openHandler: {
    current: ((details: { url: string }) => { action: string }) | null;
  } = { current: null };
  return {
    webContents: {
      getURL: () => currentUrl,
      setWindowOpenHandler: (handler) => {
        openHandler.current = handler;
      },
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
    },
    openHandler,
  };
}

describe('attachNavigationGuards', () => {
  it('lets an allowed will-navigate proceed without calling preventDefault or openExternal', () => {
    const { webContents } = fakeWebContents(CURRENT);
    attachNavigationGuards({ webContents } as unknown as BrowserWindow);
    const preventDefault = vi.fn();
    webContents.emit('will-navigate', { preventDefault }, CURRENT);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('prevents default and opens the browser for an external will-navigate target', () => {
    const { webContents } = fakeWebContents(CURRENT);
    attachNavigationGuards({ webContents } as unknown as BrowserWindow);
    const preventDefault = vi.fn();
    webContents.emit('will-navigate', { preventDefault }, 'https://example.com');
    expect(preventDefault).toHaveBeenCalled();
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com');
  });

  it('prevents default and does nothing further for a blocked will-navigate target', () => {
    const { webContents } = fakeWebContents(CURRENT);
    attachNavigationGuards({ webContents } as unknown as BrowserWindow);
    const preventDefault = vi.fn();
    webContents.emit('will-navigate', { preventDefault }, 'file:///C:/Windows/System32/calc.exe');
    expect(preventDefault).toHaveBeenCalled();
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('denies every window-open and routes only external URLs to the browser', () => {
    const { webContents, openHandler } = fakeWebContents(CURRENT);
    attachNavigationGuards({ webContents } as unknown as BrowserWindow);
    expect(openHandler.current).not.toBeNull();

    const externalResult = openHandler.current?.({ url: 'https://example.com' });
    expect(externalResult).toEqual({ action: 'deny' });
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com');

    openExternalMock.mockClear();
    const blockedResult = openHandler.current?.({ url: 'ftp://example.com/file' });
    expect(blockedResult).toEqual({ action: 'deny' });
    expect(openExternalMock).not.toHaveBeenCalled();
  });
});
