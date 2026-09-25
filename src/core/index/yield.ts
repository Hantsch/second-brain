/**
 * Yielding to the event loop during long synchronous derivation/indexing runs, so a
 * large vault does not freeze the main process for the whole duration of a build.
 */

/** Give the event loop one turn — queued IPC calls and timers get to run. */
export const yieldToEventLoop = (): Promise<void> => new Promise((r) => setImmediate(r));

/** How many documents a synchronous slice processes before it yields. */
export const YIELD_EVERY = 200;
