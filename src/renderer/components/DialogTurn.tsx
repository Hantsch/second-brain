/* Eine Runde des Tagebuch-Gesprächs, so wie sie in der Datei steht:
 * Sprecher, Uhrzeit in Mono, dann der Text.
 *
 * Der eigene Satz bleibt Text mit seinen Umbrüchen — er wird nicht als Markdown
 * gedeutet, weil niemand sein Tagebuch formatiert. Die Antwort des Coachs darf
 * eine Liste sein (Haltung „Tipps"), also läuft sie durch denselben
 * Markdown-Renderer wie jede andere Antwort der App.
 *
 * Während des Streams steht hier eine ruhige Denk-Anzeige, danach der wachsende
 * Text — kein Platzhalter, der eine fertige Antwort behauptet.
 */

import type { JournalTurn } from '@shared/ipc';
import { Spinner } from '../atoms/Spinner';
import { Markdown } from './Markdown';
import { useT } from '../i18n';

export interface DialogTurnProps {
  turn: JournalTurn;
  /** Die Antwort wächst noch. */
  streaming?: boolean;
}

export function DialogTurn({ turn, streaming = false }: DialogTurnProps) {
  const t = useT();
  const speaker = t(`journal.turn.${turn.role}`);
  const empty = turn.text.trim().length === 0;

  return (
    <article
      className={`sb-dturn sb-dturn--${turn.role}`}
      aria-label={speaker}
      aria-busy={streaming ? 'true' : undefined}
    >
      <header className="sb-dturn-head">
        {/* Overline als Text, keine Überschrift: das Gespräch ist eine Folge von
            Runden, keine Gliederung. */}
        <span className="gs-overline">{speaker}</span>
        {turn.at === null ? null : <span className="sb-mono sb-dturn-time">{turn.at}</span>}
      </header>

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
