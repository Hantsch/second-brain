/* Ask as an overlay over the current screen: a question comes up while
   standing somewhere — in a project, in the journal — and answering it must
   not cost the place the user was standing in.

   The frame is the one from `CaptureOverlay` — scrim plus dialog with its own
   width — only wide: the ask body shows conversations, answer and evidence
   next to each other. The header row is the overlay's own. The ask screen puts
   title and "new thread" into its `ScreenHeader`; an overlay has none, so it
   carries the same two things itself. Both header actions stay secondary — the
   one teal focal point is "ask question" in the composer.

   Closing only unmounts the panel; it deliberately does not abort. A running
   answer keeps streaming in the main process and is written to the file at the
   end (`src/main/ipc/chat.ts`) — an abort would write nothing and throw away
   half an answer. Nothing updates React state after unmount either: the chunks
   land in the module-level buffer of `lib/llm-stream.ts`, which no longer has a
   subscriber once the panel is gone. */

import { useCallback, useEffect, useRef } from 'react';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';
import type { AskPrefill } from '../lib/shell-overlays';
import { AskPanel, type AskPanelControls } from '../screens/ask/AskPanel';

export interface AskOverlayProps {
  /** What the opener knew. `null` when it knew nothing. */
  prefill: AskPrefill | null;
  onClose: () => void;
}

export function AskOverlay({ prefill, onClose }: AskOverlayProps) {
  const t = useT();
  const controls = useRef<AskPanelControls | null>(null);
  /* The prefill that has already been acted on, held by identity rather than as
     a boolean: every `openAsk` call makes a fresh object, so a second question
     asked while the overlay still stands is recognised as new — while React's
     double-invoked effects, which reuse the same object, still act only once. */
  const handled = useRef<AskPrefill | null>(null);

  /* Stable, so the panel registers once instead of on every render. */
  const register = useCallback((next: AskPanelControls): void => {
    controls.current = next;
  }, []);

  const question = prefill?.question ?? '';

  /* Every question that arrives has to land somewhere — the overlay stays open
     across openers, so dropping one silently would lose what the user typed.
     `submit` says the opener already carried the user's action: a keystroke
     with a question in it. A `?q=` URL does not, and there the panel's rule
     stands: fill the field, leave the asking to the user. */
  useEffect(() => {
    if (prefill === null || prefill === handled.current) return;
    handled.current = prefill;
    const text = prefill.question ?? '';
    if (text.trim().length === 0) return;
    if (prefill.submit !== true) {
      controls.current?.fill(text);
      return;
    }
    /* Asking is deferred by one microtask on purpose. Mount effects run
       child-first, so the panel below has already subscribed to its ask
       mutation by the time this runs — but under StrictMode React tears every
       effect down again and sets it up a second time, all inside the same
       synchronous flush. TanStack Query's `MutationObserver` drops itself from
       the running mutation when it loses its last listener and never re-attaches
       on the second subscribe, so a mutation started here in the first setup
       would resolve into a detached observer: the panel would never learn its
       own answer, stay `pending` forever, and refuse every later question.
       A microtask runs after the whole flush, so the subscription that carries
       the mutation is the one that survives. It deliberately is not cancelled
       on cleanup — StrictMode's teardown would cancel the only submit there is,
       and `handled` above already keeps it to exactly one per prefill. */
    queueMicrotask(() => controls.current?.ask(text));
  }, [prefill]);

  return (
    <div
      className="gs-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="gs-dialog sb-overlay sb-overlay--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t('screen.ask.title')}
      >
        <div className="sb-overlay-head">
          <h2 className="gs-dialog-title">{t('screen.ask.title')}</h2>
          <div className="sb-overlay-actions">
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              onClick={() => controls.current?.newThread()}
            >
              {t('ask.action.new')}
            </Button>
            <IconButton icon="x" size="sm" label={t('common.close')} onClick={onClose} />
          </div>
        </div>

        {/* Escape needs both paths: the shell's global hotkey closes the overlay
            from anywhere on the page, but the composer field swallows the key
            (`stopPropagation`) — and that is exactly where focus lands. So the
            panel gets the closer handed in as well. */}
        <AskPanel
          prefill={{
            question,
            module: prefill?.module ?? null,
            project: prefill?.project ?? null,
            scope: prefill?.scope ?? null,
            threadId: prefill?.threadId ?? null,
          }}
          onControls={register}
          onEscape={onClose}
        />
      </div>
    </div>
  );
}
