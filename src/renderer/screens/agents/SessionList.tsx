/* The session cards — one card per session, the shape both places that list
   sessions share: the agent project detail (all sessions of one working
   directory) and the Sessions tab of a vault project (the sessions of every
   working directory that belongs to it).

   The list arrives already sorted from its caller; this component never
   re-sorts. It also never renders an empty state: what "nothing here" means
   differs per caller, and only the caller can say it honestly.

   Every fact that the trail may not record (`durationMs`, `gitBranch`,
   `model`, `subagents`, `contextTokens`) is null-checked individually and
   rendered as an honest "unknown" — guardrail 3. `subagents: []` stays
   visually distinct from `subagents: null`: an empty array is a recorded fact
   (no subagent ran), null means the format never captured the field at all.
   Collapsing either into the other would silently turn "the trail doesn't
   know" into a number, or a real zero into a shrug. */

import type { AgentSessionSummary } from '@shared/types';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { useT, useLanguage } from '../../i18n';
import { formatAge, formatDate, formatDuration, formatNumber, plural } from '../../lib/format';

export interface SessionListProps {
  /** Already fetched by the caller, newest first; this component never re-sorts. */
  sessions: readonly AgentSessionSummary[];
  onOpen: (sessionId: string) => void;
}

export function SessionList({ sessions, onOpen }: SessionListProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <ul className="sb-agentgrid">
      {sessions.map((session) => (
        <li key={session.id}>
          <Card padded={false} interactive className="sb-agentcard">
            <button
              type="button"
              className="sb-agentcard-button"
              aria-label={t('agents.sessions.open', {
                title:
                  session.title !== null && session.title.length > 0
                    ? session.title
                    : formatDate(session.startedAt, language),
              })}
              onClick={() => onOpen(session.id)}
            >
              <span className="sb-agentcard-head">
                <Icon name="message-square" size={16} />
                <span className="sb-agentcard-title">
                  {session.title !== null && session.title.length > 0
                    ? session.title
                    : formatDate(session.startedAt, language)}
                </span>
              </span>
              {/* Start and last activity sit on one line: they are the same
                  kind of fact, and two lines for them would push every
                  other fact further down for nothing. */}
              <span className="sb-agentcard-path sb-mono">
                {t('agents.sessions.start', { time: formatAge(session.startedAt, language) })}
                {' · '}
                {t('agents.sessions.lastActivity', {
                  time: formatAge(session.lastActivity, language),
                })}
              </span>
              <span className="sb-agentcard-meta sb-mono">
                {session.durationMs === null
                  ? t('agents.sessions.durationUnknown')
                  : t('agents.sessions.duration', {
                      duration: formatDuration(session.durationMs),
                    })}
                {' · '}
                {t('agents.sessions.messages', { count: session.messageCount })}
              </span>
              <span className="sb-agentcard-meta sb-mono">
                {session.gitBranch === null
                  ? t('agents.sessions.branchUnknown')
                  : t('agents.sessions.branch', { branch: session.gitBranch })}
                {' · '}
                {session.model === null
                  ? t('agents.sessions.modelUnknown')
                  : t('agents.sessions.model', { model: session.model })}
              </span>
              <span className="sb-agentcard-meta sb-mono">
                {session.subagents === null
                  ? t('agents.sessions.subagentsUnknown')
                  : session.subagents.length === 0
                    ? t('agents.sessions.subagentsNone')
                    : `${plural(session.subagents.length, 'agents.sessions.subagentsOne', 'agents.sessions.subagents')} · ${session.subagents.join(', ')}`}
              </span>
              <span className="sb-agentcard-meta sb-mono">
                {session.contextTokens === null
                  ? t('agents.sessions.contextUnknown')
                  : t('agents.sessions.context', {
                      count: formatNumber(session.contextTokens, language),
                    })}
              </span>
            </button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
