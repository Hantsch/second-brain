/* The running maintenance run: which check is up, how far along it is, and the
   way out. Lives in the shell (mounted once in `AppShell`), not the garden
   screen — a run started from the garden screen must stay visible while the
   user is elsewhere, so this reads the progress store directly instead of
   taking it as a prop from a parent that might not be mounted (042, D3).

   ARCHITECTURE.md: anything over two seconds gets progress with a cancellable
   action. The ten mechanical checks finish in milliseconds — the model's
   interpretation does not. That's why the line shows both: the running check by
   name, and "the model is interpreting the findings" once it gets there.

   The bar has `role="progressbar"` with values, and the text next to it says
   the same thing in words — a bar alone is nothing for an assistive tool.

   Neutral tokens only: this strip is visible on every screen, so it must not
   carry the one teal accent that belongs to whichever focal action lives on
   the screen underneath it (CLAUDE.md, one accent per screen). */

import { useLocation } from 'react-router-dom';
import { Button } from '../atoms/Button';
import { ErrorState } from './ErrorState';
import { useT } from '../i18n';
import { useGardenerCancel, useGardenerProgress, useGardenerRun } from '../lib/queries/gardener';
import {
  dismissGardenerStopped,
  markGardenerStopped,
  useGardenerStopped,
} from '../lib/gardener-progress';
import { formatElapsed, useElapsedSeconds } from '../lib/useElapsed';
import type { GardenerStageId } from '@shared/types';

/** Every stage the "still to come" line can name, in the order the plan uses. */
const STAGE_LABEL_KEYS: Record<GardenerStageId, string> = {
  checks: 'garden.run.stage.checks',
  audit: 'garden.run.stage.audit',
  'loose-ends': 'garden.run.stage.loose-ends',
};

export function RunStrip() {
  const t = useT();
  const location = useLocation();
  const progress = useGardenerProgress();
  const cancel = useGardenerCancel();
  const run = useGardenerRun();
  const stopped = useGardenerStopped();
  const elapsedSeconds = useElapsedSeconds(progress?.startedAt);

  /* 042, D4: a run the user stopped reports `running: false` like a finished
     one — `progress` alone cannot tell the two apart (see `gardener-progress.ts`).
     `stopped` is the session flag that only an explicit stop sets, so it is
     what decides whether the strip offers "continue" instead of disappearing.
     Live progress always wins once it exists again (a resumed or fresh run). */
  if (progress === null && !stopped) return null;

  if (progress === null && stopped) {
    /* `GardenScreen`'s own persisted "stopped partway" banner (`canContinue`,
       sourced from the saved report, not this session flag) already says this
       while the user is looking straight at the maintenance screen, with its
       own working continue button — two chrome elements reporting one fact
       is noise. Off that route this is the only way to see or act on the
       offer, which is the point of the strip. */
    if (location.pathname === '/garden') return null;

    /* No `dismissGardenerStopped()` here (042 review, finding 1/2): a
       genuinely running snapshot now clears `stoppedInSession` itself the
       moment it arrives (`gardener-progress.ts`'s `apply()`), so a
       successful resume clears the offer on its own. A failing resume then
       correctly leaves it in place — the retry affordance survives, and the
       error below stays next to it instead of the offer vanishing first. */
    const resume = (): void => {
      run.mutate({ resume: true });
    };
    return (
      <div className="sb-runstrip" role="status">
        <div className="sb-runstrip-text">
          <span className="sb-runstrip-what">{t('garden.stopped.title')}</span>
        </div>
        <Button variant="secondary" size="sm" loading={run.isPending} onClick={resume}>
          {t('garden.run.continue')}
        </Button>
        <Button variant="secondary" size="sm" icon="x" onClick={dismissGardenerStopped}>
          {t('garden.stopped.dismiss')}
        </Button>
        {run.error === null ? null : <ErrorState error={run.error} variant="secondary" />}
      </div>
    );
  }
  if (progress === null) return null;

  const total = progress.total ?? 0;
  const done = progress.done ?? 0;
  /* 021a D2: `percent` is the weighted, cumulative figure from the stage plan
     (`@core/gardener/progress`) — rendered as-is, never recomputed from the
     flat check count. It legitimately stands still for the whole of a model
     stage; naming the stage and ticking the elapsed timer is what tells the
     user the run is still alive while the number doesn't move. */
  const percent = progress.percent ?? 0;
  const what =
    progress.stage === 'audit'
      ? t('garden.run.audit')
      : progress.stage === 'loose-ends'
        ? t('garden.run.looseEnds')
        : t('garden.run.check', { check: t(`garden.kind.${progress.check ?? 'orphan'}`) });

  const remaining = progress.remaining ?? [];
  const remainingLabel =
    remaining.length > 0
      ? t('garden.run.remaining', {
          list: remaining.map((stage) => t(STAGE_LABEL_KEYS[stage])).join(', '),
        })
      : null;

  /* 021a D6: the stage plan (`@core/gardener/progress`) drops `audit` and
     `loose-ends` outright when no model is reachable for this run — there is
     no third, empty-but-planned stage to point at. The only place that shows
     through the snapshot is the checks stage never naming a model stage as
     still to come: `stage === 'checks'` with an empty `remaining` means the
     whole plan was just `['checks']`, not that the model stages merely
     haven't started yet. That is the one thing derivable here — the renderer
     has no way to tell "no model configured at all" from "this run had the
     model switched off" apart, so the note stays honestly generic about
     which is true. */
  const noModelStage = progress.stage === 'checks' && remaining.length === 0;

  const elapsed = formatElapsed(elapsedSeconds);

  return (
    <div className="sb-runstrip" role="status">
      <div className="sb-runstrip-text">
        <span className="sb-runstrip-what">{what}</span>
        {total > 0 ? (
          <span className="sb-mono">{t('garden.run.step', { done, total })}</span>
        ) : null}
        {remainingLabel !== null ? (
          <span className="sb-runstrip-remaining">{remainingLabel}</span>
        ) : null}
        {noModelStage ? (
          <span className="sb-runstrip-note">{t('garden.run.noModelStage')}</span>
        ) : null}
        {progress.startedAt ? (
          <span
            className="sb-runstrip-elapsed sb-mono"
            aria-label={t('garden.run.elapsed', { elapsed })}
          >
            {elapsed}
          </span>
        ) : null}
      </div>
      <span
        className="sb-runstrip-track"
        role="progressbar"
        aria-label={t('garden.run.running')}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="sb-runstrip-fill" style={{ width: `${percent}%` }} />
      </span>
      <Button
        variant="secondary"
        size="sm"
        icon="x"
        loading={cancel.isPending}
        onClick={() => cancel.mutate(undefined, { onSuccess: markGardenerStopped })}
      >
        {t('garden.run.cancel')}
      </Button>
      {cancel.error === null ? null : <ErrorState error={cancel.error} variant="secondary" />}
    </div>
  );
}
