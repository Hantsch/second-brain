import { describe, expect, it } from 'vitest';
import {
  CONDENSE_MODULE_SCHEMA,
  condenseModulePrompt,
  type CondenseModuleInput,
} from '@core/llm/prompts/condense-module';
import { emptyArtifact, MODULE_SECTIONS } from '@core/condense/artifact';

function input(): CondenseModuleInput {
  const current = emptyArtifact(MODULE_SECTIONS);
  current.sections.decided = { text: 'Bisher entschieden.', sources: [] };
  current.directives = { heading: 'Direktiven', content: 'Nie Kundennamen nennen.' };
  return {
    title: 'Identity Management',
    slug: 'identity-management',
    current,
    pages: [
      { path: 'modules/identity-management/wiki/concepts/rbac.md', text: 'Rollen pro Tenant.' },
      { path: 'modules/identity-management/wiki/sources/guide.md', text: 'Token-Laufzeit.' },
    ],
  };
}

describe('condenseModulePrompt', () => {
  it('the module prompt lists every page by path and asks for decided, open and contradictions', () => {
    const turns = condenseModulePrompt(input(), 'de');
    const text = turns.map((turn) => turn.content).join('\n');

    for (const page of input().pages) expect(text).toContain(`--- ${page.path} ---`);
    expect(text).toContain('Entschieden');
    expect(text).toContain('Offen');
    expect(text).toContain('Widersprüche');
    expect(text).toContain('Bisher entschieden.');
    expect(text).toContain('Nie Kundennamen nennen.');
    expect(text.toLowerCase()).toContain('löse ihn nicht auf');
    expect(text.toLowerCase()).toContain('erfinde nichts');
    expect(text.toLowerCase()).toContain('komprimiere');

    expect(CONDENSE_MODULE_SCHEMA['required']).toEqual(['decided', 'open', 'contradictions']);
    const properties = CONDENSE_MODULE_SCHEMA['properties'] as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(['decided', 'open', 'contradictions']);
  });

  it('names the sections in the document language', () => {
    const text = condenseModulePrompt(input(), 'en')
      .map((turn) => turn.content)
      .join('\n');
    expect(text).toContain('Decided');
    expect(text).toContain('Contradictions');
  });
});
