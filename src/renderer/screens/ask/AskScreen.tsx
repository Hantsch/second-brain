/* Fragen — der Screen, an dem sich entscheidet, ob das Archiv etwas wert ist.

   Aufbau: links die Gespräche, rechts eine schmale Spalte mit dem Verlauf und
   unten der Composer. Fließtext bleibt bei etwa 72 Zeichen — eine Antwort über die
   ganze Fensterbreite liest niemand.

   Die vier Zustände aus ARCHITECTURE.md, alle ausdrücklich:
   - **Leer**: drei Beispielfragen, die aus dem Bestand dieses Vaults entstehen.
   - **Kein Modell**: der Screen bleibt voll benutzbar. Gefragt wird trotzdem; die
     Antwort sind dann die Fundstellen, mit einer ehrlichen Zeile darüber und dem
     Weg in die Modell-Einstellung.
   - **Fehler**: was beim Fragen, Löschen oder Ablegen schiefgeht, steht als Karte
     da — nie stumm.
   - **Kein Vault**: dafür sorgt die Hülle (`App.tsx`).

   Der Stream läuft nicht über TanStack Query: die Stücke landen im Puffer aus
   `lib/llm-stream.ts`, und erst am Ende invalidiert `lib/events.ts` das Gespräch.
   Dann steht die Antwort als Datei — mit geprüften Belegen. */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, Citation, Scope, WriteResult } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ChatComposer } from '../../components/ChatComposer';
import { CitationPanel } from '../../components/CitationPanel';
import { citationDomId } from '../../components/CitationList';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LlmMissing } from '../../components/LlmMissing';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { clearStream, useLlmStream } from '../../lib/llm-stream';
import { useChatMutations, useThread, useThreads } from '../../lib/queries/chat';
import { useModules, useProjects } from '../../lib/queries/data';
import { useTaskRouted } from '../../lib/queries/llm';
import { qk } from '../../lib/queries/keys';
import { AnswerFeed } from './AnswerFeed';
import { Examples } from './Examples';
import { FileBackDialog } from './FileBackDialog';
import { ThreadList } from './ThreadList';

/** Frage und Antwort einer Runde teilen die Marke; die Frage trägt `-q`. */
const QUESTION_SUFFIX = '-q';

interface Pending {
  threadId: string;
  messageId: string;
}

export function AskScreen() {
  const t = useT();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const field = useRef<HTMLTextAreaElement>(null);

  const [threadId, setThreadId] = useState<string | null>(null);
  /* Eine Frage, die von woanders kommt (Dashboard-Kachel: `/ask?q=…`), ist der
     Anfangswert des Feldes — nicht mehr. Abgeschickt wird sie hier, vom Nutzer:
     eine Adresse, die selbst ein Modell anwirft, wäre eine Aktion ohne Griff. */
  const [draft, setDraft] = useState(params.get('q') ?? '');
  const [module, setModule] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [active, setActive] = useState<{ messageId: string; index: number } | null>(null);
  const [panel, setPanel] = useState<{ citation: Citation; index: number } | null>(null);
  const [fileBackFor, setFileBackFor] = useState<ChatMessage | null>(null);
  const [written, setWritten] = useState<WriteResult | null>(null);

  const threads = useThreads(search);
  const thread = useThread(threadId);
  const modules = useModules();
  const projects = useProjects();
  const routed = useTaskRouted('query-answer');
  const mutations = useChatMutations();
  const stream = useLlmStream(pending?.messageId ?? null);

  const messages = thread.data?.messages ?? [];
  /* Beschäftigt, solange der Stream läuft. Liegt die Antwort schon als Nachricht
     vor, ist er fertig — auch wenn das Abschluss-Ereignis nie ankam (Fenster neu
     geladen, Ereignis verpasst). Sonst stünde hier für immer „Abbrechen". */
  const answered = pending !== null && messages.some((message) => message.id === pending.messageId);
  const busy = pending !== null && !stream.done && !answered;

  useEffect(() => {
    field.current?.focus();
  }, []);

  const ask = (question: string): void => {
    const text = question.trim();
    if (text.length === 0 || mutations.ask.isPending) return;
    /* Der Puffer der letzten Antwort wird nicht mehr gebraucht. */
    if (pending !== null) clearStream(pending.messageId);
    mutations.ask.mutate(
      {
        question: text,
        ...(threadId === null ? {} : { threadId }),
        module,
        scope,
      },
      {
        onSuccess: (answer) => {
          setDraft('');
          setThreadId(answer.threadId);
          setPending(answer);
          setActive(null);
          /* Die Frage liegt schon als Datei — nachladen, damit sie sofort steht. */
          void client.invalidateQueries({ queryKey: qk.chat.thread(answer.threadId) });
        },
      },
    );
  };

  /** Zum Beleg springen und ihn hervorheben. */
  const showCitation = (messageId: string, index: number): void => {
    setActive({ messageId, index });
    const source =
      messages.find((message) => message.id === messageId)?.citations ??
      (pending?.messageId === messageId ? stream.citations : []);
    const citation = source[index - 1];
    if (citation !== undefined) setPanel({ citation, index });
    const anchor = document.getElementById(citationDomId(messageId, index));
    anchor?.scrollIntoView?.({ block: 'nearest' });
  };

  const openPath = (path: string): void => {
    void api.shell.openPath(path).catch(() => undefined);
  };

  const newThread = (): void => {
    setThreadId(null);
    setPending(null);
    setActive(null);
    setDraft('');
    field.current?.focus();
  };

  const remove = (id: string): void => {
    mutations.remove.mutate(id, {
      onSuccess: () => {
        if (threadId === id) newThread();
      },
    });
  };

  const failed = mutations.ask.error ?? mutations.remove.error ?? thread.error ?? threads.error;
  const questionOf = (message: ChatMessage): string => {
    const at = messages.findIndex((entry) => entry.id === message.id);
    for (let index = at - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === 'user') return candidate.content;
    }
    return message.id.endsWith(QUESTION_SUFFIX) ? '' : (thread.data?.title ?? '');
  };

  return (
    <div className="sb-screen sb-screen--wide sb-screen--fill">
      <ScreenHeader
        overline={t('screen.ask.overline')}
        title={t('screen.ask.title')}
        action={
          /* Sekundär: der eine Teal-Fokuspunkt ist „Frage stellen" im Composer. */
          <Button variant="secondary" icon="plus" onClick={newThread}>
            {t('ask.action.new')}
          </Button>
        }
      />

      {routed === false ? <LlmMissing task="query-answer" tone="note" /> : null}
      {failed === null || failed === undefined ? null : (
        <ErrorState error={failed} variant="secondary" />
      )}

      <div className="sb-ask">
        <aside className="sb-ask-side" aria-label={t('ask.threads.title')}>
          <ThreadList
            threads={threads.data ?? []}
            activeId={threadId}
            query={search}
            onQuery={setSearch}
            onSelect={(id) => {
              setThreadId(id);
              setActive(null);
              setPending(null);
            }}
            onDelete={remove}
            pending={threads.isPending}
          />
        </aside>

        <div className="sb-ask-main">
          <div className="sb-ask-column">
            {messages.length === 0 && pending === null ? (
              (projects.data ?? []).length + (modules.data ?? []).length === 0 ? (
                <EmptyState
                  icon="sparkles"
                  title={t('screen.ask.empty.title')}
                  body={t('screen.ask.empty.body')}
                />
              ) : (
                <div className="sb-ask-start">
                  <p className="sb-ask-lead">{t('screen.ask.empty.body')}</p>
                  <Examples
                    projects={projects.data ?? []}
                    modules={modules.data ?? []}
                    onPick={(question) => {
                      setDraft(question);
                      field.current?.focus();
                    }}
                  />
                </div>
              )
            ) : (
              <AnswerFeed
                messages={messages}
                live={
                  pending === null
                    ? null
                    : {
                        messageId: pending.messageId,
                        text: stream.text,
                        done: stream.done,
                        citations: stream.citations,
                        error: stream.error,
                      }
                }
                active={active}
                onCitation={showCitation}
                onOpenPath={openPath}
                onFileBack={(message) => {
                  setWritten(null);
                  setFileBackFor(message);
                }}
              />
            )}
          </div>

          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => ask(draft)}
            onCancel={() => {
              if (pending !== null) mutations.abort.mutate(pending.messageId);
            }}
            busy={busy}
            modules={modules.data ?? []}
            module={module}
            onModule={setModule}
            scope={scope}
            onScope={setScope}
            fieldRef={field}
          />
        </div>
      </div>

      <CitationPanel
        citation={panel?.citation ?? null}
        index={panel?.index ?? null}
        onClose={() => setPanel(null)}
      />

      <FileBackDialog
        key={fileBackFor?.id ?? 'none'}
        message={fileBackFor}
        question={fileBackFor === null ? '' : questionOf(fileBackFor)}
        modules={modules.data ?? []}
        busy={mutations.fileBack.isPending}
        error={mutations.fileBack.error}
        result={written}
        onSubmit={({ module: target, title }) => {
          if (fileBackFor === null || threadId === null) return;
          mutations.fileBack.mutate(
            { threadId, messageId: fileBackFor.id, module: target, title },
            { onSuccess: (result) => setWritten(result) },
          );
        }}
        onOpen={openPath}
        onClose={() => {
          setFileBackFor(null);
          setWritten(null);
          mutations.fileBack.reset();
        }}
      />
    </div>
  );
}
