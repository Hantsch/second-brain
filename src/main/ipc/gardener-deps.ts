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
  computeProgress,
  computeStagePlan,
  looseEndFinding,
  looseEndInput,
  sortFindings,
  vaultSize,
} from '@core/gardener';
import type {
  GardenerDeps,
  GardenerIndexView,
  GardenerStageId,
  StagePlanEntry,
} from '@core/gardener';
import { modelLooseEnds } from '@core/journal';
import { isoDay } from '@core/vault/paths';
import type {
  DocLanguage,
  GardenerFinding,
  GardenerReport,
  GardenerRunTrigger,
  GardenerSettings,
  UiLanguage,
} from '@shared/types';
import { fail } from './errors';
import { docLanguage, replyLanguage } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import { gardenerLabels } from '../gardener-labels';
import { gardenerState, isRunComplete } from '../gardener-state';
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

/** The widened shape `event:gardener-progress` carries — see `src/shared/ipc.ts`. */
export interface GardenerProgressEvent {
  phase: 'checks' | 'audit' | 'loose-ends' | 'done';
  check: (typeof CHECKS)[number]['kind'] | null;
  done: number;
  total: number;
  running: boolean;
  stage: GardenerStageId | 'done';
  percent: number;
  remaining: GardenerStageId[];
  startedAt: string;
  trigger: GardenerRunTrigger;
}

export interface RunOptions {
  /** Overrides `gardener.useLlm` for this run. */
  useLlm?: boolean;
  signal?: AbortSignal;
  /** Who asked for this run — `gardener:run` passes `'user'`, the autorun
      `'auto'` (021a, D3). Defaults to `'user'` so a caller that doesn't say has
      the sensible default rather than an unlabelled run. */
  trigger?: GardenerRunTrigger;
  /** Report progress — both callers pass the run slot's `publish` (021a, D3),
      so every step is recorded and emitted in one place. */
  onProgress?: (progress: GardenerProgressEvent) => void;
  /**
   * A stored run to continue (021b, D3). Every stage named in its `completed`
   * is not run again — a check does not run twice, and a model stage that
   * already answered is not asked again. Its `findings` become the
   * deterministic base a model stage not yet reached still gets to interpret.
   * `undefined` (the default) runs every stage of the plan, exactly as before.
   */
  resumeFrom?: StoredRun;
}

/** What a run produced, and whether it got all the way there (021b, D2). */
export interface GardenerRunResult {
  /** The raw run — of the stages that finished, and only those. */
  run: StoredRun;
  /** `false` when the run was stopped before it reached every planned stage. */
  complete: boolean;
  /**
   * Did this call run the `checks` stage itself, or did it inherit its
   * findings from the run it resumed (021b, D3)? Only the first re-derived
   * what is in `run.findings`, and only the first may therefore let `save()`
   * forget what a fix has resolved since (`SaveRunOptions.checksReran`).
   */
  checksReran: boolean;
}

/** Give the event loop a turn, so progress and cancellation can get through. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * A stage noticed the signal. Deliberately **not** an `IpcFailure`: since 021b
 * a cancellation is internal control flow that never leaves this module — it
 * unwinds the stage sequence and is caught below, so the caller gets what the
 * finished stages found instead of an error that throws the run away.
 */
class RunCancelled extends Error {
  constructor() {
    super('gardener run cancelled');
    this.name = 'RunCancelled';
  }
}

function stopIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new RunCancelled();
}

/**
 * Was this the run being stopped, or a genuine failure? Our own sentinel says
 * so directly; a model stage cancelled mid-request throws whatever the gateway
 * throws, so an aborted signal counts too — the same reading the autorun has
 * always applied to its own errors.
 */
function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return error instanceof RunCancelled || signal?.aborted === true;
}

type AuditResult = Awaited<ReturnType<typeof auditFindings>>;
type LooseEndResult = Awaited<ReturnType<typeof modelLooseEnds>>;

/**
 * A run with progress. Returns the **raw** run: all findings of the stages that
 * finished, plus the size of the content as the reference point for the health
 * status — and whether every planned stage was reached.
 *
 * A stop does not throw past this function (021b, D2). Whatever the finished
 * stages produced is a result, not a failure: `complete: false` says the run was
 * cut short, `run.plan`/`run.completed` say where. What to do with a partial run
 * — store it, or drop it because the vault is closing — is the caller's
 * decision, not this function's (see `saveRun`).
 */
export async function runWithProgress(
  services: Services,
  options: RunOptions = {},
): Promise<GardenerRunResult> {
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

  /* The weighted stage plan (021a, D1): the ten mechanical checks together
     count as little as one model stage's fraction, so the bar doesn't jump to
     ~83% before the slow part even starts. See `@core/gardener/progress`. */
  const plan: readonly StagePlanEntry[] = computeStagePlan({ useLlm, useLooseEnds });
  const startedAt = ctx.ranAt;
  const trigger: GardenerRunTrigger = options.trigger ?? 'user';

  function emit(
    phase: GardenerProgressEvent['phase'],
    check: (typeof CHECKS)[number]['kind'] | null,
    doneCount: number,
    running: boolean,
    stageFraction: number,
  ): void {
    const stage: GardenerStageId | 'done' = phase === 'done' ? 'done' : phase;
    const { percent, remaining } =
      phase === 'done'
        ? { percent: 100, remaining: [] as GardenerStageId[] }
        : computeProgress({ plan, current: phase, currentFraction: stageFraction });
    options.onProgress?.({
      phase,
      check,
      done: doneCount,
      total,
      running,
      stage,
      percent,
      remaining,
      startedAt,
      trigger,
    });
  }

  /* A stage this run continues rather than repeats (021b, D3) — named in the
     stored run's own `completed`, not just present in it. */
  const resumeFrom = options.resumeFrom;
  const alreadyDone = new Set(resumeFrom?.completed ?? []);

  const deterministic: GardenerFinding[] = [];
  /* Which stages actually finished — a stage counts only once its result is in
     hand, so a stop *inside* one leaves it named in `plan` and absent here.
     A resumed stage counts too: it finished, only not in this call. */
  const completed: GardenerStageId[] = [];
  let audit: AuditResult | null = null;
  let looseEnds: LooseEndResult | null = null;
  let done = 0;
  let stopped = false;

  try {
    if (alreadyDone.has('checks')) {
      /* Not re-run: what the checks stage found last time is this run's
         deterministic base, fed to the model stages below exactly as a fresh
         run would feed its own `deterministic`. */
      deterministic.push(...(resumeFrom?.findings ?? []));
      done += CHECKS.length;
      completed.push('checks');
    } else {
      for (const check of CHECKS) {
        stopIfCancelled(options.signal);
        emit('checks', check.kind, done, true, done / CHECKS.length);
        await tick();
        stopIfCancelled(options.signal);
        deterministic.push(...check.run(ctx));
        done += 1;
      }
      completed.push('checks');
    }

    if (useLlm) {
      if (alreadyDone.has('audit')) {
        done += 1;
        completed.push('audit');
      } else {
        emit('audit', null, done, true, 0);
        await tick();
        stopIfCancelled(options.signal);
        audit = await auditFindings(ctx, deterministic, {
          gateway: run.gateway,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        done += 1;
        completed.push('audit');
      }
    }

    /* The loose-end stage, after the interpretation and wired exactly like it:
       same gateway, same signal, same order as in `core/gardener/report.ts`. It
       now gets its own `phase`/`stage` (`'loose-ends'`) instead of sharing
       `'audit'` — the two model stages are weighted separately, so the progress
       contract has to be able to name them separately too. */
    if (useLooseEnds) {
      if (alreadyDone.has('loose-ends')) {
        done += 1;
        completed.push('loose-ends');
      } else {
        emit('loose-ends', null, done, true, 0);
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
        completed.push('loose-ends');
      }
    }
  } catch (error) {
    if (!isCancellation(error, options.signal)) throw error;
    stopped = true;
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
  /* Only a run that got there reports being done — the terminating snapshot of
     a stopped run comes from the run slot's `finish()` instead (021a), which
     says "not running" without claiming the work was finished. */
  if (!stopped) emit('done', null, done, false, 1);

  /* Ids a *previous* call already re-derived, for a stage this call didn't
     re-run (021b, D3) — audit's rejections in particular must keep counting
     against a decision even on a run that never asks the model again. Without
     this, `save`'s pruning would only ever see what this one call produced,
     and a resumed run that finishes without touching `audit` again would look
     like it never considered what that stage once rejected. */
  const consideredBefore =
    alreadyDone.has('audit') || alreadyDone.has('loose-ends')
      ? (resumeFrom?.consideredIds ?? [])
      : [];

  const stored: StoredRun = {
    ranAt: ctx.ranAt,
    /* A model spoke if **one** of the two stages answered — this call's own,
       or (021b, D3) a stage this call only continues, whose model answer
       already stands from an earlier call. */
    usedLlm: resumeFrom?.usedLlm === true || audit?.usedLlm === true || looseEnds?.usedLlm === true,
    findings,
    consideredIds: [...new Set([...consideredBefore, ...considered.map((finding) => finding.id)])],
    /* This call's own advice if it ran the interpretation, otherwise (021b,
       D3) whatever the earlier call's interpretation already said — never
       invented, and never dropped just because this call didn't ask again. */
    advice: audit?.advice ?? (alreadyDone.has('audit') ? (resumeFrom?.advice ?? []) : []),
    size: vaultSize(run.index),
    plan: plan.map((entry) => entry.stage),
    completed,
  };
  /* Not `!stopped`: the storage contract decides what complete means (021b,
     D1), so the run and everyone who later reads it from the file answer the
     question the same way. */
  return {
    run: stored,
    complete: isRunComplete(stored),
    /* The one thing `stored` itself cannot say: its `completed` names `checks`
       either way, so only this call knows whether those findings were derived
       here or inherited from the stop it continues. */
    checksReran: !alreadyDone.has('checks'),
  };
}

/**
 * The health score a partial run shows instead of computing one: the score of
 * the report **as it stands right now**, before this run replaces it.
 *
 * Read from the report rather than from the raw run, because that is the number
 * the user last saw next to their list — dismissed and snoozed findings already
 * taken out. A stored run that was itself partial carries its own frozen score
 * through (`present()` puts it in `health`, and its origin in `healthAsOf`), so
 * a chain of stops keeps pointing at the last **complete** check rather than at
 * the previous stop.
 *
 * `undefined` when there is nothing to freeze — no report yet, or a vault with
 * no content, whose health is unknown rather than a number. The partial run is
 * then stored without a frozen score, and `present()` reports its health as
 * unknown: with no complete check to point at, there is no number to show, and
 * computing one over half a run is exactly what this freeze prevents.
 */
async function frozenHealth(
  services: Services,
  state: GardenerState,
): Promise<StoredRun['healthAsOf']> {
  const previous = await gardenerReport(services, state);
  if (previous === null || previous.healthKnown === false) return undefined;
  return {
    ranAt: previous.healthAsOf ?? previous.ranAt,
    score: previous.health,
    contributions: previous.healthContributions ?? [],
  };
}

/**
 * Store what a run produced — the one place a **partial** run is ever written,
 * shared by the channel and the autorun so both keep exactly as much.
 *
 * Two things a partial run does differently, and only these two: it carries the
 * frozen score of the report it replaces (no number is ever derived from half a
 * check), and it prunes no decision (`GardenerState.save`, 021b D1).
 *
 * A run that finished **no** stage is not stored at all. It re-derived nothing,
 * so it says nothing — and writing it would replace a real report with an empty
 * one that claims a check happened. Returns whether anything was written.
 *
 * Note what this function does *not* decide: a stop on the way out of the app
 * writes nothing at all, and that is the caller's call — only the caller holds
 * the run handle that knows why the run was stopped.
 */
export async function saveRun(
  services: Services,
  state: GardenerState,
  result: GardenerRunResult,
): Promise<boolean> {
  /* What a fix resolved may only be forgotten by a run that looked at the
     files again (021b): a resumed run carries the earlier stop's findings, so
     it says nothing about whether they are still there. */
  const options = { checksReran: result.checksReran };
  if (result.complete) {
    await state.save(result.run, options);
    return true;
  }
  if ((result.run.completed ?? []).length === 0) return false;
  const frozen = await frozenHealth(services, state);
  await state.save(
    { ...result.run, ...(frozen === undefined ? {} : { healthAsOf: frozen }) },
    options,
  );
  return true;
}
