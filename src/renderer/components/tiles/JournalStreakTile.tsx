/* Die Tagebuch-Serie: Tage in Folge, letzter Eintrag, Stimmungsverlauf.

   Die Serie zählt bis heute oder gestern — der heutige Eintrag entsteht meist
   abends, und eine Serie, die jeden Morgen kaputt ist, wäre keine Aussage. Genau
   so rechnet der Kern; hier steht nur, was er liefert.

   Der Verlauf zeigt ausschließlich Tage mit eingetragener Stimmung. Steht keine
   da, sagt die Kachel das statt eine Linie zu erfinden. */

import { useNavigate } from 'react-router-dom';
import { MOOD_TREND_DAYS } from './constants';
import { useLanguage, useT } from '../../i18n';
import { formatDate, plural } from '../../lib/format';
import { useDashboardData } from '../../lib/queries/dashboard';
import { MoodSpark } from './MoodSpark';
import { TileFrame } from '../TileFrame';

export function JournalStreakTile() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  const journal = data?.journal;
  const trend = journal?.moodTrend ?? [];

  return (
    <TileFrame
      id="journal-streak"
      title={t('module.journal-streak.name')}
      pending={isPending}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={journal !== undefined && journal.lastEntry === null}
      empty={{
        body: t('tile.journal.empty'),
        action: { label: t('tile.journal.open'), onClick: () => void navigate('/journal') },
      }}
      foot={
        <button type="button" className="sb-textlink" onClick={() => void navigate('/journal')}>
          {t('tile.journal.open')}
        </button>
      }
    >
      <div className="sb-tilejournal">
        <p className="sb-tilejournal-streak">
          {journal === undefined || journal.streak === 0
            ? t('tile.journal.streakNone')
            : plural(journal.streak, 'tile.journal.streakOne', 'tile.journal.streakMany')}
        </p>
        {journal?.lastEntry == null ? null : (
          <p className="sb-tile-lead">
            {t('tile.journal.last', { date: formatDate(journal.lastEntry, language) })}
          </p>
        )}
        {trend.length === 0 ? (
          <p className="sb-tile-note">{t('tile.journal.moodNone')}</p>
        ) : (
          <MoodSpark
            values={trend}
            label={`${t('tile.journal.moodLabel', { days: MOOD_TREND_DAYS })}. ${t(
              'tile.journal.moodValues',
              { values: trend.join(', ') },
            )}`}
          />
        )}
      </div>
    </TileFrame>
  );
}
