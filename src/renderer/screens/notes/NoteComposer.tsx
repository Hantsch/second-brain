/* The composer at the top of the Notes screen: one field, an optional
   target, a save button. Always visible — nothing about capturing a note
   asks for structure first (CONCEPT.md principle 1, story 005's AC 2). The
   target defaults to "no target"; the main process files an untargeted note
   into the default area (`areas/notes.md`), creating it on first use.

   Saving clears the field only once the note actually stands in the file —
   the same rule as `TodoList.tsx`'s `submit()`: a field that clears before
   the write lands would lose the user's text on a conflict. */

import { useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import type { Area } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Kbd } from '../../atoms/Kbd';
import { Select } from '../../atoms/Select';
import { useT } from '../../i18n';

export interface NoteComposerProps {
  areas: readonly Area[];
  busy: boolean;
  /** `target` is `null` for "no target" — the default. */
  onSave: (text: string, target: string | null) => Promise<unknown>;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
}

export function NoteComposer({ areas, busy, onSave, fieldRef }: NoteComposerProps) {
  const t = useT();
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');

  const submit = (): void => {
    const next = text.trim();
    if (next.length === 0 || busy) return;
    const running = onSave(next, target === '' ? null : target);
    /* Only the text clears on success — the target stays, so several notes
       in a row into the same area don't need reselecting it every time. */
    void running.then(
      () => setText(''),
      () => undefined,
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Card className="sb-notecompose">
      <textarea
        ref={fieldRef}
        className="gs-input sb-notecompose-field"
        rows={3}
        aria-label={t('notes.composer.placeholder')}
        placeholder={t('notes.composer.placeholder')}
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="sb-notecompose-foot">
        <Select
          className="sb-notecompose-target"
          label={t('notes.composer.targetLabel')}
          value={target}
          disabled={busy}
          onChange={(event) => setTarget(event.target.value)}
          options={[
            { value: '', label: t('notes.composer.targetNone') },
            ...areas.map((area) => ({ value: area.slug, label: area.title })),
          ]}
        />
        <span className="sb-notecompose-hint">
          <Kbd keys={['Ctrl', 'Enter']} />
          <span>{t('notes.composer.hint')}</span>
        </span>
        <Button icon="check" loading={busy} disabled={text.trim().length === 0} onClick={submit}>
          {t('notes.composer.save')}
        </Button>
      </div>
    </Card>
  );
}
