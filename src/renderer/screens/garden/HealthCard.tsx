/* Der Kopf der Pflege: der Wert, seine Begründung, der Zeitpunkt — und der Rat.

   Nie eine nackte Zahl. Neben dem Balken steht, **woraus** sie entsteht: die
   Beiträge je Kategorie aus dem Kern („12 kaputte Links, 3 verwaiste Seiten,
   1 unverdichtete Quelle"), jeder mit seinen Punkten. Die Punkte summieren sich
   auf `100 − Gesundheit`; der Kern rundet so, dass die Rechnung aufgeht
   (`core/gardener/health.ts`).

   Darunter zwei Angaben, die man sonst raten müsste: wann geprüft wurde (in Mono,
   es ist ein Zeitstempel) und **ob ein Modell beteiligt war**. Ein Bericht ohne
   Deutung ist kein schlechterer Bericht — aber ein anderer, und das muss dastehen.

   Der Rat darunter kommt aus dem Bericht, wenn ein Modell ihn gegeben hat; sonst
   aus der Aufschlüsselung, mit dem Vermerk, dass er so entstanden ist
   (`advice.ts`). */

import type { GardenerReport } from '@shared/types';
import { Card } from '../../atoms/Card';
import { HealthMeter } from '../../components/HealthMeter';
import { useLanguage, useT } from '../../i18n';
import { formatDate, plural } from '../../lib/format';
import { adviceFor } from './advice';

/** Zeitpunkt in Mono: Datum plus Uhrzeit, ohne Sekunden. */
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
