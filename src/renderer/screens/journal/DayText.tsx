/* The "day" section: the field the day is written in. Always editable — there
 * is no edit mode to enter first (047/D2).
 *
 * Conflict protection is the core of this file, and it hinges on one detail:
 * **the value and hash are frozen when a draft begins, not read at the moment
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
 *
 * 011/D8 removed the whole-text "click anywhere to edit" surface: `EntryStream`
 * (rendered by `DayEntry.tsx`) shows every paragraph of prose as part of the one
 * chronological column, so this component never renders the prose again — only
 * the field it is written in. 047/D2 then dropped the pencil trigger and the
 * "nothing written yet → render nothing" branch as well: the textarea is the
 * day's field on every day, fresh, empty or written, and needs no click first.
 *
 * With no editor to open, **the first keystroke of a draft is what freezes the
 * base version** — before that there is no draft, nothing to save, and the
 * file's own hash is the only one in play. Everything downstream of the freeze
 * (`expected`, the conflict card, the external-change bar) is unchanged by that
 * move.
 *
 * That is also why `written` exists: the refetch after a save is an
 * asynchronous IPC round-trip, so for a moment `text`/`hash` still describe the
 * file as it was *before* the save. A keystroke landing in that window would
 * freeze that stale pair — and the next save would go out with a hash the file
 * no longer has. `current` closes that window: while the refetch is still on
 * its way, the version the save itself wrote stands in for the props.
 *
 * The same window is open in the other direction, and that decides how the
 * draft ends: a write plus its index refresh takes real time, and every
 * keystroke that lands while it runs belongs to the user. So the draft is
 * **not** dropped because a save happened — it is dropped when the file
 * reports back exactly the text that went out (`sent`), which is the one case
 * where dropping it changes nothing on screen. Typed past that, the draft
 * stays and is rebased onto the version the save wrote.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';

/** One version of the section: text and hash belong together. */
export interface DayVersion {
  text: string;
  hash: string;
}

/**
 * A draft, the version it is based on, and the text a save has handed over —
 * one state, so there is never a render in which they disagree.
 */
interface Editing {
  draft: string;
  base: DayVersion;
  /**
   * Text of the last save handed to the main process, until the file reports
   * it back. It is what tells an arrived draft from one that has been typed
   * past while the write was still running.
   */
  sent: string | null;
}

export interface DayTextProps {
  /** The section's prose text, as it stands in the file. */
  text: string;
  /** Hash of the file it's in. */
  hash: string;
  /**
   * What this field's last successful save wrote — the text that went out,
   * together with the hash the write returned — or `null` as soon as the day
   * query reports anything other than the version that save was written on
   * top of. The screen owns that lifetime, because the hash arrives with the
   * mutation result and only the screen sees the query behind it (see
   * `JournalScreen.tsx`). It is a window, never a pin: a version that arrives
   * from outside always wins over what we once wrote.
   *
   * Without it, a keystroke in the window between a save and its refetch would
   * base its draft on the pre-save `text`/`hash`: the field would visibly fall
   * back to the old text, the external-change bar could trip on the user's own
   * save, and the next save would go out with a hash the file no longer has —
   * a conflict whose only offered way out ("overwrite") would drop exactly what
   * was just saved.
   */
  written: DayVersion | null;
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
  /**
   * Lets the screen put the cursor in this field (047/D4). Passing it hands
   * over the same ref the component uses itself after the external-change bar
   * is answered — one element, one ref, no merging.
   */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
}

export function DayText({
  text,
  hash,
  written,
  busy,
  error,
  attemptedAt,
  saved,
  onSave,
  onReload,
  onReset,
  fieldRef,
}: DayTextProps) {
  const t = useT();
  /**
   * The draft **and** the version it's based on — one state, not two. It's
   * created by the first keystroke; derived, not chased in an effect
   * (`useProposalEdit` does the same). That way there's no state where text
   * and hash don't match.
   */
  const [stored, setStored] = useState<Editing | null>(null);
  /** Outside version whose notice the user has dismissed. */
  const [accepted, setAccepted] = useState<string | null>(null);
  const own = useRef<HTMLTextAreaElement>(null);
  const field = fieldRef ?? own;

  /**
   * What the file holds, as far as this component can know it: the props — or,
   * while the refetch after a save is still on its way, the version that save
   * wrote. Everything below reads this instead of `text`/`hash`, so the moment
   * right after a save is not a moment with stale data.
   */
  const current: DayVersion = written ?? { text, hash };

  /* The file has reported back the text a save handed over. Two outcomes,
     and neither may be derived from `written`: that window closes as soon as
     the day query moves on, so anything read out of it would flip back a
     render later.
     - The draft is still that text → it has arrived. Dropping it changes
       nothing on screen (the field then shows the same text from the file)
       and hands the section back to the file, outside changes included.
     - It is not → keystrokes landed while the write was in flight, and they
       are the user's. The draft stays and its base moves to the version the
       save wrote: a base still frozen on the pre-save version would read as
       an outside change to the user's own save and send a hash the file has
       moved past.
     Adjusted during render, not in an effect (React's own pattern for state
     that follows a changed input): an effect would leave one committed render
     whose `expected` hash is the stale one. `sent: null` afterwards makes
     this fire once. */
  if (stored !== null && stored.sent !== null && current.text === stored.sent) {
    setStored(
      stored.draft === stored.sent ? null : { draft: stored.draft, base: current, sent: null },
    );
  }

  const draft = stored?.draft ?? null;
  const base = stored?.base ?? null;
  const conflict =
    error !== null && error !== undefined && decodeIpcError(error).code === 'conflict';
  const changedOutside = base !== null && current.text !== base.text && accepted !== current.text;

  /**
   * The hash used for saving.
   *
   * If the file still holds the same section as when the draft began, the current
   * hash counts: a coaching round or a day close changed the file, but not this
   * text — a conflict there would be pure friction. If the section itself has
   * changed, the frozen hash stays put: then the write **must** fail rather than
   * overwrite someone else's text.
   */
  const expected = base === null || base.text === current.text ? current.hash : base.hash;
  const frozen = expected.length > 0 ? expected : undefined;

  /* Cancel: drop the draft, and the field falls back to the file's text on the
     next render — there is no editor left to close. */
  const stop = (): void => {
    setStored(null);
    setAccepted(null);
    onReset();
  };

  const type = (value: string): void => {
    /* A draft with no base yet freezes the file as it stands right now —
       `current`, which right after a save is what that save wrote, not the
       pre-save props the refetch has yet to replace. An existing draft keeps
       its base and, with it, whatever save is still on its way: that is what
       lets this keystroke survive the write landing. */
    setStored({ draft: value, base: base ?? current, sent: stored?.sent ?? null });
    /* Still flagged as saved: "Saved." no longer describes what is in the
       field. */
    if (saved) onReset();
  };

  const save = (expectedHash: string | undefined): void => {
    if (draft === null) return;
    /* Noted before the write goes out, not after it returns: the round-trip
       is where the keystrokes this has to be told apart from happen. */
    setStored({ draft, base: base ?? current, sent: draft });
    onSave(draft, expectedHash);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    /* No Enter combination saves any more (048/D3) — Enter, Shift+Enter and
       Ctrl/Cmd+Enter all fall through to the textarea's own line-break
       behaviour. Only the "Speichern" button writes the text; discarding a
       draft is likewise only "Abbrechen", never a keystroke here. */
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      /* Esc leaves the field without discarding — it mirrors ChatComposer's
         blur pattern (see there): the draft stays exactly as typed, only
         focus moves off the textarea. */
      event.currentTarget.blur();
    }
  };

  return (
    <div className="sb-daytext">
      <label className="gs-label" htmlFor="sb-day-field">
        {t('journal.day.editLabel')}
      </label>
      {/* Draft first, the file second: with no draft the field simply shows
          what is in the file — including a version that arrived from outside
          while nobody was typing. */}
      <textarea
        id="sb-day-field"
        ref={field}
        className="gs-input sb-daytext-field"
        rows={12}
        placeholder={t('journal.day.placeholder')}
        value={draft ?? current.text}
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
          nonce={current.hash}
        >
          <Button
            size="sm"
            icon="refresh-cw"
            onClick={() => {
              /* A fresh draft on the outside version — and no save of ours
                 still pending against it. */
              setStored({ draft: current.text, base: current, sent: null });
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
              setAccepted(current.text);
              field.current?.focus();
            }}
          >
            {t('journal.day.external.keep')}
          </Button>
        </AlertCard>
      ) : null}

      <div className="sb-daytext-foot">
        {/* No draft, nothing to write: `draft ?? ''` keeps Save disabled until
            the field actually differs from the file, which is also the only
            state `save()` acts on. */}
        <Button
          icon="check"
          loading={busy}
          disabled={(draft ?? '').trim().length === 0}
          onClick={() => save(frozen)}
        >
          {t('journal.day.save')}
        </Button>
        <Button variant="ghost" onClick={stop}>
          {t('common.cancel')}
        </Button>
        {conflict ? (
          <span className="sb-pageedit-warn">{t('journal.day.unsaved')}</span>
        ) : /* Only while the field really does hold what the file holds. A
               draft typed past the save is unsaved text, and "Saved." would
               claim otherwise. */
        saved && draft === null ? (
          <span className="sb-note-line">{t('journal.day.saved')}</span>
        ) : (
          <span className="sb-capture-hint">
            <span>{t('journal.day.hint')}</span>
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
