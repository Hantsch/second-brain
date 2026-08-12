/* Presets that get a provider set up in two clicks. `hint` is an i18n key;
   the German text sits next to it as a comment, so `src/renderer/i18n/de.ts`
   can adopt it verbatim without the core knowing any UI text. */

import type { ProviderPreset } from '@shared/types';

/** ID of the "any OpenAI-compatible URL" preset. */
export const CUSTOM_PRESET_ID = 'custom-openai';

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    // „Läuft auf dieser Maschine. Kein Schlüssel nötig, erste Wahl für Tagebuch und Dumps."
    hint: 'llm.preset.ollama.hint',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    // „Lokaler Server von LM Studio. Das geladene Modell muss dort aktiv sein."
    hint: 'llm.preset.lmstudio.hint',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    local: false,
    canListModels: true,
    // „Cloud. Schlüssel bleibt verschlüsselt auf dieser Maschine, Inhalte verlassen sie."
    hint: 'llm.preset.openai.hint',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    local: false,
    canListModels: true,
    // „Ein Schlüssel für viele Modelle. Gut, um Modelle zu vergleichen."
    hint: 'llm.preset.openrouter.hint',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    local: false,
    canListModels: true,
    // „Claude-Modelle über die Messages-API. Stark beim Verdichten und Verknüpfen."
    hint: 'llm.preset.anthropic.hint',
  },
  {
    id: CUSTOM_PRESET_ID,
    label: 'Eigene OpenAI-kompatible URL',
    kind: 'openai-compatible',
    baseUrl: '',
    needsKey: false,
    local: false,
    canListModels: true,
    // „Für vLLM, llama.cpp, Azure oder jeden anderen Dienst mit /chat/completions."
    hint: 'llm.preset.custom-openai.hint',
  },
];

/** Preset for an ID, or null. */
export function findPreset(id: string): ProviderPreset | null {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Does this connection need a key? Local runtimes never, cloud always.
 * Needed in two places (registry and gateway) and must not drift apart.
 */
export function needsApiKey(provider: { kind: ProviderPreset['kind']; local: boolean }): boolean {
  if (provider.kind === 'fake') return false;
  return !provider.local;
}
