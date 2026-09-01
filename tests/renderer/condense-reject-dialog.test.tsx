// @vitest-environment jsdom
/* The condensation reject dialog (story 038, deliverable D8).
 *
 * The prüfsteine of this deliverable:
 *
 * - An empty (or whitespace-only) reason cannot be submitted — the confirm
 *   button stays disabled.
 * - A non-whitespace reason enables confirm, and clicking it calls
 *   `onSubmit` with the exact typed string.
 * - Closing the dialog (Cancel or the × button) never calls `onSubmit` —
 *   rejecting is never a bare dismiss.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CondenseRejectDialog } from '@renderer/components/CondenseRejectDialog';
import { setLanguage } from '@renderer/i18n';

describe('CondenseRejectDialog (Story 038, D8)', () => {
  it('lässt eine leere oder nur aus Leerzeichen bestehende Begründung nicht zu', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    render(<CondenseRejectDialog open onClose={() => undefined} onSubmit={onSubmit} />);

    const confirm = screen.getByRole('button', { name: 'Ablehnen' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Begründung'), '   ');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(confirm);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('aktiviert Ablehnen bei echtem Text und übergibt genau diesen an onSubmit', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    render(<CondenseRejectDialog open onClose={() => undefined} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Begründung'), 'Zu knapp, mehr Kontext nötig.');
    const confirm = screen.getByRole('button', { name: 'Ablehnen' });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith('Zu knapp, mehr Kontext nötig.');
  });

  it('verwirft den Vorschlag nicht beim Schließen — Abbrechen ruft onSubmit nicht auf', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<CondenseRejectDialog open onClose={onClose} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Begründung'), 'Ein Grund.');
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears the reason field once the dialog closes, however it was closed', async () => {
    setLanguage('de');
    const onSubmit = vi.fn();
    const { rerender } = render(
      <CondenseRejectDialog open onClose={() => undefined} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByLabelText('Begründung'), 'Ein Grund.');
    expect((screen.getByLabelText('Begründung') as HTMLTextAreaElement).value).toBe('Ein Grund.');

    // Simulates a successful submit whose parent closes the dialog directly
    // (setting `open` to false) rather than calling the dialog's own `onClose`.
    rerender(<CondenseRejectDialog open={false} onClose={() => undefined} onSubmit={onSubmit} />);
    rerender(<CondenseRejectDialog open onClose={() => undefined} onSubmit={onSubmit} />);

    expect((screen.getByLabelText('Begründung') as HTMLTextAreaElement).value).toBe('');
  });
});
