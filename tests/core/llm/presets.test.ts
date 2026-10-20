/* The curated provider presets (033, D9 adds llama.cpp) — pure data, so the
 * only thing worth testing is the shape AC 1/AC 8 actually depend on: the
 * preset is local, can list models live, and points at the fixed local
 * server address `llm:startLocalRuntime` (D9) and the status probe
 * (`llamacpp-status.ts`, D7) both agree on. */

import { describe, expect, it } from 'vitest';
import { PROVIDER_PRESETS } from '../../../src/core/llm/presets';

describe('PROVIDER_PRESETS — llama.cpp', () => {
  it('is a local, openai-compatible preset that can list models live', () => {
    const llamacpp = PROVIDER_PRESETS.find((preset) => preset.id === 'llamacpp');

    expect(llamacpp).toBeDefined();
    expect(llamacpp?.kind).toBe('openai-compatible');
    expect(llamacpp?.local).toBe(true);
    expect(llamacpp?.canListModels).toBe(true);
    expect(llamacpp?.baseUrl).toBe('http://127.0.0.1:8080/v1');
    expect(llamacpp?.needsKey).toBe(false);
  });

  it('carries an i18n hint key rather than a hardcoded string', () => {
    const llamacpp = PROVIDER_PRESETS.find((preset) => preset.id === 'llamacpp');

    expect(llamacpp?.hint).toBe('llm.preset.llamacpp.hint');
  });

  it('keeps the Ollama preset untouched alongside it', () => {
    const ollama = PROVIDER_PRESETS.find((preset) => preset.id === 'ollama');

    expect(ollama).toEqual({
      id: 'ollama',
      label: 'Ollama',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      needsKey: false,
      local: true,
      canListModels: true,
      hint: 'llm.preset.ollama.hint',
    });
  });
});
