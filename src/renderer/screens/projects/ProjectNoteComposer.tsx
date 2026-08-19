/* The note composer on a project's overview tab: one field, one save button,
   no target choice — a project note always goes into that one project's file
   (unlike `NoteComposer.tsx` on the Notes screen, which also picks an area).

   Saving clears the field only once the note actually stands in the file —
   the same rule as `NoteComposer.tsx`'s `submit()`: a field that clears
   before the write lands would lose the user's text on a conflict. */

import { useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Kbd } from '../../atoms/Kbd';
import { useT } from '../../i18n';

export interface ProjectNoteComposerProps {
  busy: boolean;
  onSave: (text: string) => Promise<unknown>;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ProjectNoteComposer({ busy, onSave, fieldRef }: ProjectNoteComposerProps) {
  const t = useT();
  const [text, setText] = useState('');

  const submit = (): void => {
    const next = text.trim();
    if (next.length === 0 || busy) return;
    const running = onSave(next);
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
    <Card className="sb-notecompose-project">
      <textarea
        ref={fieldRef}
        className="gs-input sb-notecompose-project-field"
        rows={3}
        aria-label={t('project.notes.composer.placeholder')}
        placeholder={t('project.notes.composer.placeholder')}
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="sb-notecompose-project-foot">
        <span className="sb-notecompose-project-hint">
          <Kbd keys={['Ctrl', 'Enter']} />
          <span>{t('project.notes.composer.hint')}</span>
        </span>
        <Button icon="check" loading={busy} disabled={text.trim().length === 0} onClick={submit}>
          {t('project.notes.composer.save')}
        </Button>
      </div>
    </Card>
  );
}
