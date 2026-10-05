/* Chats — the history of every question asked, readable on its own.

   Asking is an overlay over whatever screen you stand on, and the overlay only
   shows its history next to the composer. That left finished conversations
   reachable only by opening a new question first. This screen is the place to
   come back to them: the same thread list (search included), the conversation
   read-only on the right, and one action to carry on asking inside it.

   The selection lives in the address (`?t=<thread id>`), like every other
   screen's state, so Back and a reload land on the same chat. Continuing hands
   the thread to the ask overlay rather than re-implementing the composer here:
   answering needs the stream, the cancel path and the citation panel, and the
   overlay already owns all three. Filing an answer back to the wiki is part of
   that same path, so the read-only feed offers no file-back button. */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Citation } from '@shared/types';
import { Button } from '../../atoms/Button';
import { CitationPanel } from '../../components/CitationPanel';
import { citationDomId } from '../../components/CitationList';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { useChatMutations, useThread, useThreads } from '../../lib/queries/chat';
import { useShellOverlays } from '../../lib/shell-overlays';
import { useOpenDoc } from '../../lib/use-open-doc';
import { AnswerFeed } from '../ask/AnswerFeed';
import { ThreadList } from '../ask/ThreadList';

export function ChatsScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const selected = params.get('t');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<{ messageId: string; index: number } | null>(null);
  const [panel, setPanel] = useState<{ citation: Citation; index: number } | null>(null);

  const threads = useThreads(search);
  const thread = useThread(selected);
  const mutations = useChatMutations();
  const { openAsk } = useShellOverlays();
  const openDoc = useOpenDoc();

  const opened = thread.data ?? null;
  const messages = opened?.messages ?? [];
  const list = threads.data ?? [];
  /* "No chats" is a statement about the vault: only once the list has loaded,
     and never while a search is what narrowed it down. */
  const nothingYet = !threads.isPending && list.length === 0 && search.trim().length === 0;

  const select = (id: string): void => {
    setParams({ t: id }, { replace: true });
    setActive(null);
    setPanel(null);
  };

  const remove = (id: string): void => {
    mutations.remove.mutate(id, {
      onSuccess: () => {
        if (selected === id) setParams({}, { replace: true });
      },
    });
  };

  const showCitation = (messageId: string, index: number): void => {
    setActive({ messageId, index });
    const citation = messages.find((message) => message.id === messageId)?.citations?.[index - 1];
    if (citation !== undefined) setPanel({ citation, index });
    document
      .getElementById(citationDomId(messageId, index))
      ?.scrollIntoView?.({ block: 'nearest' });
  };

  const failed = mutations.remove.error ?? thread.error ?? threads.error;

  return (
    <div className="sb-screen sb-screen--wide sb-screen--fill">
      <ScreenHeader overline={t('screen.chats.overline')} title={t('screen.chats.title')} />

      {failed === null || failed === undefined ? null : (
        <ErrorState error={failed} variant="secondary" />
      )}

      {nothingYet ? (
        <EmptyState
          icon="message-square"
          title={t('screen.chats.empty.title')}
          body={t('screen.chats.empty.body')}
        />
      ) : (
        <div className="sb-ask">
          <aside className="sb-ask-side" aria-label={t('ask.threads.title')}>
            <ThreadList
              threads={list}
              activeId={selected}
              query={search}
              onQuery={setSearch}
              onSelect={select}
              onDelete={remove}
              pending={threads.isPending}
            />
          </aside>

          <div className="sb-ask-main">
            {opened === null ? (
              <p className="sb-ask-lead">{t('screen.chats.pick')}</p>
            ) : (
              <>
                <div className="sb-chats-head">
                  <h2 className="sb-chats-title">{opened.title}</h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="message-square"
                    onClick={() => openAsk({ threadId: opened.id })}
                  >
                    {t('chats.continue')}
                  </Button>
                </div>
                <div className="sb-ask-column">
                  <AnswerFeed
                    messages={messages}
                    live={null}
                    active={active}
                    onCitation={showCitation}
                    onOpenPath={openDoc}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <CitationPanel
        citation={panel?.citation ?? null}
        index={panel?.index ?? null}
        onClose={() => setPanel(null)}
      />
    </div>
  );
}
