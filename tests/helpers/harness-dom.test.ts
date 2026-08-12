// @vitest-environment jsdom
/* Die beiden DOM-Werkzeuge aus `tests/setup.ts`: die IPC-Attrappe und der
   axe-Helfer.

   Diese Datei liegt unter `tests/helpers/`, wird also von `tsconfig.node.json`
   geprüft — dort gibt es keine DOM-Bibliothek. Deshalb ohne JSX und mit den
   beiden Globals, die hier gebraucht werden, als lokale Erklärung. Zur Laufzeit
   sind es die echten von jsdom. Wandert die Datei einmal in eine DOM-Konfiguration,
   müssen die zwei `declare`-Zeilen weg. */

import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations, installSbMock } from '../setup';

declare const window: {
  sb?: {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
    on(event: string, callback: (payload: unknown) => void): () => void;
    off(event: string, callback: (payload: unknown) => void): void;
  };
};

declare const document: {
  createElement(tag: string): Element & { innerHTML: string };
  body: { append(node: Element): void };
};

describe('installSbMock', () => {
  it('setzt window.sb und protokolliert Aufrufe', async () => {
    const sb = installSbMock({ 'vault:status': () => ({ root: 'C:/demo', name: 'Demo' }) });
    const status = await window.sb?.invoke('vault:status');
    expect(status).toEqual({ root: 'C:/demo', name: 'Demo' });
    expect(sb.calls).toEqual([{ channel: 'vault:status', payload: undefined }]);
    expect(sb.invoke).toHaveBeenCalledTimes(1);
  });

  it('meldet fehlende Handler als IpcError statt still zu antworten', async () => {
    installSbMock();
    await expect(window.sb?.invoke('index:stats')).rejects.toMatchObject({
      code: 'invalid',
      message: 'kein Handler für index:stats',
    });
  });

  it('nimmt einen Rückfall für alle übrigen Kanäle', async () => {
    installSbMock({}, { fallback: (channel) => `fallback:${channel}` });
    await expect(window.sb?.invoke('index:stats')).resolves.toBe('fallback:index:stats');
  });

  it('schickt Ereignisse an die Zuhörer und löst sie wieder', () => {
    const sb = installSbMock();
    const seen: unknown[] = [];
    const stop = window.sb?.on('event:toast', (payload) => seen.push(payload));
    sb.emit('event:toast', { kind: 'info', message: 'Quelle aufgenommen.' });
    expect(seen).toEqual([{ kind: 'info', message: 'Quelle aufgenommen.' }]);
    expect(sb.listenerCount('event:toast')).toBe(1);
    stop?.();
    expect(sb.listenerCount('event:toast')).toBe(0);
  });

  it('wird nach jedem Test entfernt', () => {
    /* Der vorige Test hatte eine Attrappe gesetzt — hier ist sie weg. */
    expect(window.sb).toBeUndefined();
  });
});

describe('expectNoA11yViolations', () => {
  it('lässt eine saubere Fläche durch', async () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<main><h1>Dashboard</h1><button type="button" aria-label="Fenster schließen">x</button></main>';
    document.body.append(container);
    await expectNoA11yViolations(container);
  });

  it('schlägt bei einem Icon-Knopf ohne Namen fehl', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<main><button type="button"></button></main>';
    document.body.append(container);
    await expect(expectNoA11yViolations(container)).rejects.toThrow(/button-name/);
  });
});
