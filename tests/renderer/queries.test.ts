// @vitest-environment jsdom
/* Die Query-Keys sind der Vertrag zwischen Abfrage und Invalidierung.
 *
 * Zwei Fehler fallen ohne Maschine nicht auf, weil beide „funktionieren":
 * - **Zwei Bereiche mit demselben Key** teilen sich stillschweigend einen
 *   Zwischenspeicher — die eine Ansicht zeigt dann die Daten der anderen.
 * - **Eine Wurzel in `VAULT_DEPENDENT_ROOTS`, die es nicht gibt**, invalidiert
 *   nichts; die Ansicht bleibt nach einer Dateiänderung stehen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { qk, VAULT_DEPENDENT_ROOTS } from '@renderer/lib/queries/keys';
import {
  dismissGardenerStopped,
  getGardenerProgress,
  markGardenerStopped,
  seedGardenerProgress,
  seedGardenerProgressOnReady,
  setGardenerProgress,
  useGardenerProgress,
  useGardenerStopped,
} from '@renderer/lib/gardener-progress';
import { useSeedGardenerProgress } from '@renderer/lib/queries/gardener';
import { publishGardenerRun, publishedWorkQueue } from './gardener-transport';
import type { IpcEventName, IpcEvents } from '@shared/ipc';
import type { GardenerRunProgress } from '@shared/types';

type KeyFactory = (...args: string[]) => readonly unknown[];

/** Alle Key-Bauer als `bereich.name` → Ergebnis mit Beispielargumenten. */
function allKeys(): { name: string; key: readonly unknown[] }[] {
  const out: { name: string; key: readonly unknown[] }[] = [];
  for (const [area, group] of Object.entries(qk)) {
    for (const [name, factory] of Object.entries(group as Record<string, KeyFactory>)) {
      const args = Array.from({ length: factory.length }, (_value, index) => `arg${index}`);
      out.push({ name: `${area}.${name}`, key: factory(...args) });
    }
  }
  return out;
}

describe('Query-Keys', () => {
  it('vergibt keinen Key zweimal', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const { name, key } of allKeys()) {
      const serialized = JSON.stringify(key);
      const known = seen.get(serialized);
      if (known !== undefined) collisions.push(`${known} und ${name}: ${serialized}`);
      else seen.set(serialized, name);
    }
    expect(collisions).toEqual([]);
  });

  it('beginnt jeden Key mit dem Namen seines Bereichs', () => {
    for (const [area, group] of Object.entries(qk)) {
      for (const [name, factory] of Object.entries(group as Record<string, KeyFactory>)) {
        const args = Array.from({ length: factory.length }, () => 'arg');
        expect(factory(...args)[0], `${area}.${name}`).toBe(area);
      }
    }
  });

  it('nennt in VAULT_DEPENDENT_ROOTS nur Wurzeln, die es gibt', () => {
    const known = Object.keys(qk);
    expect(VAULT_DEPENDENT_ROOTS.filter((root) => !known.includes(root))).toEqual([]);
  });

  it('invalidiert mit den Wurzeln auch die Gespräche und die Module', () => {
    /* Beide liegen als Dateien im Vault; wer sie vergisst, zeigt alten Stand. */
    expect(VAULT_DEPENDENT_ROOTS).toContain('chat');
    expect(VAULT_DEPENDENT_ROOTS).toContain('modules');
  });
});

type ProgressEvent = GardenerRunProgress;

/** One step of a run that is going, distinguishable by its `percent`. */
function running(percent: number): ProgressEvent {
  return {
    phase: 'checks',
    check: 'orphan',
    done: 2,
    total: 9,
    running: true,
    stage: 'checks',
    percent,
    remaining: [],
    startedAt: '2026-08-22T10:00:00+02:00',
    trigger: 'user',
  };
}

/** The last thing a run says — finished, cancelled or failed, all the same. */
function finished(): ProgressEvent {
  return {
    ...running(100),
    phase: 'done',
    check: null,
    done: 9,
    running: false,
    stage: 'done',
  };
}

describe('Ereignisse', () => {
  async function wire(): Promise<{
    client: QueryClient;
    emit: <E extends IpcEventName>(event: E, payload: IpcEvents[E]) => void;
  }> {
    const listeners = new Map<string, ((payload: unknown) => void)[]>();
    const sb = {
      invoke: vi.fn(),
      on: (event: string, callback: (payload: unknown) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), callback]);
        return () => undefined;
      },
      off: vi.fn(),
    };
    window.sb = sb as unknown as typeof window.sb;
    const { wireEvents } = await import('@renderer/lib/events');
    const client = new QueryClient();
    wireEvents(client);
    return {
      client,
      emit: (event, payload) => {
        for (const callback of listeners.get(event) ?? []) callback(payload);
      },
    };
  }

  /* 019c, F6: without this, a freshly pulled model never becomes visible as
     a routing target — nothing re-probes the provider/model list the
     routing table reads from, so the models tab stays silently stale after
     a successful pull even though the manual test plan expects the model
     to show up there. */
  it('zieht nach einem erfolgreich beendeten Pull die Provider und die lokale Erkennung nach', async () => {
    const { client, emit } = await wire();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    emit('event:pull-progress', {
      pullId: 'pull-1',
      modelId: 'qwen2.5:32b',
      status: 'downloading',
      completed: 512,
      total: 1024,
      done: false,
    });
    expect(invalidate).not.toHaveBeenCalled(); // no re-fetch mid-progress

    emit('event:pull-progress', {
      pullId: 'pull-1',
      modelId: 'qwen2.5:32b',
      status: 'success',
      completed: 1024,
      total: 1024,
      done: true,
    });

    const keys = invalidate.mock.calls.map(([filter]) => JSON.stringify(filter?.queryKey));
    expect(keys).toContain(JSON.stringify(qk.llm.providers()));
    expect(keys).toContain(JSON.stringify(qk.llm.detect()));
    /* 034: der abgeleitete Startplan rechnet über die installierte
       `.gguf`-Datei. Ohne diese Wurzel plant die llama.cpp-Karte nach einem
       Pull weiter gegen das Modell von vorher. */
    expect(keys).toContain(JSON.stringify(qk.llm.llamaStartPlan()));
  });

  it('zieht nach einem abgebrochenen oder fehlgeschlagenen Pull nichts nach — nichts wurde installiert', async () => {
    const { client, emit } = await wire();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    emit('event:pull-progress', {
      pullId: 'pull-2',
      modelId: 'qwen2.5:32b',
      status: 'cancelled',
      completed: 256,
      total: 1024,
      done: true,
      error: 'cancelled',
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

/* 034: der Startplan wird aus dem Ressourcenbudget (029) und der VRAM-Angabe
   (028) abgeleitet. Wer eine der beiden Zahlen ändert, ändert den Plan — ohne
   Invalidierung zeigt die llama.cpp-Karte bis zum nächsten Mounten Werte, die
   gegen die alten Zahlen gerechnet wurden. */
describe('034: Budget- und VRAM-Änderungen ziehen den Startplan nach', () => {
  function wrapWithSpy(): {
    client: QueryClient;
    wrapper: (props: { children: ReactNode }) => ReactNode;
  } {
    const sb = {
      invoke: vi.fn(() => Promise.resolve({})),
      on: () => () => undefined,
      off: vi.fn(),
    };
    window.sb = sb as unknown as typeof window.sb;
    const client = new QueryClient();
    return {
      client,
      wrapper: ({ children }: { children: ReactNode }) => QueryClientProvider({ client, children }),
    };
  }

  async function invalidatedKeysAfter(
    hookName: 'useSetResourceBudget' | 'useSetVramOverride',
    value: number,
  ): Promise<string[]> {
    const { client, wrapper } = wrapWithSpy();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const queries = await import('@renderer/lib/queries/llm');
    const { result } = renderHook(() => queries[hookName](), { wrapper });

    result.current.mutate(value);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    return invalidate.mock.calls.map(([filter]) => JSON.stringify(filter?.queryKey));
  }

  it('nach dem Setzen des Ressourcenbudgets', async () => {
    const keys = await invalidatedKeysAfter('useSetResourceBudget', 50);

    expect(keys).toContain(JSON.stringify(qk.llm.llamaStartPlan()));
  });

  it('nach dem Setzen der VRAM-Angabe von Hand', async () => {
    const keys = await invalidatedKeysAfter('useSetVramOverride', 16384);

    expect(keys).toContain(JSON.stringify(qk.llm.llamaStartPlan()));
  });
});

/* 021a, D4: mounting the maintenance screen mid-run must show the running bar
   right away, not only once the next `event:gardener-progress` tick arrives —
   which, for a run already underway, may be seconds out. Hence the seed from
   `gardener:runStatus`.
 *
 * 042, D1: that seed — and the live progress with it — no longer lives in a
 * hook. A `useQuery` seed went stale in the cache and the `useState` live layer
 * died with the screen, so navigating away mid-run and back showed no bar at
 * all. Both now live in `gardener-progress.ts`, and what is checked here is
 * that store's contract: it seeds, it survives having no component at all, and
 * its slow seed can never overwrite a newer live event. */
describe('useGardenerProgress seeds from gardener:runStatus', () => {
  /**
   * Installs a bridge whose `gardener:runStatus` answers with `runStatus()`.
   * `work:list` is left hanging on purpose: the work queue is the *other* way
   * this store learns about a run since 074, D5, and these tests are about the
   * seed being the faster of the two for a screen that opens mid-run. A queue
   * that has not answered yet says nothing at all (`tasks-store.ts`'s
   * `loaded`), so what the bar shows here can only have come from the seed.
   */
  function installBridge(runStatus: () => unknown): void {
    const sb = {
      invoke: vi.fn((channel: string) =>
        channel === 'work:list'
          ? new Promise(() => undefined)
          : Promise.resolve(channel === 'gardener:runStatus' ? runStatus() : null),
      ),
      on: () => () => undefined,
      off: vi.fn(),
    };
    window.sb = sb as unknown as typeof window.sb;
  }

  beforeEach(() => {
    /* Both stores outlive a test the way they outlive a screen — that is the
       whole point of them. So each test puts them back to "no run going"
       itself: the queue through the real transport, and the derived snapshot
       directly, since nothing is subscribed to the queue between tests
       (074, D5 — the subscription is lazy). */
    publishGardenerRun(null);
    setGardenerProgress(finished());
    dismissGardenerStopped();
  });

  afterEach(() => {
    delete window.sb;
  });

  it('shows the running snapshot when a run is already going', async () => {
    installBridge(() => running(22));
    const { result } = renderHook(() => useGardenerProgress());
    expect(result.current).toBeNull();

    await seedGardenerProgress();

    await waitFor(() => expect(result.current?.running).toBe(true));
    expect(result.current).toMatchObject({ running: true, trigger: 'user', percent: 22 });
  });

  it('stays null when no run is going', async () => {
    installBridge(() => null);

    await seedGardenerProgress();

    expect(window.sb?.invoke).toHaveBeenCalledWith('gardener:runStatus', undefined);
    expect(getGardenerProgress()).toBeNull();
  });

  /* The original bug, in one test: `bridge().on` does not replay, so anything
     that only a mounted component collected was lost for good. Since 074, D5
     this store is not even subscribed to the queue while nothing reads it —
     which is exactly why the queue moving on in the middle here has to be
     re-derived on the next mount, synchronously, for its first render. */
  it('keeps up with a queue that moved on while no component was mounted', () => {
    installBridge(() => null);
    publishGardenerRun(running(40));

    const first = renderHook(() => useGardenerProgress());
    expect(first.result.current).toMatchObject({ percent: 40 });
    first.unmount();

    publishGardenerRun(running(60));

    expect(renderHook(() => useGardenerProgress()).result.current).toMatchObject({ percent: 60 });
  });

  /* The seed is a round-trip; a run finishing right as a screen opens produces
     exactly this order. Without the generation guard the bar would jump back to
     "checking" after the run was already over — and stay there. */
  it('never lets a slow seed overwrite a newer answer from the queue', async () => {
    let answer: (snapshot: ProgressEvent | null) => void = () => undefined;
    window.sb = {
      invoke: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
      on: () => () => undefined,
      off: vi.fn(),
    } as unknown as typeof window.sb;
    /* A mounted reader, because the queue only feeds this store while someone
       is reading it — the `work:list` its subscription issues is the first
       call this bridge parks, and it stays parked for the whole test. */
    const reader = renderHook(() => useGardenerProgress());

    const seeding = seedGardenerProgress();
    act(() => {
      publishGardenerRun(running(80));
    });
    answer(running(5));
    await seeding;

    expect(getGardenerProgress()).toMatchObject({ percent: 80 });
    reader.unmount();
  });

  it('clears the bar once the run has left the queue', () => {
    installBridge(() => null);
    const reader = renderHook(() => useGardenerProgress());
    act(() => {
      publishGardenerRun(running(50));
    });
    expect(getGardenerProgress()).toMatchObject({ percent: 50 });

    /* A run that ended is a task the registry has settled — it is simply no
       longer in the queue as a running one, which is what "no run is going"
       reads as now (074, D5). */
    act(() => {
      publishGardenerRun(finished());
    });

    expect(getGardenerProgress()).toBeNull();
    reader.unmount();
  });

  /* 042 review, N2: `stoppedInSession` used to survive a vault switch — stop a
     run in vault A, don't dismiss it, open vault B, and the strip still
     offered "continue" there, resuming vault A's run against vault B. The
     vault going not-ready is exactly the signal that whatever was stopped
     belonged to the vault that just closed, so it must be cleared alongside
     `seededForCurrentReadySpan`. */
  it('clears a stopped-partway flag once the vault becomes not ready, so it cannot follow into a different vault', () => {
    markGardenerStopped();
    const { result } = renderHook(() => useGardenerStopped());
    expect(result.current).toBe(true);

    act(() => {
      seedGardenerProgressOnReady(false);
    });

    expect(result.current).toBe(false);
  });
});

/* Ein Pflegelauf endet auch ohne offenen Pflege-Screen — beim Öffnen des Vaults
   (`gardener.runOnOpen`). Daran hängen drei Ansichten, und wenn eine davon
   stehenbleibt, sagen zwei Screens Verschiedenes über denselben Lauf.
 *
 * Bis 074, D5 hing das an `event:gardener-progress` in `events.ts`. Den Kanal
 * gibt es nicht mehr: der Lauf ist eine Aufgabe in der Warteschlange, und das
 * Nachziehen hängt jetzt an `useSeedGardenerProgress` — dem einen Haken, den
 * `AppShell` genau einmal einhängt. Ein Lauf, der von selbst endet, ist keine
 * Mutation, die jemand ausgelöst hat; ohne dieses Nachziehen fragt niemand
 * nach dem frischen Bericht.
 */
describe('Ein beendeter Pflegelauf zieht Bericht, Dashboard und Module nach (074, D5)', () => {
  beforeEach(() => {
    publishGardenerRun(null);
    setGardenerProgress(finished());
    window.sb = {
      invoke: vi.fn((channel: string) =>
        Promise.resolve(channel === 'work:list' ? publishedWorkQueue() : null),
      ),
      on: () => () => undefined,
      off: vi.fn(),
    } as unknown as typeof window.sb;
  });

  afterEach(() => {
    delete window.sb;
  });

  it('zieht genau am Übergang von „läuft“ zu „läuft nicht mehr“ nach, nicht mitten im Lauf', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      QueryClientProvider({ client, children });
    const { unmount } = renderHook(() => useSeedGardenerProgress(), { wrapper });

    act(() => {
      publishGardenerRun(running(11));
    });
    /* Zwischenstand: nichts nachladen, sonst rendert jede Prüfung neu. */
    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      publishGardenerRun(finished());
    });

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([filter]) => JSON.stringify(filter?.queryKey));
      expect(keys).toContain(JSON.stringify(qk.gardener.report()));
      expect(keys).toContain(JSON.stringify(qk.dashboard.data()));
      expect(keys).toContain(JSON.stringify(qk.modules.list()));
    });

    /* Und nur an dieser einen Kante: ein weiterer Ereignisdurchlauf ohne Lauf
       zieht nichts mehr nach, sonst würde jede Warteschlangenänderung nach
       einem Lauf drei Abfragen neu laden. */
    const afterFinish = invalidate.mock.calls.length;
    act(() => {
      publishGardenerRun(null);
    });
    expect(invalidate.mock.calls.length).toBe(afterFinish);
    unmount();
  });
});
