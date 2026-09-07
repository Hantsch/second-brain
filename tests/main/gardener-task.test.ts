/* Der Pflegelauf als Aufgabe in der einen Warteschlange (074, D2).
 *
 * Der Lauf hat seinen eigenen Platzhalter-Mechanismus (`gardener-run-state.ts`)
 * und behält ihn — die Spiegelung auf `WorkRegistry` kommt additiv dazu. Hier
 * steht genau das, was dabei schiefgehen könnte:
 *   - Der Spiegel zeigt denselben gewichteten Fortschritt, den der Lauf
 *     veröffentlicht — nicht eine zweite, neu abgeleitete Zahl.
 *   - Abgebrochen wird **einmal**, aus welcher Richtung auch immer: über
 *     `cancelGardenerRun` oder über die Warteschlange. Der jeweils andere Weg
 *     ist danach ein No-op statt ein zweiter Abbruch.
 *   - Ein Abbruch aus der Warteschlange erreicht den echten Lauf, nicht nur
 *     den Eintrag: das Signal ist danach abgebrochen.
 *   - Der lokale Platz bleibt der lokale Platz: ein zweiter Lauf wird weiter
 *     abgelehnt, egal ob eine Warteschlange im Spiel ist.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeProgress, computeStagePlan } from '@core/gardener';
import { describeFailure } from '@core/ingest';
import { WorkRegistry } from '@core/work/registry';
import type { GardenerRunProgress } from '@shared/types';
import { beginGardenerRun, cancelGardenerRun } from '../../src/main/gardener-run-state';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';
import type { Services } from '../../src/main/services';

/* Electron gibt es im Test nicht — `ipc/gardener.ts` zieht es indirekt mit. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
}));

const STARTED = '2026-09-07T08:00:00.000Z';

function registry(): WorkRegistry {
  let id = 0;
  return new WorkRegistry({
    now: () => new Date(STARTED),
    newId: () => `work-${(id += 1)}`,
  });
}

/** Ein Schritt mit genau dem Prozentwert, den die Gewichtung wirklich ergibt. */
function step(overrides: Partial<GardenerRunProgress> = {}): GardenerRunProgress {
  const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
  const { percent, remaining } = computeProgress({
    plan,
    current: 'checks',
    currentFraction: 0.5,
  });
  return {
    phase: 'checks',
    check: 'orphan',
    done: 5,
    total: 10,
    running: true,
    stage: 'checks',
    percent,
    remaining,
    startedAt: STARTED,
    trigger: 'user',
    ...overrides,
  };
}

describe('gardener run as a work task', () => {
  /* Modulzustand überlebt einen Test — ein liegengebliebener Lauf lehnte den
     nächsten ab. */
  afterEach(() => {
    cancelGardenerRun();
    resetWorkQueue();
  });

  it('lists a started run as a running gardener task on the model lane', () => {
    const queue = registry();

    const handle = beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue });

    expect(handle).not.toBeNull();
    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0]).toMatchObject({
      kind: 'gardener',
      lane: 'model',
      state: 'running',
      subject: { label: 'Maintenance run', ref: null },
      queuePosition: null,
    });
  });

  it('mirrors the published weighted progress instead of deriving a second number', () => {
    const queue = registry();
    const handle = beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue });
    const published = step();

    handle?.publish(published);

    const task = queue.list()[0];
    /* Dieselbe Zahl, nur in der Einheit des Aufgabensatzes (0..1 statt 0..100). */
    expect(published.percent).toBe(
      computeProgress({
        plan: computeStagePlan({ useLlm: true, useLooseEnds: true }),
        current: 'checks',
        currentFraction: 0.5,
      }).percent,
    );
    expect(task?.progress).toBe(published.percent / 100);
    expect(task?.detail).toEqual(published);
  });

  it('settles the mirrored task done when the run simply ends', () => {
    const queue = registry();
    const handle = beginGardenerRun({ trigger: 'auto', emit: vi.fn(), workQueue: queue });

    handle?.finish();

    expect(queue.list()[0]).toMatchObject({ state: 'done', progress: 1, error: null });
    /* Der schließende Schritt steht noch daran: er ist das Letzte, was der
       Lauf gemeldet hat. */
    expect(queue.list()[0]?.detail).toMatchObject({ running: false, percent: 100 });
  });

  it('settles the mirrored task failed when the run ends with an error', () => {
    const queue = registry();
    const handle = beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue });
    const boom = new Error('a stage failed');

    handle?.finish(boom);

    const failure = describeFailure(boom);
    expect(queue.list()[0]).toMatchObject({
      state: 'failed',
      error: failure.code,
      message: failure.message,
    });
  });

  it('still refuses a second run while one holds the local slot', () => {
    const queue = registry();

    expect(beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue })).not.toBeNull();
    expect(beginGardenerRun({ trigger: 'auto', emit: vi.fn(), workQueue: queue })).toBeNull();
    /* Und die abgelehnte Anfrage hinterlässt keine zweite Aufgabe. */
    expect(queue.list()).toHaveLength(1);
  });

  it('cancels the mirrored task once, from the run side', () => {
    const queue = registry();
    const handle = beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue });
    const id = queue.list()[0]?.id ?? '';

    cancelGardenerRun('user');

    expect(handle?.signal.aborted).toBe(true);
    expect(queue.list()[0]).toMatchObject({ state: 'cancelled' });
    /* Der zweite Weg findet nichts mehr zu tun — kein Doppelabbruch, kein
       Überschreiben eines schon aufgezeichneten Endes. */
    expect(queue.cancel(id, 'user')).toBe(false);
    expect(queue.list()[0]).toMatchObject({ state: 'cancelled' });
  });

  it('cancels the real run when the cancel comes from the queue side', () => {
    const queue = registry();
    const handle = beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue });
    const id = queue.list()[0]?.id ?? '';

    expect(queue.cancel(id, 'user')).toBe(true);

    /* Der Haken erreicht den echten Lauf, nicht nur den Eintrag. */
    expect(handle?.signal.aborted).toBe(true);
    expect(handle?.cancelledBy()).toBe('user');
    expect(queue.list()[0]).toMatchObject({ state: 'cancelled' });
    /* Und der Platz ist frei: der nächste Lauf muss nicht warten, bis der
       abgebrochene fertig abgewickelt ist. */
    expect(beginGardenerRun({ trigger: 'auto', emit: vi.fn() })).not.toBeNull();
  });

  it('answers gardener:runStatus from the queue — null without a run, the last step during one', async () => {
    const { gardenerHandlers } = await import('../../src/main/ipc/gardener');
    const sent = vi.fn();
    const services = { sendEvent: sent } as unknown as Services;
    resetWorkQueue();
    const queue = getWorkQueue(services);
    const runStatus = gardenerHandlers(services)[
      'gardener:runStatus'
    ] as () => GardenerRunProgress | null;

    expect(runStatus()).toBeNull();

    const handle = beginGardenerRun({ trigger: 'user', emit: vi.fn(), workQueue: queue });
    const published = step({ done: 7 });
    handle?.publish(published);

    expect(runStatus()).toEqual(published);

    handle?.finish();
    /* Eine fertige Aufgabe ist kein laufender Lauf — sie bleibt in der Liste
       stehen, aber der Status sagt wieder nichts. */
    expect(runStatus()).toBeNull();
  });

  it('liest gardener:runStatus aus der Registry, nicht aus dem lokalen Laufzustand (Review F5)', async () => {
    /* `beginGardenerRun` writes the identical value to both the local
       `gardener-run-state.ts` snapshot and the registry task's `detail` — a
       test seeded through it can't tell which one the handler actually read.
       This test never calls `beginGardenerRun` at all: the task is seeded
       directly on the registry via `startExternal`, so local state stays
       untouched (still "no run") for the whole test. Only a handler that
       genuinely reads the registry can produce the seeded value below. */
    const { gardenerHandlers } = await import('../../src/main/ipc/gardener');
    const sent = vi.fn();
    const services = { sendEvent: sent } as unknown as Services;
    resetWorkQueue();
    const queue = getWorkQueue(services);
    const runStatus = gardenerHandlers(services)[
      'gardener:runStatus'
    ] as () => GardenerRunProgress | null;

    const seeded = step({ done: 3, check: 'stale-page' });
    const handle = queue.startExternal(
      { kind: 'gardener', lane: 'model', subject: { label: 'Maintenance run', ref: null } },
      { state: 'running' },
    );
    handle.update({ detail: seeded });

    expect(runStatus()).toEqual(seeded);
  });
});
