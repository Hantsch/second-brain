import { describe, expect, it } from 'vitest';
import {
  FakeProvider,
  MemoryKeyStore,
  ProviderRegistry,
  suggestRouting,
  TASK_DEFINITIONS,
} from '@core/llm';
import type { ProviderConfig } from '@shared/types';
import { createFetchFake, jsonResponse, textResponse } from '../../fakes/llm';

function registry(providers: ProviderConfig[] = [], keys = new MemoryKeyStore()): ProviderRegistry {
  let counter = 0;
  return new ProviderRegistry({
    providers,
    keys,
    createId: () => {
      counter += 1;
      return `p${counter}`;
    },
    now: () => new Date('2026-08-10T10:00:00.000Z'),
    createProvider: () => new FakeProvider({ models: ['fake-small'] }),
  });
}

describe('ProviderRegistry: CRUD', () => {
  it('legt einen Provider an und merkt den Schlüssel nur im KeyStore', () => {
    const keys = new MemoryKeyStore();
    const reg = registry([], keys);

    const created = reg.add({
      label: 'OpenAI',
      kind: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-abc-1234567890',
    });

    expect(created.id).toBe('p1');
    expect(created.hasKey).toBe(true);
    expect(created.enabled).toBe(true);
    expect(created.createdAt).toBe('2026-08-10T10:00:00.000Z');
    // Der Schlüssel selbst steckt nirgends in der Konfiguration.
    expect(JSON.stringify(created)).not.toContain('sk-abc');
    expect(keys.get('p1')).toBe('sk-abc-1234567890');
  });

  it('gibt Kopien heraus, damit niemand den Bestand von außen verbiegt', () => {
    const reg = registry();
    reg.add({ label: 'A', kind: 'openai-compatible', baseUrl: 'http://a.test/v1' });
    const list = reg.list();
    list[0]!.label = 'geändert';
    expect(reg.list()[0]?.label).toBe('A');
  });

  it('ändert Felder und lässt den Schlüssel unberührt, wenn keiner mitkommt', () => {
    const keys = new MemoryKeyStore();
    const reg = registry([], keys);
    reg.add({
      label: 'A',
      kind: 'openai-compatible',
      baseUrl: 'http://a.test/v1',
      apiKey: 'sk-1234567890',
    });

    const updated = reg.update('p1', { label: 'B', enabled: false });

    expect(updated.label).toBe('B');
    expect(updated.enabled).toBe(false);
    expect(updated.hasKey).toBe(true);
    expect(keys.get('p1')).toBe('sk-1234567890');
  });

  it('löscht den Schlüssel bei leerem apiKey', () => {
    const keys = new MemoryKeyStore();
    const reg = registry([], keys);
    reg.add({
      label: 'A',
      kind: 'anthropic',
      baseUrl: 'https://a.test',
      apiKey: 'sk-ant-1234567890',
    });

    const updated = reg.update('p1', {}, '');

    expect(updated.hasKey).toBe(false);
    expect(keys.get('p1')).toBeNull();
  });

  it('nimmt beim Löschen den Schlüssel mit', () => {
    const keys = new MemoryKeyStore();
    const reg = registry([], keys);
    reg.add({
      label: 'A',
      kind: 'anthropic',
      baseUrl: 'https://a.test',
      apiKey: 'sk-ant-1234567890',
    });

    reg.remove('p1');

    expect(reg.list()).toEqual([]);
    expect(keys.get('p1')).toBeNull();
  });

  it('wirft bei unbekannter ID', () => {
    expect(() => registry().update('gibtsnicht', {})).toThrow(/Unbekannter Provider/);
  });

  it('meldet einen fehlenden Schlüssel nur für Cloud-Provider', () => {
    const reg = registry();
    reg.add({ label: 'Cloud', kind: 'openai-compatible', baseUrl: 'https://c.test/v1' });
    reg.add({
      label: 'Ollama',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      local: true,
    });
    expect(reg.missingKey('p1')).toBe(true);
    expect(reg.missingKey('p2')).toBe(false);
  });
});

describe('ProviderRegistry: probe und listModels', () => {
  const config: ProviderConfig = {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: [],
    createdAt: '2026-08-01T00:00:00.000Z',
  };

  it('probe füllt Latenz, Modellzahl und die Modell-Liste', async () => {
    const http = createFetchFake(() =>
      jsonResponse({ data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5:14b' }] }),
    );
    const reg = new ProviderRegistry({
      providers: [config],
      keys: new MemoryKeyStore(),
      fetchImpl: http.fetch,
    });

    const result = await reg.probe('ollama');

    expect(result.probe?.ok).toBe(true);
    expect(result.probe?.modelCount).toBe(2);
    expect(result.models).toEqual(['llama3.1:8b', 'qwen2.5:14b']);
    expect(reg.get('ollama')?.models).toEqual(['llama3.1:8b', 'qwen2.5:14b']);
  });

  it('probe schreibt einen Fehler als Text und behält die alten Modelle', async () => {
    const http = createFetchFake(() => textResponse('nicht erreichbar', 500));
    const reg = new ProviderRegistry({
      providers: [{ ...config, models: ['alt'] }],
      keys: new MemoryKeyStore(),
      fetchImpl: http.fetch,
    });

    const result = await reg.probe('ollama');

    expect(result.probe?.ok).toBe(false);
    expect(result.probe?.error).toContain('500');
    expect(result.models).toEqual(['alt']);
  });

  it('listModels merkt sich das Ergebnis', async () => {
    const http = createFetchFake(() => jsonResponse({ data: [{ id: 'a' }] }));
    const reg = new ProviderRegistry({
      providers: [config],
      keys: new MemoryKeyStore(),
      fetchImpl: http.fetch,
    });
    expect(await reg.listModels('ollama')).toEqual(['a']);
    expect(reg.get('ollama')?.models).toEqual(['a']);
  });
});

describe('suggestRouting', () => {
  const ollama: ProviderConfig = {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: ['llama3.1:8b', 'qwen2.5:14b'],
    createdAt: '2026-08-01T00:00:00.000Z',
  };
  const openai: ProviderConfig = {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    hasKey: true,
    local: false,
    enabled: true,
    models: ['gpt-4o-mini', 'gpt-4o'],
    createdAt: '2026-08-02T00:00:00.000Z',
  };
  const anthropic: ProviderConfig = {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    hasKey: true,
    local: false,
    enabled: true,
    models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-5', 'claude-opus-4-6'],
    createdAt: '2026-08-03T00:00:00.000Z',
  };

  it('schickt sensible Aufgaben an lokale Provider, wenn es welche gibt', () => {
    const routing = suggestRouting([openai, anthropic, ollama]);
    for (const task of TASK_DEFINITIONS.filter((t) => t.sensitive)) {
      expect(routing.tasks[task.kind]?.providerId, task.kind).toBe('ollama');
    }
  });

  it('nimmt für sensible Aufgaben notfalls doch die Cloud', () => {
    // Guardrail: lokal ist die Empfehlung, nicht das Verbot — sonst wäre die
    // Aufgabe ohne lokalen Provider gar nicht benutzbar.
    const routing = suggestRouting([openai]);
    expect(routing.tasks['journal-chat']?.providerId).toBe('openai');
  });

  it('trifft für nicht-sensible Aufgaben die empfohlene Klasse', () => {
    const routing = suggestRouting([ollama, openai, anthropic]);
    // 'gardener-audit' ist 'strong' — das große Cloud-Modell gewinnt.
    expect(routing.tasks['gardener-audit']).toEqual({
      providerId: 'anthropic',
      model: 'claude-opus-4-6',
    });
    // 'query-answer' ist 'balanced' und darf lokal laufen, wenn die Klasse passt.
    expect(routing.tasks['query-answer']).toEqual({ providerId: 'ollama', model: 'qwen2.5:14b' });
  });

  it('füllt die Klassen-Vorgaben', () => {
    const routing = suggestRouting([ollama, openai, anthropic]);
    expect(routing.defaults.cheap).toEqual({ providerId: 'ollama', model: 'llama3.1:8b' });
    expect(routing.defaults.balanced).toEqual({ providerId: 'ollama', model: 'qwen2.5:14b' });
    expect(routing.defaults.strong).toEqual({
      providerId: 'anthropic',
      model: 'claude-opus-4-6',
    });
  });

  it('lässt abgeschaltete Provider aus', () => {
    const routing = suggestRouting([{ ...ollama, enabled: false }, openai]);
    expect(routing.tasks['journal-chat']?.providerId).toBe('openai');
  });

  it('gibt ein leeres Routing zurück, wenn es keine Modelle gibt', () => {
    expect(suggestRouting([{ ...ollama, models: [] }])).toEqual({ tasks: {}, defaults: {} });
    expect(suggestRouting([])).toEqual({ tasks: {}, defaults: {} });
  });

  it('weist jeder Aufgabe im Katalog etwas zu, sobald ein Modell existiert', () => {
    const routing = suggestRouting([ollama]);
    for (const task of TASK_DEFINITIONS) {
      expect(routing.tasks[task.kind], task.kind).toBeDefined();
    }
  });
});
