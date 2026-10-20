/* The day as one chronological column: my prose and the app's answers, in
 * document order, exactly as `parseStream` read them from the file (011) —
 * replaces the old "Conversation" tab (`CoachPanel.tsx`, now gone). The
 * composer is not part of this component: it lives in `CoachComposer` as the
 * day's last section, in plain flow — nothing is anchored to the window edge
 * any more (047/D3 dropped the sticky footer; see `styles/app/journal.css`,
 * section "Composer and stance"). The day close-out is in neither place: it
 * sits next to the facts in `DayEntry.tsx`, exactly once.
 *
 * Four states, all explicit:
 *
 * - **Running.** The user's own paragraph appears immediately (it is written
 *   before any model is asked), and the answer grows below it.
 * - **Done.** Every block comes from the file — the buffer is no longer needed.
 * - **No answer.** A statement with a reason, no simulated empathy. In
 *   "analyze" mode, the earlier passages that were actually found appear
 *   below it, with a jump to each.
 * - **Empty.** A sentence about what forms here.
 */

import { useNavigate } from 'react-router-dom';
import type { Citation } from '@shared/types';
import type { JournalStreamBlock } from '@shared/ipc';
import { DialogTurn } from '../../components/DialogTurn';
import { useT } from '../../i18n';

/** Reasons that have their own sentence (`LlmUnavailable.reason` plus cancellation). */
const KNOWN_FAILURES: readonly string[] = [
  'no-route',
  'provider-disabled',
  'no-key',
  'unreachable',
  'error',
  'cancelled',
];

/** The path to the routing setting — the same address as in `LlmMissing`. */
const ROUTING_ROUTE = '/settings?tab=models';

export interface CoachLive {
  /** This run's own paragraph, verbatim as sent. */
  message: string;
  /** The text that has arrived so far. */
  text: string;
  done: boolean;
  /** Reason, if no answer came. */
  error: string | null;
  /** Earlier passages as citations ("analyze" mode). */
  citations: readonly Citation[];
}

export interface EntryStreamProps {
  /** The day's blocks, oldest first, exactly as parsed from the file. */
  stream: readonly JournalStreamBlock[];
  live: CoachLive | null;
  /** Jump to an earlier day. */
  onOpenDay: (date: string) => void;
}

export function EntryStream({ stream, live, onOpenDay }: EntryStreamProps) {
  const t = useT();
  const navigate = useNavigate();

  /* The user's own paragraph is already in the file once the day has
     reloaded — until then, the buffer shows it. Twice would be once too
     many.
     `appendEntry` writes plain prose, so a paragraph that lands right after
     existing prose in the same "Day" section merges into ONE `entry` block
     (`parseStream` doesn't split on blank lines within a run) — an exact
     match against the whole block's text would then never fire, and the
     paragraph would render twice. Checking the block's *end* is enough: the
     message is always the most recently appended text, so it's always the
     tail of whichever entry block it landed in. */
  const pendingUser =
    live === null ||
    stream.some((block) => block.kind === 'entry' && block.text.endsWith(live.message))
      ? null
      : live.message;
  const failure = live?.error ?? null;
  const evidence = live?.citations ?? [];

  return (
    <section className="sb-coach" aria-label={t('journal.dialogue.title')}>
      <h3 className="sb-section-title">{t('journal.dialogue.title')}</h3>

      {stream.length === 0 && live === null ? (
        <p className="sb-panel-empty">{t('journal.dialogue.empty')}</p>
      ) : (
        <div className="sb-dialogue">
          {stream.map((block, at) => (
            <DialogTurn
              key={`${block.kind}-${at}-${block.at ?? ''}`}
              turn={
                block.kind === 'entry'
                  ? { role: 'user', text: block.text, at: null }
                  : { role: 'assistant', text: block.text, at: block.at }
              }
              /* An `entry` block is my own prose, not a "turn" with a
                 speaker — it never carries a speaker header, mirroring the
                 file where it's plain Markdown with no `> **Gaston**`
                 marker. */
              plain={block.kind === 'entry'}
            />
          ))}
          {pendingUser === null ? null : (
            <DialogTurn turn={{ role: 'user', text: pendingUser, at: null }} plain />
          )}
          {live === null || failure !== null ? null : (
            <DialogTurn
              turn={{ role: 'assistant', text: live.text, at: null }}
              streaming={!live.done}
            />
          )}

          {failure === null ? null : (
            <div className="sb-coach-failure" role="status">
              <p className="sb-turn-note">
                {t(`journal.failure.${KNOWN_FAILURES.includes(failure) ? failure : 'other'}`)}{' '}
                {failure === 'no-route' ||
                failure === 'no-key' ||
                failure === 'provider-disabled' ? (
                  <button
                    type="button"
                    className="sb-textlink"
                    onClick={() => void navigate(ROUTING_ROUTE)}
                  >
                    {t('llm.note.action')}
                  </button>
                ) : null}
              </p>
              {evidence.length === 0 ? null : (
                <div className="sb-evidence">
                  <span className="gs-overline">{t('journal.evidence.title')}</span>
                  <ul className="sb-evidence-list">
                    {evidence.map((citation) => (
                      <li key={citation.path}>
                        <button
                          type="button"
                          className="sb-evidence-item"
                          onClick={() => onOpenDay(citation.title)}
                        >
                          <span className="sb-mono sb-evidence-date">{citation.title}</span>
                          <span className="sb-evidence-quote">{citation.quote}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
