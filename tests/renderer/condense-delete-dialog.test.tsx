// @vitest-environment jsdom
/* The condensation delete confirmation dialog (story 043, deliverable D2).
 *
 * The prüfsteine of this deliverable:
 *
 * - The dialog names the artifact's file path and states that the directives
 *   section is the one part no later run can reproduce.
 * - Confirming calls `onSubmit` with no arguments — there is no reason field,
 *   unlike `CondenseRejectDialog`.
 * - Closing the dialog (Cancel) never calls `onSubmit`.
 * - A busy confirm action is disabled — no double-submit while the delete is
 *   already in flight.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CondenseDeleteDialog } from '@renderer/components/CondenseDeleteDialog';
import { setLanguage } from '@renderer/i18n';

const PATH = 'areas/gesundheit.condensed.md';

describe('CondenseDeleteDialog (Story 043, D2)', () => {
  it('nennt den Dateipfad und sagt, dass die Direktiven nicht wiederherstellbar sind', async () => {
    setLanguage('de');
    render(
      <CondenseDeleteDialog
        open
        path={PATH}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(await screen.findByText(`„${PATH}“ löschen?`)).toBeTruthy();
    expect(screen.getByText(/Der Direktiven-Abschnitt ist der einzige Teil/)).toBeTruthy();
  });

  it('ruft onSubmit ohne weitere Eingabe auf, wenn bestätigt wird', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    render(<CondenseDeleteDialog open path={PATH} onClose={() => undefined} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onSubmit).toHaveBeenCalledWith();
  });

  it('ruft bei Abbrechen onClose auf, ohne onSubmit auszulösen', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<CondenseDeleteDialog open path={PATH} onClose={onClose} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('deaktiviert die Bestätigung, solange die Löschung läuft', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    render(
      <CondenseDeleteDialog open path={PATH} busy onClose={() => undefined} onSubmit={onSubmit} />,
    );

    const confirm = screen.getByRole('button', { name: 'Löschen' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(confirm);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
