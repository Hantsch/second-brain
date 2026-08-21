/* The Ollama model pull (019c, D4) — through a fake `fetch` that streams NDJSON
 * on the test's command, never a real runtime.
 *
 * Checked, in the order the risk in this deliverable sits:
 *   - a pull reports monotonic progress and ends with exactly one `done: true`;
 *   - a cancel that lands *mid-stream* (the reader parked in a pending read,
 *     progress already reported) deletes the partial model **before** the
 *     closing event and emits nothing after it;
 *   - a stream that stops in the middle of a line neither throws nor reports
 *     the fragment;
 *   - pulling the same model again after a cancel starts clean;
 *   - a refused pull — non-2xx, or Ollama's own error line inside an HTTP 200
 *     stream — surfaces a closed code, never a raw message;
 *   - an unknown pull id changes nothing.
 */

import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../../src/core/llm';
import { ollamaPullHandlers } from '../../../src/main/ipc/ollama-pull';
import type { Services } from '../../../src/main/services';
import type { IpcEvents } from '../../../src/shared/ipc';

/* The registry this handler map is built through imports `ipcMain`; the pull
   never touches it directly, but the module graph does. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  app: { getPath: () => '/tmp' },
}));

const BASE_URL = 'http://localhost:11434';
const MB = 1024 * 1024;

type PullEvent = IpcEvents['event:pull-progress'];

/** Everything that happened, in the order it happened — the only way to assert
    that the cleanup really precedes the closing event. */
type Step = { kind: 'event'; event: PullEvent } | { kind: 'delete'; modelId: unknown };

function fakeServices(timeline: Step[]): Services {
  // Only `sendEvent` is exercised here; a full `Services` would need a vault,
  // settings, and a key store this test has no use for.
  return {
    sendEvent: (name: string, payload: unknown) => {
      if (name === 'event:pull-progress')
        timeline.push({ kind: 'event', event: payload as PullEvent });
    },
  } as unknown as Services;
}

interface FakeOllama {
  fetchImpl: FetchLike;
  timeline: Step[];
  events: () => PullEvent[];
  deletes: () => unknown[];
  pullBodies: () => unknown[];
  /** Hand the reader the next chunk of the response body. */
  pushText: (text: string) => void;
  /** End the response body cleanly. */
  finish: () => void;
}

/** A controllable fake Ollama: the test decides when each NDJSON chunk arrives,
    when the body ends, and how the endpoints answer — and an abort rejects the
    pending read the way a real streamed response does. */
function fakeOllama(options: { pullStatus?: number; deleteStatus?: number } = {}): FakeOllama {
  const timeline: Step[] = [];
  const pullBodies: unknown[] = [];
  let resolveRead: ((result: { done: boolean; value?: Uint8Array }) => void) | null = null;
  let rejectRead: ((error: unknown) => void) | null = null;

  const reader = {
    read: () =>
      new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
        resolveRead = resolve;
        rejectRead = reject;
      }),
  };

  const fetchImpl: FetchLike = async (url, init) => {
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(String(init.body));

    if (url.endsWith('/api/delete')) {
      timeline.push({ kind: 'delete', modelId: (body as { model?: unknown } | undefined)?.model });
      const status = options.deleteStatus ?? 200;
      return { ok: status < 400, status } as unknown as Response;
    }

    expect(url).toBe(`${BASE_URL}/api/pull`);
    expect(init?.method).toBe('POST');
    pullBodies.push(body);
    init?.signal?.addEventListener('abort', () => {
      rejectRead?.(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      resolveRead = null;
      rejectRead = null;
    });
    const status = options.pullStatus ?? 200;
    return {
      ok: status < 400,
      status,
      body: status < 400 ? { getReader: () => reader } : null,
    } as unknown as Response;
  };

  return {
    fetchImpl,
    timeline,
    events: () =>
      timeline
        .filter((step): step is { kind: 'event'; event: PullEvent } => step.kind === 'event')
        .map((step) => step.event),
    deletes: () =>
      timeline
        .filter((step) => step.kind === 'delete')
        .map((step) => (step as { modelId: unknown }).modelId),
    pullBodies: () => pullBodies,
    pushText: (text: string) => {
      resolveRead?.({ done: false, value: new TextEncoder().encode(text) });
      resolveRead = null;
      rejectRead = null;
    },
    finish: () => {
      resolveRead?.({ done: true });
      resolveRead = null;
      rejectRead = null;
    },
  };
}

/** Lets the pending microtasks of the reader loop settle before asserting. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function line(status: string, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ status, ...extra })}\n`;
}

function handlersFor(fake: FakeOllama): ReturnType<typeof ollamaPullHandlers> {
  return ollamaPullHandlers(fakeServices(fake.timeline), {
    fetchImpl: fake.fetchImpl,
    baseUrl: BASE_URL,
  });
}

async function startPull(
  handlers: ReturnType<typeof ollamaPullHandlers>,
  modelId = 'qwen3:8b',
): Promise<string> {
  const started = await handlers['llm:pullModel']?.({ modelId });
  expect(started?.pullId).toBeTruthy();
  await tick(); // let `runPull` reach its first pending `reader.read()`
  return started?.pullId ?? '';
}

describe('llm:pullModel — happy path', () => {
  it('reports monotonic progress and ends with exactly one done event', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    const pullId = await startPull(handlers);

    fake.pushText(line('pulling manifest'));
    await tick();
    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 4 * MB, completed: 1 * MB }));
    await tick();
    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 4 * MB, completed: 4 * MB }));
    await tick();
    // A second layer: its own numbers restart at zero, the reported sum must not.
    fake.pushText(line('downloading', { digest: 'sha256:bbb', total: 2 * MB, completed: 1 * MB }));
    await tick();
    fake.pushText(line('verifying sha256 digest'));
    await tick();
    fake.pushText(line('success'));
    await tick();
    fake.finish();
    await tick();

    const events = fake.events();
    expect(events.every((event) => event.pullId === pullId)).toBe(true);
    expect(events.every((event) => event.modelId === 'qwen3:8b')).toBe(true);

    const completed = events.map((event) => event.completed);
    for (let index = 1; index < completed.length; index += 1) {
      expect(completed[index]).toBeGreaterThanOrEqual(completed[index - 1] as number);
    }
    expect(events.map((event) => event.status)).toContain('verifying sha256 digest');
    expect(events.filter((event) => event.done)).toHaveLength(1);

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBeUndefined();
    expect(final?.completed).toBe(5 * MB);
    expect(final?.total).toBe(6 * MB);
    expect(fake.deletes()).toEqual([]); // a finished pull is never cleaned up
    expect(fake.pullBodies()).toEqual([{ model: 'qwen3:8b' }]);
  });

  it('does not send an event per line when nothing visible changed', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    await startPull(handlers);

    // Twenty lines inside the same megabyte and the same phase.
    for (let index = 0; index < 20; index += 1) {
      fake.pushText(line('downloading', { digest: 'sha256:aaa', total: MB, completed: index * 8 }));
      await tick();
    }
    fake.finish();
    await tick();

    expect(fake.events().filter((event) => !event.done)).toHaveLength(1);
  });
});

describe('llm:pullModel — cancel mid-stream', () => {
  it('deletes the partial model before the closing event and emits nothing after it', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    const pullId = await startPull(handlers);

    // The pull is genuinely under way: bytes reported, the reader parked in a
    // pending read — this is what makes the cancel below a mid-stream abort and
    // not a cancel that races the start of the request.
    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 8 * MB, completed: 3 * MB }));
    await tick();
    const progressed = fake.events();
    expect(progressed).toHaveLength(1);
    expect(progressed[0]?.completed).toBe(3 * MB);
    expect(progressed[0]?.done).toBe(false);

    await handlers['llm:cancelPull']?.({ pullId });
    await tick();

    // Order, not just presence: the model is gone before the renderer hears
    // that the run ended.
    expect(fake.timeline.map((step) => step.kind)).toEqual(['event', 'delete', 'event']);
    expect(fake.deletes()).toEqual(['qwen3:8b']);

    const final = fake.events().at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('cancelled');

    const countAfterCancel = fake.timeline.length;
    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 8 * MB, completed: 8 * MB }));
    fake.finish();
    await tick();
    await tick();
    // A late chunk or a late stream end cannot revive a run that already closed.
    expect(fake.timeline.length).toBe(countAfterCancel);
  });

  it('still ends the run as cancelled when the cleanup delete itself fails', async () => {
    const fake = fakeOllama({ deleteStatus: 500 });
    const handlers = handlersFor(fake);
    const pullId = await startPull(handlers);

    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 8 * MB, completed: 3 * MB }));
    await tick();
    await handlers['llm:cancelPull']?.({ pullId });
    await tick();

    const final = fake.events().at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('cancelled'); // not overwritten by the failed cleanup
  });

  it('lets the same model be pulled again right after a cancel', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    const firstId = await startPull(handlers);
    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 8 * MB, completed: 2 * MB }));
    await tick();
    await handlers['llm:cancelPull']?.({ pullId: firstId });
    await tick();

    const secondId = await startPull(handlers);
    expect(secondId).not.toBe(firstId);

    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 8 * MB, completed: 8 * MB }));
    await tick();
    fake.finish();
    await tick();

    const own = fake.events().filter((event) => event.pullId === secondId);
    expect(own.at(-1)).toMatchObject({ done: true, completed: 8 * MB });
    expect(own.at(-1)?.error).toBeUndefined();
    // The second run reports under its own id only — no event from the first
    // one's leftovers.
    expect(
      fake
        .events()
        .filter((event) => event.pullId === firstId)
        .at(-1)?.error,
    ).toBe('cancelled');
  });

  it('changes nothing when a cancel arrives after the run already ended', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    const pullId = await startPull(handlers);
    fake.pushText(line('success', { digest: 'sha256:aaa', total: MB, completed: MB }));
    await tick();
    fake.finish();
    await tick();
    const settled = fake.timeline.length;

    // The run deregisters itself *before* its closing event, so a stale cancel
    // from a renderer that hadn't processed that event yet finds nothing — no
    // delete of a model that was pulled in full, no event after `done`.
    await handlers['llm:cancelPull']?.({ pullId });
    await tick();

    expect(fake.timeline.length).toBe(settled);
    expect(fake.deletes()).toEqual([]);
  });

  it('changes nothing for an unknown pull id', async () => {
    const fake = fakeOllama();
    await expect(
      handlersFor(fake)['llm:cancelPull']?.({ pullId: 'not-a-real-id' }),
    ).resolves.toBeUndefined();
    expect(fake.timeline).toEqual([]);
  });
});

describe('llm:pullModel — a stream that stops mid-line', () => {
  it('neither throws nor reports the fragment', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    await startPull(handlers);

    fake.pushText(line('downloading', { digest: 'sha256:aaa', total: 4 * MB, completed: 2 * MB }));
    await tick();
    // The last chunk breaks off inside the next line — no newline, invalid JSON.
    fake.pushText('{"status":"downloading","digest":"sha256:aaa","comple');
    await tick();
    fake.finish();
    await tick();

    const events = fake.events();
    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBeUndefined(); // a half line does not fail a finished pull
    expect(final?.completed).toBe(2 * MB); // and it reports nothing of its own
    expect(events.filter((event) => event.done)).toHaveLength(1);
  });

  it('joins a line that arrives split across two chunks', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    await startPull(handlers);

    fake.pushText('{"status":"downloading","digest":"sha256:aaa","total":4194304,"comp');
    await tick();
    expect(fake.events()).toEqual([]); // nothing to report from half a line
    fake.pushText('leted":4194304}\n');
    await tick();
    fake.finish();
    await tick();

    expect(fake.events()[0]?.completed).toBe(4 * MB);
  });
});

describe('llm:pullModel — refusals', () => {
  it('reports a closed code for a non-2xx response and does not delete anything', async () => {
    const fake = fakeOllama({ pullStatus: 503 });
    const handlers = handlersFor(fake);
    await handlers['llm:pullModel']?.({ modelId: 'qwen3:8b' });
    await tick();

    const final = fake.events().at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('io');
    // Nothing was pulled, so there is nothing to clean up — and no second
    // request at a runtime that just refused the first.
    expect(fake.deletes()).toEqual([]);
  });

  it('ends the run on Ollama’s own error line inside a 200 stream, without leaking its wording', async () => {
    const fake = fakeOllama();
    const handlers = handlersFor(fake);
    await startPull(handlers, 'nope:404b');

    fake.pushText('{"error":"pull model manifest: file does not exist"}\n');
    await tick();

    const final = fake.events().at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('io');
    expect(final?.error).not.toMatch(/manifest/);
    expect(fake.deletes()).toEqual(['nope:404b']);
  });

  it('refuses an empty model id instead of starting a request', async () => {
    const fake = fakeOllama();
    await expect(handlersFor(fake)['llm:pullModel']?.({ modelId: '   ' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(fake.timeline).toEqual([]);
  });
});
