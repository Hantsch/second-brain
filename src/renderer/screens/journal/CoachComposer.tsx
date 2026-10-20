/* The field where the day takes shape: privacy line, composer with stance —
 * the day's last section, in normal flow at the end of the detail column
 * (`styles/app/journal.css`).
 *
 * A separate component instead of part of `CoachPanel`, and a direct child of
 * `.sb-dayentry` (see `DayEntry.tsx`): that way the frame spans the whole
 * detail column and reads as the day's own footer, rather than as the narrow
 * remainder of the talk section. It used to be `position: sticky` as well,
 * which is where that placement originally came from; 047/D3 removed the
 * sticky, since its only job was keeping "close the day" above the window
 * edge and that button has left this frame. Nothing is pinned any more.
 *
 * "Close the day" no longer has a copy here (047, D3): it renders exactly
 * once, next to the facts in `DayEntry.tsx`, regardless of window width.
 *
 * The field only files on the button (048, D2): Enter breaks the line like
 * in any editor, and Shift+Enter no longer files it either — no keypress
 * does. That used to be Shift+Enter's job; the hint now names the button
 * instead of a key, since a hint promising a key that submits nothing would
 * be worse than none.
 */

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
        /* A journal entry is written text, not a one-line question: Enter
           breaks the line like in any editor, and no Enter combination files
           it either (048, D2) — only the button does. */
        submitKey="none"
        /* No `fieldRef` here: 047/D4 moved the screen's one focus target to
           the day's own field (`DayText`), which is where a fresh day and a
           closed interview dialog put the cursor now. */
        texts={{
          label: t('journal.field.label'),
          placeholder: t('journal.field.placeholder'),
          /* The stance choice *is* the request (011, D8): listen only ever
             files what's written, so its label stays the plain "say it" it
             always was; tips/analyse ask a model, and the button says so.
             The hint names the same button, so it states what actually
             happens rather than promising a key. */
          hintNoSubmit: t('journal.field.hintNoSubmit', {
            button: mode === 'listen' ? t('journal.send') : t('journal.sendAsk'),
          }),
          send: mode === 'listen' ? t('journal.send') : t('journal.sendAsk'),
          cancel: t('common.cancel'),
        }}
        /* The stance sits in the field's footer: you need to know who
           you're talking to while you type. */
        extra={<CoachModeSwitch value={mode} onChange={onMode} disabled={busy} />}
      />
    </div>
  );
}
