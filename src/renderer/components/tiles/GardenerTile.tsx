/* Der Pflegewert — oder die ehrliche Auskunft, dass es noch keinen gibt.

   `DashboardData.healthKnown` sagt, ob ein Pflegelauf vorliegt. Ist er `false`
   oder fehlt er, steht hier „noch nicht geprüft" und **keine Zahl**. Eine 100 zu
   zeigen, weil niemand nachgesehen hat, wäre die Sorte Lüge, an der ein Dashboard
   stirbt: der Nutzer glaubt es, und dann stimmt es nicht.

   Liegt ein Lauf vor, zeigt die Kachel drei Dinge: den Wert als Balken (mit
   Textalternative), die Zahl der Befunde und die zwei dringendsten Kategorien —
   damit sie nicht nur eine Note verkündet, sondern sagt, was drückt. Die
   Reihenfolge kommt aus dem Bericht (`healthContributions`, schwerste zuerst).

   Beide Wege führen in den Pflege-Screen: mit Lauf „zur Pflege", ohne Lauf
   „jetzt prüfen" — dort steht der Knopf, der prüft. */

import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { useDashboardData } from '../../lib/queries/dashboard';
import { useGardenerReport } from '../../lib/queries/gardener';
import { HealthMeter } from '../HealthMeter';
import { TileFrame } from '../TileFrame';

/** So viele Kategorien nennt die Kachel — die dringendsten. */
const WORST = 2;

export function GardenerTile() {
  const t = useT();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  /* Die Aufschlüsselung steht nur im Bericht, nicht im Dashboard-Bündel. Sie ist
     eine Datei und schon geladen, wenn der Pflege-Screen offen war. */
  const report = useGardenerReport();
  const known = data?.healthKnown === true;
  const worst = (report.data?.healthContributions ?? []).slice(0, WORST);

  return (
    <TileFrame
      id="gardener"
      title={t('module.gardener.name')}
      pending={isPending}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={data !== undefined && !known}
      empty={{
        body: t('tile.gardener.unknown'),
        action: { label: t('tile.gardener.check'), onClick: () => void navigate('/garden') },
      }}
      foot={
        known ? (
          <button type="button" className="sb-textlink" onClick={() => void navigate('/garden')}>
            {t('tile.gardener.open')}
          </button>
        ) : undefined
      }
    >
      {data === undefined ? null : (
        <div className="sb-gtile">
          <HealthMeter score={data.health} size="sm" />
          <span className="sb-tile-note">
            {plural(data.findingCount, 'tile.gardener.findingsOne', 'tile.gardener.findingsMany')}
          </span>
          {worst.length === 0 ? null : (
            <ul className="sb-lines">
              {worst.map((entry) => (
                <li key={entry.kind} className="sb-line">
                  {/* Der ganze Satz als Titel: in der schmalen Kachel bricht die
                      Zeile ab, und ein abgeschnittener Befund darf nicht die
                      einzige Auskunft sein. */}
                  <span className="sb-line-detail" title={t(`garden.kind.${entry.kind}`)}>
                    {plural(
                      entry.count,
                      `garden.countOne.${entry.kind}`,
                      `garden.countMany.${entry.kind}`,
                    )}
                  </span>
                  <span className="sb-line-meta">
                    {plural(entry.points, 'garden.health.pointOne', 'garden.health.points')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </TileFrame>
  );
}
