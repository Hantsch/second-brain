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

export interface RunBarProps {
  progress: GardenerProgress | null;
  /** Is the call still running, even if no event has arrived yet? */
  busy: boolean;
  cancelling: boolean;
  onCancel: () => void;
}

export function RunBar({ progress, busy, cancelling, onCancel }: RunBarProps) {
  const t = useT();
  if (!busy && progress === null) return null;

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const what =
    progress === null
      ? t('garden.run.running')
      : progress.phase === 'audit'
        ? t('garden.run.audit')
        : t('garden.run.check', { check: t(`garden.kind.${progress.check ?? 'orphan'}`) });

  return (
    <div className="sb-grun" role="status">
      <div className="sb-grun-text">
        <span className="sb-grun-what">{what}</span>
        {total > 0 ? (
          <span className="sb-mono">{t('garden.run.step', { done, total })}</span>
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
