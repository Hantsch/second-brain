/* The heading a block is written under is resolved from the file as it was just
 * read (`resolveSection`). Only known section kinds reach the file: no screen
 * lets the user type a heading, so an unknown one is tampered or model-invented
 * input and must not grow a heading of its own. */

import { describe, expect, it } from 'vitest';
import { resolveSection } from '@core/capture';

const GERMAN_BODY = ['## Stand', '', 'Laeuft.', '', '## Notizen', '', 'Alt.', ''].join('\n');
const ENGLISH_BODY = ['## Status', '', 'Running.', '', '## Notes', '', 'Old.', ''].join('\n');
const BARE_BODY = ['# Demo', '', 'Noch kein Abschnitt.', ''].join('\n');

describe('resolveSection', () => {
  it('an unknown heading falls back to the kind default instead of being written literally', () => {
    expect(resolveSection(GERMAN_BODY, { section: 'Geheimer Abschnitt' }, 'notes', 'de')).toBe(
      'Notizen',
    );
    expect(resolveSection(ENGLISH_BODY, { section: 'Geheimer Abschnitt' }, 'notes', 'de')).toBe(
      'Notes',
    );
    expect(resolveSection(BARE_BODY, { section: 'Invented' }, 'todos', 'en')).toBe('Todos');
    expect(resolveSection(BARE_BODY, { section: '## Injected\n\nText' }, 'notes', 'en')).toBe(
      'Notes',
    );
  });

  it('keeps resolving a known kind to the spelling the file already has', () => {
    expect(resolveSection(GERMAN_BODY, { section: 'Notes' }, 'notes', 'en')).toBe('Notizen');
    expect(resolveSection(ENGLISH_BODY, { section: 'Stand' }, 'notes', 'de')).toBe('Status');
  });

  it('falls back to the kind default when the action names no section', () => {
    expect(resolveSection(ENGLISH_BODY, { section: null }, 'notes', 'de')).toBe('Notes');
    expect(resolveSection(BARE_BODY, { section: '  ' }, 'notes', 'de')).toBe('Notizen');
  });
});
