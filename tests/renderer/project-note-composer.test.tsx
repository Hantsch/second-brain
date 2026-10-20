// @vitest-environment jsdom
/* `ProjectNoteComposer` (story 003, deliverable D3): the field clears only
   once the write actually lands — an empty field cannot be submitted, and a
   rejected write leaves the typed text standing, the same rule as
   `NoteComposer.tsx` on the Notes screen. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectNoteComposer } from '@renderer/screens/projects/ProjectNoteComposer';
import { setLanguage } from '@renderer/i18n';

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
});

describe('ProjectNoteComposer', () => {
  it('renders a field and a save button, disabled while empty', () => {
    render(<ProjectNoteComposer busy={false} onSave={vi.fn()} />);

    expect(screen.getByLabelText('Write a note')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not call onSave for an empty or whitespace-only field', async () => {
    const onSave = vi.fn();
    render(<ProjectNoteComposer busy={false} onSave={onSave} />);

    const field = screen.getByLabelText('Write a note');
    await userEvent.type(field, '   ');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves via the button and clears the field once the write resolves', async () => {
    const onSave = vi.fn().mockResolvedValue({ hash: 'h1', block: '### 2026-08-19\nDone.' });
    render(<ProjectNoteComposer busy={false} onSave={onSave} />);

    const field = screen.getByLabelText('Write a note');
    await userEvent.type(field, 'A note for this project.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('A note for this project.');
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  });

  it('saves via Ctrl+Enter as well', async () => {
    const onSave = vi.fn().mockResolvedValue({ hash: 'h1', block: 'x' });
    render(<ProjectNoteComposer busy={false} onSave={onSave} />);

    const field = screen.getByLabelText('Write a note');
    await userEvent.type(field, 'Typed with the keyboard.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Typed with the keyboard.'));
  });

  it('keeps the text in the field when the write is rejected', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('conflict'), { code: 'conflict' }));
    render(<ProjectNoteComposer busy={false} onSave={onSave} />);

    const field = screen.getByLabelText('Write a note');
    await userEvent.type(field, 'Text that runs into a conflict.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((field as HTMLTextAreaElement).value).toBe('Text that runs into a conflict.');
  });
});
