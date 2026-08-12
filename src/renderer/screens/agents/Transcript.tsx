/* D14: the transcript itself — the level `AgentsScreen` (D11) drops into
   once `ProjectDetail` (D13) hands it a `sessionId`. Backed by
   `readTranscriptPage` (`@core/agents/transcript.ts`, D8), which guarantees
   the *backend* never reads more than one 128 KB window per call, no matter
   how large the session file is. This component exists to not undo that
   guarantee on the *frontend*:

   - **Fetching.** Exactly one page is requested at a time. `requestedCursors`
     holds every cursor asked for so far (starting with the first page,
     `null`); `useAgentTranscript` is called with only the last of them. A new
     entry is appended — via the explicit "load more" trigger below the list —
     only on a deliberate click, never speculatively and never for more than
     one page ahead. `tests/renderer/agents-transcript.test.tsx` asserts the
     underlying query fires exactly once before any click and exactly once per
     click after, which is the direct test of this guarantee.
   - **Paging trigger.** An explicit button, not scroll-based infinite
     loading: this repo's QA rules require tests for every path, and asserting
     "the button was clicked, the right cursor was requested" is deterministic
     in JSDOM, where IntersectionObserver is not a real thing to assert
     against without faking browser geometry no test here would keep honest.
   - **DOM growth.** Rendering every entry from every page ever fetched, in
     one flat list, is the render-side equivalent of the freeze this
     deliverable exists to prevent — so it is worth naming the assumption this
     component leans on instead of virtualizing: there is no virtualization
     library in this project (`package.json` carries none of react-window,
     react-virtual, or similar; adding one for a single screen is scope no one
     asked for). What keeps this bounded in practice is that a page is 128 KB
     of raw session file (`TRANSCRIPT_PAGE_BYTES`), which the story's own
     worst case — a ~370 KB Codex rollout — clears in three pages; even a
     multi-megabyte Claude session lands in the tens of pages before a user
     tires of clicking "load more". Should a session ever need windowing in
     earnest, `TranscriptEntryRow`'s isolation (see that file) already keeps
     per-entry interaction cheap; only the list container would need a
     virtualization pass on top. */

import { useState } from 'react';
import type { AgentKind, TranscriptPage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT, useLanguage } from '../../i18n';
import { useAgentTranscript } from '../../lib/queries/agents';
import { TranscriptEntryRow } from './TranscriptEntryRow';

export interface TranscriptProps {
  agent: AgentKind;
  sessionId: string;
  projectKey: string;
  onBack: () => void;
}

export function Transcript({ agent, sessionId, projectKey, onBack }: TranscriptProps) {
  const t = useT();
  const language = useLanguage();
  const agentLabel = t(agent === 'claude' ? 'agents.switch.claude' : 'agents.switch.codex');

  /* Every cursor asked for so far, oldest first — `requestedCursors[0]` is
     always `null` (the first page). Its length is the number of fetches this
     session has triggered; only the *last* entry is ever handed to the query
     hook below, one page in flight at a time. */
  const [requestedCursors, setRequestedCursors] = useState<(string | null)[]>([null]);
  const currentCursor = requestedCursors[requestedCursors.length - 1] ?? null;
  const query = useAgentTranscript(agent, sessionId, projectKey, currentCursor);

  /* Pages already folded into permanent state, so an older cursor's data
     survives even once react-query stops observing it (nothing keeps a
     spent cursor's cache entry alive except this array). Folded during
     render, not in an effect: React's own pattern for "remember something
     from a previous render and react to it changing" — `pages.length <
     requestedCursors.length` means the latest requested cursor hasn't been
     folded in yet; calling `setState` right here (not in a `useEffect`)
     makes React redo this render immediately with the new state, before
     anything paints, so `pages` is already current by the time the JSX
     below is built. Gating on the *count*, not on `query.data`'s identity,
     also means a background refetch of an already-folded page (the vault
     watcher invalidates the `agents` query root on file changes) can never
     re-append it — only a cursor that hasn't been folded yet ever is. */
  const [pages, setPages] = useState<TranscriptPage[]>([]);
  if (query.data !== undefined && pages.length < requestedCursors.length) {
    setPages((prev) => [...prev, query.data]);
  }

  const entries = pages.flatMap((page) => page.entries);
  const last = pages[pages.length - 1] ?? null;

  const firstLoadPending = pages.length === 0 && query.isPending;
  const firstLoadFailed = pages.length === 0 && query.error !== null;
  const loadingMore = pages.length > 0 && query.isPending;
  const moreFailed = pages.length > 0 && query.error !== null;
  const noMorePages = last !== null && last.nextCursor === null;
  const sessionIsEmpty = entries.length === 0 && noMorePages && !firstLoadPending;

  return (
    <div className="sb-transcript">
      <div className="sb-transcript-head">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>
          {t('agents.transcript.back')}
        </Button>
        <span className="sb-mono sb-transcript-session">
          {t('agents.transcript.session', { id: sessionId })}
        </span>
      </div>

      {firstLoadFailed ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : firstLoadPending ? (
        <Skeleton lines={6} height={32} />
      ) : sessionIsEmpty ? (
        <p className="sb-panel-empty">{t('agents.transcript.empty')}</p>
      ) : (
        <div className="sb-transcript-body">
          {entries.map((entry) => (
            <TranscriptEntryRow
              key={entry.id}
              entry={entry}
              agentLabel={agentLabel}
              language={language}
            />
          ))}

          <div className="sb-transcript-footer">
            {loadingMore ? (
              <Skeleton height={32} />
            ) : moreFailed ? (
              <ErrorState
                error={query.error}
                variant="secondary"
                onRetry={() => void query.refetch()}
              />
            ) : !noMorePages && last !== null ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRequestedCursors((prev) => [...prev, last.nextCursor])}
              >
                {t('agents.transcript.loadMore')}
              </Button>
            ) : noMorePages && last?.totalKnown ? (
              <span className="sb-panel-empty">{t('agents.transcript.end')}</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
