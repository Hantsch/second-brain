import { describe, expect, it } from 'vitest';
import {
  CONDENSE_AREA_SCHEMA,
  condenseAreaPrompt,
  type CondenseAreaInput,
} from '@core/llm/prompts/condense-area';
import { emptyCondensedArtifact } from '@core/condense/artifact';

function baseInput(overrides: Partial<CondenseAreaInput> = {}): CondenseAreaInput {
  const current = emptyCondensedArtifact();
  current.sections.state = { text: 'Bisheriger Stand.', sources: ['areas/health.md'] };
  current.directives = { heading: 'Direktiven', content: 'Nie ohne Rücksprache kürzen.' };
  return {
    title: 'Gesundheit',
    slug: 'health',
    current,
    notes: [{ path: 'areas/health.md', text: 'Notiz über Schlaf.' }],
    todos: [{ path: 'areas/health.md', text: 'Arzttermin vereinbaren.' }],
    days: [{ path: 'journal/2026-08-30.md', text: 'Lief heute joggen.' }],
    truncated: false,
    ...overrides,
  };
}

function textOf(turns: ReturnType<typeof condenseAreaPrompt>): string {
  return turns.map((turn) => turn.content).join('\n');
}

describe('CONDENSE_AREA_SCHEMA', () => {
  it('demands state, patterns, open, each with text and sources', () => {
    expect(CONDENSE_AREA_SCHEMA['required']).toEqual(['state', 'patterns', 'open']);
    const properties = CONDENSE_AREA_SCHEMA['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    for (const key of ['state', 'patterns', 'open']) {
      const section = properties[key];
      expect(section?.['required']).toEqual(['text', 'sources']);
      const sectionProps = section?.['properties'] as Record<string, Record<string, unknown>>;
      expect(sectionProps?.['text']?.['type']).toBe('string');
      expect(sectionProps?.['sources']?.['type']).toBe('array');
      expect((sectionProps?.['sources']?.['items'] as Record<string, unknown>)?.['type']).toBe(
        'string',
      );
    }
  });
});

describe('condenseAreaPrompt', () => {
  it('carries the current artifact and the directives section verbatim', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'de'));
    expect(text).toContain('Bisheriger Stand.');
    expect(text).toContain('Nie ohne Rücksprache kürzen.');
  });

  it('states the soft cap with a compress-rather-than-append instruction', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'de'));
    expect(text).toContain('2000');
    expect(text).toContain('12000');
    expect(text.toLowerCase()).toContain('komprimiere');
    expect(text.toLowerCase()).toContain('hänge nicht einfach an');
  });

  it('states the no-invention rule', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'de'));
    expect(text.toLowerCase()).toContain('erfinde nichts');
  });

  it('keeps contradictions inside state, not as their own section', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'de'));
    expect(text).toContain('Widerspruch');
    expect(text).toContain('Stand');
  });

  it('requests headings in the document language: German', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'de'));
    expect(text).toContain('Stand');
    expect(text).toContain('Muster');
    expect(text).toContain('Offen');
    expect(text).not.toContain('Patterns');
  });

  it('requests headings in the document language: English', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'en'));
    expect(text).toContain('Status');
    expect(text).toContain('Patterns');
    expect(text).toContain('Open');
  });

  it('includes the given input paths so the model can cite them back', () => {
    const text = textOf(condenseAreaPrompt(baseInput(), 'de'));
    expect(text).toContain('areas/health.md');
    expect(text).toContain('journal/2026-08-30.md');
  });

  it('does not ask the model to write the truncation notice itself', () => {
    const text = textOf(condenseAreaPrompt(baseInput({ truncated: true }), 'de'));
    expect(text.toLowerCase()).not.toContain('schreibe die notiz');
    expect(text).toContain('der Lauf');
  });
});
