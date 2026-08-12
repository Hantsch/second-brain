// @vitest-environment jsdom
/* Der nächste Schritt ist ein Schreibweg mit Entwurf — also derselbe Fallstrick
 * wie in der Wiki-Seite: der Text steht seit dem Öffnen im Feld, die Datei
 * darunter kann sich ändern. Geprüft wird deshalb genau der Ablauf, bei dem
 * früher still überschrieben wurde: Feld offen, `value` ändert sich von außen,
 * dann speichern. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextStepEditor } from '@renderer/components/NextStepEditor';
import { setLanguage } from '@renderer/i18n';

const MINE = 'Rollenkonzept mit Stefan klären';
const OUTSIDE = 'Stattdessen die Migration vorziehen';

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

describe('NextStepEditor: fremde Änderung am offenen Feld', () => {
  it('sagt es, wenn der Schritt von außen geändert wurde — und behauptet nichts', async () => {
    const onSave = vi.fn();
    const view = render(<NextStepEditor value="Abnahmeprotokoll durchgehen" onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    const field = screen.getByLabelText('Nächster Schritt');
    await userEvent.clear(field);
    await userEvent.type(field, MINE);

    /* Der Watcher liefert die fremde Fassung nach — das Feld bleibt stehen. */
    view.rerender(<NextStepEditor value={OUTSIDE} onSave={onSave} />);

    expect(screen.getByRole('alert').textContent).toContain(OUTSIDE);
    expect((screen.getByLabelText('Nächster Schritt') as HTMLInputElement).value).toBe(MINE);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('übernimmt auf Wunsch die fremde Fassung in das Feld', async () => {
    const onSave = vi.fn();
    const view = render(<NextStepEditor value="Abnahmeprotokoll durchgehen" onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Nächster Schritt'), '!');
    view.rerender(<NextStepEditor value={OUTSIDE} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fremde Fassung übernehmen' }));

    expect((screen.getByLabelText('Nächster Schritt') as HTMLInputElement).value).toBe(OUTSIDE);
    expect(screen.queryByRole('alert')).toBeNull();
    /* Nichts zu ändern heißt nichts zu schreiben. */
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('lässt die eigene Fassung behalten und schreibt sie dann bewusst', async () => {
    const onSave = vi.fn();
    const view = render(<NextStepEditor value="Abnahmeprotokoll durchgehen" onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    const field = screen.getByLabelText('Nächster Schritt');
    await userEvent.clear(field);
    await userEvent.type(field, MINE);
    view.rerender(<NextStepEditor value={OUTSIDE} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Meine Fassung behalten' }));
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(MINE));
  });

  it('meldet auch, wenn der Schritt von außen entfernt wurde', async () => {
    const view = render(
      <NextStepEditor value="Abnahmeprotokoll durchgehen" onSave={() => undefined} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    view.rerender(<NextStepEditor value={null} onSave={() => undefined} />);

    expect(screen.getByRole('alert').textContent).toContain('außerhalb entfernt');
  });

  it('meldet nichts, solange niemand von außen schreibt', async () => {
    render(<NextStepEditor value="Abnahmeprotokoll durchgehen" onSave={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Nächster Schritt'), ' und melden');

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
