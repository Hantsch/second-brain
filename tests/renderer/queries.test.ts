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
import { QueryClient } from '@tanstack/react-query';
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
    });
    /* Zwischenstand: nichts nachladen, sonst rendert jede Prüfung neu. */
    expect(invalidate).not.toHaveBeenCalled();

    emit('event:gardener-progress', {
      phase: 'done',
      check: null,
      done: 9,
      total: 9,
      running: false,
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
