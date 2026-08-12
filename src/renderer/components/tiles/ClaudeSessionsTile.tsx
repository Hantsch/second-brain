/* Die Arbeitsspuren der Agenten-CLI: Projekt, Branch, wann, und woran.

   Drei Zustände, alle ausdrücklich:
   - **Aus**: der Schalter im Verhalten-Tab ist zu. Dann steht das da, mit dem Weg
     dorthin — nicht „keine Sitzungen".
   - **Leer**: es gibt keine Sitzung in der Nähe. Auch das ist eine Aussage.
   - **Nicht zugeordnet**: die Sitzung liegt in einem Verzeichnis, das kein
     Projekt kennt. Dann steht dort „Projekt zuordnen" — und die Zuordnung
     schreibt den Pfad in `repos` der Projektdatei, wo er hingehört.

   Nach der Zuordnung sagt eine Meldung, in welches Projekt der Pfad geschrieben
   wurde, und nimmt sie auf Wunsch zurück: `repos` bekommt wieder genau die Liste,
   die vorher in der Datei stand. Ohne diesen Weg müsste man bei einem Fehlgriff
   die Markdown-Datei von Hand aufräumen.

   Der Branch steht in Mono: er ist Daten, kein Fließtext. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClaudeSession } from '@shared/types';
import { useT } from '../../i18n';
import { useProjects } from '../../lib/queries/data';
import {
  useClaudeSessions,
  useLinkSession,
  useOverviewSettings,
} from '../../lib/queries/dashboard';
import { useProjectMutations } from '../../lib/queries/projects';
import { pushToast } from '../../lib/toast';
import { RelativeTime } from '../RelativeTime';
import { TileFrame } from '../TileFrame';
import { SessionLink } from './SessionLink';

const LIMIT = 6;

export function ClaudeSessionsTile() {
  const t = useT();
  const navigate = useNavigate();
  const overview = useOverviewSettings();
  const sessions = useClaudeSessions();
  const projects = useProjects();
  const link = useLinkSession();
  const { patch } = useProjectMutations();
  const [linking, setLinking] = useState<string | null>(null);
  const off = overview !== undefined && !overview.useClaudeSessions;
  const rows: ClaudeSession[] = off ? [] : (sessions.data ?? []).slice(0, LIMIT);

  /* Der Stand von `repos` **vor** dem Schreiben ist das Rückgängig. Er wird hier
     festgehalten, bevor die Abfragen neu laufen. */
  const linkTo = (session: ClaudeSession, slug: string): void => {
    const target = (projects.data ?? []).find((project) => project.slug === slug);
    const before = target?.repos ?? [];
    link.mutate(
      { sessionId: session.id, project: slug },
      {
        onSuccess: () =>
          pushToast('success', {
            message: 'tile.claude.linkedTo',
            values: { name: target?.title ?? slug },
            description: 'tile.claude.linkHint',
            action: {
              label: 'common.undo',
              run: () => patch.mutate({ slug, patch: { repos: [...before] } }),
            },
          }),
      },
    );
  };

  return (
    <TileFrame
      id="claude-sessions"
      title={t('module.claude-sessions.name')}
      pending={!off && sessions.isPending}
      error={sessions.error ?? link.error ?? patch.error}
      onRetry={() => void sessions.refetch()}
      isEmpty={off || rows.length === 0}
      empty={
        off
          ? {
              body: t('tile.claude.off'),
              action: {
                label: t('tile.claude.settings'),
                onClick: () => void navigate('/settings?tab=behavior'),
              },
            }
          : { body: t('tile.claude.empty') }
      }
    >
      <ul className="sb-lines">
        {rows.map((session) => (
          <li key={session.id} className="sb-line sb-line--stack">
            <span className="sb-line-top">
              <span className="sb-line-name">
                {session.vaultProject === null
                  ? session.projectName
                  : (projects.data?.find((project) => project.slug === session.vaultProject)
                      ?.title ?? session.projectName)}
              </span>
              {session.gitBranch === null ? null : (
                <span className="sb-mono sb-line-branch">{session.gitBranch}</span>
              )}
              <RelativeTime at={session.lastActivity} className="sb-line-meta" />
            </span>
            {session.firstPrompt.length === 0 ? null : (
              <span className="sb-line-detail" title={session.firstPrompt}>
                {session.firstPrompt}
              </span>
            )}
            <span className="sb-line-bottom">
              <span className="sb-line-count">
                {t('tile.claude.messages', { count: session.messageCount })}
              </span>
              {session.vaultProject !== null ? null : linking === session.id ? (
                <SessionLink
                  session={session}
                  projects={projects.data ?? []}
                  onPick={(slug) => {
                    setLinking(null);
                    linkTo(session, slug);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="sb-textlink"
                  onClick={() => setLinking(session.id)}
                >
                  {t('tile.claude.link')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </TileFrame>
  );
}
