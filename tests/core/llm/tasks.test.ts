import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PRESET_ID,
  PROVIDER_PRESETS,
  TASK_DEFINITIONS,
  TASK_KINDS,
  findPreset,
  needsApiKey,
  sensitiveTasks,
  suggestedTier,
  taskDefinition,
} from '@core/llm';
import { MODEL_TIERS } from '@shared/types';
import { createEmptyGateway } from '../../fakes/llm';

describe('Aufgabenkatalog', () => {
  it('deckt jede Aufgabe genau einmal ab', () => {
    const kinds = TASK_DEFINITIONS.map((task) => task.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...TASK_KINDS].sort());
  });

  it('benutzt i18n-Keys statt Texten', () => {
    for (const task of TASK_DEFINITIONS) {
      expect(task.labelKey).toBe(`task.${task.kind}.label`);
      expect(task.hintKey).toBe(`task.${task.kind}.hint`);
    }
  });

  it('empfiehlt für jede Aufgabe eine bekannte Leistungsklasse', () => {
    for (const task of TASK_DEFINITIONS) {
      expect(MODEL_TIERS).toContain(task.suggested);
    }
  });

  it('hat für jede Aufgabe plausible typische Tokenzahlen', () => {
    for (const task of TASK_DEFINITIONS) {
      expect(task.typicalTokens).toBeDefined();
      expect(task.typicalTokens.in).toBeGreaterThan(0);
      expect(task.typicalTokens.out).toBeGreaterThan(0);
    }
  });

  it('markiert genau die persönlichen Aufgaben als sensibel', () => {
    expect(sensitiveTasks().sort()).toEqual([
      'classify-dump',
      'condense-area',
      'condense-project',
      'extract-tasks',
      'journal-chat',
      'journal-loose-ends',
    ]);
  });

  it('markiert genau die Gesprächsaufgaben als streamend', () => {
    expect(
      TASK_DEFINITIONS.filter((task) => task.streams)
        .map((task) => task.kind)
        .sort(),
    ).toEqual(['journal-chat', 'query-answer']);
  });

  it('markiert genau die JSON-Aufgaben als strukturiert', () => {
    expect(
      TASK_DEFINITIONS.filter((task) => task.structured)
        .map((task) => task.kind)
        .sort(),
    ).toEqual([
      'classify-dump',
      'condense-area',
      'condense-project',
      'extract-tasks',
      'gardener-audit',
      'journal-loose-ends',
      'project-status',
      'query-rerank',
      'title-tags',
    ]);
  });

  it('liefert Definition und Klasse zu einer Aufgabe', () => {
    expect(taskDefinition('title-tags').suggested).toBe('cheap');
    expect(suggestedTier('gardener-audit')).toBe('strong');
  });

  it('empfiehlt für die losen Enden ein ausgewogenes, lokal empfohlenes Modell', () => {
    const task = taskDefinition('journal-loose-ends');
    expect(task.suggested).toBe('balanced');
    expect(task.sensitive).toBe(true);
    expect(task.structured).toBe(true);
  });

  it('setzt minLocalParamsB nur für title-tags und query-rerank auf 1', () => {
    expect(
      TASK_DEFINITIONS.filter((task) => task.minLocalParamsB === 1)
        .map((task) => task.kind)
        .sort(),
    ).toEqual(['query-rerank', 'title-tags']);
    for (const task of TASK_DEFINITIONS) {
      if (task.kind === 'title-tags' || task.kind === 'query-rerank') continue;
      expect(task.minLocalParamsB).toBeUndefined();
    }
  });

  it('empfiehlt für das Verdichten eines Bereichs ein starkes, lokal empfohlenes Modell', () => {
    const task = taskDefinition('condense-area');
    expect(task.suggested).toBe('strong');
    expect(task.sensitive).toBe(true);
    expect(task.structured).toBe(true);
    expect(task.streams).toBe(false);
  });

  it('ist ohne Route für condense-area nicht verfügbar', () => {
    expect(createEmptyGateway().isAvailable('condense-area')).toBe(false);
  });

  it('empfiehlt für das Verdichten eines Projekts ein starkes, lokal empfohlenes Modell', () => {
    const task = taskDefinition('condense-project');
    expect(task.suggested).toBe('strong');
    expect(task.sensitive).toBe(true);
    expect(task.structured).toBe(true);
    expect(task.streams).toBe(false);
    expect(task.typicalTokens).toEqual({ in: 8000, out: 1200 });
  });

  it('ist ohne Route für condense-project nicht verfügbar', () => {
    expect(createEmptyGateway().isAvailable('condense-project')).toBe(false);
  });

  it('wirft bei einer unbekannten Aufgabe', () => {
    // @ts-expect-error absichtlich falscher Wert: der Katalog muss laut scheitern
    expect(() => taskDefinition('gibt-es-nicht')).toThrow(/Unbekannte LLM-Aufgabe/);
  });
});

describe('Provider-Vorlagen', () => {
  it('enthält die versprochenen Vorlagen mit korrekten Basis-URLs', () => {
    const byId = Object.fromEntries(PROVIDER_PRESETS.map((preset) => [preset.id, preset]));
    expect(byId.ollama?.baseUrl).toBe('http://localhost:11434/v1');
    expect(byId.lmstudio?.baseUrl).toBe('http://localhost:1234/v1');
    expect(byId.openai?.baseUrl).toBe('https://api.openai.com/v1');
    expect(byId.openrouter?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(byId.anthropic?.baseUrl).toBe('https://api.anthropic.com');
    expect(byId.anthropic?.kind).toBe('anthropic');
    expect(byId[CUSTOM_PRESET_ID]?.baseUrl).toBe('');
  });

  it('kennzeichnet lokale Vorlagen als schlüsselfrei', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (preset.local) expect(preset.needsKey).toBe(false);
    }
    expect(findPreset('ollama')?.local).toBe(true);
    expect(findPreset('lmstudio')?.local).toBe(true);
    expect(findPreset('openai')?.needsKey).toBe(true);
    expect(findPreset('openrouter')?.needsKey).toBe(true);
    expect(findPreset('anthropic')?.needsKey).toBe(true);
  });

  it('hat für jede Vorlage einen Hint als i18n-Key', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.hint).toBe(`llm.preset.${preset.id}.hint`);
    }
  });

  it('gibt für unbekannte Vorlagen null zurück', () => {
    expect(findPreset('gibt-es-nicht')).toBeNull();
  });

  it('verlangt einen Schlüssel nur von entfernten Providern', () => {
    expect(needsApiKey({ kind: 'openai-compatible', local: false })).toBe(true);
    expect(needsApiKey({ kind: 'openai-compatible', local: true })).toBe(false);
    expect(needsApiKey({ kind: 'anthropic', local: false })).toBe(true);
    expect(needsApiKey({ kind: 'fake', local: false })).toBe(false);
  });
});
