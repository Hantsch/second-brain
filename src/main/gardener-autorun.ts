/* The maintenance run on opening the vault — the `gardener.runOnOpen` setting.

   The toggle in the Behavior tab is now read by someone, so it's live. Four
   rules keep it from becoming a burden:

   - **Only when it's on.** Otherwise nothing happens, and the toggle tells the
     truth.
   - **Only once the index is ready.** It's still building right after opening;
     a run over a half-built index would find findings that don't exist. So we
     wait and retry — the same as the reminder notification.
   - **One run per open.** Not stockpiled, not on a timer: anyone who wants to
     check more often clicks "Check now" in the screen. Whether one is already
     going is not this class's own bookkeeping but `gardener-run-state.ts`'s —
     the same slot the channel claims, so the two cannot overlap and one cancel
     reaches either.
   - **The setting decides interpretation**, not this automaton: without
     `gardener.useLlm` the run stays deterministic and costs nothing.

   A vault switch is detected via `app.lastVault` — the same mechanism as in
   `reminder-notify.ts`, so the service container doesn't need a second hook.
   Errors stay quiet: a failed maintenance run must not cost the app anything. */

import { gardenerStateFor, runWithProgress, saveRun } from './ipc/gardener-deps';
import { beginGardenerRun, gardenerRunning } from './gardener-run-state';
import { GARDENER_STATE_FILE } from './gardener-state';
import type { Services } from './services';

/**
 * How long after opening the check happens — the index takes a moment. No long
 * wait needed: if it's not ready yet, the same interval is retried later, and
 * the run itself costs milliseconds (it only computes over the index). With
 * interpretation it costs a model call — that's why `useLlm` in the settings
 * decides, not this automaton.
 */
export const FIRST_RUN_DELAY_MS = 2500;

/** How many times we wait for the index before the run gives up. */
const INDEX_RETRIES = 8;

/**
 * What an attempt did — the test reads from this that nothing was invented.
 * `'cancelled'` is its own answer and not a failure: a run stopped on closing
 * the vault must not look like a half-built index, or `runWhenReady` would
 * retry exactly the run that was just called off.
 */
export type AutorunResult = 'ran' | 'off' | 'no-index' | 'busy' | 'cancelled';

export interface AutorunOptions {
  /** Delay until the first attempt. Tests set it to 0. */
  delayMs?: number;
}

export class GardenerAutorun {
  private first: ReturnType<typeof setTimeout> | null = null;
  private unwatch: (() => void) | null = null;
  private lastVault: string | null = null;

  constructor(
    private readonly services: Services,
    private readonly options: AutorunOptions = {},
  ) {}

  start(): void {
    this.lastVault = this.services.settings.app().lastVault;
    this.unwatch = this.services.settings.onChange((snapshot) => {
      if (snapshot.app.lastVault === this.lastVault) return;
      this.lastVault = snapshot.app.lastVault;
      if (snapshot.app.lastVault !== null) this.schedule();
    });
    this.schedule();
  }

  stop(): void {
    if (this.first !== null) clearTimeout(this.first);
    this.first = null;
    this.unwatch?.();
    this.unwatch = null;
  }

  private schedule(): void {
    if (this.first !== null) clearTimeout(this.first);
    this.first = setTimeout(() => {
      this.first = null;
      void this.runWhenReady();
    }, this.options.delayMs ?? FIRST_RUN_DELAY_MS);
  }

  /** Waits until the index is ready. After that, at most one run. */
  async runWhenReady(attempt = 0): Promise<AutorunResult> {
    const result = await this.run();
    if (result !== 'no-index' || attempt >= INDEX_RETRIES) return result;
    return new Promise((resolve) => {
      setTimeout(
        () => void this.runWhenReady(attempt + 1).then(resolve),
        this.options.delayMs ?? FIRST_RUN_DELAY_MS,
      );
    });
  }

  /** One attempt. Reports what it did. */
  async run(): Promise<AutorunResult> {
    if (gardenerRunning()) return 'busy';
    const settings = this.services.settings.vault();
    if (settings === null || !settings.gardener.runOnOpen) return 'off';
    const status = this.services.status();
    if (!status.ready || status.indexing || this.services.index() === null) return 'no-index';

    /* The slot, not a flag of our own — and it is claimed here rather than at
       the top so a run nobody wants is never announced. Losing the race against
       a click is still `'busy'`. */
    const handle = beginGardenerRun({
      trigger: 'auto',
      emit: (progress) => this.services.sendEvent('event:gardener-progress', progress),
    });
    if (handle === null) return 'busy';
    try {
      const state = await gardenerStateFor(this.services);
      /* Reported like every other run (021a, D3): without `onProgress` the run
         on opening the vault was invisible — it happened, and the screen said
         nothing while it did. `trigger` tells the screen who asked. */
      const result = await runWithProgress(this.services, {
        signal: handle.signal,
        trigger: handle.trigger,
        onProgress: handle.publish,
      });
      /* The same rule as in the channel (021b, D2): a stop the user asked for
         keeps what the finished stages found, a stop from closing the vault or
         quitting keeps nothing — and this run is exactly the one that is going
         when the vault closes. */
      const stored =
        handle.cancelledBy() === 'shutdown' ? false : await saveRun(this.services, state, result);
      /* Same wake-up as in the channel, and only when something really was
         written: the report now sits differently. */
      if (stored) {
        this.services.sendEvent('event:vault-changed', {
          paths: [GARDENER_STATE_FILE],
          external: false,
        });
      }
      /* `'ran'` means: a whole run is on file. A stopped one says `'cancelled'`
         whether or not its half was kept — `runWhenReady` must not retry it,
         and it must not be read as the check having happened. */
      return result.complete && stored ? 'ran' : 'cancelled';
    } catch (error) {
      if (handle.signal.aborted) return 'cancelled';
      console.warn('[gardener] Maintenance run on open failed:', error);
      return 'no-index';
    } finally {
      handle.finish();
    }
  }
}

/** Builds the automaton and starts it. The return value stops it again. */
export function startGardenerAutorun(
  services: Services,
  options: AutorunOptions = {},
): GardenerAutorun {
  const autorun = new GardenerAutorun(services, options);
  autorun.start();
  return autorun;
}
