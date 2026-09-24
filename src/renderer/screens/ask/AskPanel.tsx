/* Ask — the body of asking, as a reusable component.

   Everything asking consists of lives here: the thread list on the left, the
   answer column with the composer on the right, plus the two overlays that
   belong to an answer (citation panel, file-back dialog). The panel renders no
   `ScreenHeader`: it is meant to be one body among several places that bring
   their own chrome — the ask overlay in the shell today, more later.

   Because the panel owns the conversation state (thread, draft, pending
   answer), the "new thread" action cannot live outside it. Instead of moving
   the header in, the panel hands its controls out once via `onControls`: the
   surrounding chrome keeps its own header and only calls `newThread()`. A
   render prop would have put the header's position under the panel's control —
   the registration leaves that to whoever embeds the panel.

   The panel is route-agnostic on purpose. What the URL says (`#/ask?q=…`)
   arrives as `prefill`, read by the opener route in `App.tsx` and handed on
   through the overlay — the panel itself never looks at the location.

   The four states from ARCHITECTURE.md, all explicit:
   - **Empty**: three example questions drawn from this vault's contents.
   - **No model**: the panel stays fully usable. Questions can still be asked;
     the answer is then just the matching passages, with an honest note above
     it and a link to the model settings.
   - **Error**: whatever goes wrong while asking, deleting, or filing shows up
     as a card — never silently.
   - **No vault**: handled by the shell (`App.tsx`).

   The stream doesn't run over TanStack Query: the chunks land in the buffer from
   `lib/llm-stream.ts`, and only at the end does `lib/events.ts` invalidate the
   conversation. Then the answer exists as a file — with verified citations. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, Citation, Scope } from '@shared/types';
import { ChatComposer } from '../../components/ChatComposer';
import { CitationPanel } from '../../components/CitationPanel';
import { citationDomId } from '../../components/CitationList';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LlmMissing } from '../../components/LlmMissing';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { clearStream, useLlmStream } from '../../lib/llm-stream';
import { useChatMutations, useThread, useThreads } from '../../lib/queries/chat';
import { useModules, useProjects } from '../../lib/queries/data';
import { useTaskRouted } from '../../lib/queries/llm';
import { qk } from '../../lib/queries/keys';
import { useOpenDoc } from '../../lib/use-open-doc';
import { AnswerFeed } from './AnswerFeed';
import { Examples } from './Examples';
import { FileBack } from './FileBack';
import { ThreadList } from './ThreadList';

interface Pending {
  threadId: string;
  messageId: string;
}

/** Where the panel starts. A seed, not a binding — the user may change all of it. */
export interface AskPrefill {
  /** Fills the field. It is never sent on its own: asking stays the user's move. */
  question?: string;
  module?: string | null;
  /** Project slug the answer is restricted to. Usually derived from where the
      question was asked (`lib/ask-scope.ts`), and removable in the composer. */
  project?: string | null;
  scope?: Scope | null;
}

/** What the surrounding chrome may trigger inside the panel. */
export interface AskPanelControls {
  /** Drops the current thread, draft and answer, and puts the cursor back in the field. */
  newThread: () => void;
  /** Asks the question right away, exactly as pressing enter in the field would.
      For chrome that already carries the user's action — a hotkey with a typed
      question — not for a URL, which only ever fills the field. */
  ask: (question: string) => void;
  /** Puts a question into the field without sending it — the seeding half of
      `prefill`, for chrome that receives a new question while the panel is
      already mounted, where the mount-time prefill no longer reaches. */
  fill: (question: string) => void;
}

export interface AskPanelProps {
  prefill?: AskPrefill;
  /** Hands the controls out, so a header outside the panel can drive it. */
  onControls?: (controls: AskPanelControls) => void;
  /** What Escape in the field does. Without it the field is only left (see `ChatComposer`). */
  onEscape?: () => void;
}

export function AskPanel({ prefill = {}, onControls, onEscape }: AskPanelProps) {
  const t = useT();
  const client = useQueryClient();
  const field = useRef<HTMLTextAreaElement>(null);

  const [threadId, setThreadId] = useState<string | null>(null);
  /* A question coming from elsewhere (dashboard tile: `#/ask?q=…`) is only the
     field's initial value — nothing more. It gets submitted here, by the user:
     a URL that triggers a model call by itself would be an action without a handle. */
  const [draft, setDraft] = useState(prefill.question ?? '');
  const [module, setModule] = useState<string | null>(prefill.module ?? null);
  const [project, setProject] = useState<string | null>(prefill.project ?? null);
  const [scope, setScope] = useState<Scope | null>(prefill.scope ?? null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [active, setActive] = useState<{ messageId: string; index: number } | null>(null);
  const [panel, setPanel] = useState<{ citation: Citation; index: number } | null>(null);
  const [fileBackFor, setFileBackFor] = useState<ChatMessage | null>(null);

  const threads = useThreads(search);
  const thread = useThread(threadId);
  const modules = useModules();
  const projects = useProjects();
  const routed = useTaskRouted('query-answer');
  const mutations = useChatMutations();
  const stream = useLlmStream(pending?.messageId ?? null);

  const messages = thread.data?.messages ?? [];
  /* Busy for as long as the stream is running. If the answer already exists as a
     message, it's done — even if the completion event never arrived (window
     reloaded, event missed). Otherwise this would say "Cancel" forever. */
  const answered = pending !== null && messages.some((message) => message.id === pending.messageId);
  const busy = pending !== null && !stream.done && !answered;

  useEffect(() => {
    field.current?.focus();
  }, []);

  const ask = (question: string): void => {
    const text = question.trim();
    if (text.length === 0 || mutations.ask.isPending) return;
    /* The buffer from the last answer is no longer needed. */
    if (pending !== null) clearStream(pending.messageId);
    mutations.ask.mutate(
      {
        question: text,
        ...(threadId === null ? {} : { threadId }),
        module,
        project,
        scope,
      },
      {
        onSuccess: (answer) => {
          setDraft('');
          setThreadId(answer.threadId);
          setPending(answer);
          setActive(null);
          /* The question already exists as a file — reload so it shows up immediately. */
          void client.invalidateQueries({ queryKey: qk.chat.thread(answer.threadId) });
        },
      },
    );
  };

  /** Jump to the citation and highlight it. */
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

  /* A citation's path opens in the app (059): `openDoc` closes the ask overlay
     first, then navigates to the document's home. Only validated citations get
     this far — the answer text passes no opener to `Markdown`, so an
     unconfirmed path there stays plain text (057). */
  const openDoc = useOpenDoc();

  /* The filed wiki page is a different exit: the file-back dialog promises
     the file itself, so it keeps the OS editor. */
  const openExternally = (path: string): void => {
    void api.shell.openPath(path).catch(() => undefined);
  };

  /* Stable on purpose: only setters and the field ref are used, so the
     registration below runs once instead of on every render. */
  const newThread = useCallback((): void => {
    setThreadId(null);
    setPending(null);
    setActive(null);
    setDraft('');
    field.current?.focus();
  }, []);

  /* `ask` closes over thread, filters and pending state, so it is a different
     function on every render. The controls therefore hand out a stable wrapper
     that always reaches the current version — the registration below stays a
     one-off instead of firing on every render. The ref is filled in an effect,
     which runs before the embedding chrome's effects, so whoever registers can
     call `ask` straight away on mount. */
  const latestAsk = useRef(ask);
  useEffect(() => {
    latestAsk.current = ask;
  });
  const askNow = useCallback((question: string): void => {
    latestAsk.current(question);
  }, []);

  /* Stable for the same reason as `newThread`: only a setter and the field ref. */
  const fill = useCallback((question: string): void => {
    setDraft(question);
    field.current?.focus();
  }, []);

  useEffect(() => {
    onControls?.({ newThread, ask: askNow, fill });
  }, [onControls, newThread, askNow, fill]);

  const remove = (id: string): void => {
    mutations.remove.mutate(id, {
      onSuccess: () => {
        if (threadId === id) newThread();
      },
    });
  };

  const failed = mutations.ask.error ?? mutations.remove.error ?? thread.error ?? threads.error;

  /* A fragment, not a wrapper: the parts sit directly in the column of whoever
     embeds the panel — the same place they had inside the screen. */
  return (
    <>
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
                onOpenPath={openDoc}
                onFileBack={setFileBackFor}
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
            projects={projects.data ?? []}
            project={project}
            onProject={setProject}
            scope={scope}
            onScope={setScope}
            fieldRef={field}
            onEscape={onEscape}
          />
        </div>
      </div>

      <CitationPanel
        citation={panel?.citation ?? null}
        index={panel?.index ?? null}
        onClose={() => setPanel(null)}
      />

      <FileBack
        key={fileBackFor?.id ?? 'none'}
        message={fileBackFor}
        threadId={threadId}
        messages={messages}
        threadTitle={thread.data?.title ?? ''}
        modules={modules.data ?? []}
        onOpen={openExternally}
        onClose={() => setFileBackFor(null)}
      />
    </>
  );
}
