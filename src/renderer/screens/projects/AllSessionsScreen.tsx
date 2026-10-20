/* Agent sessions across all projects — the work trails of the agent CLIs
   (Claude Code, Codex), unified.

   Since story 008 this view hangs under Projects (`#/projects/sessions`)
   instead of carrying a rail entry of its own: an agent's work trail is a
   facet of a project, not a place beside it. The nesting is also what keeps
   the Projects entry lit while this screen is open — `Rail` uses `NavLink`
   without `end`, so the prefix match does it for free.

   The screen itself is only the frame: the column, the header, the way back
   to the project list, and the translation between the address and the
   panel's state. Everything below the header — the Claude/Codex switch, the
   honest states and the drill-down from project list to transcript — lives
   in `AgentSessionsPanel`, which this screen hosts exactly like the old
   `AgentsScreen` did.

   The address is the state (`#/projects/sessions?a=codex&p=<key>&s=<id>`),
   with the same three parameters the old `#/agents` address carried: the
   redirect in `App.tsx` only swaps the path, so every old deep link — a
   bookmark, the dashboard tile, a transcript's back path — still lands on
   the same transcript. */

import { useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AgentKind } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { useOverviewSettings, useSaveOverview } from '../../lib/queries/dashboard';
import { pushToast } from '../../lib/toast';
import { AgentSessionsPanel } from '../agents/AgentSessionsPanel';

function isAgentKind(value: string | null): value is AgentKind {
  return value === 'claude' || value === 'codex';
}

export function AllSessionsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  /* This screen owns the dismissal preference: it reads it and it writes it.
     The panel below only passes it through, so a second host can show the
     same list without any dismissal at all. */
  const overview = useOverviewSettings();
  const saveOverview = useSaveOverview();
  const dismissed = overview?.dismissedAgentProjects;

  const requested = params.get('a');
  const agent: AgentKind = isAgentKind(requested) ? requested : 'claude';
  const projectKey = params.get('p');
  const sessionId = params.get('s');

  /* The address is the state: the panel reads `p`/`s` and calls `go`
     without needing to know anything else in this file — the same contract
     as `ModulesScreen`'s `go`. */
  const go = (next: { a?: AgentKind; p?: string | null; s?: string | null }): void => {
    const merged = new URLSearchParams();
    const nextAgent = next.a ?? agent;
    const nextProject = next.p === undefined ? projectKey : next.p;
    const nextSession = next.s === undefined ? sessionId : next.s;
    if (nextAgent !== 'claude') merged.set('a', nextAgent);
    if (nextProject !== null) merged.set('p', nextProject);
    if (nextProject !== null && nextSession !== null) merged.set('s', nextSession);
    setParams(merged, { replace: true });
  };

  /* The list that is currently on its way into the settings file. The cache
     only learns the new list once the write has returned, so without this a
     second dismissal would build on the last settled snapshot — and since
     `deepMerge` replaces arrays wholesale, the first one would silently come
     back. A ref, not state: the value is needed at click time, not in a
     render. */
  const inFlight = useRef<string[] | null>(null);

  /* `deepMerge` in the main process replaces arrays wholesale, so every write
     carries the complete next list. While the settings are still loading
     there is no known list to extend — the handlers stay undefined then, and
     `ProjectList` renders without a dismiss control rather than risking a
     write that drops what it never saw. */
  const save = (next: string[]): void => {
    inFlight.current = next;
    saveOverview.mutate(
      { dismissedAgentProjects: next },
      {
        /* No silent failure: the card stays where it is, and the message
           says why it did not move. */
        onError: () => pushToast('error', 'agents.dismiss.failed'),
        /* Only clear what this write put there — a newer write already owns
           the ref, and its list is the one the next click must build on. */
        onSettled: () => {
          if (inFlight.current === next) inFlight.current = null;
        },
      },
    );
  };
  const onDismiss =
    dismissed === undefined
      ? undefined
      : (key: string): void => {
          const base = inFlight.current ?? dismissed;
          if (base.includes(key)) return;
          save([...base, key]);
        };
  const onUndismiss =
    dismissed === undefined
      ? undefined
      : (key: string): void => {
          const base = inFlight.current ?? dismissed;
          save(base.filter((entry) => entry !== key));
        };

  return (
    <div className="sb-screen sb-screen--wide">
      <ScreenHeader
        overline={t('screen.agents.overline')}
        title={t('screen.agents.title')}
        /* Ghost, not primary: the way back is not this screen's focal
           point — the sessions below it are. One teal per screen. */
        action={
          <Button
            variant="ghost"
            size="sm"
            icon="chevron-left"
            onClick={() => void navigate('/projects')}
          >
            {t('agents.sessions.backToProjects')}
          </Button>
        }
      />
      <AgentSessionsPanel
        agent={agent}
        projectKey={projectKey}
        sessionId={sessionId}
        go={go}
        dismissed={dismissed}
        onDismiss={onDismiss}
        onUndismiss={onUndismiss}
      />
    </div>
  );
}
