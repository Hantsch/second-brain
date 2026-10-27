/* Chats — the place to hold a conversation with Gaston and come back to it.

   The body is the ask panel itself: thread list, conversation, composer,
   citations and filing back. Only the chrome is this screen's — header and
   "new chat". The ask overlay embeds the same panel for a question that comes
   up while standing elsewhere; both show the same threads.

   The open thread lives in the address (`?t=<thread id>`), like every other
   screen's state, so a reload lands on the same chat. Coming back through the
   nav rail carries no `?t=`, so the screen falls back to the thread it showed
   last (`lib/chat-session.ts`) — and an answer that was still being written
   when the screen was left keeps growing there. */

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { lastChatThread, rememberChatThread } from '../../lib/chat-session';
import { AskPanel, type AskPanelControls } from '../ask/AskPanel';

export function ChatsScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const fromAddress = params.get('t');
  const selected = fromAddress ?? lastChatThread();
  const controls = useRef<AskPanelControls | null>(null);

  /* A link straight to a chat (`#/chats?t=…`) is where the user stands now. */
  useEffect(() => {
    if (fromAddress !== null) rememberChatThread(fromAddress);
  }, [fromAddress]);

  /* Remembered before the address changes: for "new chat" the address loses
     its `?t=`, and the fallback above must not bring the old thread back. */
  const show = (id: string | null): void => {
    rememberChatThread(id);
    setParams(id === null ? {} : { t: id }, { replace: true });
  };

  /* Stable, so the panel registers once instead of on every render. */
  const register = useCallback((next: AskPanelControls): void => {
    controls.current = next;
  }, []);

  return (
    <div className="sb-screen sb-screen--wide sb-screen--fill">
      <ScreenHeader
        overline={t('screen.chats.overline')}
        title={t('screen.chats.title')}
        action={
          /* Secondary: the one teal focal point is "ask question" in the composer. */
          <Button variant="secondary" icon="plus" onClick={() => controls.current?.newThread()}>
            {t('chats.new')}
          </Button>
        }
      />

      <AskPanel threadId={selected} onThread={show} onControls={register} />
    </div>
  );
}
