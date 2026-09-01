/* The shared section-name table (`core/vault/section-names.ts`) that
   journal/, areas/, projects/ and capture/ source their per-language heading
   tables from. One rule nailed down here: a heading not in the table is
   `null`, never a guess. */

import { describe, expect, it } from 'vitest';
import { sectionHeadingIn, sectionKindOf, sectionNameFor } from '@core/vault/section-names';

describe('sectionNameFor', () => {
  it('knows both document languages for every kind', () => {
    expect(sectionNameFor('notes', 'de')).toBe('Notizen');
    expect(sectionNameFor('notes', 'en')).toBe('Notes');
    expect(sectionNameFor('todos', 'de')).toBe('Todos');
    expect(sectionNameFor('todos', 'en')).toBe('Todos');
    expect(sectionNameFor('state', 'de')).toBe('Stand');
    expect(sectionNameFor('state', 'en')).toBe('Status');
    expect(sectionNameFor('day', 'de')).toBe('Tag');
    expect(sectionNameFor('day', 'en')).toBe('Day');
    expect(sectionNameFor('facts', 'de')).toBe('Fakten');
    expect(sectionNameFor('facts', 'en')).toBe('Facts');
    expect(sectionNameFor('dialogue', 'de')).toBe('Gespräch');
    expect(sectionNameFor('dialogue', 'en')).toBe('Conversation');
    expect(sectionNameFor('patterns', 'de')).toBe('Muster');
    expect(sectionNameFor('patterns', 'en')).toBe('Patterns');
    expect(sectionNameFor('open', 'de')).toBe('Offen');
    expect(sectionNameFor('open', 'en')).toBe('Open');
    expect(sectionNameFor('directives', 'de')).toBe('Direktiven');
    expect(sectionNameFor('directives', 'en')).toBe('Directives');
  });

  it('falls back to German for an unrecognized document language', () => {
    expect(sectionNameFor('notes', 'xx' as never)).toBe('Notizen');
  });
});

describe('sectionKindOf', () => {
  it('recognizes a heading regardless of document language', () => {
    expect(sectionKindOf('Notizen')).toBe('notes');
    expect(sectionKindOf('Notes')).toBe('notes');
    expect(sectionKindOf('Facts')).toBe('facts');
    expect(sectionKindOf('Fakten')).toBe('facts');
    expect(sectionKindOf('Status')).toBe('state');
    expect(sectionKindOf('Stand')).toBe('state');
    expect(sectionKindOf('Todos')).toBe('todos');
    expect(sectionKindOf('Day')).toBe('day');
    expect(sectionKindOf('Tag')).toBe('day');
    expect(sectionKindOf('Conversation')).toBe('dialogue');
    expect(sectionKindOf('Gespräch')).toBe('dialogue');
    expect(sectionKindOf('Muster')).toBe('patterns');
    expect(sectionKindOf('Patterns')).toBe('patterns');
    expect(sectionKindOf('Offen')).toBe('open');
    expect(sectionKindOf('Open')).toBe('open');
    expect(sectionKindOf('Direktiven')).toBe('directives');
    expect(sectionKindOf('Directives')).toBe('directives');
  });

  /* „State" ist keine der beiden Dokumentsprachen, wurde von der Leseseite aber
     schon akzeptiert, bevor diese Tabelle existierte (`overview/status.ts`). */
  it('erkennt „State" weiterhin als Stand-Abschnitt', () => {
    expect(sectionKindOf('State')).toBe('state');
  });

  it('compares folded — case, whitespace and umlauts do not matter', () => {
    expect(sectionKindOf(' NOTIZEN ')).toBe('notes');
    expect(sectionKindOf('gespraech')).toBe('dialogue');
  });

  it('is null for a heading that names no section', () => {
    expect(sectionKindOf('Worum es geht')).toBeNull();
    expect(sectionKindOf('')).toBeNull();
  });
});

describe('sectionHeadingIn', () => {
  it('takes the existing heading over the document language default', () => {
    const body = ['## Notizen', '', 'Text.', ''].join('\n');
    expect(sectionHeadingIn(body, 'notes', 'en')).toBe('Notizen');
  });

  it('falls back to the document language word when the file has neither spelling', () => {
    expect(sectionHeadingIn('', 'notes', 'de')).toBe('Notizen');
    expect(sectionHeadingIn('', 'notes', 'en')).toBe('Notes');
  });

  /* The alias table holds folded spellings ('gespraech'), so the *matching* side
     has to fold too — otherwise a real '## Gespräch' in a file would never meet
     its own alias and filing would open a second section for the same thing. */
  it('finds a heading whose umlaut only the alias table spells out', () => {
    const body = ['## Gespräch', '', 'Text.', ''].join('\n');
    expect(sectionHeadingIn(body, 'dialogue', 'en')).toBe('Gespräch');
    expect(sectionHeadingIn(body, 'dialogue', 'de')).toBe('Gespräch');
  });

  it('still takes the older „State" spelling over the language default', () => {
    const body = ['## State', '', 'Wo es steht.', ''].join('\n');
    expect(sectionHeadingIn(body, 'state', 'de')).toBe('State');
  });
});
