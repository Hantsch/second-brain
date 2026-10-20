/* The overview: one card per knowledge module.

   The card shows what can carry the decision "keep reading here": title,
   purpose, the three counts in mono, when it was last condensed — and open
   gardener findings, if there are any. A card with no findings shows nothing:
   "0 findings" would be a claim about a gardener run that maybe nobody ever
   did. */

import type { KnowledgeModule } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { useT, useLanguage } from '../../i18n';
import { formatDate, plural } from '../../lib/format';

export interface ModuleCardsProps {
  modules: readonly KnowledgeModule[];
  onOpen: (slug: string) => void;
}

export function ModuleCards({ modules, onOpen }: ModuleCardsProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <ul className="sb-modulegrid">
      {modules.map((module) => (
        <li key={module.slug}>
          <Card padded={false} interactive className="sb-modulecard">
            <button
              type="button"
              className="sb-modulecard-button"
              aria-label={t('modules.open', { title: module.title })}
              onClick={() => onOpen(module.slug)}
            >
              <span className="sb-modulecard-head">
                <Icon name="network" size={16} />
                <span className="sb-modulecard-title">{module.title}</span>
                {module.findingCount === 0 ? null : (
                  <Badge variant="warning">
                    {plural(module.findingCount, 'modules.findingsOne', 'modules.findings')}
                  </Badge>
                )}
              </span>
              <span className="sb-modulecard-body">
                {module.description.trim().length === 0
                  ? t('modules.noDescription')
                  : module.description}
              </span>
              <span className="sb-modulecard-meta sb-mono">
                {t('modules.counts', {
                  sources: module.counts.sources,
                  entities: module.counts.entities,
                  concepts: module.counts.concepts,
                })}
              </span>
              <span className="sb-modulecard-meta sb-mono">
                {module.lastIngest === null
                  ? t('modules.neverIngested')
                  : t('modules.lastIngest', { date: formatDate(module.lastIngest, language) })}
              </span>
            </button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
