/* Der Verlauf: Frage, Antwort, Frage, Antwort — in einer schmalen Spalte.

   Zwei Quellen laufen hier zusammen. Die Runden, die schon als Datei liegen
   (`chat:thread`), und die eine Antwort, die gerade wächst (`event:llm-stream`).
   Die laufende Antwort wird gezeigt, solange es sie noch nicht als Nachricht gibt;
   danach übernimmt die Datei — sie trägt die geprüften Belege und das Modell.

   Der laufende Text behauptet nie „aus den Fundstellen": ob ein Modell geantwortet
   hat, weiß erst die geschriebene Nachricht. Bis dahin steht der Text da, wie er
   kommt. */

import { useEffect, useRef } from 'react';
import type { ChatMessage as Message, Citation } from '@shared/types';
import { ChatMessage } from '../../components/ChatMessage';
import { useT } from '../../i18n';

/** Die Antwort, die gerade gestreamt wird. */
export interface LiveAnswer {
  messageId: string;
  text: string;
  done: boolean;
  citations: Citation[];
  /** `IpcError.code`, wenn der Lauf gescheitert ist — `cancelled` heißt abgebrochen. */
  error: string | null;
}

export interface AnswerFeedProps {
  messages: readonly Message[];
  live: LiveAnswer | null;
  /** Hervorgehobener Beleg: Nachricht und Nummer, 1-basiert. */
  active: { messageId: string; index: number } | null;
  onCitation: (messageId: string, index: number) => void;
  onOpenPath: (path: string) => void;
  onFileBack: (message: Message) => void;
}

/** Die Frage, die zu dieser Antwort führte — die letzte Nutzerzeile davor. */
function questionBefore(messages: readonly Message[], at: number): string {
  for (let index = at - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

export function AnswerFeed({
  messages,
  live,
  active,
  onCitation,
  onOpenPath,
  onFileBack,
}: AnswerFeedProps) {
  const t = useT();
  const end = useRef<HTMLDivElement>(null);

  /* Die wachsende Antwort bleibt im Bild — sonst tippt man ins Blinde. */
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [live?.text, messages.length]);

  const streaming = live !== null && !messages.some((message) => message.id === live.messageId);
  const failed = live?.error !== null && live?.error !== undefined && live.error !== 'cancelled';

  return (
    <div className="sb-feed">
      {messages.map((message, at) => {
        /* Ohne Modell ist die „Antwort" eine Liste von Fundstellen. Sie als
           Wiki-Seite abzulegen hieße, den Satz „ich kann das nicht formulieren"
           ins Wissen zu schreiben — deshalb gibt es den Knopf dann nicht. */
        const passages = message.model === undefined && (message.citations?.length ?? 0) > 0;
        const fileable =
          message.role === 'assistant' && !passages && message.content.trim().length > 0;
        return (
          <ChatMessage
            key={message.id}
            message={message}
            question={questionBefore(messages, at)}
            passages={passages}
            activeCitation={active?.messageId === message.id ? active.index : null}
            onCitation={(index) => onCitation(message.id, index)}
            onOpenPath={onOpenPath}
            {...(fileable ? { onFileBack: () => onFileBack(message) } : {})}
          />
        );
      })}

      {streaming && live !== null ? (
        <>
          <ChatMessage
            message={{
              id: live.messageId,
              role: 'assistant',
              content: live.text,
              at: '',
              ...(live.citations.length === 0 ? {} : { citations: live.citations }),
            }}
            streaming={!live.done}
            cancelled={live.error === 'cancelled'}
            activeCitation={active?.messageId === live.messageId ? active.index : null}
            onCitation={(index) => onCitation(live.messageId, index)}
            onOpenPath={onOpenPath}
          />
          {failed ? <p className="sb-turn-warn">{t(`error.code.${live.error}`)}</p> : null}
        </>
      ) : null}

      <div ref={end} />
    </div>
  );
}
