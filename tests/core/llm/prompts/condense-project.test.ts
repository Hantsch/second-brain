import { describe, expect, it } from 'vitest';
import {
  CONDENSE_PROJECT_ITEM_CHARS,
  CONDENSE_PROJECT_SCHEMA,
  condenseProjectPrompt,
  promptItemsClampedChars,
  type CondenseProjectInput,
} from '@core/llm/prompts/condense-project';
import { emptyArtifact, PROJECT_SECTIONS } from '@core/condense/artifact';

function baseInput(overrides: Partial<CondenseProjectInput> = {}): CondenseProjectInput {
  const current = emptyArtifact(PROJECT_SECTIONS);
  current.sections.state = {
    text: 'Bisheriger Stand.',
    sources: ['projects/work/nyota/project.md'],
  };
  current.directives = { heading: 'Direktiven', content: 'Nie ohne Rücksprache kürzen.' };
  return {
    title: 'Nyota',
    scope: 'work',
    slug: 'nyota',
    current,
    state: { path: 'projects/work/nyota/project.md', text: 'Stand laut project.md.' },
    notes: [{ path: 'projects/work/nyota/notes/kickoff.md', text: 'Notiz über Kickoff.' }],
    todos: [{ path: 'projects/work/nyota/project.md', text: 'Angebot schreiben.' }],
    waitingOn: [
      { path: 'projects/work/nyota/project.md', text: 'Wartet auf Rückmeldung von Kim.' },
    ],
    days: [{ path: 'journal/2026-08-30.md', text: 'An Nyota weitergearbeitet.' }],
    sessions: [{ path: 'agent:claude/c--dev-nyota', text: 'Session-Ausschnitt.' }],
    truncated: false,
    ...overrides,
  };
}

function textOf(turns: ReturnType<typeof condenseProjectPrompt>): string {
  return turns.map((turn) => turn.content).join('\n');
}

describe('CONDENSE_PROJECT_SCHEMA', () => {
  it('demands state, next-step, waiting-on, learned, each with text and sources', () => {
    expect(CONDENSE_PROJECT_SCHEMA['required']).toEqual([
      'state',
      'next-step',
      'waiting-on',
      'learned',
    ]);
    const properties = CONDENSE_PROJECT_SCHEMA['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    for (const key of ['state', 'next-step', 'waiting-on', 'learned']) {
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

describe('condenseProjectPrompt', () => {
  it('carries the current artifact and the directives section verbatim', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text).toContain('Bisheriger Stand.');
    expect(text).toContain('Nie ohne Rücksprache kürzen.');
  });

  it('states the shared soft cap with a compress-rather-than-append instruction', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text).toContain('2000');
    expect(text).toContain('12000');
    expect(text.toLowerCase()).toContain('komprimiere');
    expect(text.toLowerCase()).toContain('hänge nicht einfach an');
  });

  it('states the no-invention rule', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text.toLowerCase()).toContain('erfinde nichts');
  });

  it('keeps contradictions inside state, not as their own section', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text).toContain('Widerspruch');
    expect(text).toContain('Stand');
  });

  it('names the agent:<kind>/<pathKey> form as a legal source token, with an example', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text).toContain('agent:claude/<pathKey>');
    expect(text).toContain('agent:claude/c--dev-nyota');
  });

  it('requests headings in the document language: German', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text).toContain('Stand');
    expect(text).toContain('Nächster Schritt');
    expect(text).toContain('Wartet auf');
    expect(text).toContain('Gelernt');
    expect(text).not.toContain('Next step');
  });

  it('requests headings in the document language: English', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'en'));
    expect(text).toContain('Status');
    expect(text).toContain('Next step');
    expect(text).toContain('Waiting on');
    expect(text).toContain('Learned');
  });

  it('includes the given input paths, including the agent ref, so the model can cite them back', () => {
    const text = textOf(condenseProjectPrompt(baseInput(), 'de'));
    expect(text).toContain('projects/work/nyota/notes/kickoff.md');
    expect(text).toContain('journal/2026-08-30.md');
    expect(text).toContain('agent:claude/c--dev-nyota');
  });

  it('does not ask the model to write the truncation notice itself', () => {
    const text = textOf(condenseProjectPrompt(baseInput({ truncated: true }), 'de'));
    expect(text.toLowerCase()).not.toContain('schreibe die notiz');
    expect(text).toContain('der Lauf');
  });
});

describe('promptItemsClampedChars', () => {
  it('reports nothing dropped for text within the cap, trailing whitespace included', () => {
    // clamp() trims first — a body with a trailing newline must not look
    // clamped when its trimmed length is still under the cap (review fix).
    const text = `${'x'.repeat(CONDENSE_PROJECT_ITEM_CHARS)}\n`;
    expect(promptItemsClampedChars([{ path: 'p', text }])).toBe(0);
  });

  it('counts exactly what clamp() would cut, not the raw length', () => {
    const overflow = 37;
    const text = `${'x'.repeat(CONDENSE_PROJECT_ITEM_CHARS + overflow)}\n\n`;
    expect(promptItemsClampedChars([{ path: 'p', text }])).toBe(overflow);
  });

  it('sums across items', () => {
    const long = { path: 'a', text: 'x'.repeat(CONDENSE_PROJECT_ITEM_CHARS + 10) };
    const short = { path: 'b', text: 'short' };
    expect(promptItemsClampedChars([long, short])).toBe(10);
  });
});
