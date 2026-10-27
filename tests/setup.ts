/* Gemeinsames Test-Setup. Bewusst umgebungsneutral: Node- und jsdom-Tests
   teilen diese Datei, deshalb wird alles über `globalThis` geprüft und alles
   DOM-Abhängige erst bei Bedarf geladen.

   Was hier steht:
   - `matchMedia`-Stub für jsdom (Gaston fragt `prefers-reduced-motion`)
   - Aufräumen nach jedem Test: React-Bäume, `window.sb`, gefälschte Uhr
   - `installSbMock()` — die IPC-Brücke als Attrappe
   - `expectNoA11yViolations()` — axe-core über einen Ausschnitt
   - feste Zeitkonstanten, wiederexportiert aus `tests/helpers/time.ts`

   Kein Test darf ins Netz oder an ein echtes Modell; die Fakes dafür liegen in
   `tests/fakes/` und `tests/helpers/llm.ts`. */

import { afterEach, expect, vi } from 'vitest';
import type { IpcChannel, IpcError, IpcEventName, IpcEvents, IpcRequest } from '@shared/ipc';

export {
  TODAY,
  NOW,
  NOW_MS,
  day,
  stamp,
  daysBetween,
  freezeTime,
  withFrozenTime,
} from './helpers/time';

interface MediaQueryStub {
  matches: boolean;
  media: string;
  addEventListener: () => void;
  removeEventListener: () => void;
  addListener: () => void;
  removeListener: () => void;
  dispatchEvent: () => boolean;
}

const host = globalThis as {
  window?: { matchMedia?: (query: string) => MediaQueryStub };
  document?: unknown;
};

/* jsdom kennt `matchMedia` nicht — Gaston fragt `prefers-reduced-motion`. */
if (host.window && typeof host.window.matchMedia !== 'function') {
  host.window.matchMedia = (query: string): MediaQueryStub => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

/* Testing-Library nur im DOM laden: im Node-Kontext gibt es kein `document`,
   und der Import würde beim Auswerten scheitern. */
const rtl = host.document ? await import('@testing-library/react') : null;
/* `findBy*` and `waitFor` give up after 1 s by default — a speed limit in
   disguise that a loaded CI runner crosses. A wait only lasts while its
   condition is false, so a longer ceiling costs a passing test nothing. */
rtl?.configure({ asyncUtilTimeout: 10_000 });
const cleanupDom = rtl?.cleanup ?? null;

/* `vi.waitFor` has the same 1 s default and no setting for it; `queue.test.ts`
   lost it under full-suite load in the S19–S22 gates. An explicit timeout at the
   call site still wins. */
const vitestWaitFor = vi.waitFor;
vi.waitFor = ((callback, options) =>
  vitestWaitFor(
    callback,
    typeof options === 'number' ? options : { timeout: 10_000, ...options },
  )) as typeof vi.waitFor;

// ── window.sb ────────────────────────────────────────────────────────────────

/** Antworten je Kanal. Was fehlt, geht an `fallback` oder wird zum Fehler. */
export type SbHandlers = {
  [K in IpcChannel]?: (payload: IpcRequest<K>) => unknown;
};

export interface SbMockOptions {
  /** Für nicht abgedeckte Kanäle, z. B. `mockBridge.invoke`. */
  fallback?: (channel: IpcChannel, payload?: unknown) => unknown;
}

export interface SbMock {
  /** Die Attrappe selbst — `expect(sb.invoke).toHaveBeenCalledWith(...)`. */
  invoke: ReturnType<typeof vi.fn>;
  /** Alle Aufrufe in Reihenfolge. */
  calls: { channel: IpcChannel; payload: unknown }[];
  /** Schickt ein Ereignis an alle Zuhörer — wie der Hauptprozess. */
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
  /** Wie viele Zuhörer auf diesem Ereignis sitzen. */
  listenerCount(event: IpcEventName): number;
  restore(): void;
}

let activeSbMock: SbMock | null = null;

function ipcFailure(code: IpcError['code'], message: string): Error & IpcError {
  return Object.assign(new Error(message), { code, message });
}

/**
 * Setzt `window.sb` auf eine Attrappe. Ohne Handler antwortet jeder Kanal mit
 * einem `IpcError` — so fällt auf, welcher Kanal im Test wirklich gebraucht wird.
 * Wird nach jedem Test automatisch entfernt.
 */
export function installSbMock(handlers: SbHandlers = {}, options: SbMockOptions = {}): SbMock {
  const target = globalThis as { window?: Record<string, unknown> };
  const win = target.window;
  if (!win) throw new Error('installSbMock braucht ein DOM (jsdom-Umgebung).');

  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const listeners = new Map<string, Set<(payload: never) => void>>();

  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (handler) return handler(payload);
    if (options.fallback) return options.fallback(channel, payload);
    throw ipcFailure('invalid', `kein Handler für ${channel}`);
  });

  const on = (event: IpcEventName, callback: (payload: never) => void): (() => void) => {
    const set = listeners.get(event) ?? new Set();
    set.add(callback);
    listeners.set(event, set);
    return () => void set.delete(callback);
  };

  const previous = win['sb'];
  const mock: SbMock = {
    invoke,
    calls,
    emit: (event, payload) => {
      for (const callback of listeners.get(event) ?? []) {
        (callback as (value: unknown) => void)(payload);
      }
    },
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
    restore: () => {
      if (previous === undefined) delete win['sb'];
      else win['sb'] = previous;
      activeSbMock = null;
    },
  };

  win['sb'] = {
    invoke,
    on,
    off: (event: IpcEventName, callback: (payload: never) => void) =>
      void listeners.get(event)?.delete(callback),
  };
  activeSbMock = mock;
  return mock;
}

// ── A11y ─────────────────────────────────────────────────────────────────────

/**
 * Prüft einen gerenderten Ausschnitt mit axe-core.
 *
 * Die Verstöße stehen in der Fehlermeldung selbst (Regel, Einstufung, Hilfe,
 * betroffene Knoten) — deshalb `expect.fail` statt eines Vergleichs: eine
 * Meldung, die man ohne Nachschlagen versteht, ist hier mehr wert als ein Diff.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const axe = (await import('axe-core')).default;
  const result = await axe.run(container, { resultTypes: ['violations'] });
  if (result.violations.length === 0) return;
  const violations = result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'ohne Einstufung'}): ${violation.help} — ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
  expect.fail(`A11y-Verstöße:\n- ${violations.join('\n- ')}`);
}

// ── Aufräumen ────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanupDom?.();
  activeSbMock?.restore();
  /* Ohne gefälschte Timer ein Nichts — mit ihnen die Rettung des nächsten Tests. */
  vi.useRealTimers();
});
