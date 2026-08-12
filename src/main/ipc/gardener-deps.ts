/* Wiring for the maintenance run — in exactly one place.

   The core does the computing (`@core/gardener`); here everything it doesn't
   know about comes together: the index as a read view, the thresholds from the
   vault settings, the languages, the UI labels, and the gateway.

   Two decisions that aren't otherwise visible in the code:

   - **The run calls the checks itself, instead of using `runGardener`.**
     Precisely because `runGardener` is a call with no intermediate state, and a
     run without intermediate state is a run without progress and without
     cancellation. Between two checks, the event loop is given a turn —
     otherwise the progress event would only arrive once everything is already
     done, and a `cancel` would never land. The order (deterministic, then
     interpretation, then sorting, then count) is the same as in
     `core/gardener/report.ts`.
   - **Hidden findings are *not* filtered out here.** The run records everything
     it found; "looks fine" only filters on read (`gardener-state.ts`).
     Otherwise a reversed "looks fine" would only become visible again with a
     new run. */

import { CHECKS, auditFindings, buildContext, sortFindings, vaultSize } from '@core/gardener';
import type { GardenerDeps, GardenerIndexView } from '@core/gardener';
import type { DocLanguage, GardenerSettings, UiLanguage } from '@shared/types';
import { fail } from './errors';
import { docLanguage, replyLanguage } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import { gardenerLabels } from '../gardener-labels';
import { gardenerState } from '../gardener-state';
import type { GardenerState, StoredRun } from '../gardener-state';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** What the maintenance run needs from the index — `IndexService` satisfies it structurally. */
const GARDENER_INDEX_METHODS: readonly string[] = [
  'index',
  'pages',
  'projects',
  'sources',
  'dumps',
];

function knowsGardener(index: IndexLike): index is IndexLike & GardenerIndexView {
  const record = index as unknown as Record<string, unknown>;
  return GARDENER_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/**
 * The index as the maintenance run's read view. If a derivation is missing,
 * the channel says so — a report without content would be a claim about a
 * vault that no one has read.
 */
export function gardenerIndex(services: Services): GardenerIndexView {
  const index = services.requireIndex();
  if (!knowsGardener(index)) throw fail('io', 'der Index liefert keine Pflege-Ableitungen');
  return index;
}

/** This vault's maintenance state, from `.secondbrain/gardener.json`. */
export function gardenerStateFor(services: Services): Promise<GardenerState> {
  return gardenerState(services.requireVaultRoot());
}

/** The maintenance settings of the open vault, as far as they're set. */
export function gardenerSettings(services: Services): Partial<GardenerSettings> | undefined {
  return services.settings.vault()?.gardener;
}

function deps(services: Services, signal?: AbortSignal): GardenerDeps {
  const documents: DocLanguage = docLanguage(services);
  const reply: UiLanguage = replyLanguage(services);
  return {
    index: gardenerIndex(services),
    gateway: createGateway(services),
    labels: gardenerLabels(services.settings.uiLanguage()),
    docLanguage: documents,
    replyLanguage: reply,
    now: new Date(),
    ...(signal === undefined ? {} : { signal }),
  };
}

export interface RunOptions {
  /** Overrides `gardener.useLlm` for this run. */
  useLlm?: boolean;
  signal?: AbortSignal;
  /** Report progress — the events in the channel, nothing in the autostart. */
  onProgress?: (progress: {
    phase: 'checks' | 'audit' | 'done';
    check: (typeof CHECKS)[number]['kind'] | null;
    done: number;
    total: number;
    running: boolean;
  }) => void;
}

/** Give the event loop a turn, so progress and cancellation can get through. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function stopIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw fail('cancelled', 'der Pflegelauf wurde abgebrochen');
}

/**
 * A run with progress. Returns the **raw** run: all findings, plus the size of
 * the content as the reference point for the health status.
 */
export async function runWithProgress(
  services: Services,
  options: RunOptions = {},
): Promise<StoredRun> {
  const settings = services.settings.vault();
  const run = deps(services, options.signal);
  const ctx = buildContext(run, { ...(settings === null ? {} : { settings }) });
  /* What's wanted is one thing, what's possible another: without a route for
     `gardener-audit` there is no interpretation phase — not even a reported
     one. Progress that says "the model is interpreting the findings" while
     none is reachable would be exactly the claim this screen must not make. */
  const wanted = options.useLlm ?? settings?.gardener.useLlm ?? false;
  const useLlm = wanted && run.gateway.isAvailable('gardener-audit');
  const total = CHECKS.length + (useLlm ? 1 : 0);

  const deterministic = [];
  let done = 0;
  for (const check of CHECKS) {
    stopIfCancelled(options.signal);
    options.onProgress?.({
      phase: 'checks',
      check: check.kind,
      done,
      total,
      running: true,
    });
    await tick();
    stopIfCancelled(options.signal);
    deterministic.push(...check.run(ctx));
    done += 1;
  }

  let audit = null;
  if (useLlm) {
    options.onProgress?.({ phase: 'audit', check: null, done, total, running: true });
    await tick();
    stopIfCancelled(options.signal);
    audit = await auditFindings(ctx, deterministic, {
      gateway: run.gateway,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    done += 1;
  }

  const rejected = new Set(audit?.rejected ?? []);
  const findings = sortFindings(
    [...deterministic, ...(audit?.contradictions ?? [])].filter(
      (finding) => !rejected.has(finding.id),
    ),
  );
  options.onProgress?.({ phase: 'done', check: null, done, total, running: false });

  return {
    ranAt: ctx.ranAt,
    usedLlm: audit?.usedLlm ?? false,
    findings,
    advice: audit?.advice ?? [],
    size: vaultSize(run.index),
  };
}
