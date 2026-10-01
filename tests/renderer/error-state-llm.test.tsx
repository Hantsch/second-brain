// @vitest-environment jsdom
/* `ErrorState` for `llm-unavailable`: each cause main reports gets its own
   sentence that says what to fix. One generic "no model reachable" for every
   cause sent the user looking for a model that was already assigned, when
   only the provider's key was missing. */

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcError } from '@shared/ipc';
import { ErrorState } from '@renderer/components/ErrorState';
import { setLanguage } from '@renderer/i18n';

function unavailable(detail?: unknown): IpcError {
  return {
    code: 'llm-unavailable',
    message: 'Für den zugeordneten Provider fehlt der Schlüssel (OpenRouter).',
    ...(detail === undefined ? {} : { detail }),
  };
}

describe('ErrorState — llm-unavailable names its cause', () => {
  afterEach(() => setLanguage('de'));

  it('names the provider whose key is missing', () => {
    setLanguage('de');
    render(
      <ErrorState
        error={unavailable({ reason: 'no-key', task: 'condense-project', provider: 'OpenRouter' })}
        subject="Gaston"
      />,
    );
    expect(
      screen.getByText(
        '„Gaston“ lässt sich nicht verarbeiten: Für OpenRouter ist kein API-Schlüssel hinterlegt. Trag ihn unter Einstellungen → Modelle ein.',
      ),
    ).toBeTruthy();
  });

  it('names the switched-off provider', () => {
    setLanguage('en');
    render(
      <ErrorState
        error={unavailable({
          reason: 'provider-disabled',
          task: 'condense-project',
          provider: 'Ollama',
        })}
      />,
    );
    expect(
      screen.getByText(
        'The provider Ollama is switched off. Switch it on under Settings → Models.',
      ),
    ).toBeTruthy();
  });

  it('names the task that has no model assigned', () => {
    setLanguage('de');
    render(
      <ErrorState
        error={unavailable({ reason: 'no-route', task: 'condense-project' })}
        subject="Gaston"
      />,
    );
    expect(
      screen.getByText(
        '„Gaston“ lässt sich nicht verarbeiten: Der Aufgabe „Projekt verdichten“ ist kein Modell zugeordnet. Ordne unter Einstellungen → Modelle eines zu.',
      ),
    ).toBeTruthy();
  });

  it('keeps the generic sentence when main sent no cause', () => {
    setLanguage('de');
    render(<ErrorState error={unavailable()} subject="Gaston" />);
    expect(screen.getByText('Für „Gaston“ ist kein Sprachmodell erreichbar.')).toBeTruthy();
  });
});
