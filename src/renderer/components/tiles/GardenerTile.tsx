/* The maintenance score — or the honest word that there isn't one yet.

   `DashboardData.healthKnown` says whether a maintenance run has happened. If
   it's `false` or missing, this shows "not checked yet" and **no number**.
   Showing a 100 because nobody looked would be the kind of lie a dashboard
   dies from: the user believes it, and then it isn't true.

   If a run exists, the tile shows three things: the score as a bar (with a
   text alternative), the number of findings, and the two most urgent
   categories — so it doesn't just announce a grade but says what's weighing
   it down. The order comes from the report (`healthContributions`, worst
   first).

   Both paths lead into the maintenance screen: with a run "go to maintenance",
   without one "check now" — that's where the button that checks lives. */

import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { useDashboardData } from '../../lib/queries/dashboard';
import { useGardenerReport } from '../../lib/queries/gardener';
import { HealthMeter } from '../HealthMeter';
import { TileFrame } from '../TileFrame';

/** This many categories the tile names — the most urgent ones. */
const WORST = 2;

export function GardenerTile() {
  const t = useT();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  /* The breakdown lives only in the report, not in the dashboard bundle. It's
     a file, and already loaded if the maintenance screen was open. */
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
                  {/* The full sentence as the title: in the narrow tile the
                      line truncates, and a cut-off finding must not be the
                      only information given. */}
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
