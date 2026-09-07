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
  AUDIT_CANDIDATE_KINDS,
  CHECKS,
  auditFindings,
  buildContext,
  computeProgress,
  computeStagePlan,
  inScope,
  isRunComplete,
  looseEndFinding,
  looseEndInput,
  narrowedScope,
  scopeAdmits,
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
  GardenerFindingKind,
  GardenerReport,
  GardenerRunScope,
  GardenerRunTrigger,
  GardenerSettings,
  UiLanguage,
} from '@shared/types';
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
  /**
   * The part of the vault to run over (021c). A check whose kind is not
   * named runs not at all — not run and filtered afterward, but skipped
   * outright, which is where the saving actually is for the two expensive
   * checks (`near-duplicate`, `missing-page`). What the checks stage does
   * produce is filtered to the scope before either model stage sees it, so a
   * scoped run also means a shorter model stage, not just a shorter list on
   * screen — and a model stage whose every possible output lies outside the
   * scope is not asked at all rather than asked and thrown away. A scope that
   * narrows nothing (`narrowedScope`) is read as no scope at all — the same
   * normalization `gardener-state.ts` applies.
   */
  scope?: GardenerRunScope;
  /**
   * Pause between two checks, in milliseconds (066, D4). Set only from the
   * `SB_E2E_STAGE_DELAY_MS` seam in `ipc/gardener-run.ts`, so a spec can watch
   * a run that would otherwise be over before it could look; `undefined` — the
   * default and every shipped run — creates no timer at all and leaves the
   * checks stage exactly as it was. A pause is never waited out blindly: it
   * ends the moment `signal` aborts, so a stop stays as prompt with the delay
   * set as without it.
   */
  stageDelayMs?: number;
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
 * Hold the checks stage for `ms` — `RunOptions.stageDelayMs`, and nothing else
 * ever sets that (066, D4). `undefined` returns a resolved promise without
 * touching a timer, so the run without the seam is the run it always was.
 *
 * The wait races the run's own `AbortSignal` instead of sleeping it out: a
 * plain `setTimeout` would make a stop cost the full delay, which would turn
 * the seam that makes a run observable into one that makes cancelling slow —
 * and cancellation latency is precisely what the seam must not change.
 */
function pause(ms: number | undefined, signal?: AbortSignal): Promise<void> {
  if (ms === undefined || signal?.aborted === true) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    /* Read only from `done`, which nothing can call before the timer exists:
       the abort listener is attached below it, and the signal was not aborted. */
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
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

  /* The normalized scope (021c) — `undefined` for a scope that narrows
     nothing, the same reading `gardener-state.ts` applies everywhere else it
     touches a scope. One definition, so a caller that hands in
     `{ kinds: [] }` is a full run here exactly as it is on save. Read before
     the stage gates below, because the scope decides which stages there are. */
  const scope = narrowedScope(options.scope);

  /* Could a model stage produce anything this run's scope would keep? A stage
     whose every possible output falls outside the scope is not run at all — not
     run and filtered afterwards, which would be the full model cost for a
     result thrown away in its entirety, and for the journal stage the content of
     every day in a request the scope says it was not meant for (guardrail 6).
     That is the point of a part-run: a shorter model stage, not a faster guess.

     Each stage is judged by what only it can produce. The audit: a
     contradiction, or a verdict on a candidate it may reject
     (`AUDIT_CANDIDATE_KINDS`) — neither admitted, nothing to ask about. The
     loose-end stage: a loose end, and one certainty about it — a loose end never
     carries a module (`looseEndFinding`), so a scope over some module can never
     keep one, which is why this axis is answered here and not left open. */
  const auditInScope =
    scopeAdmits(scope, 'contradiction') ||
    AUDIT_CANDIDATE_KINDS.some((kind) => scopeAdmits(scope, kind));
  const looseEndsInScope = scopeAdmits(scope, 'loose-end', null);

  /* What's wanted is one thing, what's possible another: without a route for
     `gardener-audit` there is no interpretation phase — not even a reported
     one. Progress that says "the model is interpreting the findings" while
     none is reachable would be exactly the claim this screen must not make. */
  const wanted = options.useLlm ?? settings?.gardener.useLlm ?? false;
  const useLlm = wanted && auditInScope && run.gateway.isAvailable('gardener-audit');
  /* The second model stage (020, D4) has its own task and therefore its own
     route: a vault that routes `journal-loose-ends` but not `gardener-audit`
     still gets its loose ends read. Both stages are gated by the same wish —
     no model is asked anything unless the run was asked to use one. */
  const useLooseEnds = wanted && looseEndsInScope && run.gateway.isAvailable('journal-loose-ends');
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

  /** Would a check of this kind produce anything the scope wants at all? The
      module axis can't be judged before a check runs — a check doesn't know
      which module its findings will land in until it looks — so only the
      kind axis decides whether to run it in the first place. */
  function kindInScope(kind: GardenerFindingKind): boolean {
    return scopeAdmits(scope, kind);
  }

  const deterministic: GardenerFinding[] = [];
  /* Scope-filtered view of `deterministic` (021c) — declared here, outside the
     try block, so it's still reachable after a stop. Its initial value is an
     own empty list and deliberately **not** `deterministic` itself: an alias
     would grow with every check and hand a stop inside the checks loop a list
     that was never filtered to the scope. Whenever the checks stage finishes,
     the assignment below replaces this; a stop before that leaves a run that
     re-derived nothing, which is exactly what an empty list says. */
  let scopedDeterministic: GardenerFinding[] = [];
  /* Which stages actually finished — a stage counts only once its result is in
     hand, so a stop *inside* one leaves it named in `plan` and absent here.
     A resumed stage counts too: it finished, only not in this call. */
  const completed: GardenerStageId[] = [];
  /* Which kinds a stage of this run actually looked for (021c) — the record
     `save` needs to tell "looked, and found nothing here" from "never looked
     here at all". Filled as the stages run and never from the scope: a scope may
     name a kind no stage of this particular run can produce — `contradiction`
     without a routed model — and then this run looked for nothing.
     A resumed run counts what the call it continues looked for: those findings
     are its own base, and the stage that derived them did run, only not here. */
  const checkedKinds = new Set<GardenerFindingKind>(
    alreadyDone.has('checks')
      ? (resumeFrom?.checkedKinds ??
          CHECKS.filter((check) => kindInScope(check.kind)).map((check) => check.kind))
      : [],
  );
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
        /* Out of scope: not run, not even ticked over — the ten mechanical
           checks are cheap, but `near-duplicate` and `missing-page` are not,
           and skipping them outright is the actual point of a scoped run
           (021c). `done` still advances, so the checks stage still reaches
           100% at the same `done` count a full run would. */
        if (!kindInScope(check.kind)) {
          done += 1;
          continue;
        }
        emit('checks', check.kind, done, true, done / CHECKS.length);
        await tick();
        /* After the progress event, not before: what the pause holds open is
           the state the screen was just told about (066, D4). Inert unless the
           seam set a delay. */
        await pause(options.stageDelayMs, options.signal);
        stopIfCancelled(options.signal);
        deterministic.push(...check.run(ctx));
        /* Counted only once the check has actually run: a stop lands before
           this line, and a check that never ran must not be recorded as one
           that looked and found nothing. */
        checkedKinds.add(check.kind);
        done += 1;
      }
      completed.push('checks');
    }

    /* What this run may hand to the model stages (021c): a resumed run's
       inherited findings can predate the scope, and a check that did run may
       still have produced a finding in a module the scope doesn't want — the
       kind axis is checked before a check runs, the module axis only once its
       findings exist. Filtering here, before either model stage, is what
       makes a scoped run's model stage shorter rather than just its display. */
    scopedDeterministic =
      scope === undefined
        ? [...deterministic]
        : deterministic.filter((finding) => inScope(finding, scope));

    if (useLlm) {
      if (alreadyDone.has('audit')) {
        done += 1;
        completed.push('audit');
      } else {
        emit('audit', null, done, true, 0);
        await tick();
        stopIfCancelled(options.signal);
        audit = await auditFindings(ctx, scopedDeterministic, {
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

  /* The two model stages, each recorded by what only it can produce: a
     contradiction comes from the audit alone, a loose end the heuristic never
     saw from the loose-end stage alone. Read off `completed`, so a resumed run
     that merely inherits a stage counts it too, and a stage stopped mid-request
     counts for nothing — its silence is not a statement. */
  if (completed.includes('audit')) checkedKinds.add('contradiction');
  if (completed.includes('loose-ends')) checkedKinds.add('loose-end');

  const fromModel = (looseEnds?.looseEnds ?? []).map((looseEnd) => looseEndFinding(ctx, looseEnd));

  /* Everything this run re-derived. Kept separately from `findings`, because a
     candidate the audit rejects is still one the deterministic check produced
     again — the rejection says "don't show it now", not "the vault condition is
     gone". Only the second would justify forgetting a user decision, so
     `save` prunes against this list (see `gardener-state.ts`). */
  const considered = [...scopedDeterministic, ...(audit?.contradictions ?? []), ...fromModel];
  const rejected = new Set(audit?.rejected ?? []);
  /* A loose end already answered (020, D5) must not resurface here — its id
     lives in its own file (`main/loose-end-state.ts`), not in 017's
     `dismissed` list, because it was never a "looks fine" click. Filtered at
     the same point as `rejected`, for the same reason: both say "this run
     re-derived it, but don't show it". */
  const answered = await answeredLooseEnds(services);
  const findings = sortFindings(
    considered.filter(
      (finding) =>
        !rejected.has(finding.id) &&
        !answered.has(finding.id) &&
        /* A safety net beside the input-side filter above: a contradiction
           the audit names, or a loose end the model finds, comes from the
           model rather than from `scopedDeterministic` — so it is checked
           against the scope here, the one point every source of a finding
           passes through on the way out (021c). */
        (scope === undefined || inScope(finding, scope)),
    ),
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
    /* Set exactly when the run was scoped (021c) — absent for a full run, so
       `isRunComplete`/`present()` read this run exactly like one predating
       the field. */
    ...(scope === undefined ? {} : { scope }),
    /* What this run looked for, always recorded — a full run's list is simply
       everything it could reach. The merge of a scoped run stands on it
       (`gardener-state.ts`, `rederivedBy`): without it, a scope naming a kind no
       stage of this run could produce would read as "that kind is gone now". */
    checkedKinds: [...checkedKinds],
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
