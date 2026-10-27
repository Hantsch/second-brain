/* Error state. The wording comes from `IpcError.code`; the technical message
   sits behind "Show details", never as a raw stack trace.

   Three rules from ARCHITECTURE.md are baked into the shape: the card sits
   where the triggering action was (the caller decides that), it offers an
   escape route (`onRetry` runs the same action again), and it names the
   subject — "the vault 'broken-vault' couldn't be opened" is information,
   "that didn't work" is a riddle.

   `variant` decides the teal: if the screen already has its own primary
   action, "Retry" stays secondary. Two focal points on one surface are none. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { decodeIpcError, llmUnavailableCause } from '../lib/ipc-error';

export interface ErrorStateProps {
  /** Anything an IPC call can throw. */
  error: unknown;
  onRetry?: () => void;
  /**
   * What it was about: vault name, path, title. Already translated, or a date
   * from the vault — appears as the subject in the sentence.
   */
  subject?: string;
  /**
   * `primary`: "Retry" is the surface's focal point (default).
   * `secondary`: the screen already has one — the button then stays calm.
   */
  variant?: 'primary' | 'secondary';
  /** Scroll into view as soon as the error appears. */
  scrollIntoView?: boolean;
}

export function ErrorState({
  error,
  onRetry,
  subject,
  variant = 'primary',
  scrollIntoView = false,
}: ErrorStateProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const failure = decodeIpcError(error);

  /* An error the user doesn't see is a silent error. */
  useEffect(() => {
    if (!scrollIntoView) return;
    box.current?.scrollIntoView({ block: 'nearest' });
  }, [scrollIntoView, failure.code, failure.message]);

  /* A missing model has three different fixes — assign one, enter a key,
     switch the provider on. One generic sentence for all three sent the user
     looking for a model that was already assigned. */
  const cause = llmUnavailableCause(failure);
  const key = cause === null ? failure.code : `${failure.code}.${cause.reason}`;
  const values: Record<string, string> =
    cause === null
      ? {}
      : { task: t(`task.${cause.task}.label`), provider: cause.provider, reason: cause.detail };
  const sentence =
    subject === undefined || subject.length === 0
      ? t(`error.code.${key}`, values)
      : t(`error.about.${key}`, { ...values, subject });

  return (
    <div ref={box}>
      <Card padded={false} className="sb-error" role="alert">
        <div className="sb-error-body">
          <span className="sb-error-icon">
            <Icon name="triangle-alert" size={18} />
          </span>
          <div className="sb-error-text">
            <h2 className="sb-error-title">{t('error.title')}</h2>
            <p className="sb-empty-body">{sentence}</p>
            <div className="sb-error-actions">
              {onRetry ? (
                <Button
                  variant={variant === 'secondary' ? 'secondary' : 'primary'}
                  icon="refresh-cw"
                  size="sm"
                  onClick={onRetry}
                >
                  {t('error.retry')}
                </Button>
              ) : null}
              <Button
                variant={variant === 'secondary' && onRetry ? 'ghost' : 'secondary'}
                size="sm"
                icon={open ? 'chevron-up' : 'chevron-down'}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? t('error.detailsHide') : t('error.details')}
              </Button>
            </div>
            {open ? (
              <span className="sb-note-detail">
                {failure.code}: {failure.message}
              </span>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
