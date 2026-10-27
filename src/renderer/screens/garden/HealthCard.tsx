/* The head of the maintenance screen: the score, its justification, the
   timestamp — and the advice.

   Never a bare number. Next to the bar is **what it's made of**: the
   contributions per category from the core ("12 broken links, 3 orphaned
   pages, 1 uncondensed source"), each with its points. The points add up to
   `100 − health`; the core rounds so the math works out
   (`core/gardener/health.ts`).

   Below that, two pieces of information you'd otherwise have to guess: when
   it was checked (in mono, since it's a timestamp) and **whether a model was
   involved**. A report without interpretation isn't a worse report — but a
   different one, and that has to be stated.

   The advice below comes from the report if a model produced it; otherwise
   from the breakdown, with a note that it was derived that way
   (`advice.ts`). */

/* 017 D5: hidden findings (dismissed or snoozed) don't count toward the score
   — `present()` in `gardener-state.ts` already excludes them. But a score
   that looks perfect while something was put away would be a quiet lie, so
   this card names what it left out: the total and the split, plus a way to
   go look at them. `garden.health.perfect` ("nothing pulls the score down")
   must not render in that case, even when the visible score is 100. */

import type { GardenerHiddenFinding, GardenerReport } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { HandOverGardenerRunButton } from '../../components/AgentHandOverActions';
import { HealthMeter } from '../../components/HealthMeter';
import { useLanguage, useT } from '../../i18n';
import { formatDateTime, plural } from '../../lib/format';
import { adviceFor } from './advice';
import { scopeLabel } from './scope';

/** Total plus the split, worded as one sentence — never a bare count. */
function hiddenNote(hidden: readonly GardenerHiddenFinding[], t: ReturnType<typeof useT>): string {
  const dismissed = hidden.filter((entry) => entry.state === 'dismissed').length;
  const snoozed = hidden.filter((entry) => entry.state === 'snoozed').length;
  return hidden.length === 1
    ? t('garden.health.hiddenOne', { dismissed, snoozed })
    : t('garden.health.hidden', { total: hidden.length, dismissed, snoozed });
}

export interface HealthCardProps {
  report: GardenerReport;
  /** Switches the findings filter to reveal what the score left out. Absent
      when there is nothing hidden — the button then never renders. */
  onShowHidden?: () => void;
}

export function HealthCard({ report, onShowHidden }: HealthCardProps) {
  const t = useT();
  const language = useLanguage();
  const known = report.healthKnown !== false;
  /* A stopped run with no earlier complete check behind it (021b): there is no
     frozen score and none may be computed, so the card names that state
     instead of printing an "as of" line with no date in it. */
  const partial = report.complete === false;
  const frozenAt = report.healthAsOf;
  const contributions = report.healthContributions ?? [];
  const lost = contributions.reduce((sum, entry) => sum + entry.points, 0);
  const hidden = report.hidden ?? [];
  const hasHidden = hidden.length > 0;
  const advice = adviceFor(report);

  return (
    <Card padded={false} className="sb-ghealth">
      <div className="sb-ghealth-top">
        <HealthMeter score={known ? report.health : null} />

        <div className="sb-ghealth-why">
          <span className="gs-overline">{t('garden.health.why')}</span>
          {!known ? (
            <p className="sb-ghealth-note">
              {t(partial ? 'garden.health.noCompleteBody' : 'garden.health.noStock')}
            </p>
          ) : contributions.length === 0 && !hasHidden ? (
            <p className="sb-ghealth-note">{t('garden.health.perfect')}</p>
          ) : contributions.length === 0 ? null : (
            <>
              <ul className="sb-ghealth-list">
                {contributions.map((entry) => (
                  <li key={entry.kind} className="sb-ghealth-item">
                    <span className="sb-ghealth-count">
                      {plural(
                        entry.count,
                        `garden.countOne.${entry.kind}`,
                        `garden.countMany.${entry.kind}`,
                      )}
                    </span>
                    <span className="sb-mono sb-ghealth-points">
                      {plural(entry.points, 'garden.health.pointOne', 'garden.health.points')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="sb-ghealth-note">{t('garden.health.lost', { count: lost })}</p>
            </>
          )}
          {known && hasHidden ? (
            <div className="sb-ghealth-hidden">
              <p className="sb-ghealth-note">{hiddenNote(hidden, t)}</p>
              <Button variant="ghost" size="sm" onClick={onShowHidden}>
                {t('garden.health.showHidden')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <p className="sb-ghealth-stamp">
        {!partial ? (
          <>
            <span>{t('garden.health.ranAt')}</span>
            <span className="sb-mono">{formatDateTime(report.ranAt, language)}</span>
          </>
        ) : frozenAt === undefined ? (
          <span>{t('garden.health.noComplete')}</span>
        ) : (
          <span className="sb-mono">
            {t('garden.health.asOf', { when: formatDateTime(frozenAt, language) })}
          </span>
        )}
        <span className="sb-ghealth-model">
          {t(report.usedLlm ? 'garden.health.withModel' : 'garden.health.withoutModel')}
        </span>
      </p>

      {/* Main decides whether a run is worth handing over (no audit yet, something to
          interpret); this card only shows what it was told. */}
      {report.agentAudit?.offered === true ? (
        <HandOverGardenerRunButton open={report.agentAudit.open} />
      ) : null}

      {/* 021c, D4: next to the frozen-score stamp above — not instead of it —
          names the part of the vault the last run actually looked at, so the
          findings below read as "just this scope" rather than "the whole
          vault, some of it missing" (021b's stopped-run reading). */}
      {report.scope === undefined ? null : (
        <p className="sb-ghealth-note">{scopeLabel(report.scope, t)}</p>
      )}

      {advice.sentences.length === 0 ? null : (
        <div className="sb-gadvice">
          <span className="gs-overline">{t('garden.advice.label')}</span>
          <ol className="sb-gadvice-list">
            {advice.sentences.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ol>
          <p className="sb-ghealth-note">
            {t(advice.heuristic ? 'garden.advice.heuristic' : 'garden.advice.fromModel')}
          </p>
        </div>
      )}
    </Card>
  );
}
