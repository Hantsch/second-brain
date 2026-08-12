/* The head of the detail view: title, scope, status, deadline, priority.

   The status change writes immediately — that's why the confirmation sits
   right below it (`StatusPicker`). Everything else here is display; it's
   changed in the file or via the fields meant for that. */

import type { Project } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { DeadlineChip } from '../../components/DeadlineChip';
import { StatusPicker } from '../../components/StatusPicker';
import { useT } from '../../i18n';

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
  return (
    <div className="sb-phead">
      <div className="sb-phead-title">
        <h2 className="sb-phead-name">{project.title}</h2>
        <Badge>{t(`scope.${project.scope}`)}</Badge>
        {project.stale ? <Badge variant="warning">{t('projects.stale')}</Badge> : null}
      </div>

      <div className="sb-phead-facts">
        <StatusPicker
          value={project.status}
          busy={statusBusy}
          savedAs={savedStatus}
          onChange={onStatus}
        />
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
