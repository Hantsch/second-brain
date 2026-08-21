// @vitest-environment jsdom
/* The acceptance criterion for 019c/D5 is mechanical: progress must survive
 * navigating away from the screen that started the pull and back. Since
 * `pullStore` lives at module level, "navigate away and back" is simply
 * "nothing unsubscribes/clears in between" — there is no component
 * lifecycle to lose the state, which is exactly what these tests pin down.
 */

import { describe, expect, it, vi } from 'vitest';
import { appendPull, clearPull, getAllPulls, usePull, useAllPulls } from '@renderer/lib/pullStore';
import { renderHook, act } from '@testing-library/react';

describe('pullStore', () => {
  it('keeps the advanced position across a simulated navigate-away-and-back', () => {
    appendPull('pull-1', {
      modelId: 'llama3',
      status: 'downloading',
      completed: 10,
      total: 100,
      done: false,
    });
    appendPull('pull-1', {
      modelId: 'llama3',
      status: 'downloading',
      completed: 60,
      total: 100,
      done: false,
    });

    /* "Navigating away and back" has no effect on the store itself — no
       component subscribed to it in the first place. Reading it fresh,
       as the card would after remounting, still finds the advanced state. */
    const { result } = renderHook(() => usePull('pull-1'));
    expect(result.current.completed).toBe(60);
    expect(result.current.done).toBe(false);

    clearPull('pull-1');
  });

  it('returns the empty/"not running" default for an unknown or null id', () => {
    const { result: unknown } = renderHook(() => usePull('does-not-exist'));
    expect(unknown.current.done).toBe(false);
    expect(unknown.current.modelId).toBe('');

    const { result: none } = renderHook(() => usePull(null));
    expect(none.current.status).toBe('');
  });

  it('lets a card recover an in-flight pull without holding its id locally', () => {
    appendPull('pull-2', {
      modelId: 'qwen2.5-coder',
      status: 'pulling manifest',
      completed: 0,
      total: 0,
      done: false,
    });

    /* The card never learned "pull-2" from local state — it iterates every
       known pull and matches by modelId, which is the whole point of
       exposing the full map rather than only single-id lookup. */
    const all = getAllPulls();
    const found = Object.entries(all).find(([, state]) => state.modelId === 'qwen2.5-coder');
    expect(found?.[0]).toBe('pull-2');
    expect(found?.[1].status).toBe('pulling manifest');

    clearPull('pull-2');
  });

  it('notifies every subscriber, and lets one unsubscribe without affecting the other', () => {
    const first = renderHook(() => useAllPulls());
    const second = renderHook(() => useAllPulls());

    act(() => {
      appendPull('pull-3', {
        modelId: 'phi4',
        status: 'downloading',
        completed: 5,
        total: 50,
        done: false,
      });
    });

    expect(first.result.current['pull-3']?.completed).toBe(5);
    expect(second.result.current['pull-3']?.completed).toBe(5);

    first.unmount();

    act(() => {
      appendPull('pull-3', {
        modelId: 'phi4',
        status: 'downloading',
        completed: 20,
        total: 50,
        done: false,
      });
    });

    /* Only the still-mounted subscriber is asserted here — the unmounted
       one already stopped rendering, so there's nothing left to check on it
       other than that it didn't throw. */
    expect(second.result.current['pull-3']?.completed).toBe(20);

    clearPull('pull-3');
  });

  it('clears an entry so a dismissed bar does not resurface', () => {
    appendPull('pull-4', {
      modelId: 'mistral',
      status: 'downloading',
      completed: 100,
      total: 100,
      done: true,
    });
    expect(getAllPulls()['pull-4']).toBeDefined();

    clearPull('pull-4');
    expect(getAllPulls()['pull-4']).toBeUndefined();

    /* Clearing an id that was never there, or already cleared, is a no-op
       — the card may dismiss a bar it already dismissed once. */
    expect(() => clearPull('pull-4')).not.toThrow();
  });

  it('merges error into the state instead of losing prior progress', () => {
    appendPull('pull-5', {
      modelId: 'llama3',
      status: 'downloading',
      completed: 30,
      total: 100,
      done: false,
    });
    appendPull('pull-5', {
      modelId: 'llama3',
      status: 'error',
      completed: 30,
      total: 100,
      done: true,
      error: 'runtime-unreachable',
    });

    const { result } = renderHook(() => usePull('pull-5'));
    expect(result.current.error).toBe('runtime-unreachable');
    expect(result.current.done).toBe(true);
    expect(result.current.completed).toBe(30);

    clearPull('pull-5');
  });
});

describe('wireEvents pull-progress wiring', () => {
  it('forwards event:pull-progress chunks into the store', async () => {
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

    const { QueryClient } = await import('@tanstack/react-query');
    const { wireEvents } = await import('@renderer/lib/events');
    wireEvents(new QueryClient());

    const emit = (payload: unknown): void => {
      for (const callback of listeners.get('event:pull-progress') ?? []) callback(payload);
    };

    emit({
      pullId: 'pull-wired',
      modelId: 'llama3',
      status: 'downloading',
      completed: 42,
      total: 100,
      done: false,
    });

    expect(getAllPulls()['pull-wired']?.completed).toBe(42);
    clearPull('pull-wired');
  });
});
