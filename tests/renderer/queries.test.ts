// @vitest-environment jsdom
/* Die Query-Keys sind der Vertrag zwischen Abfrage und Invalidierung.
 *
 * Zwei Fehler fallen ohne Maschine nicht auf, weil beide „funktionieren":
 * - **Zwei Bereiche mit demselben Key** teilen sich stillschweigend einen
 *   Zwischenspeicher — die eine Ansicht zeigt dann die Daten der anderen.
 * - **Eine Wurzel in `VAULT_DEPENDENT_ROOTS`, die es nicht gibt**, invalidiert
 *   nichts; die Ansicht bleibt nach einer Dateiänderung stehen.
 */

import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { qk, VAULT_DEPENDENT_ROOTS } from '@renderer/lib/queries/keys';
import type { IpcEventName, IpcEvents } from '@shared/ipc';

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

/* Ein Pflegelauf endet auch ohne offenen Pflege-Screen — beim Öffnen des Vaults
   (`gardener.runOnOpen`). Daran hängen drei Ansichten, und wenn eine davon
   stehenbleibt, sagen zwei Screens Verschiedenes über denselben Lauf. */
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

  it('zieht nach einem beendeten Pflegelauf Bericht, Dashboard und Module nach', async () => {
    const { client, emit } = await wire();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    emit('event:gardener-progress', {
      phase: 'checks',
      check: 'orphan',
      done: 1,
      total: 9,
      running: true,
      stage: 'checks',
      percent: 11,
      remaining: [],
      startedAt: new Date().toISOString(),
      trigger: 'user',
    });
    /* Zwischenstand: nichts nachladen, sonst rendert jede Prüfung neu. */
    expect(invalidate).not.toHaveBeenCalled();

    emit('event:gardener-progress', {
      phase: 'done',
      check: null,
      done: 9,
      total: 9,
      running: false,
      stage: 'done',
      percent: 100,
      remaining: [],
      startedAt: new Date().toISOString(),
      trigger: 'user',
    });

    const keys = invalidate.mock.calls.map(([filter]) => JSON.stringify(filter?.queryKey));
    expect(keys).toContain(JSON.stringify(qk.gardener.report()));
    expect(keys).toContain(JSON.stringify(qk.dashboard.data()));
    expect(keys).toContain(JSON.stringify(qk.modules.list()));
  });

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

/* 021a, D4: mounting the maintenance screen mid-run must show the running bar
   right away, not only once the next `event:gardener-progress` tick arrives —
   which, for a run already underway, may be seconds out. `useGardenerProgress`
   seeds itself from `gardener:runStatus` on mount for exactly that reason. */
describe('useGardenerProgress seeds from gardener:runStatus', () => {
  function wrapWithClient(invoke: (channel: string, payload?: unknown) => unknown): {
    wrapper: (props: { children: ReactNode }) => ReactNode;
  } {
    const sb = {
      invoke: vi.fn((channel: string, payload?: unknown) => Promise.resolve(invoke(channel, payload))),
      on: () => () => undefined,
      off: vi.fn(),
    };
    window.sb = sb as unknown as typeof window.sb;
    const client = new QueryClient();
    return {
      wrapper: ({ children }: { children: ReactNode }) =>
        QueryClientProvider({ client, children }),
    };
  }

  it('shows the running snapshot immediately when a run is already going', async () => {
    const { wrapper } = wrapWithClient((channel) => {
      if (channel === 'vault:status') return { ready: true, indexing: false };
      if (channel === 'gardener:runStatus') {
        return {
          phase: 'checks',
          check: 'orphan',
          done: 2,
          total: 9,
          running: true,
          stage: 'checks',
          percent: 22,
          remaining: [],
          startedAt: new Date().toISOString(),
          trigger: 'user',
        };
      }
      return null;
    });

    const { useGardenerProgress } = await import('@renderer/lib/queries/gardener');
    const { result } = renderHook(() => useGardenerProgress(), { wrapper });

    await waitFor(() => expect(result.current?.running).toBe(true));
    expect(result.current).toMatchObject({ running: true, trigger: 'user' });
  });

  it('stays null when no run is going', async () => {
    const { wrapper } = wrapWithClient((channel) => {
      if (channel === 'vault:status') return { ready: true, indexing: false };
      if (channel === 'gardener:runStatus') return null;
      return null;
    });

    const { useGardenerProgress } = await import('@renderer/lib/queries/gardener');
    const { result } = renderHook(() => useGardenerProgress(), { wrapper });

    /* Give the seed query a tick to settle, then confirm it never flips. */
    await waitFor(() => expect(window.sb?.invoke).toHaveBeenCalledWith('gardener:runStatus', undefined));
    expect(result.current).toBeNull();
  });
});
