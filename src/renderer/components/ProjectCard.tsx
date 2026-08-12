/* Eine Projektzeile in der Liste: Bereich, Titel, Status, offene Todos, Frist,
   Alter.

   Der nächste Schritt steht hier bewusst **nicht**: er ist die große Zeile im
   Detail. In der Liste wäre er zweimal derselbe Satz und nähme den Platz weg,
   den die Zahlen brauchen.

   Der Statuspunkt ist Farbe **und** Wort. Wer die Farbe nicht unterscheidet,
   liest den Status trotzdem. */

import type { Project } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { useLanguage, useT } from '../i18n';
import { formatAge } from '../lib/format';
import { DeadlineChip } from './DeadlineChip';

/* Der Punkt benutzt die geteilten Töne aus shell.css; ohne Ton bleibt er grau. */
const DOT_TONE: Record<Project['status'], string> = {
  idea: '',
  active: 'sb-dot--ok',
  waiting: 'sb-dot--warn',
  paused: '',
  done: 'sb-dot--busy',
  dropped: '',
};

export interface ProjectCardProps {
  project: Project;
  active: boolean;
  onSelect: () => void;
  /** Für den Tastaturweg: die Zeile muss den Fokus annehmen können. */
  buttonRef?: (element: HTMLButtonElement | null) => void;
  now?: Date;
}

export function ProjectCard({ project, active, onSelect, buttonRef, now }: ProjectCardProps) {
  const t = useT();
  const language = useLanguage();
  const waiting = project.waitingOn.filter((entry) => entry.resolved !== true);

  return (
    <li>
      <button
        type="button"
        ref={buttonRef}
        className={`sb-projectitem${active ? ' sb-projectitem--active' : ''}`}
        aria-current={active}
        onClick={onSelect}
      >
        <span className="sb-projectitem-head">
          <span className={`sb-dot ${DOT_TONE[project.status]}`.trim()} aria-hidden="true" />
          <span className="sb-projectitem-title">{project.title}</span>
          <span className="sb-projectitem-count sb-mono">
            {t('projects.openTodos', { count: project.openTodoCount })}
          </span>
        </span>
        <span className="sb-projectitem-meta">
          {/* Der Bereich steht an der Zeile, nicht nur in der Überschrift darüber:
              wer eine einzelne Karte ansieht (Suche, Sprung von außen), soll ohne
              Rollen wissen, ob das Arbeit oder Privat ist. Ruhig, kein Farbakzent. */}
          <span className="sb-projectitem-scope">{t(`scope.${project.scope}`)}</span>
          <span className="sb-projectitem-status">{t(`project.status.${project.status}`)}</span>
          <DeadlineChip date={project.deadline} {...(now === undefined ? {} : { now })} />
          <span className="sb-projectitem-age">
            <Icon name="history" size={11} />
            {formatAge(project.lastTouch, language, now)}
          </span>
          {waiting.length > 0 ? (
            <span className="sb-projectitem-wait">
              <Icon name="users" size={11} />
              {t('projects.waitingMark')}
            </span>
          ) : null}
          {project.stale ? (
            <span className="sb-projectitem-stale">{t('projects.stale')}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
