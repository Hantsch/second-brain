/* Einem Vault-Projekt etwas zuordnen — die Auswahl dazu. Zwei Stellen brauchen
   sie: die Dashboard-Kachel ordnet eine Sitzung zu, der Agent-Browser ein
   Projekt (ein Arbeitsverzeichnis). Deshalb weiß diese Auswahl nur noch, wie
   das Ding heißt, das zugeordnet wird — nicht mehr, was es ist.

   Ab acht Projekten steht ein Suchfeld darüber. Vorher wäre es Zierde; danach
   ist eine Liste ohne Suche ein Ratespiel, und ein Fehlgriff schreibt einen
   Pfad in die falsche Projektdatei. Die Auswahl bleibt ein `select`: sie ist
   kurz, sie ist mit der Tastatur bedienbar, und sie braucht kein eigenes Menü.

   Geschrieben wird hier nichts. `onPick` reicht den Slug nach oben; die Kachel
   ruft die Zuordnung auf und sagt danach, was passiert ist — mit Rückweg. */

import { useState } from 'react';
import type { Project } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { Input } from '../../atoms/Input';
import { useT } from '../../i18n';
import { favoritesFirst } from '../../lib/favorites';

/** Ab so vielen Projekten gibt es das Suchfeld. */
const SEARCH_FROM = 8;

export interface SessionLinkProps {
  /** Was zugeordnet wird — steht als Subjekt in der Beschriftung der Auswahl. */
  name: string;
  /**
   * i18n-Key der Beschriftung, mit `{name}` darin. Standard ist die Sitzung, wie
   * die Dashboard-Kachel sie zuordnet; der Agent-Browser ordnet ein Projekt zu
   * und sagt genau das.
   */
  labelKey?: string;
  projects: readonly Project[];
  onPick: (slug: string) => void;
}

export function SessionLink({
  name,
  labelKey = 'tile.claude.linkFor',
  projects,
  onPick,
}: SessionLinkProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const ordered = favoritesFirst(projects);
  const found =
    needle.length === 0
      ? ordered
      : ordered.filter((project) =>
          `${project.title} ${project.slug}`.toLowerCase().includes(needle),
        );

  return (
    <span className="sb-line-link">
      {projects.length < SEARCH_FROM ? null : (
        <Input
          className="sb-line-search"
          icon="search"
          label={t('tile.claude.linkSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <span className="gs-inputwrap sb-line-picker">
        <select
          className="gs-input gs-select"
          aria-label={t(labelKey, { name })}
          value=""
          onChange={(event) => {
            const slug = event.target.value;
            if (slug.length > 0) onPick(slug);
          }}
        >
          <option value="">{t('tile.claude.link')}</option>
          {found.map((project) => (
            <option key={project.slug} value={project.slug}>
              {project.title}
            </option>
          ))}
        </select>
        <span className="gs-select-chevron">
          <Icon name="chevron-down" size={14} />
        </span>
      </span>
      {/* Eine leere Trefferliste ist eine Aussage, kein leeres Feld. */}
      {found.length === 0 ? (
        <span className="sb-line-none">
          {t('tile.claude.linkNoMatch', { query: query.trim() })}
        </span>
      ) : null}
    </span>
  );
}
