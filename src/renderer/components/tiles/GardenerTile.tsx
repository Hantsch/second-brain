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
   without one "check now" — that's where the button that checks lives.

   021b D5: a run that was stopped partway must not sell its partial finding
   count as the vault's current state — that number can be smaller than
   reality simply because a stage never ran. So with `complete: false` the
   tile freezes on the score as of the last complete run (with its date) and
   says the check was stopped, instead of the usual "N findings" line. The
   score bar and worst-categories list stay: both come from
   `healthContributions`, which mirrors the frozen score itself, not the count
   of open findings in this run.

   If that stopped run was this vault's **first** check, there is no frozen
   score at all: `healthKnown` is then false and the tile falls back to "not
   checked yet" — no number, and no "as of" line with nothing in it. */

import { useNavigate } from 'react-router-dom';
import { useLanguage, useT } from '../../i18n';
import { formatDate, plural } from '../../lib/format';
import { useDashboardData } from '../../lib/queries/dashboard';
import { useGardenerReport } from '../../lib/queries/gardener';
import { HealthMeter } from '../HealthMeter';
import { TileFrame } from '../TileFrame';

/** This many categories the tile names — the most urgent ones. */
const WORST = 2;

export function GardenerTile() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  /* The breakdown lives only in the report, not in the dashboard bundle. It's
     a file, and already loaded if the maintenance screen was open. */
  const report = useGardenerReport();
  const known = data?.healthKnown === true;
  const worst = (report.data?.healthContributions ?? []).slice(0, WORST);
  const partial = report.data?.complete === false;
  const asOf = partial ? formatDate(report.data?.healthAsOf ?? null, language) : '';

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
          {partial ? (
            /* Without a date there is no complete run to be "as of" — the
               stopped note stands alone rather than with an empty date in
               front of it (021b). */
            <span className="sb-tile-note">
              {asOf === ''
                ? t('tile.gardener.stopped')
                : `${t('tile.gardener.asOf', { date: asOf })} · ${t('tile.gardener.stopped')}`}
            </span>
          ) : (
            <span className="sb-tile-note">
              {plural(data.findingCount, 'tile.gardener.findingsOne', 'tile.gardener.findingsMany')}
            </span>
          )}
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
