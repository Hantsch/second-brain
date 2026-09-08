/**
 * One module at a time.
 *
 * The write phase of a digestion is a read-modify-write over files the whole
 * module shares: `wiki/index.md`, `wiki/log.md`, `wiki/overview.md`. Two
 * digestions into the same module interleave their reads and their writes, and
 * the later write wins — a chronicle entry appended to a copy that was read
 * before the other run appended its own is simply gone. The import queue runs
 * two digestions at a time (`src/main/ipc/ingest.ts`), so this is the normal
 * case, not the exotic one.
 *
 * The lock is per module slug and covers the **write phase only**: the model
 * calls stay outside it, because AC2 asks both digestions to *complete* and the
 * expensive part is the summarizing (story 050, D-d).
 *
 * It is a promise chain, not a flag: each call hangs itself onto the previous
 * call for its module, and two different modules never meet. Two properties
 * matter, and both are about never wedging a module:
 *
 * - **The chain advances on failure too.** What is stored is a promise that only
 *   ever settles; `fn`'s rejection travels to `fn`'s own caller and never to the
 *   next one in line. A digestion that throws and rolls back therefore hands the
 *   module on instead of blocking every later import into it.
 * - **It is not re-entrant.** Calling `withModuleLock` for the same module from
 *   inside `fn` would wait for `fn` itself and deadlock. Locked segments are
 *   sequenced side by side, never nested.
 *
 * Process-local, deliberately: it serializes this app against itself. The
 * gardener in another process, or a hand edit in Obsidian, is a different
 * problem, and the answer to that one is the hash guard on every write plus the
 * bounded retry in `write-retry.ts` (story 050, D-e).
 */

/**
 * Tail of the chain per module slug. The stored promise **never rejects** — it
 * only marks "the segment before you is over". Idle modules drop out again, so
 * the map does not grow with every module the app ever touched.
 */
const chains = new Map<string, Promise<void>>();

/**
 * Run `fn` with nothing else for this module running beside it. The result and
 * the failure of `fn` are handed to the caller unchanged.
 */
export function withModuleLock<T>(module: string, fn: () => Promise<T>): Promise<T> {
  const key = module.trim();
  const previous = chains.get(key) ?? Promise.resolve();
  /* Both handlers start `fn`: a predecessor that failed must not keep this call
     from running, and it never gets this call's failure either. Going through
     `then` also turns a synchronous throw inside `fn` into a rejection of `run`,
     so there is exactly one exit path to release on. */
  const run = previous.then(fn, fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, settled);
  void settled.then(() => {
    // Only the current tail clears the entry — whoever queued behind it owns it now.
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
