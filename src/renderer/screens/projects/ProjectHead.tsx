/* The head of the detail view: title, scope, status, deadline, priority.

   The status change writes immediately — that's why the confirmation sits
   right below it (`StatusPicker`). Everything else here is display; it's
   changed in the file or via the fields meant for that. */

import type { Project } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { DeadlineChip } from '../../components/DeadlineChip';
import { StatusPicker } from '../../components/StatusPicker';
import { useLanguage, useT } from '../../i18n';
import { formatAge, formatDate } from '../../lib/format';

export interface ProjectHeadProps {
  project: Project;
  statusBusy: boolean;
  savedStatus: Project['status'] | null;
  onStatus: (next: Project['status']) => void;
  onOpenFile: () => void;
  now?: Date;
}

export function ProjectHead({
  project,
  statusBusy,
  savedStatus,
  onStatus,
  onOpenFile,
  now,
}: ProjectHeadProps) {
  const t = useT();
  const language = useLanguage();

  /* Honest provenance for the status: who set it and when, straight from the
     file's `status_set` frontmatter (D4). A project that never recorded this
     (old file, hand-edited) gets the fallback instead of a guessed author —
     it reuses `lastTouch`, the same recency notion the staleness badge uses,
     rather than inventing a second one. */
  const statusSet = project.statusSet;
  const statusProvenance =
    statusSet === undefined
      ? t('project.provenance.unknown', { age: formatAge(project.lastTouch, language, now) })
      : t(
          statusSet.by === 'user'
            ? 'project.provenance.setByUser'
            : statusSet.by === 'suggestion'
              ? 'project.provenance.acceptedSuggestion'
              : 'project.provenance.writtenByFiling',
          { date: formatDate(statusSet.at, language) },
        );

  return (
    <div className="sb-phead">
      <div className="sb-phead-title">
        <h2 className="sb-phead-name">{project.title}</h2>
        <Badge>{t(`scope.${project.scope}`)}</Badge>
        {project.stale ? <Badge variant="warning">{t('projects.stale')}</Badge> : null}
      </div>

      <div className="sb-phead-facts">
        <div className="sb-phead-status">
          <StatusPicker
            value={project.status}
            busy={statusBusy}
            savedAs={savedStatus}
            onChange={onStatus}
          />
          <p className="sb-phead-provenance">{statusProvenance}</p>
        </div>
        <span className="sb-phead-fact">
          {project.deadline === null ? (
            <span className="sb-phead-none">{t('project.deadlineNone')}</span>
          ) : (
            <DeadlineChip
              date={project.deadline}
              relative
              {...(now === undefined ? {} : { now })}
            />
          )}
        </span>
        <span className="sb-phead-fact sb-mono">
          {t('project.priority', { value: project.priority })}
        </span>
        <Button variant="ghost" size="sm" icon="external-link" onClick={onOpenFile}>
          {t('project.openFile')}
        </Button>
      </div>
    </div>
  );
}
