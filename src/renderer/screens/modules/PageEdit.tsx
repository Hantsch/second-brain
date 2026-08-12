/* The editor for a wiki page: field, messages, footer.
   Split out of PageView.tsx — viewing and editing are two separate jobs.

   The order in the markup is the point of this file: **the message sits
   between the field and the footer, not above the field.** The field is
   380 px tall; a card placed above it ended up outside the viewport after
   clicking "save" (measured: 182 px tall at `top = -136` — two pixels
   visible). Someone who clicks at the bottom and gets a response at the top
   never sees it and assumes the draft was saved. To fix that: `role="alert"`,
   `scrollIntoView` on appearance, and a line next to the button that states
   plainly that nothing was written. */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

export interface PageEditProps {
  /** The draft as it stands in the field. */
  draft: string;
  onDraft: (next: string) => void;
  /** The main process rejected the write with `conflict`. */
  conflict: boolean;
  /** Some other error from the write path; `null` when there is none. */
  error: unknown;
  /** The file has changed since the editor was opened. */
  changedOutside: boolean;
  /** Hash of the version currently in the file — the reason for the message. */
  docHash: string;
  /** The write is in progress. */
  busy: boolean;
  /** Timestamp of the last attempt — same card, new reason. */
  attemptedAt: number;
  /** Path of the page, for the error card. */
  subject: string;
  /** Save with the frozen hash. */
  onSave: () => void;
  /** Explicit overwrite, without a hash. */
  onOverwrite: () => void;
  /** Discard the draft and fetch the version written elsewhere. */
  onReload: () => void;
  /** Keep the local version despite the outside change. */
  onKeep: () => void;
  onCancel: () => void;
}

export function PageEdit({
  draft,
  onDraft,
  conflict,
  error,
  changedOutside,
  docHash,
  busy,
  attemptedAt,
  subject,
  onSave,
  onOverwrite,
  onReload,
  onKeep,
  onCancel,
}: PageEditProps) {
  const t = useT();
  return (
    <div className="sb-pageedit">
      <label className="gs-label" htmlFor="sb-page-draft">
        {t('page.editLabel')}
      </label>
      <textarea
        id="sb-page-draft"
        className="gs-input sb-pageedit-field"
        value={draft}
        spellCheck={false}
        onChange={(event) => onDraft(event.target.value)}
      />

      {conflict ? (
        <AlertCard
          title={t('page.conflict.title')}
          body={t('page.conflict.body')}
          nonce={attemptedAt}
        >
          {/* Secondary: the focal point now belongs to the decision in this
              card, not the footer's "save" — in this state that could only
              produce the same rejection again. "Overwrite" remains the only
              action with weight, because it's the only one that actually
              changes anything. */}
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={onReload}>
            {t('page.conflict.reload')}
          </Button>
          <Button variant="danger" size="sm" icon="pencil" loading={busy} onClick={onOverwrite}>
            {t('page.conflict.overwrite')}
          </Button>
        </AlertCard>
      ) : error === null ? null : (
        <ErrorState error={error} variant="secondary" subject={subject} scrollIntoView />
      )}

      {/* The outside change arrives via the watcher, not only at save time:
          knowing about it means never losing your text out of ignorance. */}
      {changedOutside && !conflict ? (
        <AlertCard title={t('page.external.title')} body={t('page.external.body')} nonce={docHash}>
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={onReload}>
            {t('page.external.reload')}
          </Button>
          <Button variant="secondary" size="sm" icon="pencil" onClick={onKeep}>
            {t('page.external.keep')}
          </Button>
        </AlertCard>
      ) : null}

      <div className="sb-pageedit-foot">
        {/* While a card is showing above, this button can only produce the
            same rejection again — secondary, so two teal surfaces don't
            compete for attention at the same time. */}
        <Button
          variant={conflict || changedOutside ? 'secondary' : 'primary'}
          icon="check"
          loading={busy}
          onClick={onSave}
        >
          {t('page.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('page.cancel')}
        </Button>
        {/* Without this line, clicking "save" would produce no response at
            the button itself. No live region of its own: the card above is
            the announcement, twice would be once too many. */}
        {conflict ? (
          <span className="sb-pageedit-warn">{t('page.unsaved')}</span>
        ) : (
          <span className="gs-hint">{t('page.editHint')}</span>
        )}
      </div>
    </div>
  );
}

/**
 * A message that must not be missed: it scrolls into view when it appears
 * and announces itself as `alert`.
 *
 * `nonce` is the reason it appeared. If the card stays in place and only
 * gets triggered again (second click on "save", second rejection), the
 * value changes — and the card scrolls into view again instead of quietly
 * staying the same.
 */
function AlertCard({
  title,
  body,
  nonce,
  children,
}: {
  title: string;
  body: string;
  nonce: number | string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* Called optionally: an environment without layout (jsdom) doesn't know
     `scrollIntoView` — what's tested there is the message, not the scroll. */
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest' });
  }, [nonce]);
  return (
    <div ref={box}>
      <Card className="sb-conflict" role="alert">
        <h3 className="sb-conflict-title">{title}</h3>
        <p className="sb-empty-body">{body}</p>
        <div className="sb-conflict-actions">{children}</div>
      </Card>
    </div>
  );
}
