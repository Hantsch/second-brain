/* Die Seiten eines Moduls: Suche, Kategoriefilter, Liste.

   Die Kategorien sind die Rubriken des Katalogs (`wiki/index.md`), in derselben
   Reihenfolge — wer die Liste liest, liest die Datei. Gesucht wird über Titel,
   Slug und Tags; der Rumpf steckt nicht in der Liste, dafür gibt es die
   Volltextsuche.

   Die Auswahl hängt am Pfad, nicht an der Stelle: sortiert sich die Liste neu
   (eine Seite wird umbenannt, eine kommt dazu), bleibt dieselbe Seite gewählt. */

import { useId, useMemo, useState } from 'react';
import type { WikiPage, WikiPageType } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { plural } from '../lib/format';

/** Reihenfolge wie im Katalog (`CATEGORY_ORDER` im Wissens-Kern). */
const CATEGORIES: readonly WikiPageType[] = ['source', 'entity', 'concept', 'overview'];

export interface PageListProps {
  pages: readonly WikiPage[];
  /** Pfad der gewählten Seite. */
  selected: string | null;
  onSelect: (path: string) => void;
}

/** Suchform: Kleinschreibung, damit „OAuth" und „oauth" sich treffen. */
function matches(page: WikiPage, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystack = [page.title, page.slug, ...page.tags].join(' ').toLowerCase();
  return haystack.includes(needle);
}

function group(pages: readonly WikiPage[], type: WikiPageType): WikiPage[] {
  return pages.filter((page) => page.type === type);
}

export function PageList({ pages, selected, onSelect }: PageListProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WikiPageType | 'all'>('all');
  const searchId = useId();
  const filterId = useId();

  const needle = query.trim().toLowerCase();
  const found = useMemo(
    () =>
      pages.filter((page) => (filter === 'all' || page.type === filter) && matches(page, needle)),
    [pages, filter, needle],
  );

  const shown = CATEGORIES.filter((type) => group(found, type).length > 0);

  return (
    <div className="sb-pagelist">
      <div className="sb-pagelist-tools">
        <div className="gs-field">
          <label className="gs-label" htmlFor={searchId}>
            {t('pages.search')}
          </label>
          <div className="gs-inputwrap">
            <span className="gs-input-icon">
              <Icon name="search" size={15} />
            </span>
            <input
              id={searchId}
              className="gs-input gs-input--withicon"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="gs-field">
          <label className="gs-label" htmlFor={filterId}>
            {t('pages.filter')}
          </label>
          <div className="gs-inputwrap">
            <select
              id={filterId}
              className="gs-input gs-select"
              value={filter}
              onChange={(event) => setFilter(event.target.value as WikiPageType | 'all')}
            >
              <option value="all">{t('modules.category.all')}</option>
              {CATEGORIES.map((type) => (
                <option key={type} value={type}>
                  {t(`modules.category.${type}`)}
                </option>
              ))}
            </select>
            <span className="gs-select-chevron">
              <Icon name="chevron-down" size={15} />
            </span>
          </div>
        </div>
      </div>

      <p className="sb-pagelist-count sb-mono">
        {plural(found.length, 'pages.countOne', 'pages.count')}
      </p>

      {found.length === 0 ? (
        <p className="sb-panel-empty">
          {pages.length === 0 ? t('pages.empty') : t('pages.noMatch', { query: query.trim() })}
        </p>
      ) : (
        <div className="sb-pagelist-groups">
          {shown.map((type) => (
            <section key={type} className="sb-pagegroup">
              {/* h2 wie der Titel der gelesenen Seite: Liste und Seite sind
                  Geschwister, kein Über- und Unterabschnitt. */}
              <h2 className="sb-pagegroup-title">{t(`modules.category.${type}`)}</h2>
              <ul className="sb-pagegroup-items" aria-label={t(`modules.category.${type}`)}>
                {group(found, type).map((page) => (
                  <li key={page.path}>
                    <button
                      type="button"
                      className={`sb-pageitem${page.path === selected ? ' sb-pageitem--active' : ''}`}
                      aria-current={page.path === selected ? 'true' : undefined}
                      onClick={() => onSelect(page.path)}
                    >
                      <span className="sb-pageitem-title">{page.title}</span>
                      <span className="sb-pageitem-meta sb-mono">
                        {t('pages.words', { count: page.wordCount })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
