/* Was der Index über den Vault weiß, in Zahlen: abgeleitet, nachprüfbar, ohne
   LLM. Es ist Statistik über die Ablage — deshalb steht die Karte in den
   Einstellungen und nicht auf dem Dashboard, wo der Arbeitsstand hingehört.

   Ohne Index (frisch geöffnet, noch am Bauen) rendert sie nichts. */

import type { IndexStats } from '@shared/ipc';
import { useLanguage, useT } from '../i18n';
import { formatNumber } from '../lib/format';
import { useIndexStats } from '../lib/queries/data';
import { Panel } from './Panel';

type Figure = { key: string; value: number };

function figures(stats: IndexStats): Figure[] {
  return [
    { key: 'stats.docs', value: stats.docs },
    { key: 'stats.projects', value: stats.projects },
    { key: 'stats.todos', value: stats.todos },
    { key: 'stats.pages', value: stats.pages },
    { key: 'stats.words', value: stats.words },
  ];
}

export function IndexStatsCard() {
  const t = useT();
  const language = useLanguage();
  const { data } = useIndexStats();
  if (!data || data.docs === 0) return null;
  return (
    <Panel title={t('stats.title')}>
      <dl className="sb-stats">
        {figures(data).map((figure) => (
          <div className="sb-stat" key={figure.key}>
            <dt className="sb-stat-label">{t(figure.key)}</dt>
            {/* Zahlen in Mono — sie sollen untereinander stehen. */}
            <dd className="sb-stat-value">{formatNumber(figure.value, language)}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
