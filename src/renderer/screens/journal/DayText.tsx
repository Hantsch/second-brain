/* The "day" section: the prose text, rendered — a click makes it editable.
 *
 * Conflict protection is the core of this file, and it hinges on one detail:
 * **the value and hash are frozen when the editor opens, not read at the moment
 * Save is clicked.** The watcher refreshes the day query as soon as someone
 * writes from outside; if the current hash were taken only at save time, the old
 * text would go out with the new hash — and the main process would accept it.
 * That is exactly the silent data loss CLAUDE.md rules out.
 *
 * Two kinds of outside change, two responses:
 *
 * - **The section itself has changed** → a bar on the field with two options
 *   (take the outside version or keep your own). The value is compared, since
 *   that's the only change that matters here.
 * - **The file has changed, but this section hasn't** (a coaching round was
 *   added, the day close wrote facts) → the frozen hash quietly catches up. A
 *   conflict here would be pure friction: only this section gets saved anyway.
 *
 * If the main process still returns a `conflict`, the draft stays put and the
 * message offers the explicit path to overwrite. Nothing is lost without someone
 * deciding it.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Kbd } from '../../atoms/Kbd';
import { ErrorState } from '../../components/ErrorState';
import { Markdown } from '../../components/Markdown';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';

/** The version a draft is based on: text and hash belong together. */
interface Base {
  text: string;
  hash: string;
}

export interface DayTextProps {
  /** The section's prose text, as it stands in the file. */
  text: string;
  /** Hash of the file it's in. */
  hash: string;
  /** The day has no file yet — then the field is the entry point. */
  fresh: boolean;
  busy: boolean;
  /** The main process rejected the last attempt. */
  error: unknown;
  /** Timestamp of the last attempt — same card, new occasion. */
  attemptedAt: number;
  saved: boolean;
  /** Save with the frozen hash; `undefined` means explicitly overwrite. */
  onSave: (text: string, expectedHash: string | undefined) => void;
  /** The user wants to see the outside version. */
  onReload: () => void;
  onReset: () => void;
}

export function DayText({
  text,
  hash,
  fresh,
  busy,
  error,
  attemptedAt,
  saved,
  onSave,
  onReload,
  onReset,
}: DayTextProps) {
  const t = useT();
  /**
   * The draft **and** the version it's based on — one state, not two. It's
   * created when the editor opens and on the first keystroke in the inviting
   * field; derived, not chased in an effect (`useProposalEdit` does the same).
   * That way there's no state where text and hash don't match.
   */
  const [stored, setStored] = useState<{ draft: string; base: Base } | null>(null);
  /** Outside version whose notice the user has dismissed. */
  const [accepted, setAccepted] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  /* Once saved, the draft has arrived — then the file takes over again. */
  const draft = saved ? null : (stored?.draft ?? null);
  const base = saved ? null : (stored?.base ?? null);
  /* A day without prose invites input instead of showing an empty area with a
     pen icon — even when the file already exists (a day where only talking
     happened). */
  const inviting = draft === null && (fresh || text.trim().length === 0);
  const editing = draft !== null || inviting;
  const conflict =
    error !== null && error !== undefined && decodeIpcError(error).code === 'conflict';
  const changedOutside = base !== null && text !== base.text && accepted !== text;

  /**
   * The hash used for saving.
   *
   * If the file still holds the same section as when it was opened, the current
   * hash counts: a coaching round or a day close changed the file, but not this
   * text — a conflict there would be pure friction. If the section itself has
   * changed, the frozen hash stays put: then the write **must** fail rather than
   * overwrite someone else's text.
   */
  const expected = base === null || base.text === text ? hash : base.hash;
  const frozen = expected.length > 0 ? expected : undefined;

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const start = (): void => {
    onReset();
    setAccepted(null);
    setStored({ draft: text, base: { text, hash } });
  };

  const stop = (): void => {
    setStored(null);
    setAccepted(null);
    onReset();
  };

  /* The first keystroke in the inviting field freezes what was there before. */
  const type = (value: string): void => {
    setStored({ draft: value, base: stored?.base ?? { text, hash } });
  };

  const save = (expectedHash: string | undefined): void => {
    if (draft === null && !inviting) return;
    onSave(draft ?? '', expectedHash);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save(frozen);
      return;
    }
    if (event.key === 'Escape' && !inviting) {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  };

  if (!editing) {
    return (
      <div className="sb-daytext">
        {saved ? <p className="sb-note-line">{t('journal.day.saved')}</p> : null}
        {/* A click on the text opens it — that's why the text is the button. */}
        <button
          type="button"
          className="sb-daytext-view"
          aria-label={t('journal.day.edit')}
          onClick={start}
        >
          <Markdown text={text} className="sb-daytext-md" />
          <Icon name="pencil" size={14} className="sb-daytext-pen" />
        </button>
      </div>
    );
  }

  return (
    <div className="sb-daytext sb-daytext--editing">
      <label className="gs-label" htmlFor="sb-day-field">
        {inviting ? t('journal.day.ask') : t('journal.day.editLabel')}
      </label>
      <textarea
        id="sb-day-field"
        ref={field}
        className="gs-input sb-daytext-field"
        rows={inviting ? 4 : 8}
        placeholder={t('journal.day.placeholder')}
        value={draft ?? ''}
        onChange={(event) => type(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {/* The notice sits between the field and the footer, not above it: someone
          clicking below and getting a response above would never see it. */}
      {conflict ? (
        <AlertCard
          title={t('journal.day.conflict.title')}
          body={t('journal.day.conflict.body')}
          nonce={attemptedAt}
        >
          <Button size="sm" icon="refresh-cw" onClick={onReload}>
            {t('journal.day.conflict.reload')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="pencil"
            loading={busy}
            onClick={() => save(undefined)}
          >
            {t('journal.day.conflict.overwrite')}
          </Button>
        </AlertCard>
      ) : error === null || error === undefined ? null : (
        <ErrorState error={error} variant="secondary" scrollIntoView />
      )}

      {changedOutside && !conflict ? (
        <AlertCard
          title={t('journal.day.external.title')}
          body={t('journal.day.external.body')}
          nonce={hash}
        >
          <Button
            size="sm"
            icon="refresh-cw"
            onClick={() => {
              setStored({ draft: text, base: { text, hash } });
              setAccepted(null);
              field.current?.focus();
            }}
          >
            {t('journal.day.external.take')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="pencil"
            onClick={() => {
              setAccepted(text);
              field.current?.focus();
            }}
          >
            {t('journal.day.external.keep')}
          </Button>
        </AlertCard>
      ) : null}

      <div className="sb-daytext-foot">
        <Button
          icon="check"
          loading={busy}
          disabled={(draft ?? '').trim().length === 0}
          onClick={() => save(frozen)}
        >
          {t('journal.day.save')}
        </Button>
        {inviting ? null : (
          <Button variant="ghost" onClick={stop}>
            {t('common.cancel')}
          </Button>
        )}
        {conflict ? (
          <span className="sb-pageedit-warn">{t('journal.day.unsaved')}</span>
        ) : (
          <span className="sb-capture-hint">
            <Kbd keys={['Ctrl', 'Enter']} />
            <span>{inviting ? t('journal.day.askHint') : t('journal.day.hint')}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A message that must not be missed: it scrolls into view when it appears and
 * announces itself as `alert`. `nonce` is the occasion — if the card stays put
 * and is only triggered again, it scrolls into view again.
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
