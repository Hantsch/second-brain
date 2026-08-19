/* One block of the unified journal stream (011), as it stands in the file:
 * speaker, time in mono, then the text — or, with `plain`, just the text,
 * for my own prose blocks that carry no speaker line in the file either.
 *
 * The user's own sentence stays text with its line breaks — it's not
 * interpreted as Markdown, because no one formats their journal. The coach's
 * response is allowed to be a list (the "Tips" stance), so it runs through the
 * same Markdown renderer as any other response in the app.
 *
 * During the stream, a calm thinking indicator shows here, then the growing
 * text — no placeholder that claims a finished answer.
 */

import type { JournalTurn } from '@shared/ipc';
import { Spinner } from '../atoms/Spinner';
import { Markdown } from './Markdown';
import { useT } from '../i18n';

export interface DialogTurnProps {
  turn: JournalTurn;
  /** The response is still growing. */
  streaming?: boolean;
  /** Suppresses the speaker header — for the day's own prose in the unified
      stream (011, `EntryStream.tsx`): an `entry` block is not a "turn" with
      a speaker, just what was written, and it never carries a timestamp
      (`JournalStreamBlock.at` is always `null` for it) — mirroring the file,
      where it's plain Markdown with no `> **Second Brain**` marker. */
  plain?: boolean;
}

export function DialogTurn({ turn, streaming = false, plain = false }: DialogTurnProps) {
  const t = useT();
  const speaker = t(`journal.turn.${turn.role}`);
  const empty = turn.text.trim().length === 0;

  return (
    <article
      className={`sb-dturn sb-dturn--${turn.role}`}
      aria-label={plain ? undefined : speaker}
      aria-busy={streaming ? 'true' : undefined}
    >
      {plain ? null : (
        <header className="sb-dturn-head">
          {/* Overline as text, not a heading: the conversation is a sequence
              of turns, not an outline. */}
          <span className="gs-overline">{speaker}</span>
          {turn.at === null ? null : <span className="sb-mono sb-dturn-time">{turn.at}</span>}
        </header>
      )}

      {streaming && empty ? (
        <p className="sb-thinking">
          <Spinner size={14} label={t('journal.thinking')} />
          <span>{t('journal.thinking')}</span>
        </p>
      ) : turn.role === 'assistant' ? (
        <Markdown text={turn.text} className="sb-dturn-text" />
      ) : (
        <p className="sb-dturn-said">{turn.text}</p>
      )}
    </article>
  );
}
