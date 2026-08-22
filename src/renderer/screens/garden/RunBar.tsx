/* The running maintenance run: which check is up, how far along it is, and the
   way out.

   ARCHITECTURE.md: anything over two seconds gets progress with a cancellable
   action. The ten mechanical checks finish in milliseconds — the model's
   interpretation does not. That's why the line shows both: the running check by
   name, and "the model is interpreting the findings" once it gets there.

   The bar has `role="progressbar"` with values, and the text next to it says
   the same thing in words — a bar alone is nothing for an assistive tool. */

import { Button } from '../../atoms/Button';
import type { GardenerProgress } from '../../lib/queries/gardener';
import { useT } from '../../i18n';
import { formatElapsed, useElapsedSeconds } from '../../lib/useElapsed';
import type { GardenerStageId } from '@shared/types';

export interface RunBarProps {
  progress: GardenerProgress | null;
  /** Is the call still running, even if no event has arrived yet? */
  busy: boolean;
  cancelling: boolean;
  onCancel: () => void;
}

/** Every stage the "still to come" line can name, in the order the plan uses. */
const STAGE_LABEL_KEYS: Record<GardenerStageId, string> = {
  checks: 'garden.run.stage.checks',
  audit: 'garden.run.stage.audit',
  'loose-ends': 'garden.run.stage.loose-ends',
};

export function RunBar({ progress, busy, cancelling, onCancel }: RunBarProps) {
  const t = useT();
  const elapsedSeconds = useElapsedSeconds(progress?.startedAt);
  if (!busy && progress === null) return null;

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  /* 021a D2: `percent` is the weighted, cumulative figure from the stage plan
     (`@core/gardener/progress`) — rendered as-is, never recomputed from the
     flat check count. It legitimately stands still for the whole of a model
     stage; naming the stage and ticking the elapsed timer is what tells the
     user the run is still alive while the number doesn't move. */
  const percent = progress?.percent ?? 0;
  const what =
    progress === null
      ? t('garden.run.running')
      : progress.stage === 'audit'
        ? t('garden.run.audit')
        : progress.stage === 'loose-ends'
          ? t('garden.run.looseEnds')
          : t('garden.run.check', { check: t(`garden.kind.${progress.check ?? 'orphan'}`) });

  const remaining = progress?.remaining ?? [];
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
  const noModelStage = progress !== null && progress.stage === 'checks' && remaining.length === 0;

  const elapsed = formatElapsed(elapsedSeconds);

  return (
    <div className="sb-grun" role="status">
      <div className="sb-grun-text">
        <span className="sb-grun-what">{what}</span>
        {total > 0 ? (
          <span className="sb-mono">{t('garden.run.step', { done, total })}</span>
        ) : null}
        {remainingLabel !== null ? (
          <span className="sb-grun-remaining">{remainingLabel}</span>
        ) : null}
        {noModelStage ? (
          <span className="sb-grun-note">{t('garden.run.noModelStage')}</span>
        ) : null}
        {progress?.startedAt ? (
          <span
            className="sb-grun-elapsed sb-mono"
            aria-label={t('garden.run.elapsed', { elapsed })}
          >
            {elapsed}
          </span>
        ) : null}
      </div>
      <span
        className="sb-grun-track"
        role="progressbar"
        aria-label={t('garden.run.running')}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="sb-grun-fill" style={{ width: `${percent}%` }} />
      </span>
      <Button variant="secondary" size="sm" icon="x" loading={cancelling} onClick={onCancel}>
        {t('garden.run.cancel')}
      </Button>
    </div>
  );
}
