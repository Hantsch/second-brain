/* The NDJSON parser behind Ollama's `/api/pull` (019c, D4).
 *
 * Pure text in, data out — so the awkward cases can be exercised here, without
 * a socket, an abort, or an Ollama: a line split across two chunks, a stream
 * that stops mid-line, garbage in the middle of otherwise good output, and the
 * per-layer numbers that would walk a progress bar backwards if they were
 * passed through raw.
 */

import { describe, expect, it } from 'vitest';
import { createPullProgress, parsePullLines } from '../../../src/core/llm/pull-parser';

/** A realistic pull: manifest, two layers, verification, success. */
const FIXTURE_LINES = [
  '{"status":"pulling manifest"}',
  '{"status":"downloading","digest":"sha256:aaa","total":1000,"completed":0}',
  '{"status":"downloading","digest":"sha256:aaa","total":1000,"completed":600}',
  '{"status":"downloading","digest":"sha256:aaa","total":1000,"completed":1000}',
  '{"status":"downloading","digest":"sha256:bbb","total":500,"completed":250}',
  '{"status":"downloading","digest":"sha256:bbb","total":500,"completed":500}',
  '{"status":"verifying sha256 digest"}',
  '{"status":"success"}',
];

describe('parsePullLines', () => {
  it('parses every complete line and leaves no remainder after a closing newline', () => {
    const { events, remainder } = parsePullLines(`${FIXTURE_LINES.join('\n')}\n`);

    expect(remainder).toBe('');
    expect(events).toHaveLength(FIXTURE_LINES.length);
    expect(events[0]).toEqual({ status: 'pulling manifest' });
    expect(events[1]).toEqual({
      status: 'downloading',
      digest: 'sha256:aaa',
      total: 1000,
      completed: 0,
    });
  });

  it('carries an unterminated trailing line over instead of throwing or reporting it', () => {
    const first = parsePullLines('{"status":"pulling manifest"}\n{"status":"downl');

    expect(first.events).toEqual([{ status: 'pulling manifest' }]);
    expect(first.remainder).toBe('{"status":"downl');

    // The next chunk completes exactly the line the remainder started.
    const second = parsePullLines(`${first.remainder}oading","digest":"sha256:aaa"}\n`);
    expect(second.events).toEqual([{ status: 'downloading', digest: 'sha256:aaa' }]);
    expect(second.remainder).toBe('');
  });

  it('treats a stream that ends mid-line as nothing to report, not as a failure', () => {
    // What a truncated final chunk looks like: the last line never closes.
    const truncated = `{"status":"downloading","digest":"sha256:aaa","total":1000,"completed":600}\n{"status":"downloading","dig`;

    expect(() => parsePullLines(truncated)).not.toThrow();
    const { events, remainder } = parsePullLines(truncated);
    expect(events).toHaveLength(1);
    expect(remainder).not.toBe('');
    // And the fragment is never parsed into a half-event of its own.
    expect(events.every((event) => event.status === 'downloading')).toBe(true);
  });

  it('skips a line that is not JSON and keeps reading the ones after it', () => {
    const { events } = parsePullLines('{"status":"one"}\nnot json at all\n{"status":"two"}\n');

    expect(events.map((event) => event.status)).toEqual(['one', 'two']);
  });

  it('skips JSON that is not an object', () => {
    const { events } = parsePullLines('"just a string"\n[1,2,3]\nnull\n{"status":"kept"}\n');

    expect(events).toEqual([{ status: 'kept' }]);
  });

  it('ignores fields of an unexpected type instead of adopting them', () => {
    const { events } = parsePullLines('{"status":42,"total":"lots","completed":-5,"digest":""}\n');

    expect(events).toEqual([{}]);
  });

  it('tolerates \\r\\n and blank lines', () => {
    const { events } = parsePullLines('{"status":"one"}\r\n\r\n{"status":"two"}\r\n');

    expect(events.map((event) => event.status)).toEqual(['one', 'two']);
  });

  it('reports an error line as a line, so the caller can end the run on it', () => {
    const { events } = parsePullLines('{"error":"pull model manifest: file does not exist"}\n');

    expect(events[0]?.error).toContain('file does not exist');
  });
});

describe('createPullProgress', () => {
  it('sums the layers, so completed never walks backwards across a layer boundary', () => {
    const progress = createPullProgress();
    const { events } = parsePullLines(`${FIXTURE_LINES.join('\n')}\n`);

    const seen = events.map((line) => progress.push(line));
    const completed = seen.map((state) => state.completed);

    expect(completed).toEqual([0, 0, 600, 1000, 1250, 1500, 1500, 1500]);
    // Raw pass-through would drop from 1000 to 250 at the second digest.
    for (let index = 1; index < completed.length; index += 1) {
      expect(completed[index]).toBeGreaterThanOrEqual(completed[index - 1] as number);
    }
    expect(progress.current()).toEqual({ status: 'success', completed: 1500, total: 1500 });
  });

  it('carries Ollama’s own phase wording, including on lines without bytes', () => {
    const progress = createPullProgress();

    expect(progress.current().status).toBe('');
    progress.push({ status: 'pulling manifest' });
    expect(progress.current()).toEqual({ status: 'pulling manifest', completed: 0, total: 0 });
    progress.push({ status: 'downloading', digest: 'sha256:aaa', total: 10, completed: 4 });
    const afterPhase = progress.push({ status: 'verifying sha256 digest' });
    expect(afterPhase).toEqual({ status: 'verifying sha256 digest', completed: 4, total: 10 });
  });

  it('does not let a re-announced layer reduce what it already reported', () => {
    const progress = createPullProgress();

    progress.push({ status: 'downloading', digest: 'sha256:aaa', total: 900, completed: 800 });
    const retried = progress.push({ status: 'downloading', digest: 'sha256:aaa', total: 900 });

    expect(retried).toEqual({ status: 'downloading', completed: 800, total: 900 });
  });
});
