/* Eine Runde im Gespräch: die Frage, dann die Antwort mit ihren Belegen.

   Vier Zustände, alle ausdrücklich — keiner davon wird kaschiert:

   - **Antwort mit Belegen.** Prosa, darunter die Belegliste. Die Marken `[1]` im
     Text springen dorthin.
   - **Antwort ohne Beleg.** „Dazu steht nichts im Vault." Keine Prosa, kein
     Ratespiel (Guardrail 3).
   - **Kein Modell.** Die Fundstellen selbst sind das Ergebnis, darüber eine
     ehrliche Zeile und der Weg in die Modell-Einstellung. Formuliert wird nichts.
   - **Läuft noch.** Eine ruhige Denk-Anzeige, danach der wachsende Text.

   Woran „kein Modell" erkennbar ist: eine Antwort, die ein Modell geschrieben hat,
   trägt seinen Namen (`model`). Fehlt der und gibt es Fundstellen, dann hat die
   App gesucht und nicht formuliert. */

import { useNavigate } from 'react-router-dom';
import type { ChatMessage as Message } from '@shared/types';
import { Button } from '../atoms/Button';
import { Spinner } from '../atoms/Spinner';
import { CitationList } from './CitationList';
import { Markdown } from './Markdown';
import { useT } from '../i18n';

export interface ChatMessageProps {
  message: Message;
  /** Läuft der Stream noch? Dann wächst der Text und Belege gibt es noch nicht. */
  streaming?: boolean;
  /** Vom Nutzer abgebrochen — der Text bleibt stehen, wird aber nicht behauptet. */
  cancelled?: boolean;
  /** Hervorgehobener Beleg, 1-basiert. */
  activeCitation?: number | null;
  onCitation: (index: number) => void;
  onOpenPath: (path: string) => void;
  /** Antwort als Wiki-Seite ablegen. Fehlt der Rückruf, gibt es den Knopf nicht. */
  onFileBack?: () => void;
  /** Die Frage dieser Runde — ihre Wörter werden in den Zitaten markiert. */
  question?: string;
  /**
   * Kein Modell im Spiel: die Fundstellen sind das Ergebnis. Entscheidet der
   * Aufrufer, weil nur er weiß, ob ein Modell geantwortet hat — geraten würde hier
   * für einen Moment das Falsche behauptet.
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
      /* Overline als Text, nicht als Ueberschrift: der Verlauf ist eine Folge von
         Runden, keine Gliederung — und eine h3 unter der h1 des Screens waere ein
         Sprung in der Ueberschriftenordnung. Benannt wird die Runde per Label. */
      <article className="sb-turn sb-turn--user" aria-label={t('ask.turn.question')}>
        <span className="gs-overline">{t('ask.turn.question')}</span>
        <p className="sb-turn-question">{message.content}</p>
      </article>
    );
  }

  const empty = message.content.trim().length === 0;
  /* Gesucht, nicht formuliert — der Antworttext des Kerns sagt dasselbe, aber die
     Fundstellen darunter sind das, was der Nutzer braucht. */
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
        /* Der Weg zum Modell steht in der Zeile selbst: die Karte oben im Screen
           sagt dasselbe, ist aber weggerollt, sobald das Gespräch länger wird.
           Das Ziel ist der Modelle-Tab — wie in `LlmMissing`. */
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
