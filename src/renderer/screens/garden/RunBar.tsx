/* Der laufende Pflegelauf: welche Prüfung dran ist, wie weit es ist, und der Weg
   heraus.

   ARCHITECTURE.md: alles über zwei Sekunden bekommt einen Fortschritt mit
   abbrechbarer Aktion. Die zehn maschinellen Prüfungen sind in Millisekunden
   durch — die Deutung durch ein Modell ist es nicht. Deshalb zeigt die Zeile
   beides: die laufende Prüfung beim Namen und „das Modell deutet die Befunde",
   wenn es soweit ist.

   Der Balken hat `role="progressbar"` mit Werten, und der Text daneben sagt
   dasselbe in Worten — ein Balken allein ist für ein Hilfsmittel nichts. */

import { Button } from '../../atoms/Button';
import type { GardenerProgress } from '../../lib/queries/gardener';
import { useT } from '../../i18n';

export interface RunBarProps {
  progress: GardenerProgress | null;
  /** Läuft der Aufruf noch, auch wenn noch kein Ereignis da war? */
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
