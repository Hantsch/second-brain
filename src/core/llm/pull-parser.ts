/* Ollama's native `/api/pull` reports progress as newline-delimited JSON: one
   JSON object per line, `{"status":"pulling manifest"}` then a long run of
   `{"status":"downloading","digest":"sha256:…","total":…,"completed":…}` and
   finally `{"status":"success"}`.

   Two things make that harder than `JSON.parse` per chunk, and both live here
   so they're testable without a socket, a fetch, or Electron:

   - **Chunks don't respect lines.** A chunk can end in the middle of a line,
     and the stream itself can end that way too (the server disappears, the
     request is aborted). An incomplete trailing fragment is "nothing to report
     yet" — it goes back to the caller as `remainder` and gets prepended to the
     next chunk. It is never a parse error, and at the end of a stream it is
     simply dropped: half a line carries no information worth reporting, and
     throwing over it would turn a finished download into a failure.
   - **Ollama's numbers are per layer, not per pull.** Each blob has its own
     `total`/`completed`, and `completed` restarts at zero for the next
     `digest`. Passed through raw, a progress bar would jump backwards on every
     layer boundary. `createPullProgress` therefore folds the layers into one
     sum — no invented numbers, just the layer figures added up, which makes
     `completed` monotonic for as long as a run lasts. */

/** One parsed line of the pull stream. Every field is optional: which of them
    a line carries depends on its phase, and none of them is guaranteed by a
    schema — this is a foreign process's output, so each is only adopted when
    it has the expected type. */
export interface PullLine {
  /** Ollama's own phase wording, e.g. `pulling manifest`, `downloading`. */
  status?: string;
  /** The blob this line is about; absent on the phase-only lines. */
  digest?: string;
  total?: number;
  completed?: number;
  /** Ollama reports a refused pull (unknown model, for instance) as a line in
      an otherwise successful HTTP 200 stream, not as a status code. */
  error?: string;
}

export interface PullLineResult {
  /** Every line that was complete and parseable, in order. */
  events: PullLine[];
  /** The trailing fragment without its closing newline — prepend to the next chunk. */
  remainder: string;
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function toPullLine(raw: string): PullLine | null {
  const trimmed = raw.trim(); // also disposes of the \r in a \r\n stream
  if (trimmed === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    /* A line that isn't JSON tells us nothing we could report, and a stream
       that contains one is not a reason to abandon the rest of it. */
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const line: PullLine = {};
  const status = stringField(source, 'status');
  if (status !== undefined) line.status = status;
  const digest = stringField(source, 'digest');
  if (digest !== undefined) line.digest = digest;
  const total = numberField(source, 'total');
  if (total !== undefined) line.total = total;
  const completed = numberField(source, 'completed');
  if (completed !== undefined) line.completed = completed;
  const error = stringField(source, 'error');
  if (error !== undefined) line.error = error;
  return line;
}

/**
 * Splits whatever text has accumulated so far into complete lines, parses each
 * one, and hands the unterminated rest back. Never throws: an unparseable line
 * is skipped, and the trailing fragment stays a fragment.
 */
export function parsePullLines(buffer: string): PullLineResult {
  const parts = buffer.split('\n');
  // Without a closing newline the last part is incomplete by definition; with
  // one it is the empty string, and an empty remainder costs nothing.
  const remainder = parts.pop() ?? '';
  const events: PullLine[] = [];
  for (const part of parts) {
    const line = toPullLine(part);
    if (line) events.push(line);
  }
  return { events, remainder };
}

/** Where a pull currently stands, in bytes across all of its layers. */
export interface PullProgress {
  /** Ollama's last reported phase, `''` before the first one arrives. */
  status: string;
  completed: number;
  total: number;
}

export interface PullProgressTracker {
  /** Folds a line in and returns the state after it. */
  push(line: PullLine): PullProgress;
  /** The state as it stands, for the closing event. */
  current(): PullProgress;
}

/**
 * Adds up the per-layer figures so `completed` only ever grows. `total` grows
 * as further layers announce themselves — honest, since their size genuinely
 * isn't known before Ollama mentions them.
 */
export function createPullProgress(): PullProgressTracker {
  const layers = new Map<string, { completed: number; total: number }>();
  let status = '';

  const sum = (pick: (layer: { completed: number; total: number }) => number): number => {
    let result = 0;
    for (const layer of layers.values()) result += pick(layer);
    return result;
  };

  const current = (): PullProgress => ({
    status,
    completed: sum((layer) => layer.completed),
    total: sum((layer) => layer.total),
  });

  return {
    push: (line) => {
      if (line.status !== undefined) status = line.status;
      if (line.digest !== undefined) {
        const previous = layers.get(line.digest);
        layers.set(line.digest, {
          // A retried or re-announced layer must not walk the bar backwards.
          completed: Math.max(previous?.completed ?? 0, line.completed ?? 0),
          total: Math.max(previous?.total ?? 0, line.total ?? 0),
        });
      }
      return current();
    },
    current,
  };
}
