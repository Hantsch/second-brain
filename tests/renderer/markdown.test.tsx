// @vitest-environment jsdom
/* Markdown (057, D2): eine Belegmarke bleibt anklickbar, ein Dateiverweis
 * nur, wenn der Aufrufer `onOpenPath` übergibt — sonst ist ein Pfad im
 * Fließtext nur Text (siehe `ask.test.tsx` für den abgelehnten Fall). */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Citation } from '@shared/types';
import { Markdown } from '@renderer/components/Markdown';
import { setLanguage } from '@renderer/i18n';

const PATH = 'modules/identity-management/wiki/concepts/token-lebensdauer.md';

const citation: Citation = {
  path: PATH,
  title: 'Token-Lebensdauer',
  quote: 'Access-Token leben 15 Minuten.',
  line: 13,
};

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

describe('Markdown: Verweise', () => {
  it('a validated citation stays a clickable mark', async () => {
    const onCitation = vi.fn();
    render(
      <Markdown
        text={`Access-Token leben 15 Minuten [[${PATH}]].`}
        citations={[citation]}
        onCitation={onCitation}
      />,
    );

    const mark = screen.getByRole('button', { name: 'Beleg 1 anzeigen' });
    expect(mark.textContent).toBe('[1]');

    await userEvent.click(mark);
    expect(onCitation).toHaveBeenCalledWith(1);
  });

  it('a file ref stays clickable where the caller passes onOpenPath', async () => {
    const onOpenPath = vi.fn();
    render(<Markdown text={`Siehe [[${PATH}]].`} onOpenPath={onOpenPath} />);

    const button = screen.getByRole('button', { name: `Datei öffnen: ${PATH}` });
    expect(button.textContent).toBe('token-lebensdauer.md');

    await userEvent.click(button);
    expect(onOpenPath).toHaveBeenCalledWith(PATH);
  });
});

describe('plainExcerpt', () => {
  it('drops inline marks and keeps the text of links', async () => {
    const { plainExcerpt } = await import('@renderer/components/markdown-render');
    expect(plainExcerpt('**Kanal:** [Better Stack](https://www.youtube.com/channel/x)')).toBe(
      'Kanal: Better Stack',
    );
    expect(
      plainExcerpt('[`00:04:23`](https://youtu.be/f4mI3d-nTrI?t=263) the second question'),
    ).toBe('00:04:23 the second question');
    expect(plainExcerpt('Dateinamen wie `auth0.md`, __klein__ geschrieben')).toBe(
      'Dateinamen wie auth0.md, klein geschrieben',
    );
  });
});
