/* What the index knows about the vault, in numbers: derived, verifiable,
   without an LLM. It's statistics about the filing system — that's why the
   card lives in settings and not on the dashboard, where the work status
   belongs.

   Without an index (freshly opened, still building) it renders nothing. */

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
            {/* Numbers in mono — they should line up underneath each other. */}
            <dd className="sb-stat-value">{formatNumber(figure.value, language)}</dd>
          </div>
        ))}
      </dl>
      {/* D5 read files > 2 MiB by name only, never their content — this is the
          honest note that tells the user which files that is, so a "why isn't
          this found" question has an answer instead of a silent gap. */}
      {data.oversized.length > 0 ? (
        <div className="sb-setting">
          <p className="sb-setting-example">
            {t('stats.oversized', { count: data.oversized.length })}
          </p>
          <ul className="sb-mono sb-vault-path">
            {data.oversized.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
