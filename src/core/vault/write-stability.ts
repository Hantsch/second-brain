/**
 * Holds back a file's add/change report until its size has stopped changing — the same
 * semantics as chokidar's `awaitWriteFinish`. OneDrive syncs and bulk copies write files in
 * chunks; without this a still-growing file would be reported (and read) half-written.
 *
 * Elapsed time is counted as polls x `pollMs` instead of reading the clock, so the gate is
 * fully driven by timers and can be proven under fake timers without faking `Date`.
 */

/** How long a file's size must be unchanged before it is reported. */
export const WATCH_WRITE_STABILITY_MS = 300;

/** How often a pending file's size is polled. */
export const WATCH_WRITE_POLL_MS = 100;

export interface WriteStabilityGate {
  /** Start watching `path` for a stable size; a path already pending is left alone. */
  touch(path: string): void;
  /** Drop every pending path and timer; nothing is reported afterwards. */
  cancel(): void;
}

interface PendingWrite {
  timer: ReturnType<typeof setTimeout> | null;
  /** Size seen by the previous poll; `null` until the first poll. */
  lastSize: number | null;
  /** Time the size has been unchanged, counted in polls x pollMs. */
  stableMs: number;
}

/**
 * `statSize` resolves to the file's size, or `null` when the file is gone. A vanished file is
 * dropped silently: its `unlink` event reports it, not this gate.
 */
export function createWriteStabilityGate(
  onStable: (path: string) => void,
  statSize: (path: string) => Promise<number | null>,
  stabilityMs = WATCH_WRITE_STABILITY_MS,
  pollMs = WATCH_WRITE_POLL_MS,
): WriteStabilityGate {
  const pending = new Map<string, PendingWrite>();

  const schedule = (path: string, entry: PendingWrite): void => {
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void statSize(path).then((size) => {
        // Identity check: after cancel() (or cancel + a fresh touch) a stat that was already
        // in flight must not report or reschedule anything.
        if (pending.get(path) !== entry) return;
        if (size === null) {
          pending.delete(path);
          return;
        }
        if (size !== entry.lastSize) {
          entry.lastSize = size;
          entry.stableMs = 0;
        } else {
          entry.stableMs += pollMs;
        }
        if (entry.stableMs >= stabilityMs) {
          pending.delete(path);
          onStable(path);
          return;
        }
        schedule(path, entry);
      });
    }, pollMs);
  };

  return {
    touch(path: string): void {
      // A pending path needs no restart: the next poll sees the growth and resets the window.
      if (pending.has(path)) return;
      const entry: PendingWrite = { timer: null, lastSize: null, stableMs: 0 };
      pending.set(path, entry);
      schedule(path, entry);
    },
    cancel(): void {
      for (const entry of pending.values()) {
        if (entry.timer !== null) clearTimeout(entry.timer);
      }
      pending.clear();
    },
  };
}
