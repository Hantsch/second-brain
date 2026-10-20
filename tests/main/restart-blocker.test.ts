/* The restart blocker: running work vetoes an update restart, queued work and
   idleness do not. */

import { afterEach, describe, expect, it } from 'vitest';
import type { Services } from '../../src/main/services';
import { llmStreams } from '../../src/main/ipc/llm-stream';
import { restartBlocker } from '../../src/main/update/restart-blocker';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';

const services = { sendEvent: () => undefined } as unknown as Services;
/** A runner that never settles; the model lane runs one at a time, so a second one stays queued. */
function enqueue(count: number): void {
  for (let i = 0; i < count; i += 1) {
    getWorkQueue(services).enqueue(
      { kind: 'condense', lane: 'model', subject: { label: `t${i}`, ref: null } },
      () => new Promise(() => undefined),
    );
  }
}

const open: Array<{ end: () => void }> = [];

afterEach(() => {
  getWorkQueue(services).clear();
  resetWorkQueue();
  for (const run of open.splice(0)) run.end();
});

describe('restartBlocker', () => {
  it('a running task blocks the restart', () => {
    enqueue(1);
    expect(restartBlocker(services)).toBe('taskRunning');
  });

  it('a streaming LLM response blocks the restart', () => {
    const run = llmStreams(services).begin('t1', 'm1');
    open.push(run);
    expect(restartBlocker(services)).toBe('llmStreaming');
    run.end({ error: 'aborted' });
    expect(restartBlocker(services)).toBeNull();
  });

  it('a queued-but-not-running task does not block', () => {
    getWorkQueue(services).startExternal(
      { kind: 'ingest', lane: 'import', subject: { label: 'queued', ref: null } },
      { state: 'queued' },
    );
    expect(
      getWorkQueue(services)
        .list()
        .map((t) => t.state),
    ).toEqual(['queued']);
    expect(restartBlocker(services)).toBeNull();
  });

  it('nothing running means no blocker', () => {
    expect(restartBlocker(services)).toBeNull();
  });

  it('two instances sharing an id do not clear each other', () => {
    const a = llmStreams(services).begin('t1', 'same');
    const b = llmStreams(services).begin('t2', 'same');
    open.push(a, b);
    a.end();
    expect(restartBlocker(services)).toBe('llmStreaming');
    b.end();
    expect(restartBlocker(services)).toBeNull();
  });
});
