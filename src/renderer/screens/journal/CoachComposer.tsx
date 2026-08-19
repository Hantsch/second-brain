/* The field where the day takes shape: privacy line, composer with stance —
 * in the wide window anchored as one block at the bottom edge of the detail
 * column (`position: sticky`, `styles/app/journal.css`), with "close the
 * day" (`footerAction`) right next to it.
 *
 * A separate component instead of part of `CoachPanel`, for exactly one
 * reason: `position: sticky` only sticks within the box surrounding this
 * element (its nearest block-forming ancestor) — not the whole scroll area.
 * As a descendant of `.sb-coach`, this frame would only have been the
 * narrow remainder of the talk section, deep at the bottom of the page,
 * with no room to move upward. As a direct descendant of `.sb-dayentry`
 * (see `DayEntry.tsx`), the frame is the whole detail column — the field
 * thus reaches the bottom window edge without anyone having to scroll.
 *
 * In the narrow window (≤ 1200 px) there is no separate tab any more (011,
 * D7 removed it): the whole day, including this composer, flows as one
 * scrolling column, so `footerAction` still stays `undefined` there —
 * "close the day" sits instead next to the facts in `DayEntry.tsx`
 * (`JournalScreen.tsx` decides based on window width where the one button
 * goes; it's never duplicated). The composer doesn't need the sticky frame
 * there either: as the column's last, non-growing element it's always
 * within the window regardless of how long the day gets.
 */

import type { RefObject } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CoachMode } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { ChatComposer } from '../../components/ChatComposer';
import { CoachModeSwitch } from '../../components/CoachModeSwitch';
import { useT } from '../../i18n';
import type { CoachRoute } from '../../lib/queries/journal';

/** The path to the routing setting — the same address as in `LlmMissing`. */
const ROUTING_ROUTE = '/settings?tab=models';

export interface CoachComposerProps {
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  busy: boolean;
  mode: CoachMode;
  onMode: (mode: CoachMode) => void;
  route: CoachRoute;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /** "Close the day" — only in the wide window (`JournalScreen.tsx` passes
      it through there and only there): it sits next to the send button, so
      both actions concerning the day stand together at the bottom edge of
      the detail column and never slide below the visible edge (same anchor
      pattern as the inbox's action bar). In the narrow window the same
      button instead sits next to the facts in the "Day" tab
      (`DayEntry.tsx`) — here the spot then stays empty. */
  footerAction?: ReactNode;
}

export function CoachComposer({
  draft,
  onDraft,
  onSend,
  onCancel,
  busy,
  mode,
  onMode,
  route,
  fieldRef,
  footerAction,
}: CoachComposerProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="sb-journal-footer">
      {/* A fact in one line, right above the field. As long as the route is
          unknown, nothing is shown here: a promise about privacy must not
          rest on an assumption. */}
      {route.routed === undefined ? null : (
        <p className="sb-privacy">
          <Icon name={route.local ? 'sprout' : 'globe'} size={13} />
          {route.routed && route.local ? (
            <span>{t('journal.privacy.local')}</span>
          ) : route.routed ? (
            <>
              <span>{t('journal.privacy.remote', { provider: route.provider ?? '' })}</span>
              <button
                type="button"
                className="sb-textlink"
                onClick={() => void navigate(ROUTING_ROUTE)}
              >
                {t('journal.privacy.action')}
              </button>
            </>
          ) : (
            <>
              <span>{t('journal.privacy.none')}</span>
              <button
                type="button"
                className="sb-textlink"
                onClick={() => void navigate(ROUTING_ROUTE)}
              >
                {t('llm.note.action')}
              </button>
            </>
          )}
        </p>
      )}

      <ChatComposer
        value={draft}
        onChange={onDraft}
        onSubmit={onSend}
        onCancel={onCancel}
        busy={busy}
        fieldId="sb-journal-field"
        fieldRef={fieldRef}
        texts={{
          label: t('journal.field.label'),
          placeholder: t('journal.field.placeholder'),
          hintSend: t('journal.field.hintSend'),
          /* The stance choice *is* the request (011, D8): listen only ever
             files what's written, so its label stays the plain "say it" it
             always was; tips/analyse ask a model, and the button says so. */
          send: mode === 'listen' ? t('journal.send') : t('journal.sendAsk'),
          cancel: t('common.cancel'),
        }}
        /* The stance sits in the field's footer: you need to know who
           you're talking to while you type. */
        extra={<CoachModeSwitch value={mode} onChange={onMode} disabled={busy} />}
      />

      {footerAction === undefined ? null : (
        <div className="sb-journal-footer-close">{footerAction}</div>
      )}
    </div>
  );
}
