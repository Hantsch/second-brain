/* The "Conversation" section: the turns so far — the input field, coaching
 * stance, and day-close live separately in `CoachComposer`, anchored to the
 * bottom edge of the detail column, not here. Kept separate because whatever
 * sticks to the screen edge must be a direct descendant of `.sb-dayentry`:
 * nested under "Conversation", its own sticky frame would only span the
 * narrow remainder of this section, not the whole detail column (see the
 * comment in `styles/app/journal.css`, section "Composer, stance and
 * day-close").
 *
 * Three states, all explicit:
 *
 * - **Running.** The user's own turn appears immediately (it is written
 *   before any model is asked), and the answer grows below it.
 * - **Done.** Both turns come from the file — the buffer is no longer needed.
 * - **No answer.** A statement with a reason, no simulated empathy. In
 *   "analyze" mode, the earlier passages that were actually found appear
 *   below it, with a jump to each.
 * - **Empty.** A sentence about what forms here.
 */

import { useNavigate } from 'react-router-dom';
import type { Citation } from '@shared/types';
import type { JournalTurn } from '@shared/ipc';
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
  /** This run's own turn, verbatim as sent. */
  message: string;
  /** The text that has arrived so far. */
  text: string;
  done: boolean;
  /** Reason, if no answer came. */
  error: string | null;
  /** Earlier passages as citations ("analyze" mode). */
  citations: readonly Citation[];
}

export interface CoachPanelProps {
  /** The turns from the file, oldest first. */
  turns: readonly JournalTurn[];
  live: CoachLive | null;
  /** Jump to an earlier day. */
  onOpenDay: (date: string) => void;
}

export function CoachPanel({ turns, live, onOpenDay }: CoachPanelProps) {
  const t = useT();
  const navigate = useNavigate();

  /* The user's own turn is already in the file once the day has reloaded —
     until then, the buffer shows it. Twice would be once too many. */
  const pendingUser =
    live === null || turns.some((turn) => turn.role === 'user' && turn.text === live.message)
      ? null
      : live.message;
  const failure = live?.error ?? null;
  const evidence = live?.citations ?? [];

  return (
    <section className="sb-coach" aria-label={t('journal.dialogue.title')}>
      <h3 className="sb-section-title">{t('journal.dialogue.title')}</h3>

      {turns.length === 0 && live === null ? (
        <p className="sb-panel-empty">{t('journal.dialogue.empty')}</p>
      ) : (
        <div className="sb-dialogue">
          {turns.map((turn, at) => (
            <DialogTurn key={`${turn.role}-${at}-${turn.at ?? ''}`} turn={turn} />
          ))}
          {pendingUser === null ? null : (
            <DialogTurn turn={{ role: 'user', text: pendingUser, at: null }} />
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
