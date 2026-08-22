/* Elapsed time since a run started, ticking every second — the answer to
   "is anything even happening" while the progress bar itself stands still
   during a model stage (021a, D2). No i18n or formatting opinions belong to
   the timer itself; `formatElapsed` turns the count into `m:ss` for display. */

import { useEffect, useState } from 'react';

/**
 * Seconds elapsed since `startedAt` (an ISO timestamp). `null`/`undefined`
 * means no run is going: no timer starts and the result is `0`. The timer
 * resets and restarts whenever `startedAt` changes — a new run gets its own
 * clock, not the leftover tick count from the last one.
 */
interface ElapsedTick {
  /** Which run this tick belongs to — lets a stale tick from a run that just
   *  ended be told apart from the current one without clearing state
   *  synchronously inside the effect (a lint rule this codebase enforces). */
  startedAt: string;
  seconds: number;
}

export function useElapsedSeconds(startedAt: string | null | undefined): number {
  const [tick, setTick] = useState<ElapsedTick | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const startedMs = new Date(startedAt).getTime();
    const id = window.setInterval(() => {
      setTick({ startedAt, seconds: Math.max(0, Math.floor((Date.now() - startedMs) / 1000)) });
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return 0;
  /* Before the first tick of a (new) run, or right after the previous run's
     last tick, there is nothing current to show yet — 0 is the honest answer,
     not a leftover count from a run that already ended. */
  return tick?.startedAt === startedAt ? tick.seconds : 0;
}

/** `m:ss`, e.g. 65 seconds becomes `1:05`. */
export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
