/* An inline composer for a new waiting-on entry, next to `WaitingList` in the
   same Panel — mirrors `ProjectNoteComposer`'s save-clears-only-on-success
   rule and `TodoList`'s internal composer, which stays open after a
   successful add so several entries can go in one after another.

   Only "who" is mandatory in the UI. `since` defaults to today because the
   main process requires it (`asWaiting` in `project-patch.ts`) — the file
   format has no notion of "since unknown". `what` and `due` are left out of
   the saved entry entirely when blank: `asWaiting`'s `asText` rejects an
   empty string for any field it validates, `what` included, so an explicit
   `what: ''` would fail where leaving the key out succeeds. */

import { useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { Button } from '../../atoms/Button';
import { todayIso } from '../../components/DayList';
import { useT } from '../../i18n';

export interface WaitingEntryInput {
  who: string;
  what: string;
  since: string;
  due?: string;
}

export interface WaitingComposerProps {
  busy: boolean;
  onSave: (entry: WaitingEntryInput) => Promise<unknown>;
  fieldRef?: RefObject<HTMLInputElement | null>;
  /** Controlled by the parent, so a later deliverable (D6) can open this
      composer on a keyboard shortcut without restructuring either file. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WaitingComposer({
  busy,
  onSave,
  fieldRef,
  open,
  onOpenChange,
}: WaitingComposerProps) {
  const t = useT();
  const [who, setWho] = useState('');
  const [what, setWhat] = useState('');
  const [since, setSince] = useState(() => todayIso());
  const [due, setDue] = useState('');

  const reset = (): void => {
    setWho('');
    setWhat('');
    setSince(todayIso());
    setDue('');
  };

  const close = (): void => {
    reset();
    onOpenChange(false);
  };

  const submit = (): void => {
    const trimmedWho = who.replace(/\s+/g, ' ').trim();
    if (trimmedWho.length === 0 || busy) return;
    const entry: WaitingEntryInput = { who: trimmedWho, what: what.trim(), since };
    if (due.length > 0) entry.due = due;
    /* Cleared only once the entry actually stands in the file — the composer
       itself stays open, so a run of "waiting on" entries doesn't need a
       click to reopen it between each one (same as `TodoList`'s `submit()`). */
    void onSave(entry).then(reset, () => undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" icon="plus" onClick={() => onOpenChange(true)}>
        {t('project.waiting.new.action')}
      </Button>
    );
  }

  return (
    <div className="sb-waitcompose">
      <div className="sb-waitcompose-fields">
        <input
          ref={fieldRef}
          className="gs-input sb-waitcompose-who"
          aria-label={t('project.waiting.new.who')}
          placeholder={t('project.waiting.new.whoPlaceholder')}
          value={who}
          disabled={busy}
          onChange={(event) => setWho(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <input
          className="gs-input sb-waitcompose-what"
          aria-label={t('project.waiting.new.what')}
          placeholder={t('project.waiting.new.whatPlaceholder')}
          value={what}
          disabled={busy}
          onChange={(event) => setWhat(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="sb-waitcompose-foot">
        <label className="sb-waitcompose-date">
          <span>{t('project.waiting.new.since')}</span>
          <input
            type="date"
            className="gs-input sb-waitcompose-dateinput"
            value={since}
            disabled={busy}
            onChange={(event) => setSince(event.target.value)}
          />
        </label>
        <label className="sb-waitcompose-date">
          <span>{t('project.waiting.new.due')}</span>
          <input
            type="date"
            className="gs-input sb-waitcompose-dateinput"
            value={due}
            disabled={busy}
            onChange={(event) => setDue(event.target.value)}
          />
        </label>
        <span className="sb-waitcompose-hint">{t('project.waiting.new.hint')}</span>
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={who.trim().length === 0}
          onClick={submit}
        >
          {t('project.waiting.new.submit')}
        </Button>
      </div>
    </div>
  );
}
