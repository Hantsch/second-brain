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

import type { GardenerReport } from '@shared/types';
import { Card } from '../../atoms/Card';
import { HealthMeter } from '../../components/HealthMeter';
import { useLanguage, useT } from '../../i18n';
import { formatDate, plural } from '../../lib/format';
import { adviceFor } from './advice';

/** Timestamp in mono: date plus time, without seconds. */
function stamp(iso: string, language: 'de' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${formatDate(iso, language)}, ${time}`;
}

export interface HealthCardProps {
  report: GardenerReport;
}

export function HealthCard({ report }: HealthCardProps) {
  const t = useT();
  const language = useLanguage();
  const known = report.healthKnown !== false;
  const contributions = report.healthContributions ?? [];
  const lost = contributions.reduce((sum, entry) => sum + entry.points, 0);
  const advice = adviceFor(report);

  return (
    <Card padded={false} className="sb-ghealth">
      <div className="sb-ghealth-top">
        <HealthMeter score={known ? report.health : null} />

        <div className="sb-ghealth-why">
          <span className="gs-overline">{t('garden.health.why')}</span>
          {!known ? (
            <p className="sb-ghealth-note">{t('garden.health.noStock')}</p>
          ) : contributions.length === 0 ? (
            <p className="sb-ghealth-note">{t('garden.health.perfect')}</p>
          ) : (
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
        </div>
      </div>

      <p className="sb-ghealth-stamp">
        <span>{t('garden.health.ranAt')}</span>
        <span className="sb-mono">{stamp(report.ranAt, language)}</span>
        <span className="sb-ghealth-model">
          {t(report.usedLlm ? 'garden.health.withModel' : 'garden.health.withoutModel')}
        </span>
      </p>

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
