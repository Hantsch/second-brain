/* Wiring for the maintenance run — in exactly one place.

   The core does the computing (`@core/gardener`); here everything it doesn't
   know about comes together: the index as a read view, the thresholds from the
   vault settings, the languages, the UI labels, and the gateway.

   Three decisions that aren't otherwise visible in the code:

   - **The run calls the checks itself, instead of using `runGardener`.**
     Precisely because `runGardener` is a call with no intermediate state, and a
     run without intermediate state is a run without progress and without
     cancellation. Between two checks, the event loop is given a turn —
     otherwise the progress event would only arrive once everything is already
     done, and a `cancel` would never land. The order (deterministic, then
     interpretation, then the loose-end model stage, then sorting, then count)
     is the same as in `core/gardener/report.ts` — and every stage that lives
     there has to be repeated here, or it never runs in the app.
   - **The stored report is only read through `gardenerReport`.** A run filters
     the loose ends already answered (020, D5) out of what it stores; an answer
     given *after* a run would still be in the stored one, so the read filters
     again. One function for it, so no consumer of a stored run can forget it.
   - **Hidden findings are *not* filtered out here.** The run records everything
     it found; "looks fine" only filters on read (`gardener-state.ts`).
     Otherwise a reversed "looks fine" would only become visible again with a
     new run. */

import {
  CHECKS,
  auditFindings,
  buildContext,
  looseEndFinding,
  looseEndInput,
  sortFindings,
  vaultSize,
} from '@core/gardener';
import type { GardenerDeps, GardenerIndexView } from '@core/gardener';
import { modelLooseEnds } from '@core/journal';
import { isoDay } from '@core/vault/paths';
import type { DocLanguage, GardenerReport, GardenerSettings, UiLanguage } from '@shared/types';
import { fail } from './errors';
import { docLanguage, replyLanguage } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import { gardenerLabels } from '../gardener-labels';
import { gardenerState } from '../gardener-state';
import type { GardenerState, StoredRun } from '../gardener-state';
import { looseEndState } from '../loose-end-state';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** What the maintenance run needs from the index — `IndexService` satisfies it structurally. */
const GARDENER_INDEX_METHODS: readonly string[] = [
  'index',
  'pages',
  'projects',
  'sources',
  'dumps',
  'journal',
  'todos',
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

/**
 * The calendar day the maintenance state is read against: a snooze runs until a
 * day, not until a timestamp. Read from the clock here rather than taken from a
 * caller — when a finding comes back is not a parameter of the request.
 */
export function gardenerToday(): string {
  return isoDay(new Date());
}

/** This vault's maintenance state, from `.secondbrain/gardener.json`. */
export function gardenerStateFor(services: Services): Promise<GardenerState> {
  return gardenerState(services.requireVaultRoot(), gardenerToday());
}

/** The ids of loose ends already answered (020, D5) — from their own file. */
export async function answeredLooseEnds(services: Services): Promise<ReadonlySet<string>> {
  return (await looseEndState(services.requireVaultRoot())).answeredIds();
}

/**
 * The stored report as **every** reader has to see it — the one place a
 * persisted run turns into a report.
 *
 * `present()` alone hides what the user put away (017); an answered loose end
 * (020, D5) is neither dismissed nor snoozed but resolved, and its id lives in
 * its own file. Filtering it only in `runWithProgress` would keep it out of the
 * run that just happened and let it come back from the stored one — an answer
 * given after a run would resurface on the next read. So the two go together
 * here, and nobody reads `present()` past this function.
 */
export async function gardenerReport(
  services: Services,
  state?: GardenerState,
): Promise<GardenerReport | null> {
  const loaded = state ?? (await gardenerStateFor(services));
  return loaded.present(gardenerToday(), await answeredLooseEnds(services));
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
  /* The second model stage (020, D4) has its own task and therefore its own
     route: a vault that routes `journal-loose-ends` but not `gardener-audit`
     still gets its loose ends read. Both stages are gated by the same wish —
     no model is asked anything unless the run was asked to use one. */
  const useLooseEnds = wanted && run.gateway.isAvailable('journal-loose-ends');
  const total = CHECKS.length + (useLlm ? 1 : 0) + (useLooseEnds ? 1 : 0);

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

  /* The loose-end stage, after the interpretation and wired exactly like it:
     same gateway, same signal, same order as in `core/gardener/report.ts`.
     `phase: 'audit'` for it too — from the outside both are the same sentence,
     "a model is reading now", and the progress contract knows no third phase. */
  let looseEnds = null;
  if (useLooseEnds) {
    options.onProgress?.({ phase: 'audit', check: null, done, total, running: true });
    await tick();
    stopIfCancelled(options.signal);
    looseEnds = await modelLooseEnds(
      { ...looseEndInput(ctx), today: ctx.today },
      {
        gateway: run.gateway,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    done += 1;
  }
  const fromModel = (looseEnds?.looseEnds ?? []).map((looseEnd) => looseEndFinding(ctx, looseEnd));

  /* Everything this run re-derived. Kept separately from `findings`, because a
     candidate the audit rejects is still one the deterministic check produced
     again — the rejection says "don't show it now", not "the vault condition is
     gone". Only the second would justify forgetting a user decision, so
     `save` prunes against this list (see `gardener-state.ts`). */
  const considered = [...deterministic, ...(audit?.contradictions ?? []), ...fromModel];
  const rejected = new Set(audit?.rejected ?? []);
  /* A loose end already answered (020, D5) must not resurface here — its id
     lives in its own file (`main/loose-end-state.ts`), not in 017's
     `dismissed` list, because it was never a "looks fine" click. Filtered at
     the same point as `rejected`, for the same reason: both say "this run
     re-derived it, but don't show it". */
  const answered = await answeredLooseEnds(services);
  const findings = sortFindings(
    considered.filter((finding) => !rejected.has(finding.id) && !answered.has(finding.id)),
  );
  options.onProgress?.({ phase: 'done', check: null, done, total, running: false });

  return {
    ranAt: ctx.ranAt,
    /* A model spoke if **one** of the two stages answered — which one is said
       per finding by `origin`, not by the run. */
    usedLlm: audit?.usedLlm === true || looseEnds?.usedLlm === true,
    findings,
    consideredIds: considered.map((finding) => finding.id),
    advice: audit?.advice ?? [],
    size: vaultSize(run.index),
  };
}
