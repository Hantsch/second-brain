/* One turn in the conversation: the question, then the answer with its citations.

   Four states, all explicit — none of them is glossed over:

   - **Answer with citations.** Prose, with the citation list below it. The
     markers `[1]` in the text jump there.
   - **Answer without evidence.** "There's nothing about that in the vault." No
     prose, no guessing (guardrail 3).
   - **No model.** The search results themselves are the result, with an honest
     line above them and a link to the model setting. Nothing is composed.
   - **Still running.** A calm thinking indicator, then the growing text.

   How "no model" is recognized: an answer a model has written carries its name
   (`model`). If that's missing and there are search results, the app searched
   but didn't compose an answer. */

import { useNavigate } from 'react-router-dom';
import type { ChatMessage as Message } from '@shared/types';
import { Button } from '../atoms/Button';
import { Spinner } from '../atoms/Spinner';
import { CitationList } from './CitationList';
import { Markdown } from './Markdown';
import { useT } from '../i18n';

export interface ChatMessageProps {
  message: Message;
  /** Is the stream still running? Then the text keeps growing and there are no citations yet. */
  streaming?: boolean;
  /** Cancelled by the user — the text stays as is but isn't asserted as final. */
  cancelled?: boolean;
  /** Highlighted citation, 1-based. */
  activeCitation?: number | null;
  onCitation: (index: number) => void;
  onOpenPath: (path: string) => void;
  /** File the answer as a wiki page. If the callback is missing, the button doesn't appear. */
  onFileBack?: () => void;
  /** This turn's question — its words get highlighted in the citations. */
  question?: string;
  /**
   * No model involved: the search results are the result. Decided by the
   * caller, since only it knows whether a model answered — guessing here would
   * momentarily assert the wrong thing.
   */
  passages?: boolean;
}

export function ChatMessage({
  message,
  streaming = false,
  cancelled = false,
  activeCitation = null,
  onCitation,
  onOpenPath,
  onFileBack,
  question = '',
  passages = false,
}: ChatMessageProps) {
  const t = useT();
  const navigate = useNavigate();
  const citations = message.citations ?? [];

  if (message.role === 'user') {
    return (
      /* Overline as text, not as a heading: the history is a sequence of turns,
         not an outline — and an h3 below the screen's h1 would be a jump in the
         heading order. The turn is named via a label instead. */
      <article className="sb-turn sb-turn--user" aria-label={t('ask.turn.question')}>
        <span className="gs-overline">{t('ask.turn.question')}</span>
        <p className="sb-turn-question">{message.content}</p>
      </article>
    );
  }

  const empty = message.content.trim().length === 0;
  /* Searched, not composed — the core's answer text says the same thing, but the
     search results below it are what the user actually needs. */
  const passagesOnly = passages && !streaming && citations.length > 0;
  const noEvidence = !streaming && citations.length === 0 && message.unsupported === true;

  return (
    <article
      className="sb-turn sb-turn--answer"
      aria-label={t('ask.turn.answer')}
      aria-busy={streaming ? 'true' : undefined}
    >
      <span className="gs-overline">{t('ask.turn.answer')}</span>

      {streaming && empty ? (
        <p className="sb-thinking">
          <Spinner size={14} label={t('ask.thinking')} />
          <span>{t('ask.thinking')}</span>
        </p>
      ) : null}

      {passagesOnly ? (
        /* The link to the model settings lives right in this line: the card at
           the top of the screen says the same thing, but scrolls out of view
           once the conversation gets longer. Target is the models tab — same as
           in `LlmMissing`. */
        <p className="sb-turn-note">
          {t('ask.noModel')}{' '}
          <button
            type="button"
            className="sb-textlink"
            onClick={() => void navigate('/settings?tab=models')}
          >
            {t('llm.note.action')}
          </button>
        </p>
      ) : noEvidence ? (
        <>
          <p className="sb-turn-note">{t('ask.noEvidence')}</p>
          <p className="sb-panel-empty">{t('ask.noEvidenceHint')}</p>
        </>
      ) : empty ? null : (
        <Markdown
          text={message.content}
          citations={citations}
          onCitation={onCitation}
          onOpenPath={onOpenPath}
        />
      )}

      {message.unsupported === true && citations.length > 0 ? (
        <p className="sb-turn-warn">{t('ask.unsupported')}</p>
      ) : null}

      {cancelled ? <p className="sb-turn-note">{t('ask.cancelled')}</p> : null}

      {citations.length > 0 ? (
        <section className="sb-turn-cites" aria-label={t('ask.citations.title')}>
          <span className="gs-overline">{t('ask.citations.title')}</span>
          <CitationList
            messageId={message.id}
            citations={citations}
            active={activeCitation}
            onSelect={onCitation}
            onOpen={onOpenPath}
            question={question}
          />
        </section>
      ) : null}

      {streaming || empty ? null : (
        <footer className="sb-turn-foot">
          {onFileBack === undefined ? null : (
            <Button variant="secondary" size="sm" icon="book-open" onClick={onFileBack}>
              {t('ask.fileBack.action')}
            </Button>
          )}
          {message.model === undefined ? null : (
            <span className="sb-mono sb-turn-model">{message.model}</span>
          )}
        </footer>
      )}
    </article>
  );
}
