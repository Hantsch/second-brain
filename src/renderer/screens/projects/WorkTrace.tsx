/* Die Arbeitsspur: was an diesem Projekt zuletzt passiert ist.

   Zwei Quellen. Die jüngste Dateiänderung im Projektordner kennt der Index
   (`lastTouch`, `lastTouchSource`) — sie steht immer da. Die Claude-Sessions
   kommen über `claude:sessions`; ist der Kanal noch nicht angeschlossen, sagt
   diese Sektion genau das. Sie behauptet nie „keine Sessions", wenn sie in
   Wahrheit nicht gefragt hat.

   Zugeordnet werden Sessions über `repos` im Frontmatter. Fehlt das Feld, steht
   das hier — sonst sucht der Nutzer den Fehler bei sich. */

import type { ClaudeSession, Project } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { Skeleton } from '../../components/Skeleton';
import { useLanguage, useT } from '../../i18n';
import { formatAge } from '../../lib/format';

export interface WorkTraceProps {
  project: Project;
  sessions: ClaudeSession[] | undefined;
  /** Die Abfrage läuft noch. */
  pending: boolean;
  /** Der Kanal steht noch nicht — nicht „nichts gefunden". */
  notWired: boolean;
  now?: Date;
}

export function WorkTrace({ project, sessions, pending, notWired, now }: WorkTraceProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <div className="sb-trace">
      <p className="sb-trace-touch">
        <Icon name="history" size={13} />
        <span>
          {t('project.trace.lastTouch', { age: formatAge(project.lastTouch, language, now) })}
        </span>
        <span className="sb-trace-source">
          {t(`project.trace.source.${project.lastTouchSource}`)}
        </span>
      </p>

      {notWired ? (
        <p className="sb-panel-empty">{t('project.trace.pending')}</p>
      ) : pending ? (
        <Skeleton lines={2} height={26} />
      ) : sessions === undefined || sessions.length === 0 ? (
        <p className="sb-panel-empty">
          {project.repos.length === 0 ? t('project.trace.noRepos') : t('project.trace.noSessions')}
        </p>
      ) : (
        <ul className="sb-lines">
          {sessions.map((session) => (
            <li key={session.id} className="sb-line">
              <span className="sb-line-name">{session.projectName}</span>
              <span className="sb-line-detail">{session.summary ?? session.firstPrompt}</span>
              <span className="sb-line-meta">
                {t('project.trace.messages', { count: session.messageCount })} ·{' '}
                {formatAge(session.lastActivity, language, now)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {project.repos.length === 0 ? null : (
        <ul className="sb-trace-repos">
          {project.repos.map((repo) => (
            <li key={repo} className="sb-mono">
              {repo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
